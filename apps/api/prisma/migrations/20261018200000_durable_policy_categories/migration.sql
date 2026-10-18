-- CreateTable: policy_categories (Phase 4 Durable Policy Categories)
CREATE TABLE IF NOT EXISTS "policy_categories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Tenant Organization index
CREATE INDEX IF NOT EXISTS "policy_categories_organizationId_idx" ON "policy_categories"("organizationId");

-- CreateIndex: Exact name uniqueness per tenant
CREATE UNIQUE INDEX IF NOT EXISTS "policy_categories_organizationId_name_key" ON "policy_categories"("organizationId", "name");

-- CreateIndex: Case-insensitive name uniqueness per tenant
CREATE UNIQUE INDEX IF NOT EXISTS "policy_categories_org_lower_name_idx" ON "policy_categories"("organizationId", LOWER("name"));

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'policy_categories_organizationId_fkey'
    ) THEN
        ALTER TABLE "policy_categories" ADD CONSTRAINT "policy_categories_organizationId_fkey" 
            FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Enable Row Level Security (Phase 4.1 Tenant Isolation Convention)
ALTER TABLE "policy_categories" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'policy_categories' 
          AND policyname = 'policy_categories_tenant_isolation'
    ) THEN
        CREATE POLICY policy_categories_tenant_isolation ON "policy_categories"
            USING ("organizationId"::text = current_setting('app.current_tenant', true));
    END IF;
END $$;

-- Safe, deterministic, idempotent backfill for existing distinct categories from policies table
-- Deduplicates categories case-insensitively per tenant to guarantee compatibility with
-- both the exact unique constraint and the case-insensitive unique index.
WITH deduplicated_categories AS (
    SELECT DISTINCT ON (p."organizationId", LOWER(TRIM(p."category")))
        p."organizationId",
        TRIM(p."category") AS "name",
        LOWER(TRIM(p."category")) AS "normalized_name"
    FROM "policies" p
    WHERE p."category" IS NOT NULL 
      AND TRIM(p."category") <> ''
      AND p."deletedAt" IS NULL
    ORDER BY p."organizationId", LOWER(TRIM(p."category")), p."createdAt" ASC, TRIM(p."category") ASC
)
INSERT INTO "policy_categories" ("id", "organizationId", "name", "isDefault", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid()::text AS "id",
    dc."organizationId",
    dc."name",
    CASE 
        WHEN dc."normalized_name" IN (
            'information security',
            'data privacy',
            'access control',
            'acceptable use',
            'incident response',
            'business continuity',
            'vendor management',
            'compliance'
        ) THEN true
        ELSE false
    END AS "isDefault",
    CURRENT_TIMESTAMP AS "createdAt",
    CURRENT_TIMESTAMP AS "updatedAt"
FROM deduplicated_categories dc
WHERE NOT EXISTS (
    SELECT 1 FROM "policy_categories" pc
    WHERE pc."organizationId" = dc."organizationId"
      AND LOWER(pc."name") = dc."normalized_name"
)
ON CONFLICT ("organizationId", "name") DO NOTHING;
