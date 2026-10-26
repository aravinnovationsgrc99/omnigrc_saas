-- Phase 6: Regulatory Control-Gap Analysis and Evidence Sufficiency Migration
-- (UNAPPLIED - Safe schema artifact, do not apply directly to production database)

-- 1. Create ControlGapOutcome Enum
DO $$ BEGIN
    CREATE TYPE "ControlGapOutcome" AS ENUM (
        'NO_MAPPING',
        'CONTROL_INELIGIBLE',
        'NOT_IMPLEMENTED',
        'PARTIALLY_IMPLEMENTED',
        'IMPLEMENTED',
        'UNKNOWN_IMPLEMENTATION'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create EvidenceSufficiencyOutcome Enum
DO $$ BEGIN
    CREATE TYPE "EvidenceSufficiencyOutcome" AS ENUM (
        'SUFFICIENT',
        'INSUFFICIENT',
        'STALE',
        'UNVERIFIED',
        'NOT_ASSESSED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Create Table: regulatory_control_gap_assessments
CREATE TABLE IF NOT EXISTS "regulatory_control_gap_assessments" (
    "id" VARCHAR(36) NOT NULL,
    "organizationId" VARCHAR(36) NOT NULL,
    "obligationId" VARCHAR(36) NOT NULL,
    "mappingId" VARCHAR(36),
    "controlId" VARCHAR(36),
    "publicationId" VARCHAR(36),
    "publicationVersionId" VARCHAR(36),
    "applicabilityId" VARCHAR(36),
    "gapOutcome" "ControlGapOutcome" NOT NULL,
    "evidenceOutcome" "EvidenceSufficiencyOutcome" NOT NULL DEFAULT 'NOT_ASSESSED',
    "determinationType" "DeterminationType" NOT NULL DEFAULT 'RULE_DERIVED',
    "confidence" "ObligationConfidence" NOT NULL DEFAULT 'HIGH',
    "gapRationale" TEXT NOT NULL,
    "evidenceRationale" TEXT NOT NULL,
    "ruleMatched" VARCHAR(128),
    "evaluatedRecords" JSONB NOT NULL,
    "isHumanReviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedById" VARCHAR(36),
    "reviewedAt" TIMESTAMPTZ,
    "reviewNotes" TEXT,
    "reassessmentCount" INTEGER NOT NULL DEFAULT 0,
    "assessedById" VARCHAR(36),
    "assessedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_control_gap_assessments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "regulatory_control_gap_assessments_organizationId_obligationId_key" UNIQUE ("organizationId", "obligationId")
);

-- 4. Create Table: regulatory_control_gap_assessment_histories
CREATE TABLE IF NOT EXISTS "regulatory_control_gap_assessment_histories" (
    "id" VARCHAR(36) NOT NULL,
    "assessmentId" VARCHAR(36) NOT NULL,
    "organizationId" VARCHAR(36) NOT NULL,
    "previousGapOutcome" "ControlGapOutcome" NOT NULL,
    "newGapOutcome" "ControlGapOutcome" NOT NULL,
    "previousEvidenceOutcome" "EvidenceSufficiencyOutcome" NOT NULL,
    "newEvidenceOutcome" "EvidenceSufficiencyOutcome" NOT NULL,
    "determinationType" "DeterminationType" NOT NULL,
    "gapRationale" TEXT NOT NULL,
    "evidenceRationale" TEXT NOT NULL,
    "actorId" VARCHAR(36) NOT NULL,
    "reviewNotes" TEXT,
    "evaluatedRecords" JSONB,
    "changedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_control_gap_assessment_histories_pkey" PRIMARY KEY ("id")
);

-- 5. Foreign Key Constraints
ALTER TABLE "regulatory_control_gap_assessments"
    ADD CONSTRAINT "regulatory_control_gap_assessments_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "regulatory_control_gap_assessments"
    ADD CONSTRAINT "regulatory_control_gap_assessments_obligationId_fkey"
    FOREIGN KEY ("obligationId") REFERENCES "regulatory_obligations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "regulatory_control_gap_assessments"
    ADD CONSTRAINT "regulatory_control_gap_assessments_mappingId_fkey"
    FOREIGN KEY ("mappingId") REFERENCES "regulatory_obligation_control_mappings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "regulatory_control_gap_assessments"
    ADD CONSTRAINT "regulatory_control_gap_assessments_controlId_fkey"
    FOREIGN KEY ("controlId") REFERENCES "controls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "regulatory_control_gap_assessments"
    ADD CONSTRAINT "regulatory_control_gap_assessments_publicationId_fkey"
    FOREIGN KEY ("publicationId") REFERENCES "regulatory_publications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "regulatory_control_gap_assessments"
    ADD CONSTRAINT "regulatory_control_gap_assessments_publicationVersionId_fkey"
    FOREIGN KEY ("publicationVersionId") REFERENCES "regulatory_publication_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "regulatory_control_gap_assessments"
    ADD CONSTRAINT "regulatory_control_gap_assessments_applicabilityId_fkey"
    FOREIGN KEY ("applicabilityId") REFERENCES "regulatory_applicability_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "regulatory_control_gap_assessment_histories"
    ADD CONSTRAINT "regulatory_control_gap_assessment_histories_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "regulatory_control_gap_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "regulatory_control_gap_assessment_histories"
    ADD CONSTRAINT "regulatory_control_gap_assessment_histories_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS "regulatory_control_gap_assessments_organizationId_idx" ON "regulatory_control_gap_assessments"("organizationId");
CREATE INDEX IF NOT EXISTS "regulatory_control_gap_assessments_obligationId_idx" ON "regulatory_control_gap_assessments"("obligationId");
CREATE INDEX IF NOT EXISTS "regulatory_control_gap_assessments_controlId_idx" ON "regulatory_control_gap_assessments"("controlId");
CREATE INDEX IF NOT EXISTS "regulatory_control_gap_assessments_mappingId_idx" ON "regulatory_control_gap_assessments"("mappingId");
CREATE INDEX IF NOT EXISTS "regulatory_control_gap_assessments_gapOutcome_idx" ON "regulatory_control_gap_assessments"("gapOutcome");
CREATE INDEX IF NOT EXISTS "regulatory_control_gap_assessments_evidenceOutcome_idx" ON "regulatory_control_gap_assessments"("evidenceOutcome");
CREATE INDEX IF NOT EXISTS "regulatory_control_gap_assessments_isHumanReviewed_idx" ON "regulatory_control_gap_assessments"("isHumanReviewed");

CREATE INDEX IF NOT EXISTS "regulatory_control_gap_assessment_histories_assessmentId_idx" ON "regulatory_control_gap_assessment_histories"("assessmentId");
CREATE INDEX IF NOT EXISTS "regulatory_control_gap_assessment_histories_organizationId_idx" ON "regulatory_control_gap_assessment_histories"("organizationId");

-- 7. Row-Level Security
ALTER TABLE "regulatory_control_gap_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "regulatory_control_gap_assessments" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regulatory_control_gap_assessments_tenant_isolation" ON "regulatory_control_gap_assessments";
CREATE POLICY "regulatory_control_gap_assessments_tenant_isolation" ON "regulatory_control_gap_assessments"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

ALTER TABLE "regulatory_control_gap_assessment_histories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "regulatory_control_gap_assessment_histories" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regulatory_control_gap_assessment_histories_tenant_isolation" ON "regulatory_control_gap_assessment_histories";
CREATE POLICY "regulatory_control_gap_assessment_histories_tenant_isolation" ON "regulatory_control_gap_assessment_histories"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'omnigrc_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "regulatory_control_gap_assessments" TO omnigrc_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "regulatory_control_gap_assessment_histories" TO omnigrc_app;
  END IF;
END $$;
