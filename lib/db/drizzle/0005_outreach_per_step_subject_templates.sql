-- Per-step subject templates for outreach campaigns.
--
-- 0004 added email_1_subject_template but not 2/3. Each step's editor in the
-- Sequence tab needs its own subject template field so the UI is symmetric
-- (subject + body per step).
--
-- Also tightens the body template defaults to {{email_N_body}} so each step's
-- default explicitly references its own lead-written body — clearer than the
-- {{email_body}} magic shortcut.

ALTER TABLE outreach_campaigns
  ADD COLUMN email_2_subject_template text,
  ADD COLUMN email_3_subject_template text;

ALTER TABLE outreach_campaigns
  ALTER COLUMN email_1_template SET DEFAULT '{{email_1_body}}',
  ALTER COLUMN email_2_template SET DEFAULT '{{email_2_body}}',
  ALTER COLUMN email_3_template SET DEFAULT '{{email_3_body}}';

-- Rewrite any existing rows that are still on the old generic default.
UPDATE outreach_campaigns SET email_1_template = '{{email_1_body}}' WHERE email_1_template = '{{email_body}}';
UPDATE outreach_campaigns SET email_2_template = '{{email_2_body}}' WHERE email_2_template = '{{email_body}}';
UPDATE outreach_campaigns SET email_3_template = '{{email_3_body}}' WHERE email_3_template = '{{email_body}}';
