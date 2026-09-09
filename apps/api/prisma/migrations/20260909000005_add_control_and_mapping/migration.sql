-- CreateEnum
CREATE TYPE "MappingStatus" AS ENUM ('SUGGESTED', 'APPROVED', 'OVERRIDDEN', 'REJECTED');

-- CreateEnum
CREATE TYPE "ModelTier" AS ENUM ('TIER_1', 'TIER_2');

-- CreateTable
CREATE TABLE "controls" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "controls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_framework_mappings" (
    "id" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "frameworkClauseId" TEXT NOT NULL,
    "status" "MappingStatus" NOT NULL DEFAULT 'SUGGESTED',
    "confidenceScore" DOUBLE PRECISION,
    "modelTier" "ModelTier" NOT NULL DEFAULT 'TIER_1',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_framework_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "controls_organizationId_idx" ON "controls"("organizationId");

-- CreateIndex
CREATE INDEX "controls_deletedAt_idx" ON "controls"("deletedAt");

-- CreateIndex
CREATE INDEX "control_framework_mappings_controlId_idx" ON "control_framework_mappings"("controlId");

-- CreateIndex
CREATE INDEX "control_framework_mappings_frameworkClauseId_idx" ON "control_framework_mappings"("frameworkClauseId");

-- CreateIndex
CREATE INDEX "control_framework_mappings_status_idx" ON "control_framework_mappings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "control_framework_mappings_controlId_frameworkClauseId_key" ON "control_framework_mappings"("controlId", "frameworkClauseId");

-- AddForeignKey
ALTER TABLE "controls" ADD CONSTRAINT "controls_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_framework_mappings" ADD CONSTRAINT "control_framework_mappings_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "controls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_framework_mappings" ADD CONSTRAINT "control_framework_mappings_frameworkClauseId_fkey" FOREIGN KEY ("frameworkClauseId") REFERENCES "FrameworkClause"("id") ON DELETE CASCADE ON UPDATE CASCADE;
