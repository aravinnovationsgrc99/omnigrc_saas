-- CreateEnum
CREATE TYPE "ApprovalWorkflowStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ApprovalInstanceStatus" AS ENUM ('DRAFT', 'PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalStepStatus" AS ENUM ('PENDING', 'ACTIVE', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ApproverType" AS ENUM ('ROLE', 'DEPARTMENT', 'PROJECT', 'SPECIFIC_USER', 'ORGANIZATION_AUTHORITY');

-- CreateEnum
CREATE TYPE "DecisionAction" AS ENUM ('APPROVE', 'REJECT', 'REQUEST_CHANGES');

-- CreateTable
CREATE TABLE "approval_workflows" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "applicableResourceType" TEXT NOT NULL,
    "status" "ApprovalWorkflowStatus" NOT NULL DEFAULT 'ACTIVE',
    "allowSelfApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_workflow_steps" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "approverType" "ApproverType" NOT NULL DEFAULT 'ROLE',
    "targetRole" "Role",
    "targetDepartmentId" TEXT,
    "targetProjectId" TEXT,
    "specificUserId" TEXT,
    "dueDays" INTEGER,

    CONSTRAINT "approval_workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_instances" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "status" "ApprovalInstanceStatus" NOT NULL DEFAULT 'PENDING',
    "currentStepNumber" INTEGER NOT NULL DEFAULT 1,
    "dueAt" TIMESTAMP(3),
    "frameworkReferenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "approval_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_instance_steps" (
    "id" TEXT NOT NULL,
    "approvalInstanceId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "approverType" "ApproverType" NOT NULL DEFAULT 'ROLE',
    "targetRole" "Role",
    "targetDepartmentId" TEXT,
    "targetProjectId" TEXT,
    "specificUserId" TEXT,
    "status" "ApprovalStepStatus" NOT NULL DEFAULT 'PENDING',
    "activatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "approval_instance_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_decisions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "approvalInstanceId" TEXT NOT NULL,
    "stepId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" "DecisionAction" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_approvals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "approvalInstanceId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_approvals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "approvalInstanceId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_approvals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "approvalInstanceId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_finding_approvals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "approvalInstanceId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_finding_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_assessment_approvals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorAssessmentId" TEXT NOT NULL,
    "approvalInstanceId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_assessment_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vulnerability_approvals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vulnerabilityId" TEXT NOT NULL,
    "approvalInstanceId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vulnerability_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_approvals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "approvalInstanceId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_exception_approvals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "policyExceptionId" TEXT NOT NULL,
    "approvalInstanceId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_exception_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_approvals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "approvalInstanceId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "approval_workflows_organizationId_idx" ON "approval_workflows"("organizationId");
CREATE INDEX "approval_workflows_applicableResourceType_idx" ON "approval_workflows"("applicableResourceType");
CREATE INDEX "approval_workflows_status_idx" ON "approval_workflows"("status");

CREATE UNIQUE INDEX "approval_workflow_steps_workflowId_stepNumber_key" ON "approval_workflow_steps"("workflowId", "stepNumber");
CREATE INDEX "approval_workflow_steps_workflowId_idx" ON "approval_workflow_steps"("workflowId");

CREATE INDEX "approval_instances_organizationId_idx" ON "approval_instances"("organizationId");
CREATE INDEX "approval_instances_resourceType_resourceId_idx" ON "approval_instances"("resourceType", "resourceId");
CREATE INDEX "approval_instances_requesterId_idx" ON "approval_instances"("requesterId");
CREATE INDEX "approval_instances_status_idx" ON "approval_instances"("status");

CREATE UNIQUE INDEX "approval_instance_steps_approvalInstanceId_stepNumber_key" ON "approval_instance_steps"("approvalInstanceId", "stepNumber");
CREATE INDEX "approval_instance_steps_approvalInstanceId_idx" ON "approval_instance_steps"("approvalInstanceId");
CREATE INDEX "approval_instance_steps_status_idx" ON "approval_instance_steps"("status");

CREATE INDEX "approval_decisions_organizationId_idx" ON "approval_decisions"("organizationId");
CREATE INDEX "approval_decisions_approvalInstanceId_idx" ON "approval_decisions"("approvalInstanceId");
CREATE INDEX "approval_decisions_actorId_idx" ON "approval_decisions"("actorId");

CREATE UNIQUE INDEX "control_approvals_controlId_approvalInstanceId_key" ON "control_approvals"("controlId", "approvalInstanceId");
CREATE UNIQUE INDEX "risk_approvals_riskId_approvalInstanceId_key" ON "risk_approvals"("riskId", "approvalInstanceId");
CREATE UNIQUE INDEX "policy_approvals_policyId_approvalInstanceId_key" ON "policy_approvals"("policyId", "approvalInstanceId");
CREATE UNIQUE INDEX "audit_finding_approvals_findingId_approvalInstanceId_key" ON "audit_finding_approvals"("findingId", "approvalInstanceId");
CREATE UNIQUE INDEX "vendor_assessment_approvals_vendorAssessmentId_approvalInstanceId_key" ON "vendor_assessment_approvals"("vendorAssessmentId", "approvalInstanceId");
CREATE UNIQUE INDEX "vulnerability_approvals_vulnerabilityId_approvalInstanceId_key" ON "vulnerability_approvals"("vulnerabilityId", "approvalInstanceId");
CREATE UNIQUE INDEX "incident_approvals_incidentId_approvalInstanceId_key" ON "incident_approvals"("incidentId", "approvalInstanceId");
CREATE UNIQUE INDEX "policy_exception_approvals_policyExceptionId_approvalInstanceId_key" ON "policy_exception_approvals"("policyExceptionId", "approvalInstanceId");
CREATE UNIQUE INDEX "evidence_approvals_evidenceId_approvalInstanceId_key" ON "evidence_approvals"("evidenceId", "approvalInstanceId");

-- Foreign Keys
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_workflow_steps" ADD CONSTRAINT "approval_workflow_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_frameworkReferenceId_fkey" FOREIGN KEY ("frameworkReferenceId") REFERENCES "framework_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_instance_steps" ADD CONSTRAINT "approval_instance_steps_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "approval_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "approval_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "approval_instance_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "control_approvals" ADD CONSTRAINT "control_approvals_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "controls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "control_approvals" ADD CONSTRAINT "control_approvals_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "approval_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "risk_approvals" ADD CONSTRAINT "risk_approvals_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "risks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "risk_approvals" ADD CONSTRAINT "risk_approvals_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "approval_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "policy_approvals" ADD CONSTRAINT "policy_approvals_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "policy_approvals" ADD CONSTRAINT "policy_approvals_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "approval_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_finding_approvals" ADD CONSTRAINT "audit_finding_approvals_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "audit_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_finding_approvals" ADD CONSTRAINT "audit_finding_approvals_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "approval_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vendor_assessment_approvals" ADD CONSTRAINT "vendor_assessment_approvals_vendorAssessmentId_fkey" FOREIGN KEY ("vendorAssessmentId") REFERENCES "vendor_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_assessment_approvals" ADD CONSTRAINT "vendor_assessment_approvals_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "approval_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vulnerability_approvals" ADD CONSTRAINT "vulnerability_approvals_vulnerabilityId_fkey" FOREIGN KEY ("vulnerabilityId") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vulnerability_approvals" ADD CONSTRAINT "vulnerability_approvals_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "approval_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "incident_approvals" ADD CONSTRAINT "incident_approvals_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incident_approvals" ADD CONSTRAINT "incident_approvals_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "approval_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "policy_exception_approvals" ADD CONSTRAINT "policy_exception_approvals_policyExceptionId_fkey" FOREIGN KEY ("policyExceptionId") REFERENCES "policy_exceptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "policy_exception_approvals" ADD CONSTRAINT "policy_exception_approvals_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "approval_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "evidence_approvals" ADD CONSTRAINT "evidence_approvals_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evidence_approvals" ADD CONSTRAINT "evidence_approvals_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "approval_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
