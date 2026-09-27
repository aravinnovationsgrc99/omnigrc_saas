-- CreateEnum
CREATE TYPE "DataPlaneServiceStateEnum" AS ENUM ('AVAILABLE', 'DISABLED', 'TECHNICAL_OUTAGE', 'COMMERCIAL_DISABLED');

-- CreateTable
CREATE TABLE "global_service_state_projections" (
    "id" TEXT NOT NULL,
    "capabilityCode" TEXT NOT NULL,
    "state" "DataPlaneServiceStateEnum" NOT NULL DEFAULT 'AVAILABLE',
    "sequence" BIGINT NOT NULL DEFAULT 1,
    "reason" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_service_state_projections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_service_override_projections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "capabilityCode" TEXT NOT NULL,
    "overrideState" "DataPlaneServiceStateEnum" NOT NULL,
    "sequence" BIGINT NOT NULL DEFAULT 1,
    "reason" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_service_override_projections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "global_service_state_projections_capabilityCode_key" ON "global_service_state_projections"("capabilityCode");

-- CreateIndex
CREATE INDEX "global_service_state_projections_capabilityCode_idx" ON "global_service_state_projections"("capabilityCode");

-- CreateIndex
CREATE INDEX "global_service_state_projections_state_idx" ON "global_service_state_projections"("state");

-- CreateIndex
CREATE INDEX "organization_service_override_projections_organizationId_idx" ON "organization_service_override_projections"("organizationId");

-- CreateIndex
CREATE INDEX "organization_service_override_projections_capabilityCode_idx" ON "organization_service_override_projections"("capabilityCode");

-- CreateIndex
CREATE UNIQUE INDEX "organization_service_override_projections_organizationId_capabilityCode_key" ON "organization_service_override_projections"("organizationId", "capabilityCode");

-- AddForeignKey
ALTER TABLE "organization_service_override_projections" ADD CONSTRAINT "organization_service_override_projections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
