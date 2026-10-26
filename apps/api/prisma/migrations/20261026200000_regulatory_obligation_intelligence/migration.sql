-- Phase 3: Regulatory Obligation Intelligence Additive Migration
-- Migration: 20261026200000_regulatory_obligation_intelligence

-- ==============================================================================
-- 1. Create Enums for Regulatory Obligation Status, Extraction Method & Confidence
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RegulatoryObligationStatus') THEN
    CREATE TYPE "RegulatoryObligationStatus" AS ENUM ('CANDIDATE', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'DEPRECATED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ObligationExtractionMethod') THEN
    CREATE TYPE "ObligationExtractionMethod" AS ENUM ('RULE_BASED', 'AI_EXTRACTED', 'MANUAL_ENTRY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ObligationConfidence') THEN
    CREATE TYPE "ObligationConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
  END IF;
END $$;

-- ==============================================================================
-- 2. Create Table: regulatory_obligations
-- ==============================================================================
CREATE TABLE IF NOT EXISTS "regulatory_obligations" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "publicationId" TEXT NOT NULL,
  "publicationVersionId" TEXT,
  "catalogueEntryId" TEXT,
  "sourceId" TEXT,
  "manualIntakeId" TEXT,
  "obligationIdentifier" TEXT,
  "title" TEXT NOT NULL,
  "obligationWording" TEXT NOT NULL,
  "requiredAction" TEXT,
  "affectedActor" TEXT,
  "effectiveDate" TIMESTAMP(3),
  "complianceDeadline" TIMESTAMP(3),
  "sourceExcerpt" TEXT,
  "documentLocation" JSONB,
  "extractionMethod" "ObligationExtractionMethod" NOT NULL DEFAULT 'RULE_BASED',
  "extractionConfidence" "ObligationConfidence" NOT NULL DEFAULT 'HIGH',
  "extractionModelDetails" JSONB,
  "fingerprint" TEXT NOT NULL,
  "status" "RegulatoryObligationStatus" NOT NULL DEFAULT 'CANDIDATE',
  "isHumanVerified" BOOLEAN NOT NULL DEFAULT false,
  "verifiedById" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "reviewNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "regulatory_obligations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "regulatory_obligations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "regulatory_obligations_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "regulatory_publications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "regulatory_obligations_publicationVersionId_fkey" FOREIGN KEY ("publicationVersionId") REFERENCES "regulatory_publication_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "regulatory_obligations_catalogueEntryId_fkey" FOREIGN KEY ("catalogueEntryId") REFERENCES "regulatory_catalogue_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "regulatory_obligations_manualIntakeId_fkey" FOREIGN KEY ("manualIntakeId") REFERENCES "manual_source_intakes"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Idempotent deduplication unique index: guarantees re-extraction never duplicates candidate obligations
CREATE UNIQUE INDEX IF NOT EXISTS "regulatory_obligations_publicationId_fingerprint_key"
ON "regulatory_obligations"("publicationId", "fingerprint");

CREATE INDEX IF NOT EXISTS "regulatory_obligations_organizationId_idx" ON "regulatory_obligations"("organizationId");
CREATE INDEX IF NOT EXISTS "regulatory_obligations_publicationId_idx" ON "regulatory_obligations"("publicationId");
CREATE INDEX IF NOT EXISTS "regulatory_obligations_catalogueEntryId_idx" ON "regulatory_obligations"("catalogueEntryId");
CREATE INDEX IF NOT EXISTS "regulatory_obligations_status_idx" ON "regulatory_obligations"("status");
CREATE INDEX IF NOT EXISTS "regulatory_obligations_isHumanVerified_idx" ON "regulatory_obligations"("isHumanVerified");
CREATE INDEX IF NOT EXISTS "regulatory_obligations_affectedActor_idx" ON "regulatory_obligations"("affectedActor");
CREATE INDEX IF NOT EXISTS "regulatory_obligations_fingerprint_idx" ON "regulatory_obligations"("fingerprint");

-- ==============================================================================
-- 3. Row-Level Security (RLS) Policies
-- Permissive policy: allows reading global public obligations (organizationId IS NULL)
-- OR tenant-scoped obligations matching the current tenant context.
-- ==============================================================================
ALTER TABLE "regulatory_obligations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "regulatory_obligations" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regulatory_obligations_tenant_isolation" ON "regulatory_obligations";
CREATE POLICY "regulatory_obligations_tenant_isolation" ON "regulatory_obligations"
AS PERMISSIVE FOR ALL
USING (
  "organizationId" IS NULL
  OR "organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
)
WITH CHECK (
  "organizationId" IS NULL
  OR "organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'omnigrc_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "regulatory_obligations" TO omnigrc_app;
  END IF;
END $$;
