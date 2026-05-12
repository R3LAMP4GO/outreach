/**
 * Outreach booking webhook tester
 *
 * Purpose-built for testing the Cal.com webhook handler against localhost,
 * specifically the outreach-sourced booking path (no contact_submissions row).
 *
 * Usage:
 *   bun scripts/test-outreach-booking.ts --email josh@example.com
 *   bun scripts/test-outreach-booking.ts --email josh@example.com --event BOOKING_RESCHEDULED --booking-id abc-123
 *   bun scripts/test-outreach-booking.ts --email josh@example.com --event BOOKING_CANCELLED --booking-id abc-123
 *
 * Signature format matches Cal.com's open-source `createWebhookSignature`:
 *   raw hex HMAC-SHA256 (no `sha256=` prefix).
 */

import crypto from "crypto";
import { config } from "dotenv";

config({ path: ".env.local" });

type EventType = "BOOKING_CREATED" | "BOOKING_RESCHEDULED" | "BOOKING_CANCELLED" | "BOOKING_ENDED";

const VALID_EVENTS: EventType[] = [
  "BOOKING_CREATED",
  "BOOKING_RESCHEDULED",
  "BOOKING_CANCELLED",
  "BOOKING_ENDED",
];

interface CliFlags {
  email: string | null;
  event: EventType;
  bookingId: string;
  startTime: string;
  url: string;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {
    email: null,
    event: "BOOKING_CREATED",
    bookingId: `outreach-test-${crypto.randomUUID()}`,
    startTime: tomorrowAt10AmSydney(),
    url: process.env.WEBHOOK_URL || "http://localhost:3500/api/webhooks/cal",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--email":
        flags.email = next ?? null;
        i++;
        break;
      case "--event": {
        if (!next) throw new Error("--event requires a value");
        const upper = next.toUpperCase() as EventType;
        if (!VALID_EVENTS.includes(upper)) {
          throw new Error(`--event must be one of: ${VALID_EVENTS.join(", ")}`);
        }
        flags.event = upper;
        i++;
        break;
      }
      case "--booking-id":
        if (!next) throw new Error("--booking-id requires a value");
        flags.bookingId = next;
        i++;
        break;
      case "--start-time":
        if (!next) throw new Error("--start-time requires a value");
        flags.startTime = next;
        i++;
        break;
      case "--url":
        if (!next) throw new Error("--url requires a value");
        flags.url = next;
        i++;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown flag: ${arg}`);
        }
    }
  }

  return flags;
}

function printUsage(): void {
  console.log(`Outreach booking webhook tester

Flags:
  --email <addr>         (required) Attendee email — must match a CRM contact
  --event <type>         BOOKING_CREATED | BOOKING_RESCHEDULED | BOOKING_CANCELLED | BOOKING_ENDED
                         (default: BOOKING_CREATED)
  --booking-id <id>      Cal.com booking UID (default: random UUID)
  --start-time <iso>     Booking start time (default: tomorrow 10am Sydney)
  --url <url>            Webhook URL (default: http://localhost:3500/api/webhooks/cal)
  -h, --help             Show this message
`);
}

function tomorrowAt10AmSydney(): string {
  // 10am Sydney = 23:00 UTC the previous day in standard time, 00:00 UTC in daylight time.
  // Easier: just pick now + 24h, then snap to 10:00 in Sydney by computing the UTC offset.
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  // Sydney is UTC+10 (AEST) or UTC+11 (AEDT). Use the system to format the date in Sydney.
  const sydneyDateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(tomorrow);
  const get = (type: string) => sydneyDateParts.find((p) => p.type === type)?.value ?? "";
  const ymd = `${get("year")}-${get("month")}-${get("day")}`;
  // Build a UTC instant equivalent to 10am Sydney by probing the offset.
  // Pick a candidate of 10:00:00 in Sydney and convert: we use a helper that
  // creates a Date from "YYYY-MM-DDT10:00:00" interpreted as Sydney local.
  const probe = new Date(`${ymd}T10:00:00Z`);
  const sydneyOffsetMs = sydneyOffsetForInstant(probe);
  return new Date(probe.getTime() - sydneyOffsetMs).toISOString();
}

function sydneyOffsetForInstant(instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Sydney",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const sydneyAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return sydneyAsUtc - instant.getTime();
}

function buildPayload(flags: CliFlags) {
  const startTime = flags.startTime;
  const endTime = new Date(new Date(startTime).getTime() + 30 * 60 * 1000).toISOString();

  return {
    triggerEvent: flags.event,
    createdAt: new Date().toISOString(),
    payload: {
      uid: flags.bookingId,
      bookingId: Math.floor(Math.random() * 1_000_000_000),
      type: "30min",
      title: "Business Consultation",
      description: "Outreach-booking webhook test",
      startTime,
      endTime,
      attendees: [
        {
          email: flags.email!,
          name: "Outreach Test",
          timeZone: "Australia/Sydney",
        },
      ],
      organizer: {
        email: process.env.TEST_ORGANIZER_EMAIL || "test@example.com",
        name: "Test Organizer",
        timeZone: "Australia/Sydney",
      },
      metadata: {},
    },
  };
}

function signRawHex(body: string, secret: string): string {
  // Matches Cal.com's createWebhookSignature: raw hex, no prefix.
  // Source: calcom/cal.com packages/features/webhooks/lib/sendPayload.ts
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

async function main(): Promise<void> {
  let flags: CliFlags;
  try {
    flags = parseFlags(process.argv.slice(2));
  } catch (err) {
    console.error("✖", err instanceof Error ? err.message : String(err));
    printUsage();
    process.exit(2);
  }

  if (!flags.email) {
    console.error("✖ --email is required");
    printUsage();
    process.exit(2);
  }

  const secret = process.env.CAL_WEBHOOK_SECRET;
  if (!secret) {
    console.error("✖ CAL_WEBHOOK_SECRET not set in .env.local");
    process.exit(1);
  }

  const payload = buildPayload(flags);
  const body = JSON.stringify(payload);
  const signature = signRawHex(body, secret);

  console.log("┌─ Outreach booking webhook test ─");
  console.log(`│ URL:        ${flags.url}`);
  console.log(`│ Event:      ${flags.event}`);
  console.log(`│ Email:      ${flags.email}`);
  console.log(`│ Booking ID: ${flags.bookingId}`);
  console.log(`│ Start:      ${flags.startTime}`);
  console.log(`│ Signature:  ${signature.substring(0, 16)}… (raw hex)`);
  console.log("└─");

  const start = Date.now();
  let response: Response;
  try {
    response = await fetch(flags.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cal-signature-256": signature,
        "x-cal-webhook-version": "2021-10-20",
      },
      body,
    });
  } catch (err) {
    console.error("✖ Network error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const elapsedMs = Date.now() - start;
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* leave as text */
  }

  console.log(`\nStatus:   ${response.status} ${response.statusText} (${elapsedMs}ms)`);
  console.log("Response:", typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2));

  if (response.ok) {
    console.log("\n✓ Webhook accepted");
    process.exit(0);
  } else {
    console.log("\n✖ Webhook rejected");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("✖ Unexpected error:", err);
  process.exit(1);
});
