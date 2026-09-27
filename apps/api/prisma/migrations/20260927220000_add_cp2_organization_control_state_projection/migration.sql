-- CreateEnum
CREATE TYPE "OrganizationControlStateEnum" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED', 'DECOMMISSIONED');

-- CreateTable
CREATE TABLE "organization_control_state_projections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "state" "OrganizationControlStateEnum" NOT NULL DEFAULT 'PENDING',
    "sequence" BIGINT NOT NULL DEFAULT 1,
    "reason" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_control_state_projections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_control_state_projections_organizationId_key" ON "organization_control_state_projections"("organizationId");

-- CreateIndex
CREATE INDEX "organization_control_state_projections_organizationId_idx" ON "organization_control_state_projections"("organizationId");

-- CreateIndex
CREATE INDEX "organization_control_state_projections_state_idx" ON "organization_control_state_projections"("state");

-- AddForeignKey
ALTER TABLE "organization_control_state_projections" ADD CONSTRAINT "organization_control_state_projections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
