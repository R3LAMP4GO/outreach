# Quo (OpenPhone) Integration

End-to-end wiring for receiving call + message events from Quo (formerly
OpenPhone), running AI extraction on phone-call transcripts, and writing
the results into the CRM.

## Architecture

```
Quo workspace
   │
   │  HTTPS POST + openphone-signature header
   ▼
POST /api/webhooks/quo  ──► verify signature
                          │
                          ├─► idempotency dedupe (quo_webhook_events)
                          │
                          ├─► call.completed              ─┐
                          ├─► call.summary.completed       ├─► enqueue `process-quo-call` (pg-boss)
                          ├─► call.transcript.completed   ─┘        │
                          │                                          ▼
                          ├─► message.received  ──► inline timeline + admin notification
                          └─► message.delivered ──► inline timeline (delivery receipt)
                                                                     │
                                                                     ▼
                          ┌──────────────────────────────────────────┘
                          │
                          ▼
                pg-boss worker: process-quo-call
                          │
                          ├─► getCall + getCallSummary + getCallTranscript (Quo REST)
                          ├─► extractCallData (gg-ai → Anthropic)
                          ├─► find-or-create prospect by phone
                          ├─► upsert contact (only when email captured)
                          ├─► update prospect.outreachStage + lastTouchedAt
                          ├─► write `call_made` / `call_received` timeline event
                          └─► if follow-up intent: insert row + enqueue scheduled job
```

## Quo webhook URL to register

Replace `<your-domain>` with whatever the operator has configured (e.g.
`hooks.example.com`).

```
https://<your-domain>/api/webhooks/quo
```

Configure in the Quo dashboard at:
**Settings → Integrations → Webhooks → Create webhook**

Subscribe to these event types:

| Event                          | Why we need it                              |
| ------------------------------ | ------------------------------------------- |
| `call.completed`               | First signal that a call ended              |
| `call.summary.completed`       | Quo's AI summary is ready                   |
| `call.transcript.completed`    | Quo's AI transcript is ready                |
| `message.received`             | Inbound SMS                                 |
| `message.delivered`            | Outbound SMS delivery receipt               |

## Environment variables

Set on **both** the `website` and `worker` Railway services.

| Variable                       | Purpose                                                                                                                                  | Required |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `QUO_WEBHOOK_SECRET`           | Base64 signing key from the Quo webhook details page (**"Reveal Signing Secret"**). Used to verify the `openphone-signature` header.    | yes      |
| `QUO_API_KEY`                  | Quo REST API key. Used by `lib/quo/client.ts` to fetch call metadata / summaries / transcripts. NO `Bearer` prefix.                      | yes      |
| `QUO_PHONE_NUMBER`             | Your Quo number in E.164 (`+15551234567`). Determines which side of `from`/`to` is the prospect on inbound vs. outbound calls/messages. | yes      |
| `OPENAI_API_KEY`               | For the AI extraction step (`extractCallData` → gg-ai → OpenAI, `gpt-4.1-mini`).                                                          | yes      |
| `PROCESS_QUO_CALL_CONCURRENCY` | Max parallel `process-quo-call` jobs on the worker (default 2).                                                                          | no       |
| `QUO_API_BASE`                 | Override the REST base URL. Defaults to `https://api.openphone.com/v1`.                                                                  | no       |

## Signature verification

Quo signs each webhook with HMAC-SHA256 and ships the digest in the
`openphone-signature` header. Format documented at
<https://support.openphone.com/core-concepts/integrations/webhooks>
(verified 2026-05-15):

```
openphone-signature: hmac;1;<timestampMs>;<base64-signature>
```

Verification (`lib/quo/verify-signature.ts`):

1. Split the header on `;` → `[scheme, version, timestamp, signature]`.
2. Reject anything that isn't `scheme="hmac"`, `version="1"`, finite numeric
   timestamp, and present-tense (≤ 5 min old, ≤ 30 s clock skew).
3. Build the signed payload: `${timestamp}.${rawBody}`.
4. **Convert the base64-decoded signing key to a binary (latin1) string**
   before passing it to `crypto.createHmac`. This is unusual but matches
   Quo's own Node example exactly — skipping the `.toString("binary")` step
   silently rejects every real Quo webhook.
