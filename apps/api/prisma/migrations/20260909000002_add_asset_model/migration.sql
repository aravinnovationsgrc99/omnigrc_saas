-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('HARDWARE', 'SOFTWARE', 'VENDOR', 'DATA_STORE', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetCriticality" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "description" TEXT,
    "owner" TEXT NOT NULL,
    "criticality" "AssetCriticality" NOT NULL DEFAULT 'MEDIUM',
    "vendorName" TEXT,
    "dataResidencyRegion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assets_organizationId_idx" ON "assets"("organizationId");

-- CreateIndex
CREATE INDEX "assets_deletedAt_idx" ON "assets"("deletedAt");

-- CreateIndex
CREATE INDEX "assets_type_idx" ON "assets"("type");

-- CreateIndex
CREATE INDEX "assets_criticality_idx" ON "assets"("criticality");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable Row Level Security
ALTER TABLE "assets" ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation RLS policy for assets
CREATE POLICY asset_tenant_isolation ON "assets"
    FOR ALL
    USING ("organizationId" = current_setting('app.current_organization_id', true));
