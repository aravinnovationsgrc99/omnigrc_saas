-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "CapaApplicability" AS ENUM ('UNASSESSED', 'REQUIRED', 'NOT_REQUIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AuditFindingLifecycleAction" AS ENUM ('VERIFICATION_PASSED', 'VERIFICATION_REJECTED', 'FINDING_REOPENED', 'STATUS_TRANSITIONED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable: audit_plans
ALTER TABLE "audit_plans" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable: audit_capas
ALTER TABLE "audit_capas" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable: audit_findings
ALTER TABLE "audit_findings" ADD COLUMN IF NOT EXISTS "capaApplicability" "CapaApplicability" NOT NULL DEFAULT 'UNASSESSED';
ALTER TABLE "audit_findings" ADD COLUMN IF NOT EXISTS "capaRationale" TEXT;
ALTER TABLE "audit_findings" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex: audit_findings
CREATE INDEX IF NOT EXISTS "audit_findings_organizationId_capaApplicability_idx" ON "audit_findings"("organizationId", "capaApplicability");

-- CreateTable: audit_finding_verification_histories
CREATE TABLE IF NOT EXISTS "audit_finding_verification_histories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "action" "AuditFindingLifecycleAction" NOT NULL,
    "priorStatus" "FindingStatus" NOT NULL,
    "newStatus" "FindingStatus" NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_finding_verification_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: audit_finding_verification_histories
CREATE INDEX IF NOT EXISTS "audit_finding_verification_histories_organizationId_idx" ON "audit_finding_verification_histories"("organizationId");
CREATE INDEX IF NOT EXISTS "audit_finding_verification_histories_findingId_idx" ON "audit_finding_verification_histories"("findingId");
CREATE INDEX IF NOT EXISTS "audit_finding_verification_histories_actorId_idx" ON "audit_finding_verification_histories"("actorId");
CREATE INDEX IF NOT EXISTS "audit_finding_verification_histories_createdAt_idx" ON "audit_finding_verification_histories"("createdAt");

-- AddForeignKey: audit_finding_verification_histories with ON DELETE RESTRICT
DO $$ BEGIN
    ALTER TABLE "audit_finding_verification_histories" 
        ADD CONSTRAINT "audit_finding_verification_histories_findingId_fkey" 
        FOREIGN KEY ("findingId") REFERENCES "audit_findings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "audit_finding_verification_histories" 
        ADD CONSTRAINT "audit_finding_verification_histories_organizationId_fkey" 
        FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "audit_finding_verification_histories" 
        ADD CONSTRAINT "audit_finding_verification_histories_actorId_fkey" 
        FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Data Backfill: Extract [NO_CAPA_REQUIRED: ...] tags into normalized columns
-- Preserves legacy findings as 'UNASSESSED' by default, and converts tagged findings to 'NOT_REQUIRED' with extracted rationale
UPDATE "audit_findings"
SET 
  "capaApplicability" = 'NOT_REQUIRED',
  "capaRationale" = TRIM(SUBSTRING("remediationPlan" FROM '\[NO_CAPA_REQUIRED:\s*([^\]]+)\]')),
  "remediationPlan" = NULLIF(TRIM(REGEXP_REPLACE("remediationPlan", '\[NO_CAPA_REQUIRED:[^\]]*\]\s*', '')), '')
WHERE "remediationPlan" LIKE '%[NO_CAPA_REQUIRED:%';

