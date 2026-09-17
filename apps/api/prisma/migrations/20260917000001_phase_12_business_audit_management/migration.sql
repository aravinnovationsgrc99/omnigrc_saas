-- CreateEnum
CREATE TYPE "AuditPlanStatus" AS ENUM ('DRAFT', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "AuditScheduleStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "AuditAssessmentStatus" AS ENUM ('IN_PROGRESS', 'UNDER_REVIEW', 'COMPLETED');
CREATE TYPE "AuditCheckResult" AS ENUM ('NOT_EVALUATED', 'COMPLIANT', 'PARTIALLY_COMPLIANT', 'NON_COMPLIANT', 'NOT_APPLICABLE');
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'IN_REMEDIATION', 'READY_FOR_VERIFICATION', 'VERIFIED', 'CLOSED');
CREATE TYPE "CapaStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'CLOSED');

-- CreateTable AuditPlans
CREATE TABLE "audit_plans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "scope" TEXT,
    "frameworkCode" TEXT,
    "ownerId" TEXT NOT NULL,
    "plannedStartDate" TIMESTAMP(3),
    "plannedEndDate" TIMESTAMP(3),
    "status" "AuditPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable AuditSchedules
CREATE TABLE "audit_schedules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "auditPlanId" TEXT NOT NULL,
    "scheduledStartDate" TIMESTAMP(3) NOT NULL,
    "scheduledEndDate" TIMESTAMP(3) NOT NULL,
    "leadAuditorId" TEXT NOT NULL,
    "status" "AuditScheduleStatus" NOT NULL DEFAULT 'SCHEDULED',
    "recurrence" "ObligationCadence",
    "nextAuditDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable AuditAssessments
CREATE TABLE "audit_assessments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "auditPlanId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "auditorId" TEXT NOT NULL,
    "status" "AuditAssessmentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "summary" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable AuditCheckItems
CREATE TABLE "audit_check_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "controlId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "result" "AuditCheckResult" NOT NULL DEFAULT 'NOT_EVALUATED',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_check_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable AuditEvidences
CREATE TABLE "audit_evidences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "checkItemId" TEXT,
    "findingId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable AuditFindings
CREATE TABLE "audit_findings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "checkItemId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "VulnerabilitySeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "riskId" TEXT,
    "remediationPlan" TEXT,
    "verificationNotes" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable AuditCapas
CREATE TABLE "audit_capas" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "correctiveAction" TEXT NOT NULL,
    "preventiveAction" TEXT,
    "ownerId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "CapaStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_capas_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "audit_plans_organizationId_idx" ON "audit_plans"("organizationId");
CREATE INDEX "audit_plans_status_idx" ON "audit_plans"("status");

CREATE INDEX "audit_schedules_organizationId_idx" ON "audit_schedules"("organizationId");
CREATE INDEX "audit_schedules_auditPlanId_idx" ON "audit_schedules"("auditPlanId");
CREATE INDEX "audit_schedules_status_idx" ON "audit_schedules"("status");

CREATE INDEX "audit_assessments_organizationId_idx" ON "audit_assessments"("organizationId");
CREATE INDEX "audit_assessments_auditPlanId_idx" ON "audit_assessments"("auditPlanId");
CREATE INDEX "audit_assessments_status_idx" ON "audit_assessments"("status");

CREATE INDEX "audit_check_items_organizationId_idx" ON "audit_check_items"("organizationId");
CREATE INDEX "audit_check_items_assessmentId_idx" ON "audit_check_items"("assessmentId");
CREATE INDEX "audit_check_items_controlId_idx" ON "audit_check_items"("controlId");
CREATE INDEX "audit_check_items_result_idx" ON "audit_check_items"("result");

CREATE INDEX "audit_evidences_organizationId_idx" ON "audit_evidences"("organizationId");
CREATE INDEX "audit_evidences_checkItemId_idx" ON "audit_evidences"("checkItemId");
CREATE INDEX "audit_evidences_findingId_idx" ON "audit_evidences"("findingId");

CREATE INDEX "audit_findings_organizationId_idx" ON "audit_findings"("organizationId");
CREATE INDEX "audit_findings_assessmentId_idx" ON "audit_findings"("assessmentId");
CREATE INDEX "audit_findings_status_idx" ON "audit_findings"("status");
CREATE INDEX "audit_findings_severity_idx" ON "audit_findings"("severity");
CREATE INDEX "audit_findings_ownerId_idx" ON "audit_findings"("ownerId");

CREATE INDEX "audit_capas_organizationId_idx" ON "audit_capas"("organizationId");
CREATE INDEX "audit_capas_findingId_idx" ON "audit_capas"("findingId");
CREATE INDEX "audit_capas_status_idx" ON "audit_capas"("status");

-- AddForeignKeys
ALTER TABLE "audit_plans" ADD CONSTRAINT "audit_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_schedules" ADD CONSTRAINT "audit_schedules_auditPlanId_fkey" FOREIGN KEY ("auditPlanId") REFERENCES "audit_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_assessments" ADD CONSTRAINT "audit_assessments_auditPlanId_fkey" FOREIGN KEY ("auditPlanId") REFERENCES "audit_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_assessments" ADD CONSTRAINT "audit_assessments_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "audit_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_check_items" ADD CONSTRAINT "audit_check_items_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "audit_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_check_items" ADD CONSTRAINT "audit_check_items_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "controls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_evidences" ADD CONSTRAINT "audit_evidences_checkItemId_fkey" FOREIGN KEY ("checkItemId") REFERENCES "audit_check_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_evidences" ADD CONSTRAINT "audit_evidences_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "audit_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "audit_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_checkItemId_fkey" FOREIGN KEY ("checkItemId") REFERENCES "audit_check_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "risks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_capas" ADD CONSTRAINT "audit_capas_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "audit_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security
ALTER TABLE "audit_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_check_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_evidences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_findings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_capas" ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_plans_tenant_isolation ON "audit_plans" USING ("organizationId"::text = current_setting('app.current_tenant', true));
CREATE POLICY audit_schedules_tenant_isolation ON "audit_schedules" USING ("organizationId"::text = current_setting('app.current_tenant', true));
CREATE POLICY audit_assessments_tenant_isolation ON "audit_assessments" USING ("organizationId"::text = current_setting('app.current_tenant', true));
CREATE POLICY audit_check_items_tenant_isolation ON "audit_check_items" USING ("organizationId"::text = current_setting('app.current_tenant', true));
CREATE POLICY audit_evidences_tenant_isolation ON "audit_evidences" USING ("organizationId"::text = current_setting('app.current_tenant', true));
CREATE POLICY audit_findings_tenant_isolation ON "audit_findings" USING ("organizationId"::text = current_setting('app.current_tenant', true));
CREATE POLICY audit_capas_tenant_isolation ON "audit_capas" USING ("organizationId"::text = current_setting('app.current_tenant', true));
