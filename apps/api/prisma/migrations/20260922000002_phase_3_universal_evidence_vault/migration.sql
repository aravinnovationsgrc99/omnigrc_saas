-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('DOCUMENT', 'SPREADSHEET', 'IMAGE', 'CONFIG_EXPORT', 'SYSTEM_LOG', 'CERTIFICATE', 'EXTERNAL_LINK', 'OTHER');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('PENDING', 'ACTIVE', 'QUARANTINED', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "EvidenceScanStatus" AS ENUM ('PENDING_SCAN', 'CLEAN', 'QUARANTINED', 'SCAN_FAILED');

-- CreateTable
CREATE TABLE "evidences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "evidenceType" "EvidenceType" NOT NULL DEFAULT 'DOCUMENT',
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'ACTIVE',
    "scanStatus" "EvidenceScanStatus" NOT NULL DEFAULT 'CLEAN',
    "uploadedById" TEXT NOT NULL,
    "retentionUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_evidences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_evidences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_evidences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_check_item_evidences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "checkItemId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_check_item_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_finding_evidences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_finding_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_evidences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vulnerability_evidences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vulnerabilityId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vulnerability_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_evidences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_framework_references" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "frameworkReferenceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_framework_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX "evidences_storageKey_key" ON "evidences"("storageKey");
CREATE INDEX "evidences_organizationId_idx" ON "evidences"("organizationId");
CREATE INDEX "evidences_status_idx" ON "evidences"("status");
CREATE INDEX "evidences_scanStatus_idx" ON "evidences"("scanStatus");
CREATE INDEX "evidences_uploadedById_idx" ON "evidences"("uploadedById");

CREATE UNIQUE INDEX "control_evidences_controlId_evidenceId_key" ON "control_evidences"("controlId", "evidenceId");
CREATE INDEX "control_evidences_organizationId_idx" ON "control_evidences"("organizationId");
CREATE INDEX "control_evidences_controlId_idx" ON "control_evidences"("controlId");
CREATE INDEX "control_evidences_evidenceId_idx" ON "control_evidences"("evidenceId");

CREATE UNIQUE INDEX "risk_evidences_riskId_evidenceId_key" ON "risk_evidences"("riskId", "evidenceId");
CREATE INDEX "risk_evidences_organizationId_idx" ON "risk_evidences"("organizationId");
CREATE INDEX "risk_evidences_riskId_idx" ON "risk_evidences"("riskId");
CREATE INDEX "risk_evidences_evidenceId_idx" ON "risk_evidences"("evidenceId");

CREATE UNIQUE INDEX "policy_evidences_policyId_evidenceId_key" ON "policy_evidences"("policyId", "evidenceId");
CREATE INDEX "policy_evidences_organizationId_idx" ON "policy_evidences"("organizationId");
CREATE INDEX "policy_evidences_policyId_idx" ON "policy_evidences"("policyId");
CREATE INDEX "policy_evidences_evidenceId_idx" ON "policy_evidences"("evidenceId");

CREATE UNIQUE INDEX "audit_check_item_evidences_checkItemId_evidenceId_key" ON "audit_check_item_evidences"("checkItemId", "evidenceId");
CREATE INDEX "audit_check_item_evidences_organizationId_idx" ON "audit_check_item_evidences"("organizationId");
CREATE INDEX "audit_check_item_evidences_checkItemId_idx" ON "audit_check_item_evidences"("checkItemId");
CREATE INDEX "audit_check_item_evidences_evidenceId_idx" ON "audit_check_item_evidences"("evidenceId");

CREATE UNIQUE INDEX "audit_finding_evidences_findingId_evidenceId_key" ON "audit_finding_evidences"("findingId", "evidenceId");
CREATE INDEX "audit_finding_evidences_organizationId_idx" ON "audit_finding_evidences"("organizationId");
CREATE INDEX "audit_finding_evidences_findingId_idx" ON "audit_finding_evidences"("findingId");
CREATE INDEX "audit_finding_evidences_evidenceId_idx" ON "audit_finding_evidences"("evidenceId");

CREATE UNIQUE INDEX "vendor_evidences_vendorId_evidenceId_key" ON "vendor_evidences"("vendorId", "evidenceId");
CREATE INDEX "vendor_evidences_organizationId_idx" ON "vendor_evidences"("organizationId");
CREATE INDEX "vendor_evidences_vendorId_idx" ON "vendor_evidences"("vendorId");
CREATE INDEX "vendor_evidences_evidenceId_idx" ON "vendor_evidences"("evidenceId");

CREATE UNIQUE INDEX "vulnerability_evidences_vulnerabilityId_evidenceId_key" ON "vulnerability_evidences"("vulnerabilityId", "evidenceId");
CREATE INDEX "vulnerability_evidences_organizationId_idx" ON "vulnerability_evidences"("organizationId");
CREATE INDEX "vulnerability_evidences_vulnerabilityId_idx" ON "vulnerability_evidences"("vulnerabilityId");
CREATE INDEX "vulnerability_evidences_evidenceId_idx" ON "vulnerability_evidences"("evidenceId");

CREATE UNIQUE INDEX "incident_evidences_incidentId_evidenceId_key" ON "incident_evidences"("incidentId", "evidenceId");
CREATE INDEX "incident_evidences_organizationId_idx" ON "incident_evidences"("organizationId");
CREATE INDEX "incident_evidences_incidentId_idx" ON "incident_evidences"("incidentId");
CREATE INDEX "incident_evidences_evidenceId_idx" ON "incident_evidences"("evidenceId");

CREATE UNIQUE INDEX "evidence_framework_references_evidenceId_frameworkReferenceId_key" ON "evidence_framework_references"("evidenceId", "frameworkReferenceId");
CREATE INDEX "evidence_framework_references_evidenceId_idx" ON "evidence_framework_references"("evidenceId");
CREATE INDEX "evidence_framework_references_frameworkReferenceId_idx" ON "evidence_framework_references"("frameworkReferenceId");

-- Foreign Keys
ALTER TABLE "evidences" ADD CONSTRAINT "evidences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "control_evidences" ADD CONSTRAINT "control_evidences_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "controls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "control_evidences" ADD CONSTRAINT "control_evidences_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "risk_evidences" ADD CONSTRAINT "risk_evidences_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "risks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "risk_evidences" ADD CONSTRAINT "risk_evidences_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "policy_evidences" ADD CONSTRAINT "policy_evidences_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "policy_evidences" ADD CONSTRAINT "policy_evidences_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_check_item_evidences" ADD CONSTRAINT "audit_check_item_evidences_checkItemId_fkey" FOREIGN KEY ("checkItemId") REFERENCES "audit_check_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_check_item_evidences" ADD CONSTRAINT "audit_check_item_evidences_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_finding_evidences" ADD CONSTRAINT "audit_finding_evidences_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "audit_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_finding_evidences" ADD CONSTRAINT "audit_finding_evidences_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vendor_evidences" ADD CONSTRAINT "vendor_evidences_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_evidences" ADD CONSTRAINT "vendor_evidences_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vulnerability_evidences" ADD CONSTRAINT "vulnerability_evidences_vulnerabilityId_fkey" FOREIGN KEY ("vulnerabilityId") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vulnerability_evidences" ADD CONSTRAINT "vulnerability_evidences_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "incident_evidences" ADD CONSTRAINT "incident_evidences_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incident_evidences" ADD CONSTRAINT "incident_evidences_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "evidence_framework_references" ADD CONSTRAINT "evidence_framework_references_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evidence_framework_references" ADD CONSTRAINT "evidence_framework_references_frameworkReferenceId_fkey" FOREIGN KEY ("frameworkReferenceId") REFERENCES "framework_references"("id") ON DELETE CASCADE ON UPDATE CASCADE;
