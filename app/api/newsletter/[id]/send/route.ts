import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { newsletterEditions, adminAuditLog } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { Resend } from "resend";
import { triggerPublishWorkflow } from "@/lib/newsletter/lib/queue/qstash-client";

/**
 * POST /api/newsletter/:id/send
 *
 * Send a newsletter edition to subscribers.
 *
 * In test mode, sends a single email inline (fast, bounded).
 *
 * In production mode, enqueues a QStash publish workflow which fans out
 * to all verified subscribers asynchronously. This keeps the request handler
 * well within the Vercel function timeout regardless of subscriber count.
 *
 * @auth Required - Admin users only
 * @param id - Newsletter edition ID
 * @body { testMode?: boolean, testEmail?: string }
 * @returns Queue status (or test send result in test mode)
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    // 1. Authentication
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    // Verify admin role
    if (session.user.role !== "admin" && session.user.role !== "super_admin") {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    // 2. Rate limiting
    const rateLimitResult = await checkRateLimit(
      `newsletter-send:${session.user.id}`,
      { limit: 10, windowMs: 60 * 60 * 1000 }, // 10 sends per hour per user
      "api",
    );

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Rate limit exceeded. Please try again later.",
          resetIn: rateLimitResult.resetIn,
        },
        { status: 429 },
      );
    }

    // 3. Validate ID parameter
    if (!id || typeof id !== "string") {
      return NextResponse.json({ success: false, error: "Invalid newsletter ID" }, { status: 400 });
    }

    // 4. Parse request body
    const body = await request.json();
    const { testMode = false, testEmail } = body;

    // 5. Fetch newsletter
    const [newsletter] = await db
      .select()
      .from(newsletterEditions)
      .where(eq(newsletterEditions.id, id))
      .limit(1);

    if (!newsletter) {
      return NextResponse.json({ success: false, error: "Newsletter not found" }, { status: 404 });
    }

    // 6. Validate newsletter status
    if (newsletter.status === "sent") {
      return NextResponse.json(
        { success: false, error: "Newsletter has already been sent" },
        { status: 400 },
      );
    }

    if (newsletter.status === "sending" || newsletter.status === "queued") {
      return NextResponse.json(
        { success: false, error: "Newsletter is already queued or being sent" },
        { status: 400 },
      );
    }

    // 7. Test mode - send a single inline email via Resend
    if (testMode) {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        logger.error("RESEND_API_KEY not configured");
        return NextResponse.json(
          {
            success: false,
            error: "Email service not configured. Please set RESEND_API_KEY environment variable.",
          },
          { status: 500 },
        );
      }

      const resend = new Resend(apiKey);
      const fromEmail = process.env.NEWSLETTER_FROM_EMAIL || "newsletter@email.__YOUR_DOMAIN__";

      const targetEmail = testEmail || session.user.email;

      if (!targetEmail) {
        return NextResponse.json(
          { success: false, error: "Test email address required" },
          { status: 400 },
        );
      }

      logger.debug(`Sending test newsletter to ${targetEmail}`);

      try {
        const { data: emailData, error: sendError } = await resend.emails.send({
          from: fromEmail,
          to: targetEmail,
          subject: `[TEST] ${newsletter.subject}`,
          html: newsletter.contentHtml,
          text: newsletter.contentText,
          headers: {
            "X-Newsletter-ID": newsletter.id,
            "X-Test-Mode": "true",
          },
        });

        if (sendError) {
          throw sendError;
        }

        // Log test send
        try {
          await db.insert(adminAuditLog).values({
            userId: session.user.id,
            action: "newsletter_test_sent",
            resourceType: "newsletter_edition",
            resourceId: id,
            details: {
              testEmail: targetEmail,
              emailId: emailData?.id,
            },
          });
        } catch (auditError) {
          logger.warn("Failed to write audit log", {
            error: auditError instanceof Error ? auditError.message : "Unknown error",
            action: "newsletter_test_sent",
          });
        }

        return NextResponse.json({
          success: true,
          testMode: true,
          message: `Test email sent to ${targetEmail}`,
          emailId: emailData?.id,
        });
      } catch (error) {
        logger.error("Failed to send test email:", error);
        return NextResponse.json(
          {
            success: false,
            error: error instanceof Error ? error.message : "Failed to send test email",
          },
          { status: 500 },
        );
      }
    }

    // 8. Production mode - enqueue publish workflow via QStash
    //
    // Atomically flip the edition to `queued` so concurrent send requests
    // can't double-enqueue. We use a WHERE clause on the previous status to
    // guard against races.
    const previousStatus = newsletter.status;
    const nowIso = new Date().toISOString();

    const flipped = await db
      .update(newsletterEditions)
      .set({ status: "queued", updatedAt: nowIso })
      .where(and(eq(newsletterEditions.id, id), eq(newsletterEditions.status, previousStatus)))
      .returning({ id: newsletterEditions.id });

    if (flipped.length === 0) {
      return NextResponse.json(
        { success: false, error: "Newsletter status changed; please retry" },
        { status: 409 },
      );
    }

    // Enqueue the publish workflow. If this throws, revert the status.
    let workflowRunId: string;
    try {
      const result = await triggerPublishWorkflow({
        campaignId: newsletter.campaignId ?? id,
        newsletterId: id,
        userId: session.user.id,
      });
      workflowRunId = result.workflowRunId;
    } catch (enqueueError) {
      logger.error("Failed to enqueue newsletter publish workflow:", enqueueError);

      // Best-effort revert to previous status
      try {
        await db
          .update(newsletterEditions)
          .set({ status: previousStatus, updatedAt: new Date().toISOString() })
          .where(eq(newsletterEditions.id, id));
      } catch (revertError) {
        logger.error("Failed to revert newsletter status after enqueue failure:", revertError);
      }

      return NextResponse.json(
        {
          success: false,
          error:
            enqueueError instanceof Error
              ? `Failed to enqueue newsletter: ${enqueueError.message}`
              : "Failed to enqueue newsletter",
        },
        { status: 500 },
      );
    }

    // Audit log
    try {
      await db.insert(adminAuditLog).values({
        userId: session.user.id,
        action: "newsletter_queued",
        resourceType: "newsletter_edition",
        resourceId: id,
        details: {
          workflowRunId,
        },
      });
    } catch (auditError) {
      logger.warn("Failed to write audit log", {
        error: auditError instanceof Error ? auditError.message : "Unknown error",
        action: "newsletter_queued",
      });
    }

    logger.info("Newsletter publish workflow enqueued", {
      newsletterId: id,
      workflowRunId,
    });

    return NextResponse.json({
      success: true,
      status: "queued",
      newsletterId: id,
      workflowRunId,
    });
  } catch (error) {
    logger.error("Newsletter send error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send newsletter",
      },
      { status: 500 },
    );
  }
}
