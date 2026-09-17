-- CreateEnum
CREATE TYPE "AssetEnvironment" AS ENUM ('PRODUCTION', 'STAGING', 'DEVELOPMENT', 'OTHER');
CREATE TYPE "VulnerabilitySeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "VulnerabilityStatus" AS ENUM ('OPEN', 'IN_REMEDIATION', 'RESOLVED', 'RISK_ACCEPTED');
CREATE TYPE "PolicyStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'RETIRED');
CREATE TYPE "PolicyExceptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
CREATE TYPE "VendorCriticality" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "VendorStatus" AS ENUM ('ACTIVE', 'UNDER_REVIEW', 'INACTIVE');
CREATE TYPE "VendorAssessmentStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE');
CREATE TYPE "ObligationCadence" AS ENUM ('ONE_OFF', 'MONTHLY', 'QUARTERLY', 'ANNUAL');

-- AlterTable Asset
ALTER TABLE "assets" ADD COLUMN "department" TEXT;
ALTER TABLE "assets" ADD COLUMN "environment" "AssetEnvironment" NOT NULL DEFAULT 'PRODUCTION';
ALTER TABLE "assets" ADD COLUMN "isManaged" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "assets" ADD COLUMN "lastScannedAt" TIMESTAMP(3);
ALTER TABLE "assets" ADD COLUMN "maintenanceDueDate" TIMESTAMP(3);
ALTER TABLE "assets" ADD COLUMN "vendorId" TEXT;

-- AlterTable ComplianceTask
ALTER TABLE "compliance_tasks" ADD COLUMN "cadence" "ObligationCadence" NOT NULL DEFAULT 'ONE_OFF';
ALTER TABLE "compliance_tasks" ADD COLUMN "category" TEXT;
ALTER TABLE "compliance_tasks" ADD COLUMN "obligationReference" TEXT;
ALTER TABLE "compliance_tasks" ADD COLUMN "lastCompletedAt" TIMESTAMP(3);
ALTER TABLE "compliance_tasks" ADD COLUMN "nextDueDate" TIMESTAMP(3);

-- CreateTable Vendors
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "criticality" "VendorCriticality" NOT NULL DEFAULT 'MEDIUM',
    "status" "VendorStatus" NOT NULL DEFAULT 'ACTIVE',
    "owner" TEXT NOT NULL,
    "department" TEXT,
    "reviewCadenceDays" INTEGER NOT NULL DEFAULT 365,
    "lastReviewedAt" TIMESTAMP(3),
    "nextReviewDate" TIMESTAMP(3),
    "websiteUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable VendorAssessments
CREATE TABLE "vendor_assessments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "score" INTEGER,
    "status" "VendorAssessmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "evaluatorId" TEXT NOT NULL,
    "riskId" TEXT,
    "complianceTaskId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable Vulnerabilities
CREATE TABLE "vulnerabilities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cveId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "VulnerabilitySeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "VulnerabilityStatus" NOT NULL DEFAULT 'OPEN',
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remediationOwner" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "remediationNotes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vulnerabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable VulnerabilityAssets
CREATE TABLE "vulnerability_assets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vulnerabilityId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vulnerability_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable Policies
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "status" "PolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerId" TEXT NOT NULL,
    "businessUnit" TEXT,
    "publishedVersionId" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "reviewDate" TIMESTAMP(3),
    "reviewCadenceDays" INTEGER NOT NULL DEFAULT 365,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable PolicyVersions
CREATE TABLE "policy_versions" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "versionNumber" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "changeLog" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable PolicyAttestations
CREATE TABLE "policy_attestations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "policy_attestations_pkey" PRIMARY KEY ("id")
);

