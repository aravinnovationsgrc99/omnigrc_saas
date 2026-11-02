-- Phase 4: Policy & Control Mapping Additive Migration
-- Creates: policy_controls table linking policies and controls with tenant isolation and auditability

CREATE TABLE IF NOT EXISTS "policy_controls" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "status" "MappingStatus" NOT NULL DEFAULT 'APPROVED',
    "rationale" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_controls_pkey" PRIMARY KEY ("id")
);

-- Unique constraint ensuring no duplicate mappings between the same policy and control
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'policy_controls_policyId_controlId_key'
  ) THEN
    ALTER TABLE "policy_controls"
      ADD CONSTRAINT "policy_controls_policyId_controlId_key" UNIQUE ("policyId", "controlId");
  END IF;
END $$;

-- Indexes for performance and multi-tenant scoping
CREATE INDEX IF NOT EXISTS "policy_controls_organizationId_idx" ON "policy_controls"("organizationId");
CREATE INDEX IF NOT EXISTS "policy_controls_policyId_idx" ON "policy_controls"("policyId");
CREATE INDEX IF NOT EXISTS "policy_controls_controlId_idx" ON "policy_controls"("controlId");

-- Foreign key constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'policy_controls_organizationId_fkey'
  ) THEN
    ALTER TABLE "policy_controls"
      ADD CONSTRAINT "policy_controls_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'policy_controls_policyId_fkey'
  ) THEN
    ALTER TABLE "policy_controls"
      ADD CONSTRAINT "policy_controls_policyId_fkey"
      FOREIGN KEY ("policyId") REFERENCES "policies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'policy_controls_controlId_organizationId_fkey'
  ) THEN
    ALTER TABLE "policy_controls"
      ADD CONSTRAINT "policy_controls_controlId_organizationId_fkey"
      FOREIGN KEY ("controlId", "organizationId") REFERENCES "controls"("id", "organizationId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Add version column to policies if not exists for optimistic concurrency control
ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

