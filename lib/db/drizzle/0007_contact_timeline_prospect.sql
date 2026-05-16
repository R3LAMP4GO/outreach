-- Allow contact_timeline rows to belong to a prospect instead of a contact.
-- Prospects exist before they're promoted to a contact, so prospect-only
-- events (e.g. "prospect_imported", "seo_report_generated") need a way to
-- attach to a prospect without forging a contact row.
--
-- Apply via: node scripts/apply-migration.mjs lib/db/drizzle/0007_contact_timeline_prospect.sql
-- (or `bunx drizzle-kit push` to sync schema.ts in dev)

ALTER TABLE "contact_timeline" ALTER COLUMN "contact_id" DROP NOT NULL;
ALTER TABLE "contact_timeline" ADD COLUMN IF NOT EXISTS "prospect_id" uuid;
CREATE INDEX IF NOT EXISTS "contact_timeline_prospect_id_idx" ON "contact_timeline" USING btree ("prospect_id");

-- Integrity guard: every row must point at a contact OR a prospect (or both).
ALTER TABLE "contact_timeline"
  DROP CONSTRAINT IF EXISTS "contact_timeline_owner_check";
ALTER TABLE "contact_timeline"
  ADD CONSTRAINT "contact_timeline_owner_check"
  CHECK (contact_id IS NOT NULL OR prospect_id IS NOT NULL);
