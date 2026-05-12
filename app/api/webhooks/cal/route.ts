/**
 * Cal.com Webhook Handler
 * POST /api/webhooks/cal
 *
 * Receives booking events from Cal.com and updates the CRM (and, for
 * form-submission contacts, the contact_submissions audit table).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contactSubmissions, contacts, deals, stages } from "@/lib/db/schema";
import { eq, and, gte, isNull, desc, sql } from "drizzle-orm";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import crypto from "crypto";
import { writeTimelineEvent } from "@/lib/crm/timeline";

// Constants for webhook validation
const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes (allows for network latency and retries)
const CLOCK_SKEW_TOLERANCE_MS = 30 * 1000; // 30 seconds tolerance for clock differences
const SUBMISSION_MATCH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_BODY_SIZE = 1024 * 1024; // 1MB limit for webhook payloads

// Regex for validating SHA-256 hex format (64 lowercase hex characters)
// Case-sensitive: HMAC produces lowercase hex; uppercase/mixed-case is rejected
const HEX_SHA256_REGEX = /^[a-f0-9]{64}$/;

/**
 * Debug information for signature verification logging
 */
interface SignatureDebugInfo {
  hasSignatureHeader: boolean;
  signatureLength: number;
  computedLength: number;
  bodyLength: number;
  bodyHash: string;
}

/**
 * Hash email for safe logging (GDPR/CCPA compliant)
 * Returns first 8 chars of SHA256 hash for correlation without exposing PII
 */
function hashEmailForLogging(email: string): string {
  return crypto.createHash("sha256").update(email.toLowerCase()).digest("hex").substring(0, 8);
}

/**
 * Hash body for safe logging (GDPR/CCPA compliant)
 * Returns first 16 chars of SHA256 hash for correlation without exposing PII
 */
function hashBodyForLogging(body: string): string {
  return crypto.createHash("sha256").update(body).digest("hex").substring(0, 16);
}

// Cal.com webhook metadata structure
interface CalMetadata {
  email?: { value: string };
  submission_id?: { value: string };
  [key: string]: unknown;
}

// Cal.com webhook payload types
interface CalWebhookPayload {
  triggerEvent: string; // e.g., "BOOKING_CREATED"
  createdAt: string;
  payload: {
    uid: string; // Booking ID
    bookingId: number;
    type: string;
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    attendees: Array<{
      email: string;
      name: string;
      timeZone: string;
    }>;
    organizer: {
      email: string;
      name: string;
      timeZone: string;
    };
    metadata?: CalMetadata;
  };
}

/**
 * Compute HMAC-SHA256 signature for webhook payload
 */
function computeSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verify webhook signature from Cal.com
 * Cal.com sends a signature in the 'x-cal-signature-256' header as a raw hex hash
 * (without sha256= prefix, though we support both formats for compatibility)
 *
 * Security: Uses HMAC-SHA256 for signature verification
 * - Verifies webhook authenticity (prevents unauthorized webhook calls)
 * - Uses constant-time comparison to prevent timing attacks
 * - Secret must be configured in both Cal.com webhook settings AND CAL_WEBHOOK_SECRET env var
 */
function verifyWebhookSignature(signature: string | null, computedSignature: string): boolean {
  if (!signature) return false;

  // Extract the hash part (supports both raw hex and sha256= prefix formats)
  let actualHash: string;
  if (signature.startsWith("sha256=")) {
    actualHash = signature.substring(7); // Remove 'sha256=' prefix
  } else {
    // Raw hash format is the standard Cal.com format (no sha256= prefix)
    // Only log when debugging is enabled to avoid noise
    if (process.env.DEBUG_WEBHOOK_SIGNATURE === "true") {
      logger.debug("Webhook signature: using raw hash format");
    }
    actualHash = signature;
  }

  // Validate hex format - SHA-256 hash should be exactly 64 hex characters
  if (!HEX_SHA256_REGEX.test(actualHash)) {
    logger.warn("Invalid signature format: not a valid SHA-256 hex string", {
      actualLength: actualHash.length,
      expectedLength: 64,
    });
    return false;
  }

  // Defense-in-depth: ensure both are 64 chars (should always be true after regex validation)
  if (actualHash.length !== computedSignature.length) return false;

  return crypto.timingSafeEqual(Buffer.from(actualHash), Buffer.from(computedSignature));
}

