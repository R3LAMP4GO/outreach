# Cal.com Webhook Integration

This API endpoint receives webhooks from Cal.com when bookings are created, rescheduled, or cancelled, and updates the corresponding contact submissions in the database via Drizzle ORM.

## Endpoint

**Production URL:** `https://hooks.coastalprograms.com/api/webhooks/cal`
**Method:** `POST`
**Content-Type:** `application/json`

### Why `hooks.coastalprograms.com` and not the main domain?

The main site (`coastalprograms.com` / `www.coastalprograms.com`) is proxied through Cloudflare (orange cloud). Cloudflare's free-tier Bot Fight Mode + managed bot rules return **HTTP 403** for Cal.com's webhook POSTs before they reach Railway. Confirmed by reproducing locally: a direct `POST` to `coastalprograms.com/api/webhooks/cal` returns `401 Invalid signature` (route runs); Cal.com's identical POST gets `403` from Cloudflare's edge.

`hooks.coastalprograms.com` is configured as **DNS-only (grey cloud)** in Cloudflare, pointing directly at Railway. Cal.com → DNS → Railway, no Cloudflare proxy in the path, no bot rules to fight.

**Do NOT "clean this up" by moving the webhook URL back to the apex domain or by orange-clouding the `hooks` CNAME.** It will silently break Cal.com → CRM sync (deals stay stuck at `Contacted`, never advance to `Meeting Booked`).

DNS records (Cloudflare zone `coastalprograms.com`):
- `CNAME hooks → <railway-target>.up.railway.app` — **DNS only (grey cloud)**
- `TXT _railway-verify.hooks → railway-verify=...` — required by Railway for ownership verification

Railway custom domain: `hooks.coastalprograms.com` is added to the `website` service (port 3000), same app as the main site.

## Setup Instructions

### Step 1: Generate Webhook Secret

Generate a secure 32-character secret:
```bash
# Mac/Linux
openssl rand -hex 32

# Windows (PowerShell)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))

# Or use: https://randomkeygen.com/
```

### Step 2: Add Environment Variables

**Local Development** (`.env.local`):
```bash
CAL_WEBHOOK_SECRET=your_generated_secret_here
DATABASE_URL=postgresql://user:pass@host:port/dbname
```

**Production** (Vercel):
```
Variable: CAL_WEBHOOK_SECRET
Value: your_generated_secret_here
```

### 2. Cal.com Webhook Setup

1. Go to [Cal.com Webhooks Settings](https://app.cal.com/settings/developer/webhooks)
2. Click "New Webhook"
3. Configure:
   - **Subscriber URL:** `https://your-domain.com/api/webhooks/cal`
   - **Triggers:** Select "Booking Created" (and optionally "Rescheduled" and "Cancelled")
   - **Secret:** Enter the same secret as `CAL_WEBHOOK_SECRET` above
   - **Payload Template:** Use default (no customization needed)

4. Save and activate the webhook

## How It Works

### Flow

1. User fills out contact form on website
2. Form data saved to `contact_submissions` table
3. User redirected to Cal.com with pre-filled information
4. User books a call on Cal.com
5. Cal.com sends webhook to `/api/webhooks/cal`
6. Webhook handler:
   - Verifies HMAC-SHA256 signature
   - Extracts email, booking ID, and start time
   - Calls `update_contact_and_deal_for_booking` RPC via `db.execute(sql\`...\`)`
   - Updates contact status, deal stage, and timeline

### Supported Events

- **BOOKING_CREATED**: Stores booking ID and date/time
- **BOOKING_RESCHEDULED**: Updates booking ID and new date/time
- **BOOKING_CANCELLED**: Clears booking ID and date/time
- **BOOKING_ENDED**: Logged (could be used for follow-up emails)

## Database Access

All database operations use Drizzle ORM:

```typescript
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

// RPC call for atomic contact + deal update
await db.execute(sql`SELECT * FROM update_contact_and_deal_for_booking(
  ${email}::text,
  ${bookingUid}::text,
  ${startTime}::timestamptz
)`);
```

## Database Schema

Updates the `contact_submissions` table:

```sql
-- Fields updated by webhook
cal_booking_id         TEXT         -- Cal.com booking UID
booking_date_time      TIMESTAMPTZ  -- Scheduled start time
updated_at             TIMESTAMPTZ  -- Auto-updated timestamp
```

## Security

- **Signature Verification**: Uses HMAC-SHA256 with secret key
- **Timing-Safe Comparison**: Prevents timing attacks
- **Drizzle ORM**: Uses `db` from `@/lib/db` with parameterized queries for safe database access
- **Input Validation**: Validates all required fields before processing

## Testing

### Local Testing with ngrok

1. Start local dev server:
   ```bash
   bun run dev
   ```

2. Expose localhost with ngrok:
   ```bash
   ngrok http 3000
   ```

3. Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)

