-- Phase 2.1 Remediation: Regulatory Manual Intake Tenant Isolation & Deduplication Additive Migration
-- Migration: 20261026190000_regulatory_manual_intake_tenant_isolation

-- ==============================================================================
-- 1. Regulatory Sources: Consecutive Failures and Paused Scheduling State
-- ==============================================================================
ALTER TABLE "regulatory_sources" 
  ADD COLUMN IF NOT EXISTS "isPaused" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "consecutiveFailures" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "regulatory_sources_isPaused_idx" ON "regulatory_sources"("isPaused");

-- ==============================================================================
-- 2. Regulatory Publications: Feed Content Hash, Document Bytes SHA-256 & Deduplication
-- ==============================================================================
ALTER TABLE "regulatory_publications"
  ADD COLUMN IF NOT EXISTS "feedContentHash" TEXT,
  ADD COLUMN IF NOT EXISTS "documentBytesSha256" TEXT,
  ADD COLUMN IF NOT EXISTS "isDocumentBytesVerified" BOOLEAN NOT NULL DEFAULT false;

-- Deduplication index for (sourceId, externalId) when externalId is non-null (DB-01)
-- Partial unique index permits multiple NULL externalId records while strictly preventing duplicate non-null external IDs
CREATE UNIQUE INDEX IF NOT EXISTS "regulatory_publications_sourceId_externalId_key" 
ON "regulatory_publications"("sourceId", "externalId") 
WHERE "externalId" IS NOT NULL;

-- ==============================================================================
-- 3. Regulatory Publication Versions: Separated Content vs Byte Verification
-- ==============================================================================
ALTER TABLE "regulatory_publication_versions"
  ADD COLUMN IF NOT EXISTS "feedContentHash" TEXT,
  ADD COLUMN IF NOT EXISTS "documentBytesSha256" TEXT,
  ADD COLUMN IF NOT EXISTS "isDocumentBytesVerified" BOOLEAN NOT NULL DEFAULT false;

-- ==============================================================================
-- 4. Manual Source Intakes: Tenant Isolation (SEC-01) & Safe Backfill Plan
-- ==============================================================================
-- Step 4.1: Add organizationId column as nullable first to safely allow data backfill
ALTER TABLE "manual_source_intakes" 
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

-- Step 4.2: Safe Non-Fabricated Backfill Plan
-- In production environments with pre-existing manual intake records:
-- 1. Backfill organizationId directly from the uploading user's organization:
--    UPDATE "manual_source_intakes" m
--    SET "organizationId" = u."organizationId"
--    FROM "users" u
--    WHERE m."uploadedById" = u."id"
--      AND m."organizationId" IS NULL;
--
-- 2. Any orphan record whose uploadedById cannot be resolved to an active organization
--    MUST NOT be arbitrarily reassigned. It must be isolated/quarantined for administrative review
--    prior to enforcing the NOT NULL constraint.
--
-- The following backfill executes idempotently:
UPDATE "manual_source_intakes" m
SET "organizationId" = u."organizationId"
FROM "users" u
WHERE m."uploadedById" = u."id"
  AND m."organizationId" IS NULL;

-- Step 4.3: Enforce NOT NULL and Foreign Key Constraint
-- Note: Only execute once all records have a valid organizationId
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "manual_source_intakes" WHERE "organizationId" IS NULL
  ) THEN
    ALTER TABLE "manual_source_intakes" ALTER COLUMN "organizationId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'manual_source_intakes_organizationId_fkey'
  ) THEN
    ALTER TABLE "manual_source_intakes" 
      ADD CONSTRAINT "manual_source_intakes_organizationId_fkey" 
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "manual_source_intakes_organizationId_idx" ON "manual_source_intakes"("organizationId");

-- ==============================================================================
-- 5. PostgreSQL Row-Level Security (RLS) Enforcement on Manual Source Intakes
-- ==============================================================================
ALTER TABLE "manual_source_intakes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "manual_source_intakes" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manual_source_intakes_tenant_isolation" ON "manual_source_intakes";
CREATE POLICY "manual_source_intakes_tenant_isolation" ON "manual_source_intakes"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

-- Least privilege grant to omnigrc_app role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'omnigrc_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "manual_source_intakes" TO omnigrc_app;
  END IF;
END $$;