// ============================================================================
// CRM SYNC HELPERS (for both form-sourced AND outreach-sourced contacts)
// ============================================================================
//
// These helpers run AFTER the optional contact_submissions update. They are
// driven by the attendee email — they look up the CRM contact directly, so
// they work for outreach contacts (which have no contact_submissions row) as
// well as form-submission contacts.
//
// Each helper returns whether a CRM contact was found, so the caller can
// surface a "no matching record" response when neither a submission nor a
// CRM contact exists.

/**
 * BOOKING_CREATED → move deal to "meeting-booked", set meeting_booked_at,
 * write timeline events. Idempotent at the deal level (RPC handles repeats).
 */
async function runCrmBookingSync(
  attendeeEmail: string,
  bookingId: string,
  startTime: string,
  eventTitle: string,
): Promise<{ contactFound: boolean }> {
  try {
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.email, attendeeEmail))
      .limit(1);

    if (!contact) {
      logger.warn("Contact not found for booking CRM sync:", hashEmailForLogging(attendeeEmail));
      return { contactFound: false };
    }

    const now = new Date().toISOString();

    const [meetingStage] = await db
      .select({ id: stages.id })
      .from(stages)
      .where(eq(stages.slug, "meeting-booked"))
      .limit(1);

    if (!meetingStage) {
      logger.error("Meeting Booked stage not found in database");
      return { contactFound: true };
    }

    // Atomic RPC: contact status update (with hierarchy protection),
    // deal stage update, and stage history insert in a single transaction.
    type BookingSyncResult = {
      contact_updated: boolean;
      deal_id: string | null;
      deal_updated: boolean;
      history_created: boolean;
    };

    const syncRows = await db.execute(sql`
      SELECT * FROM update_contact_and_deal_for_booking(
        ${contact.id}::uuid,
        ${meetingStage.id}::uuid,
        ${bookingId}::text,
        ${now}::timestamptz
      )
    `);

    const result = (syncRows as unknown as Array<Record<string, unknown>>)[0] as
      | BookingSyncResult
      | undefined;

    if (result) {
      logger.info("CRM sync completed:", {
        contactId: contact.id,
        contactUpdated: result.contact_updated,
        dealId: result.deal_id,
        dealUpdated: result.deal_updated,
        historyCreated: result.history_created,
      });

      if (result.deal_id) {
        try {
          await db
            .update(deals)
            .set({ meetingBookedAt: startTime })
            .where(eq(deals.id, result.deal_id));
        } catch (meetingError) {
          logger.error("Failed to set meeting_booked_at on deal:", {
            dealId: result.deal_id,
            error: meetingError instanceof Error ? meetingError.message : String(meetingError),
          });
        }
      }

      const bookingDate = new Date(startTime).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });

      void writeTimelineEvent({
        contactId: contact.id,
        eventType: "booking_created",
        title: `Meeting booked for ${bookingDate}`,
        metadata: {
          booking_id: bookingId,
          booking_time: startTime,
          event_type: eventTitle,
        },
      });

      if (result.deal_updated && result.deal_id) {
        void writeTimelineEvent({
          contactId: contact.id,
          eventType: "stage_changed",
          title: "Deal moved to Meeting Booked",
          metadata: {
            deal_id: result.deal_id,
            to_stage: "Meeting Booked",
            automated: true,
          },
          stageId: meetingStage.id,
        });
      }
    }

    return { contactFound: true };
  } catch (crmError) {
    // Log CRM errors but don't fail the webhook
    logger.error("CRM sync error during booking:", crmError);
    return { contactFound: true };
  }
}

/**
 * BOOKING_RESCHEDULED → update meeting_booked_at on the contact's open deal
 * and write a timeline event. No stage change.
 */
async function runCrmRescheduleSync(
  attendeeEmail: string,
  bookingId: string,
  newStartTime: string,
): Promise<{ contactFound: boolean }> {
  try {
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.email, attendeeEmail))
      .limit(1);

    if (!contact) {
      logger.warn("Contact not found for reschedule CRM sync:", hashEmailForLogging(attendeeEmail));
      return { contactFound: false };
    }

    // Find the open deal for this contact and update meeting_booked_at.
    // We don't constrain on stage — admin may have manually moved it forward.
    try {
      await db
        .update(deals)
        .set({ meetingBookedAt: newStartTime })
        .where(and(eq(deals.contactId, contact.id), eq(deals.status, "open")));
    } catch (updateError) {
      logger.error("Failed to update meeting_booked_at for reschedule:", {
        contactId: contact.id,
        error: updateError instanceof Error ? updateError.message : String(updateError),
      });
    }

    const rescheduleDate = new Date(newStartTime).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    await writeTimelineEvent({
      contactId: contact.id,
      eventType: "booking_rescheduled",
      title: `Meeting rescheduled to ${rescheduleDate}`,
      metadata: {
        booking_id: bookingId,
        booking_time: newStartTime,
      },
    });

    return { contactFound: true };
  } catch (crmError) {
    logger.error("CRM sync error during reschedule:", crmError);
    return { contactFound: true };
  }
}

