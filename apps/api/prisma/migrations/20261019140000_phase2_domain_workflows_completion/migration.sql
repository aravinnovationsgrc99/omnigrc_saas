-- Phase 2: Domain Models and Business Workflow Completion Additive Migration
-- Modifies: risks, incidents, vendors
-- Creates: incident_actions, vendor_questionnaires, vendor_questionnaire_submissions, vendor_assessment_actions
-- Establishes RLS policies for newly created tenant-owned tables and least-privilege grants to omnigrc_app.

-- 1. Alter Table "risks" (Additive Columns)
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "residualLikelihood" INTEGER;
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "residualImpact" INTEGER;
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "residualScore" INTEGER;
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "treatmentStrategy" TEXT;
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "treatmentOwner" TEXT;
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "treatmentDueDate" TIMESTAMP(3);
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "treatmentStatus" TEXT;
CREATE INDEX IF NOT EXISTS "risks_category_idx" ON "risks"("category");

-- 2. Alter Table "incidents" (Additive Columns)
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "priority" TEXT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "businessUnit" TEXT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "investigationDetails" TEXT;
CREATE INDEX IF NOT EXISTS "incidents_category_idx" ON "incidents"("category");

-- 3. Alter Table "vendors" (Additive Columns)
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "dueDiligenceStatus" TEXT;

-- 4. Create Table "incident_actions"
CREATE TABLE IF NOT EXISTS "incident_actions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "actionType" TEXT NOT NULL DEFAULT 'CORRECTIVE',
    "owner" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "CapaStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "incident_actions_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "incident_actions_organizationId_idx" ON "incident_actions"("organizationId");
CREATE INDEX IF NOT EXISTS "incident_actions_incidentId_idx" ON "incident_actions"("incidentId");
CREATE INDEX IF NOT EXISTS "incident_actions_status_idx" ON "incident_actions"("status");

-- 5. Create Table "vendor_questionnaires"
CREATE TABLE IF NOT EXISTS "vendor_questionnaires" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "questions" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_questionnaires_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vendor_questionnaires_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "vendor_questionnaires_organizationId_idx" ON "vendor_questionnaires"("organizationId");
CREATE INDEX IF NOT EXISTS "vendor_questionnaires_status_idx" ON "vendor_questionnaires"("status");

-- 6. Create Table "vendor_questionnaire_submissions"
CREATE TABLE IF NOT EXISTS "vendor_questionnaire_submissions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "assessmentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "answers" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "score" INTEGER,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_questionnaire_submissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vendor_questionnaire_submissions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "vendor_questionnaire_submissions_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "vendor_questionnaire_submissions_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "vendor_questionnaires"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "vendor_questionnaire_submissions_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "vendor_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "vendor_questionnaire_submissions_organizationId_idx" ON "vendor_questionnaire_submissions"("organizationId");
CREATE INDEX IF NOT EXISTS "vendor_questionnaire_submissions_vendorId_idx" ON "vendor_questionnaire_submissions"("vendorId");
CREATE INDEX IF NOT EXISTS "vendor_questionnaire_submissions_questionnaireId_idx" ON "vendor_questionnaire_submissions"("questionnaireId");
CREATE INDEX IF NOT EXISTS "vendor_questionnaire_submissions_status_idx" ON "vendor_questionnaire_submissions"("status");

-- 7. Create Table "vendor_assessment_actions"
CREATE TABLE IF NOT EXISTS "vendor_assessment_actions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "actionType" TEXT NOT NULL DEFAULT 'REMEDIATION',
    "owner" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "CapaStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_assessment_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vendor_assessment_actions_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "vendor_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "vendor_assessment_actions_organizationId_idx" ON "vendor_assessment_actions"("organizationId");
CREATE INDEX IF NOT EXISTS "vendor_assessment_actions_assessmentId_idx" ON "vendor_assessment_actions"("assessmentId");
CREATE INDEX IF NOT EXISTS "vendor_assessment_actions_status_idx" ON "vendor_assessment_actions"("status");

-- 8. PostgreSQL Row Level Security (RLS) on New Tenant Tables
ALTER TABLE "incident_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "incident_actions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "vendor_questionnaires" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vendor_questionnaires" FORCE ROW LEVEL SECURITY;

ALTER TABLE "vendor_questionnaire_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vendor_questionnaire_submissions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "vendor_assessment_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vendor_assessment_actions" FORCE ROW LEVEL SECURITY;

-- 9. Tenant Isolation Policies
DROP POLICY IF EXISTS "incident_actions_tenant_isolation" ON "incident_actions";
CREATE POLICY "incident_actions_tenant_isolation" ON "incident_actions"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "vendor_questionnaires_tenant_isolation" ON "vendor_questionnaires";
CREATE POLICY "vendor_questionnaires_tenant_isolation" ON "vendor_questionnaires"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "vendor_questionnaire_submissions_tenant_isolation" ON "vendor_questionnaire_submissions";
CREATE POLICY "vendor_questionnaire_submissions_tenant_isolation" ON "vendor_questionnaire_submissions"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "vendor_assessment_actions_tenant_isolation" ON "vendor_assessment_actions";
CREATE POLICY "vendor_assessment_actions_tenant_isolation" ON "vendor_assessment_actions"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

-- 10. Least-Privilege Role Grants to omnigrc_app
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'omnigrc_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "incident_actions" TO omnigrc_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "vendor_questionnaires" TO omnigrc_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "vendor_questionnaire_submissions" TO omnigrc_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "vendor_assessment_actions" TO omnigrc_app;
  END IF;
END $$;
