-- Outreach: per-campaign sequence templates + per-sender signatures.
--
-- The "email shell" moves from per-contact to per-campaign. Each campaign owns
-- three templates (one per step) that wrap the AI-personalised body stored on
-- outreach_contacts. Three new tokens are recognised inside these templates:
--   {{email_body}}        → contact.email_N_body (AI-personalised paragraph)
--   {{signature}}         → sender.signature_html / signature_plain_text
--   {{unsubscribe_link}}  → system-rendered styled <p> footer (WYSIWYG —
--                           only appears in the email if the token is present)
--
-- Legacy outreach_campaigns.email_subject / email_body columns are dropped:
-- nothing reads them at send time. The schema is now honest about which fields
-- drive the send (per-contact body/subject + per-campaign template wrapper).

-- 1. Per-campaign sequence templates (the "shell" wrapping each contact's body).
ALTER TABLE outreach_campaigns
  ADD COLUMN email_1_template text NOT NULL DEFAULT E'{{email_body}}\n\n{{signature}}',
  ADD COLUMN email_2_template text NOT NULL DEFAULT E'{{email_body}}\n\n{{signature}}',
  ADD COLUMN email_3_template text NOT NULL DEFAULT E'{{email_body}}\n\n{{signature}}',
  ADD COLUMN email_1_subject_template text;

-- 2. Backfill: in-flight (status='active') campaigns previously had an
-- auto-appended visible unsubscribe footer. Preserve that behaviour for those
-- campaigns so the next emails sent don't look different from the ones already
-- sent in the same sequence.
UPDATE outreach_campaigns
SET
  email_1_template = E'{{email_body}}\n\n{{signature}}\n\n{{unsubscribe_link}}',
  email_2_template = E'{{email_body}}\n\n{{signature}}\n\n{{unsubscribe_link}}',
  email_3_template = E'{{email_body}}\n\n{{signature}}\n\n{{unsubscribe_link}}'
WHERE status = 'active';

-- 3. Per-sender signatures (HTML + plain text variants).
ALTER TABLE outreach_sender_accounts
  ADD COLUMN signature_html text,
  ADD COLUMN signature_plain_text text;

-- 4. Drop legacy campaign-wide body/subject columns. Nothing reads them at
-- send time (confirmed via grep across lib/outreach/sending/).
ALTER TABLE outreach_campaigns
  DROP COLUMN email_body,
  DROP COLUMN email_subject;