-- CreateTable PolicyExceptions
CREATE TABLE "policy_exceptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "status" "PolicyExceptionStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "assets_vendorId_idx" ON "assets"("vendorId");
CREATE INDEX "vendors_organizationId_idx" ON "vendors"("organizationId");
CREATE INDEX "vendors_deletedAt_idx" ON "vendors"("deletedAt");
CREATE INDEX "vendors_status_idx" ON "vendors"("status");
CREATE INDEX "vendor_assessments_organizationId_idx" ON "vendor_assessments"("organizationId");
CREATE INDEX "vendor_assessments_vendorId_idx" ON "vendor_assessments"("vendorId");
CREATE INDEX "vulnerabilities_organizationId_idx" ON "vulnerabilities"("organizationId");
CREATE INDEX "vulnerabilities_status_idx" ON "vulnerabilities"("status");
CREATE INDEX "vulnerabilities_severity_idx" ON "vulnerabilities"("severity");
CREATE INDEX "vulnerabilities_deletedAt_idx" ON "vulnerabilities"("deletedAt");
UNIQUE INDEX "vulnerability_assets_vulnerabilityId_assetId_key" ON "vulnerability_assets"("vulnerabilityId", "assetId");
CREATE INDEX "vulnerability_assets_organizationId_idx" ON "vulnerability_assets"("organizationId");
CREATE INDEX "vulnerability_assets_vulnerabilityId_idx" ON "vulnerability_assets"("vulnerabilityId");
CREATE INDEX "vulnerability_assets_assetId_idx" ON "vulnerability_assets"("assetId");
CREATE INDEX "policies_organizationId_idx" ON "policies"("organizationId");
CREATE INDEX "policies_status_idx" ON "policies"("status");
CREATE INDEX "policies_deletedAt_idx" ON "policies"("deletedAt");
UNIQUE INDEX "policy_versions_policyId_versionNumber_key" ON "policy_versions"("policyId", "versionNumber");
CREATE INDEX "policy_versions_policyId_idx" ON "policy_versions"("policyId");
UNIQUE INDEX "policy_attestations_policyVersionId_userId_key" ON "policy_attestations"("policyVersionId", "userId");
CREATE INDEX "policy_attestations_organizationId_idx" ON "policy_attestations"("organizationId");
CREATE INDEX "policy_exceptions_organizationId_idx" ON "policy_exceptions"("organizationId");
CREATE INDEX "policy_exceptions_policyId_idx" ON "policy_exceptions"("policyId");

-- AddForeignKeys
ALTER TABLE "assets" ADD CONSTRAINT "assets_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_assessments" ADD CONSTRAINT "vendor_assessments_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_assessments" ADD CONSTRAINT "vendor_assessments_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "risks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vendor_assessments" ADD CONSTRAINT "vendor_assessments_complianceTaskId_fkey" FOREIGN KEY ("complianceTaskId") REFERENCES "compliance_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vulnerability_assets" ADD CONSTRAINT "vulnerability_assets_vulnerabilityId_fkey" FOREIGN KEY ("vulnerabilityId") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vulnerability_assets" ADD CONSTRAINT "vulnerability_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "policies" ADD CONSTRAINT "policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "policies" ADD CONSTRAINT "policies_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "policy_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "policy_attestations" ADD CONSTRAINT "policy_attestations_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "policy_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "policy_exceptions" ADD CONSTRAINT "policy_exceptions_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security
ALTER TABLE "vendors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vendor_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vulnerabilities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vulnerability_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_attestations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_exceptions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendors_tenant_isolation ON "vendors" USING ("organizationId"::text = current_setting('app.current_tenant', true));
CREATE POLICY vendor_assessments_tenant_isolation ON "vendor_assessments" USING ("organizationId"::text = current_setting('app.current_tenant', true));
CREATE POLICY vulnerabilities_tenant_isolation ON "vulnerabilities" USING ("organizationId"::text = current_setting('app.current_tenant', true));
CREATE POLICY vulnerability_assets_tenant_isolation ON "vulnerability_assets" USING ("organizationId"::text = current_setting('app.current_tenant', true));
CREATE POLICY policies_tenant_isolation ON "policies" USING ("organizationId"::text = current_setting('app.current_tenant', true));
CREATE POLICY policy_attestations_tenant_isolation ON "policy_attestations" USING ("organizationId"::text = current_setting('app.current_tenant', true));
CREATE POLICY policy_exceptions_tenant_isolation ON "policy_exceptions" USING ("organizationId"::text = current_setting('app.current_tenant', true));