/**
 * BOOKING_CANCELLED → write a timeline event. We intentionally do NOT
 * revert the deal stage; admins may want cancelled bookings to remain
 * visible in their "Meeting Booked" column for follow-up.
 */
async function runCrmCancelSync(
  attendeeEmail: string,
  bookingId: string,
): Promise<{ contactFound: boolean }> {
  try {
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.email, attendeeEmail))
      .limit(1);

    if (!contact) {
      logger.warn(
        "Contact not found for cancellation CRM sync:",
        hashEmailForLogging(attendeeEmail),
      );
      return { contactFound: false };
    }

    await writeTimelineEvent({
      contactId: contact.id,
      eventType: "booking_cancelled",
      title: "Meeting cancelled",
      metadata: { booking_id: bookingId },
    });

    return { contactFound: true };
  } catch (crmError) {
    logger.error("CRM sync error during cancellation:", crmError);
    return { contactFound: true };
  }
}

/**
 * POST /api/webhooks/cal
 * Handle Cal.com webhook events
 *
 * Note: Rate limiting should be implemented at the edge (Vercel Edge Functions) or middleware level
 * to prevent webhook flooding attacks before they reach this handler.
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting (before signature verification to prevent DoS on HMAC computation)
    const clientIp = getClientIp(request);
    const rateLimitResult = await checkRateLimit(
      `webhook:cal:${clientIp}`,
      { limit: 100, windowMs: 60 * 1000 }, // 100 requests per minute
      "api",
    );

    if (!rateLimitResult.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // Get raw body for signature verification
    const rawBody = await request.text();

    // Defense-in-depth size validation (body already in memory)
    // Primary protection should be at Vercel Edge level
    if (rawBody.length > MAX_BODY_SIZE) {
      logger.warn("Webhook payload too large", { size: rawBody.length });
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    const signature = request.headers.get("x-cal-signature-256");

    // Step 1: Get webhook secret from environment
    const webhookSecret = process.env.CAL_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error("CAL_WEBHOOK_SECRET not configured in environment");
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    // Compute signature once and reuse for both debug logging and verification
    const computedSignature = computeSignature(rawBody, webhookSecret);

    // Debug logging for signature verification (only when explicitly enabled)
    // Logs are security-conscious: no secret prefixes, body content is hashed
    if (process.env.DEBUG_WEBHOOK_SIGNATURE === "true") {
      if (process.env.NODE_ENV === "production") {
        logger.warn("DEBUG_WEBHOOK_SIGNATURE is enabled in production - disable after debugging");
      }
      const debugInfo: SignatureDebugInfo = {
        hasSignatureHeader: !!signature,
        signatureLength: signature?.length || 0,
        computedLength: computedSignature.length,
        bodyLength: rawBody.length,
        bodyHash: hashBodyForLogging(rawBody),
      };
      logger.debug("Webhook signature debug:", debugInfo);
    }

    if (!verifyWebhookSignature(signature, computedSignature)) {
      logger.error("Invalid webhook signature - verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Parse webhook payload
    let webhookData: CalWebhookPayload;
    try {
      webhookData = JSON.parse(rawBody);
    } catch {
      logger.error("Invalid JSON in webhook payload", {
        bodyLength: rawBody.length,
        bodyHash: hashBodyForLogging(rawBody),
        contentType: request.headers.get("content-type"),
      });
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    logger.info("Cal.com webhook received:", {
      event: webhookData.triggerEvent,
      bookingId: webhookData.payload?.uid,
    });

    // Validate webhook timestamp (prevent replay attacks)
    // Cal.com webhooks should be processed within 5 minutes of creation
    const createdAtDate = new Date(webhookData.createdAt);
    if (isNaN(createdAtDate.getTime())) {
      logger.error("Invalid createdAt timestamp in webhook");
      return NextResponse.json({ error: "Invalid webhook timestamp" }, { status: 400 });
    }
    const webhookAge = Date.now() - createdAtDate.getTime();

    if (webhookAge > WEBHOOK_MAX_AGE_MS) {
      logger.warn("Webhook too old, possible replay attack", {
        createdAt: webhookData.createdAt,
        ageMinutes: Math.floor(webhookAge / 60000),
      });
      return NextResponse.json({ error: "Webhook timestamp too old" }, { status: 400 });
    }

    if (webhookAge < -CLOCK_SKEW_TOLERANCE_MS) {
      logger.warn("Webhook timestamp too far in the future", {
        createdAt: webhookData.createdAt,
        skewMs: Math.abs(webhookAge),
      });
      return NextResponse.json({ error: "Invalid webhook timestamp" }, { status: 400 });
    }

    // Handle different booking events (case-insensitive comparison)
    const validEvents = [
      "BOOKING_CREATED",
      "BOOKING_RESCHEDULED",
      "BOOKING_CANCELLED",
      "BOOKING_ENDED",
    ];

    const normalizedEvent = webhookData.triggerEvent?.toUpperCase() || "";

    if (!validEvents.includes(normalizedEvent)) {
      return NextResponse.json({
        message: "Event type not handled",
        event: webhookData.triggerEvent,
      });
    }

    // Validate payload exists
    if (!webhookData.payload) {
      logger.error("Missing payload in webhook data");
      return NextResponse.json({ error: "Invalid webhook data: missing payload" }, { status: 400 });
    }

    // Extract booking details with null safety
    const bookingId = webhookData.payload.uid;
    const attendees = webhookData.payload.attendees || [];
    const startTime = webhookData.payload.startTime;
    const eventTitle = webhookData.payload.title;

    // Get attendee email from multiple possible locations
    // 1. Try metadata.email (when email is a custom form field)
    // 2. Fallback to attendees[0].email (standard booking flow)
    let attendeeEmail: string | null = null;

    // Safe metadata extraction with improved type safety
    const metadata = webhookData.payload.metadata;
    if (metadata?.email?.value) {
      attendeeEmail = metadata.email.value;
    }

    // Fallback to attendees array
    if (!attendeeEmail && attendees && attendees.length > 0) {
      attendeeEmail = attendees[0].email;
    }

    // Validate email was found
    if (!attendeeEmail) {
      logger.error("No email found in webhook payload", {
        hasMetadata: !!metadata,
        hasMetadataEmail: !!metadata?.email,
        hasAttendees: !!attendees,
        attendeesLength: attendees?.length || 0,
      });
      return NextResponse.json({ error: "No email found in booking" }, { status: 400 });
    }

    // Normalize email
    attendeeEmail = attendeeEmail.toLowerCase().trim();

    // BOOKING_ENDED is a no-op (we just log and exit) — no DB writes needed.
    if (normalizedEvent === "BOOKING_ENDED") {
      logger.info("Meeting ended for:", hashEmailForLogging(attendeeEmail));
      return NextResponse.json({
        success: true,
        message: "Meeting ended event logged",
      });
    }

    // ============================================================================
    // CONTACT_SUBMISSIONS LOOKUP (form-submission audit trail)
    // ============================================================================
    // contact_submissions is only populated by the website contact form. Outreach
    // contacts have no row here — that's expected. We update the row only when
    // it exists; the CRM sync below runs regardless.

    const cutoffDate = new Date(Date.now() - SUBMISSION_MATCH_WINDOW_MS).toISOString();

    let existingSubmission:
      | {
          id: string;
          email: string;
          firstName: string;
          updatedAt: string;
          calBookingId: string | null;
        }
      | undefined;

    try {
      if (normalizedEvent === "BOOKING_RESCHEDULED" || normalizedEvent === "BOOKING_CANCELLED") {
        // Match by booking ID to ensure we're updating the correct booking
        const [row] = await db
          .select({
            id: contactSubmissions.id,
            email: contactSubmissions.email,
            firstName: contactSubmissions.firstName,
            updatedAt: contactSubmissions.updatedAt,
            calBookingId: contactSubmissions.calBookingId,
          })
          .from(contactSubmissions)
          .where(eq(contactSubmissions.calBookingId, bookingId))
          .orderBy(desc(contactSubmissions.createdAt))
          .limit(1);
        existingSubmission = row;
      } else {
        // For new bookings, match by email within the time window
        const [row] = await db
          .select({
            id: contactSubmissions.id,
            email: contactSubmissions.email,
            firstName: contactSubmissions.firstName,
            updatedAt: contactSubmissions.updatedAt,
            calBookingId: contactSubmissions.calBookingId,
          })
          .from(contactSubmissions)
          .where(
            and(
              eq(contactSubmissions.email, attendeeEmail),
              gte(contactSubmissions.createdAt, cutoffDate),
            ),
          )
          .orderBy(desc(contactSubmissions.createdAt))
          .limit(1);
        existingSubmission = row;
      }
    } catch (fetchError) {
      logger.error("Database error while fetching contact submission:", {
        message: fetchError instanceof Error ? fetchError.message : String(fetchError),
        emailHash: hashEmailForLogging(attendeeEmail),
      });
      return NextResponse.json(
        { error: "Database error while fetching submission" },
        { status: 500 },
      );
    }

    if (!existingSubmission) {
      logger.info("No contact submission — outreach-sourced or unknown contact path", {
        emailHash: hashEmailForLogging(attendeeEmail),
        event: normalizedEvent,
      });
    }

    // ============================================================================
    // BOOKING_CANCELLED
    // ============================================================================
    if (normalizedEvent === "BOOKING_CANCELLED") {
      if (existingSubmission) {
        try {
          const updatedData = await db
            .update(contactSubmissions)
            .set({
              calBookingId: null,
              bookingDateTime: null,
            })
            .where(eq(contactSubmissions.id, existingSubmission.id))
            .returning({ id: contactSubmissions.id });

          if (updatedData.length === 0) {
            logger.warn("No rows updated for cancellation", {
              submissionId: existingSubmission.id,
              emailHash: hashEmailForLogging(attendeeEmail),
            });
          } else {
            logger.info("Successfully cleared booking for cancellation:", {
              id: existingSubmission.id,
              emailHash: hashEmailForLogging(attendeeEmail),
              bookingId,
            });
          }
        } catch (updateError) {
          logger.error("Failed to clear booking for cancellation:", updateError);
          return NextResponse.json(
            {
              error: "Failed to update contact submission for cancellation",
              message: updateError instanceof Error ? updateError.message : String(updateError),
              details:
                "Database update failed when processing booking cancellation. Cal.com may retry this webhook.",
            },
            { status: 500 },
          );
        }
      }

      const { contactFound } = await runCrmCancelSync(attendeeEmail, bookingId);

      if (!existingSubmission && !contactFound) {
        return NextResponse.json({
          message: "No matching record found",
          emailHash: hashEmailForLogging(attendeeEmail),
        });
      }

      return NextResponse.json({
        success: true,
        message: "Booking cancelled",
        submissionId: existingSubmission?.id,
      });
    }

    // ============================================================================
    // BOOKING_CREATED
    // ============================================================================
    if (normalizedEvent === "BOOKING_CREATED") {
      if (existingSubmission) {
        // Idempotency: if this submission already has the same booking, the
        // CRM sync also already ran. Short-circuit.
        if (existingSubmission.calBookingId === bookingId) {
          logger.info("Booking already processed (idempotent):", {
            bookingId,
            existingSubmissionId: existingSubmission.id,
          });
          return NextResponse.json({
            success: true,
            message: "Booking already processed",
            submissionId: existingSubmission.id,
          });
        }

        // Different booking already attached — don't overwrite, don't retry.
        if (existingSubmission.calBookingId) {
          logger.warn("Submission already has a different booking", {
            submissionId: existingSubmission.id,
            existingBookingId: existingSubmission.calBookingId,
            newBookingId: bookingId,
            emailHash: hashEmailForLogging(attendeeEmail),
          });
          return NextResponse.json({
            success: true,
            message: "Submission already has a booking",
          });
        }

        // Atomic update: only sets cal_booking_id when it's still NULL.
        try {
          const updatedData = await db
            .update(contactSubmissions)
            .set({
              calBookingId: bookingId,
              bookingDateTime: startTime,
            })
            .where(
              and(
                eq(contactSubmissions.id, existingSubmission.id),
                isNull(contactSubmissions.calBookingId),
              ),
            )
            .returning({
              id: contactSubmissions.id,
              calBookingId: contactSubmissions.calBookingId,
            });

          if (updatedData.length === 0) {
            // Race resolution: another request may have won.
            const [checkBooking] = await db
              .select({ id: contactSubmissions.id, calBookingId: contactSubmissions.calBookingId })
              .from(contactSubmissions)
              .where(eq(contactSubmissions.calBookingId, bookingId))
              .limit(1);

            if (checkBooking) {
              logger.info("Booking already processed (race resolved):", {
                bookingId,
                existingSubmissionId: checkBooking.id,
              });
              return NextResponse.json({
                success: true,
                message: "Booking already processed",
                submissionId: checkBooking.id,
              });
            }

            logger.warn("No rows updated - submission may have another booking or was deleted", {
              submissionId: existingSubmission.id,
              emailHash: hashEmailForLogging(attendeeEmail),
            });
            return NextResponse.json({
              success: true,
              message: "Submission not found or already has a booking",
            });
          }

          logger.info("Successfully updated contact submission:", {
            id: existingSubmission.id,
            emailHash: hashEmailForLogging(attendeeEmail),
            bookingId,
          });
        } catch (updateError) {
          const errMsg = updateError instanceof Error ? updateError.message : String(updateError);
          if (errMsg.includes("23505") || errMsg.includes("unique")) {
            const [checkBooking] = await db
              .select({ id: contactSubmissions.id })
              .from(contactSubmissions)
              .where(eq(contactSubmissions.calBookingId, bookingId))
              .limit(1);

            if (checkBooking) {
              logger.info("Booking already processed elsewhere (idempotent):", {
                bookingId,
                existingSubmissionId: checkBooking.id,
              });
              return NextResponse.json({
                success: true,
                message: "Booking already processed",
                submissionId: checkBooking.id,
              });
            }
          }

          logger.error("Failed to update contact submission:", updateError);
          return NextResponse.json(
            {
              error: "Failed to update contact submission with booking details",
              message: errMsg,
              details:
                "Database update failed when processing new booking. Cal.com may retry this webhook.",
            },
            { status: 500 },
          );
        }
      }

      // Run CRM sync for both form-sourced AND outreach-sourced contacts.
      const { contactFound } = await runCrmBookingSync(
        attendeeEmail,
        bookingId,
        startTime,
        eventTitle,
      );

      if (!existingSubmission && !contactFound) {
        return NextResponse.json({
          message: "No matching record found",
          emailHash: hashEmailForLogging(attendeeEmail),
        });
      }

      return NextResponse.json({
        success: true,
        message: "Booking recorded",
        submissionId: existingSubmission?.id,
      });
    }

    // ============================================================================
    // BOOKING_RESCHEDULED
    // ============================================================================
    if (existingSubmission) {
      try {
        const updatedData = await db
          .update(contactSubmissions)
          .set({
            calBookingId: bookingId,
            bookingDateTime: startTime,
          })
          .where(eq(contactSubmissions.id, existingSubmission.id))
          .returning({ id: contactSubmissions.id });

        if (updatedData.length === 0) {
          logger.warn("No rows updated - submission may have been deleted", {
            submissionId: existingSubmission.id,
            emailHash: hashEmailForLogging(attendeeEmail),
          });
        } else {
          logger.info("Successfully rescheduled booking:", {
            id: existingSubmission.id,
            emailHash: hashEmailForLogging(attendeeEmail),
            bookingId,
          });
        }
      } catch (updateError) {
        logger.error("Failed to update contact submission:", updateError);
        return NextResponse.json(
          {
            error: "Failed to update contact submission with rescheduled booking",
            message: updateError instanceof Error ? updateError.message : String(updateError),
            details:
              "Database update failed when processing rescheduled booking. Cal.com may retry this webhook.",
          },
          { status: 500 },
        );
      }
    }

    const { contactFound } = await runCrmRescheduleSync(attendeeEmail, bookingId, startTime);

    if (!existingSubmission && !contactFound) {
      return NextResponse.json({
        message: "No matching record found",
        emailHash: hashEmailForLogging(attendeeEmail),
      });
    }

    return NextResponse.json({
      success: true,
      message: "Booking rescheduled",
      submissionId: existingSubmission?.id,
    });
  } catch (error) {
    logger.error("Webhook processing error:", error);

    return NextResponse.json(
      {
        error: "Webhook processing failed with unexpected error",
        message: error instanceof Error ? error.message : "Unknown error",
        details:
          "Cal.com webhook could not be processed. Cal.com may retry this webhook automatically.",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/webhooks/cal
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Cal.com webhook endpoint is active",
  });
}

// Export internal functions for testing
export const _testing = {
  computeSignature,
  verifyWebhookSignature,
  hashBodyForLogging,
  hashEmailForLogging,
};
