-- Phase 4: Regulatory Applicability Assessment Additive Migration
-- Migration: 20261026210000_regulatory_applicability_assessment

-- ==============================================================================
-- 1. Create Enums for Applicability Outcome, Determination Type & Confidence
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApplicabilityOutcome') THEN
    CREATE TYPE "ApplicabilityOutcome" AS ENUM ('APPLICABLE', 'NOT_APPLICABLE', 'REQUIRES_REVIEW', 'INSUFFICIENT_INFORMATION');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeterminationType') THEN
    CREATE TYPE "DeterminationType" AS ENUM ('RULE_DERIVED', 'HUMAN_OVERRIDDEN', 'HUMAN_CONFIRMED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApplicabilityConfidence') THEN
    CREATE TYPE "ApplicabilityConfidence" AS ENUM ('CONFIRMED', 'HIGH', 'MEDIUM', 'LOW');
  END IF;
END $$;

-- ==============================================================================
-- 2. Create Table: organization_compliance_profiles
-- ==============================================================================
CREATE TABLE IF NOT EXISTS "organization_compliance_profiles" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "operatingJurisdictions" TEXT[] NOT NULL DEFAULT ARRAY['INDIA']::TEXT[],
  "industrySector" TEXT,
  "regulatedEntityTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "handlesPersonalData" BOOLEAN NOT NULL DEFAULT true,
  "handlesPaymentData" BOOLEAN NOT NULL DEFAULT false,
  "isSignificantDataFiduciary" BOOLEAN NOT NULL DEFAULT false,
  "annualTurnoverBand" TEXT,
  "employeeCountBand" TEXT,
  "customAttributes" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "organization_compliance_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_compliance_profiles_organizationId_key" UNIQUE ("organizationId"),
  CONSTRAINT "organization_compliance_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "organization_compliance_profiles_organizationId_idx" ON "organization_compliance_profiles"("organizationId");

-- ==============================================================================
-- 3. Create Table: regulatory_applicability_assessments
-- ==============================================================================
CREATE TABLE IF NOT EXISTS "regulatory_applicability_assessments" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "obligationId" TEXT NOT NULL,
  "publicationId" TEXT,
  "publicationVersionId" TEXT,
  "catalogueEntryId" TEXT,
  "outcome" "ApplicabilityOutcome" NOT NULL,
  "determinationType" "DeterminationType" NOT NULL DEFAULT 'RULE_DERIVED',
  "confidence" "ApplicabilityConfidence" NOT NULL DEFAULT 'HIGH',
  "rationale" TEXT NOT NULL,
  "ruleMatched" TEXT,
  "evaluatedAttributes" JSONB NOT NULL,
  "obligationCriteriaSnapshot" JSONB NOT NULL,
  "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assessedById" TEXT,
  "isHumanReviewed" BOOLEAN NOT NULL DEFAULT false,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNotes" TEXT,
  "previousOutcome" "ApplicabilityOutcome",
  "reassessmentCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "regulatory_applicability_assessments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "regulatory_applicability_assessments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "regulatory_applicability_assessments_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "regulatory_obligations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "regulatory_applicability_assessments_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "regulatory_publications"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "regulatory_applicability_assessments_catalogueEntryId_fkey" FOREIGN KEY ("catalogueEntryId") REFERENCES "regulatory_catalogue_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "regulatory_applicability_assessments_organizationId_obligationId_key"
ON "regulatory_applicability_assessments"("organizationId", "obligationId");

CREATE INDEX IF NOT EXISTS "regulatory_applicability_assessments_organizationId_idx" ON "regulatory_applicability_assessments"("organizationId");
CREATE INDEX IF NOT EXISTS "regulatory_applicability_assessments_obligationId_idx" ON "regulatory_applicability_assessments"("obligationId");
CREATE INDEX IF NOT EXISTS "regulatory_applicability_assessments_catalogueEntryId_idx" ON "regulatory_applicability_assessments"("catalogueEntryId");
CREATE INDEX IF NOT EXISTS "regulatory_applicability_assessments_outcome_idx" ON "regulatory_applicability_assessments"("outcome");
CREATE INDEX IF NOT EXISTS "regulatory_applicability_assessments_determinationType_idx" ON "regulatory_applicability_assessments"("determinationType");
CREATE INDEX IF NOT EXISTS "regulatory_applicability_assessments_isHumanReviewed_idx" ON "regulatory_applicability_assessments"("isHumanReviewed");

-- ==============================================================================
-- 4. Create Table: regulatory_applicability_histories
-- ==============================================================================
CREATE TABLE IF NOT EXISTS "regulatory_applicability_histories" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "previousOutcome" "ApplicabilityOutcome" NOT NULL,
  "newOutcome" "ApplicabilityOutcome" NOT NULL,
  "determinationType" "DeterminationType" NOT NULL,
  "rationale" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "evaluatedAttributes" JSONB,

  CONSTRAINT "regulatory_applicability_histories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "regulatory_applicability_histories_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "regulatory_applicability_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "regulatory_applicability_histories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "regulatory_applicability_histories_assessmentId_idx" ON "regulatory_applicability_histories"("assessmentId");
CREATE INDEX IF NOT EXISTS "regulatory_applicability_histories_organizationId_idx" ON "regulatory_applicability_histories"("organizationId");

-- ==============================================================================
-- 5. Row-Level Security (RLS) Policies
-- ==============================================================================
ALTER TABLE "organization_compliance_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_compliance_profiles" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organization_compliance_profiles_tenant_isolation" ON "organization_compliance_profiles";
CREATE POLICY "organization_compliance_profiles_tenant_isolation" ON "organization_compliance_profiles"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

ALTER TABLE "regulatory_applicability_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "regulatory_applicability_assessments" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regulatory_applicability_assessments_tenant_isolation" ON "regulatory_applicability_assessments";
CREATE POLICY "regulatory_applicability_assessments_tenant_isolation" ON "regulatory_applicability_assessments"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

ALTER TABLE "regulatory_applicability_histories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "regulatory_applicability_histories" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regulatory_applicability_histories_tenant_isolation" ON "regulatory_applicability_histories";
CREATE POLICY "regulatory_applicability_histories_tenant_isolation" ON "regulatory_applicability_histories"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'omnigrc_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "organization_compliance_profiles" TO omnigrc_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "regulatory_applicability_assessments" TO omnigrc_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "regulatory_applicability_histories" TO omnigrc_app;
  END IF;
END $$;