5. Compute HMAC-SHA256 over the signed payload, base64-encode the digest,
   and `timingSafeEqual` against the header value.

The signing key in the env var must be exactly the base64 string Quo shows
in the "Reveal Signing Secret" dialog. Don't strip padding, don't trim, don't
re-encode.

## Idempotency

Two layers, both in Postgres:

1. **`quo_webhook_events`** — the webhook route writes the event id before
   dispatching downstream work. `ON CONFLICT DO NOTHING` on the PK turns
   the second arrival into a no-op (200 ack with `duplicate: true`).
2. **`quo_calls_processed`** — the `process-quo-call` job records the
   callId once it's fully extracted. All three call-related webhooks
   (`call.completed`, `call.summary.completed`, `call.transcript.completed`)
   enqueue the same job; this table is how the handler knows the work has
   already been done.

## Partial-ready retries

Quo's AI takes 1–2 minutes to generate summary + transcript after a call ends.
The `call.completed` webhook usually arrives *before* both are ready. The job
handler throws `QuoArtefactsNotReadyError` when either is missing; the
queue's retry config (`retryLimit: 5`, `retryDelay: 120 s`) gives Quo up to
10 minutes to finish before we give up.

## Stage progression

The AI extraction updates `prospects.outreachStage` per:

| Captured                | New stage          |
| ----------------------- | ------------------ |
| `emailCaptured` is set  | `email_captured`   |
| `phoneCaptured` is set  | `phone_captured`   |
| (default)               | `called`           |

Existing stages further along the funnel are not downgraded — the UPDATE
unconditionally moves to the new stage, so if an admin manually moved the
prospect to `meeting_booked`, a subsequent call extraction would walk it
back to `email_captured`. **TODO**: add a stage-ordering guard, or restrict
this to a known set of source stages, in a follow-up if this becomes a
problem in practice.

## Contact creation rules

`contacts.email` is `NOT NULL` in the schema. The job handler therefore
**only creates a contact when the AI extraction returned `emailCaptured`**.
When no email was captured but a person name was, the person info is
appended to `prospects.notes` so the admin can promote them manually later.

## Schema additions

Two new tables introduced by this integration (`lib/db/drizzle/0008_quo_webhook_events.sql`):

- `quo_webhook_events(id text pk, event_type text, received_at timestamptz)`
- `quo_calls_processed(call_id text pk, prospect_id uuid, contact_id uuid, processed_at timestamptz)`

Apply in production via:

```bash
node scripts/apply-migration.mjs lib/db/drizzle/0008_quo_webhook_events.sql
```

Or in dev with `bunx drizzle-kit push`.

## Testing locally

The signing key Quo gives you is workspace-specific — there's no shared
sandbox secret. To test the route handler:

```bash
# 1. Generate a signed test payload (uses the production sign helper)
bun -e '
  import("./lib/quo/verify-signature").then(async ({ signQuoPayload }) => {
    const body = JSON.stringify({
      id: "EVtest",
      object: "event",
      apiVersion: "v4",
      createdAt: new Date().toISOString(),
      type: "call.completed",
      data: { object: {
        id: "ACtest", direction: "outgoing", status: "completed",
        from: "+15550001111", to: "+15552223333",
        createdAt: new Date().toISOString(),
      }},
    });
    const sig = signQuoPayload(body, process.env.QUO_WEBHOOK_SECRET);
    console.log("body:", body);
    console.log("header:", sig);
  })
'

# 2. POST it to your local dev server
.gg/eyes/http.sh http://localhost:3500/api/webhooks/quo POST '<body-from-step-1>' \
  -H "openphone-signature: <header-from-step-1>"
```

For end-to-end testing against real Quo events, use ngrok or your team's
shared tunnel to expose `localhost:3500` and register that URL in a
**dev** Quo workspace (don't point production webhooks at a tunnel).

## Reference

- Official docs: <https://support.openphone.com/core-concepts/integrations/webhooks>
- Pipedream OpenPhone sources (test-event fixtures): <https://github.com/PipedreamHQ/pipedream/tree/main/components/openphone>
- Quo REST client (this repo): `lib/quo/client.ts`
- AI extraction (this repo): `lib/ai/gg-client.ts`
- Worker registration: `scripts/worker.ts` (search for `PROCESS_QUO_CALL`)
