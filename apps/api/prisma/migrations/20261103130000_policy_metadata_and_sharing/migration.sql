-- ============================================================================
-- Migration: 20261103130000_policy_metadata_and_sharing
-- Title: Extended Policy Classification, Metadata Dates & Internal User Sharing
-- Status: PENDING DEPLOYMENT (Staged locally, zero runtime impact on Supabase)
-- ============================================================================

-- 1. Extend policies table with formal classification and expiry date
ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "policyType" TEXT NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "expiryDate" TIMESTAMP(3);

-- 2. Extend organizations table with company profile & branding metadata
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "industry" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "businessActivities" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "registeredAddress" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "contactEmail" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;

-- 3. Create policy_shares table for granular internal document access control
CREATE TABLE IF NOT EXISTS "policy_shares" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "sharedWithUserId" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'VIEW',
    "expiresAt" TIMESTAMP(3),
    "sharedByUserId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "policy_shares_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "policy_shares_permission_check" CHECK ("permission" IN ('VIEW', 'DOWNLOAD', 'EDIT'))
);

-- 4. Foreign Key Constraints
DO $$ BEGIN
    ALTER TABLE "policy_shares"
        ADD CONSTRAINT "policy_shares_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "policy_shares"
        ADD CONSTRAINT "policy_shares_policyId_fkey"
        FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "policy_shares"
        ADD CONSTRAINT "policy_shares_sharedWithUserId_fkey"
        FOREIGN KEY ("sharedWithUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "policy_shares"
        ADD CONSTRAINT "policy_shares_sharedByUserId_fkey"
        FOREIGN KEY ("sharedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 5. Indexes for performant lookup and scoping
CREATE INDEX IF NOT EXISTS "policy_shares_org_policy_idx" ON "policy_shares"("organizationId", "policyId");
CREATE INDEX IF NOT EXISTS "policy_shares_user_active_idx" ON "policy_shares"("organizationId", "sharedWithUserId", "revokedAt");
CREATE INDEX IF NOT EXISTS "policy_shares_policy_revoked_idx" ON "policy_shares"("policyId", "revokedAt");

-- 6. Enable Row-Level Security (RLS)
ALTER TABLE "policy_shares" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "policy_shares_tenant_isolation" ON "policy_shares"
        FOR ALL
        USING ("organizationId" = current_setting('app.current_organization_id', true)::text);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