4. Update Cal.com webhook URL temporarily:
   ```
   https://abc123.ngrok.io/api/webhooks/cal
   ```

5. Create a test booking and check ngrok request inspector

### Manual Testing with cURL

```bash
# Get webhook secret (use your CAL_WEBHOOK_SECRET from .env.local)
SECRET="your_webhook_secret_here"

# Create test payload
PAYLOAD='{
  "triggerEvent": "BOOKING_CREATED",
  "createdAt": "2025-01-19T10:00:00.000Z",
  "payload": {
    "uid": "test-booking-123",
    "bookingId": 123,
    "type": "30min",
    "title": "Test Booking",
    "description": "Test booking description",
    "startTime": "2025-01-25T14:00:00.000Z",
    "endTime": "2025-01-25T14:30:00.000Z",
    "attendees": [
      {
        "email": "[email protected]",
        "name": "Test User",
        "timeZone": "Australia/Sydney"
      }
    ],
    "organizer": {
      "email": "[email protected]",
      "name": "Jake Schepis",
      "timeZone": "Australia/Sydney"
    }
  }
}'

# Generate signature (Mac/Linux)
SIGNATURE="sha256=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')"

# Send webhook (use localhost:3000 for local testing or your production domain)
curl -X POST http://localhost:3000/api/webhooks/cal \
  -H "Content-Type: application/json" \
  -H "x-cal-signature-256: $SIGNATURE" \
  -d "$PAYLOAD"
```

### Check Webhook Health

```bash
# GET request to check webhook is active
curl http://localhost:3000/api/webhooks/cal
```

Expected response:
```json
{
  "status": "ok",
  "message": "Cal.com webhook endpoint is active"
}
```

## Monitoring

### Logs to Check

1. **Vercel Function Logs**: Check for webhook processing errors
2. **Database Logs**: Verify database updates
3. **Cal.com Webhook Logs**: View webhook delivery status

### Common Issues

| Issue | Solution |
|-------|----------|
| "Invalid signature" | Verify `CAL_WEBHOOK_SECRET` matches Cal.com setting |
| "No matching contact submission found" | Check email in Cal.com matches contact form email |
| "Webhook secret not configured" | Add `CAL_WEBHOOK_SECRET` to environment variables |
| Signature format mismatch | Webhook now supports both `sha256=<hash>` and raw hash |

## Code Structure

```
app/api/webhooks/cal/
├── route.ts         # Webhook handler
└── README.md        # This file
```

### Key Functions

- `verifyWebhookSignature()`: Validates HMAC-SHA256 signature
- `POST()`: Main webhook handler
- `GET()`: Health check endpoint

## Next Steps

1. ✅ Webhook handler created with signature verification
2. ⏳ Configure webhook in Cal.com dashboard
3. ⏳ Test end-to-end with real booking
4. ⏳ Monitor initial webhook deliveries
5. 🔮 Future: Add email notifications when booking confirmed

## Related Files

- Contact Form: `components/sections/ContactForm.tsx`
- Form Submit API: `app/api/contact/submit/route.ts`
- Database Client: `lib/db/index.ts`
- Database Schema: `lib/db/schema.ts`
- Table Migration: `supabase/migrations/20250119000001_create_contact_submissions.sql`
