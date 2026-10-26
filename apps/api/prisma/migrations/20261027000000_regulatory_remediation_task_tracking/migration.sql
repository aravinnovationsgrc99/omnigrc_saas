-- Phase 7: Regulatory Remediation Planning and Task Tracking Migration
-- (UNAPPLIED - Safe schema artifact, do not apply directly to production database)

-- 1. Create RegulatoryRemediationStatus Enum
DO $$ BEGIN
    CREATE TYPE "RegulatoryRemediationStatus" AS ENUM (
        'PROPOSED',
        'AWAITING_APPROVAL',
        'APPROVED',
        'IN_PROGRESS',
        'BLOCKED',
        'COMPLETED',
        'VERIFIED_CLOSED',
        'REJECTED',
        'RISK_ACCEPTED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create RemediationPriority Enum
DO $$ BEGIN
    CREATE TYPE "RemediationPriority" AS ENUM (
        'LOW',
        'MEDIUM',
        'HIGH',
        'CRITICAL'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Create Table: regulatory_remediation_tasks
CREATE TABLE IF NOT EXISTS "regulatory_remediation_tasks" (
    "id" VARCHAR(36) NOT NULL,
    "organizationId" VARCHAR(36) NOT NULL,
    "complianceTaskId" VARCHAR(36) NOT NULL,
    "assessmentId" VARCHAR(36) NOT NULL,
    "obligationId" VARCHAR(36) NOT NULL,
    "controlId" VARCHAR(36),
    "mappingId" VARCHAR(36),
    "publicationId" VARCHAR(36),
    "publicationVersionId" VARCHAR(36),
    "applicabilityId" VARCHAR(36),

    "status" "RegulatoryRemediationStatus" NOT NULL DEFAULT 'PROPOSED',
    "priority" "RemediationPriority" NOT NULL DEFAULT 'MEDIUM',
    "initialGapOutcome" "ControlGapOutcome" NOT NULL,
    "initialEvidenceOutcome" "EvidenceSufficiencyOutcome" NOT NULL,

    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "acceptanceCriteria" TEXT NOT NULL,

    "internalDueDate" TIMESTAMPTZ,
    "regulatoryDeadline" TIMESTAMPTZ,

    "assignedToId" VARCHAR(36) NOT NULL,
    "assignedById" VARCHAR(36) NOT NULL,

    "blockedReason" TEXT,
    "unblockedReason" TEXT,

    "progressNotes" TEXT,
    "completionNotes" TEXT,
    "evidenceReferences" JSONB,

    "verifiedById" VARCHAR(36),
    "verifiedAt" TIMESTAMPTZ,
    "verificationNotes" TEXT,
    "reassessmentRequested" BOOLEAN NOT NULL DEFAULT false,

    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" VARCHAR(36),
    "approvedAt" TIMESTAMPTZ,
    "approvalNotes" TEXT,
    "rejectedById" VARCHAR(36),
    "rejectedAt" TIMESTAMPTZ,
    "rejectionReason" TEXT,

    "riskAcceptedById" VARCHAR(36),
    "riskAcceptedAt" TIMESTAMPTZ,
    "riskAcceptanceRationale" TEXT,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_remediation_tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "regulatory_remediation_tasks_complianceTaskId_key" UNIQUE ("complianceTaskId")
);

-- 4. Create Table: regulatory_remediation_histories
CREATE TABLE IF NOT EXISTS "regulatory_remediation_histories" (
    "id" VARCHAR(36) NOT NULL,
    "remediationTaskId" VARCHAR(36) NOT NULL,
    "organizationId" VARCHAR(36) NOT NULL,
    "previousStatus" "RegulatoryRemediationStatus",
    "newStatus" "RegulatoryRemediationStatus" NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "actorId" VARCHAR(36) NOT NULL,
    "rationale" TEXT,
    "snapshotPayload" JSONB,
    "recordedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_remediation_histories_pkey" PRIMARY KEY ("id")
);

-- 5. Foreign Keys for regulatory_remediation_tasks
DO $$ BEGIN
    ALTER TABLE "regulatory_remediation_tasks"
        ADD CONSTRAINT "regulatory_remediation_tasks_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "regulatory_remediation_tasks"
        ADD CONSTRAINT "regulatory_remediation_tasks_complianceTaskId_fkey"
        FOREIGN KEY ("complianceTaskId") REFERENCES "compliance_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "regulatory_remediation_tasks"
        ADD CONSTRAINT "regulatory_remediation_tasks_assessmentId_fkey"
        FOREIGN KEY ("assessmentId") REFERENCES "regulatory_control_gap_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "regulatory_remediation_tasks"
        ADD CONSTRAINT "regulatory_remediation_tasks_obligationId_fkey"
        FOREIGN KEY ("obligationId") REFERENCES "regulatory_obligations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "regulatory_remediation_tasks"
        ADD CONSTRAINT "regulatory_remediation_tasks_controlId_fkey"
        FOREIGN KEY ("controlId") REFERENCES "controls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "regulatory_remediation_tasks"
        ADD CONSTRAINT "regulatory_remediation_tasks_mappingId_fkey"
        FOREIGN KEY ("mappingId") REFERENCES "regulatory_obligation_control_mappings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "regulatory_remediation_tasks"
        ADD CONSTRAINT "regulatory_remediation_tasks_publicationId_fkey"
        FOREIGN KEY ("publicationId") REFERENCES "regulatory_publications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "regulatory_remediation_tasks"
        ADD CONSTRAINT "regulatory_remediation_tasks_publicationVersionId_fkey"
        FOREIGN KEY ("publicationVersionId") REFERENCES "regulatory_publication_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "regulatory_remediation_tasks"
        ADD CONSTRAINT "regulatory_remediation_tasks_applicabilityId_fkey"
        FOREIGN KEY ("applicabilityId") REFERENCES "regulatory_applicability_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 6. Foreign Keys for regulatory_remediation_histories
DO $$ BEGIN
    ALTER TABLE "regulatory_remediation_histories"
        ADD CONSTRAINT "regulatory_remediation_histories_remediationTaskId_fkey"
        FOREIGN KEY ("remediationTaskId") REFERENCES "regulatory_remediation_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "regulatory_remediation_histories"
        ADD CONSTRAINT "regulatory_remediation_histories_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 7. Indexes
CREATE INDEX IF NOT EXISTS "regulatory_remediation_tasks_organizationId_idx" ON "regulatory_remediation_tasks"("organizationId");
CREATE INDEX IF NOT EXISTS "regulatory_remediation_tasks_assessmentId_idx" ON "regulatory_remediation_tasks"("assessmentId");
CREATE INDEX IF NOT EXISTS "regulatory_remediation_tasks_complianceTaskId_idx" ON "regulatory_remediation_tasks"("complianceTaskId");
CREATE INDEX IF NOT EXISTS "regulatory_remediation_tasks_obligationId_idx" ON "regulatory_remediation_tasks"("obligationId");
CREATE INDEX IF NOT EXISTS "regulatory_remediation_tasks_controlId_idx" ON "regulatory_remediation_tasks"("controlId");
CREATE INDEX IF NOT EXISTS "regulatory_remediation_tasks_status_idx" ON "regulatory_remediation_tasks"("status");
CREATE INDEX IF NOT EXISTS "regulatory_remediation_tasks_priority_idx" ON "regulatory_remediation_tasks"("priority");
CREATE INDEX IF NOT EXISTS "regulatory_remediation_tasks_assignedToId_idx" ON "regulatory_remediation_tasks"("assignedToId");

-- Partial unique index guaranteeing at most ONE active remediation task per finding per organization
CREATE UNIQUE INDEX IF NOT EXISTS "regulatory_remediation_tasks_active_assessment_idx"
ON "regulatory_remediation_tasks"("organizationId", "assessmentId")
WHERE "status" NOT IN ('VERIFIED_CLOSED', 'REJECTED', 'RISK_ACCEPTED');

CREATE INDEX IF NOT EXISTS "regulatory_remediation_histories_remediationTaskId_idx" ON "regulatory_remediation_histories"("remediationTaskId");
CREATE INDEX IF NOT EXISTS "regulatory_remediation_histories_organizationId_idx" ON "regulatory_remediation_histories"("organizationId");

-- 8. Row-Level Security
ALTER TABLE "regulatory_remediation_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "regulatory_remediation_tasks" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regulatory_remediation_tasks_tenant_isolation" ON "regulatory_remediation_tasks";
CREATE POLICY "regulatory_remediation_tasks_tenant_isolation" ON "regulatory_remediation_tasks"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

ALTER TABLE "regulatory_remediation_histories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "regulatory_remediation_histories" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regulatory_remediation_histories_tenant_isolation" ON "regulatory_remediation_histories";
CREATE POLICY "regulatory_remediation_histories_tenant_isolation" ON "regulatory_remediation_histories"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'omnigrc_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "regulatory_remediation_tasks" TO omnigrc_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "regulatory_remediation_histories" TO omnigrc_app;
  END IF;
END $$;
