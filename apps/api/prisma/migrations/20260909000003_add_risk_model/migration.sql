-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'IN_TREATMENT', 'ACCEPTED', 'CLOSED');

-- CreateTable
CREATE TABLE "risks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "likelihood" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "status" "RiskStatus" NOT NULL DEFAULT 'OPEN',
    "owner" TEXT NOT NULL,
    "assetId" TEXT,
    "treatmentPlan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "risks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "risks_organizationId_idx" ON "risks"("organizationId");

-- CreateIndex
CREATE INDEX "risks_deletedAt_idx" ON "risks"("deletedAt");

-- CreateIndex
CREATE INDEX "risks_status_idx" ON "risks"("status");

-- CreateIndex
CREATE INDEX "risks_score_idx" ON "risks"("score");

-- CreateIndex
CREATE INDEX "risks_assetId_idx" ON "risks"("assetId");

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enable Row Level Security
ALTER TABLE "risks" ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation RLS policy for risks
CREATE POLICY risk_tenant_isolation ON "risks"
    FOR ALL
    USING ("organizationId" = current_setting('app.current_organization_id', true));
