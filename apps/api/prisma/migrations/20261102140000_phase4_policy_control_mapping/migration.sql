-- Phase 4: Policy & Control Mapping Hardened Additive Migration
-- Creates: policy_controls table linking policies and controls with database-level tenant isolation, OCC, and auditability

CREATE TABLE IF NOT EXISTS "policy_controls" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "status" "MappingStatus" NOT NULL DEFAULT 'APPROVED',
    "rationale" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_controls_pkey" PRIMARY KEY ("id")
);

-- Unique constraint ensuring no duplicate mappings between the same policy and control
DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'policy_controls_policyId_controlId_key'
  ) THEN
    ALTER TABLE "policy_controls"
      ADD CONSTRAINT "policy_controls_policyId_controlId_key" UNIQUE ("policyId", "controlId");
  END IF;
END $block$;

-- Ensure composite uniqueness on policies(id, organizationId) to enforce tenant integrity at DB level
CREATE UNIQUE INDEX IF NOT EXISTS "policies_id_organizationId_key" ON "policies"("id", "organizationId");

-- Indexes for performance and multi-tenant scoping
CREATE INDEX IF NOT EXISTS "policy_controls_organizationId_idx" ON "policy_controls"("organizationId");
CREATE INDEX IF NOT EXISTS "policy_controls_policyId_idx" ON "policy_controls"("policyId");
CREATE INDEX IF NOT EXISTS "policy_controls_controlId_idx" ON "policy_controls"("controlId");

-- Foreign key constraints with database-enforced multi-tenant consistency
DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'policy_controls_organizationId_fkey'
  ) THEN
    ALTER TABLE "policy_controls"
      ADD CONSTRAINT "policy_controls_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- Drop legacy single-column FK if present to upgrade to composite tenant FK
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'policy_controls_policyId_fkey'
  ) THEN
    ALTER TABLE "policy_controls" DROP CONSTRAINT "policy_controls_policyId_fkey";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'policy_controls_policyId_organizationId_fkey'
  ) THEN
    ALTER TABLE "policy_controls"
      ADD CONSTRAINT "policy_controls_policyId_organizationId_fkey"
      FOREIGN KEY ("policyId", "organizationId") REFERENCES "policies"("id", "organizationId")
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
END $block$;

-- Add version column to policies and policy_controls if not exists for optimistic concurrency control
ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "policy_controls" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
