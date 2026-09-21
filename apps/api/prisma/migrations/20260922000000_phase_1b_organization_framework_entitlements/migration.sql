-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED');

-- CreateTable organization_framework_entitlements
CREATE TABLE "organization_framework_entitlements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "versionId" TEXT,
    "status" "EntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'ARAV_CONTROL_PLANE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_framework_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX "organization_framework_entitlements_organizationId_frameworkId_versionId_key" ON "organization_framework_entitlements"("organizationId", "frameworkId", "versionId");
CREATE INDEX "organization_framework_entitlements_organizationId_status_idx" ON "organization_framework_entitlements"("organizationId", "status");
CREATE INDEX "organization_framework_entitlements_frameworkId_versionId_idx" ON "organization_framework_entitlements"("frameworkId", "versionId");

-- AddForeignKeys
ALTER TABLE "organization_framework_entitlements" ADD CONSTRAINT "organization_framework_entitlements_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "frameworks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_framework_entitlements" ADD CONSTRAINT "organization_framework_entitlements_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "framework_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
