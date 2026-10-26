-- Phase 5: Regulatory Obligation-to-Control Mapping Migration
-- (UNAPPLIED - Safe schema artifact, do not apply directly to production database)

-- 1. Create ObligationMappingMethod Enum
DO $$ BEGIN
    CREATE TYPE "ObligationMappingMethod" AS ENUM (
        'HUMAN_AUTHORED',
        'RULE_SUGGESTED',
        'AI_SUGGESTED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Table: regulatory_obligation_control_mappings
CREATE TABLE IF NOT EXISTS "regulatory_obligation_control_mappings" (
    "id" VARCHAR(36) NOT NULL,
    "organizationId" VARCHAR(36) NOT NULL,
    "obligationId" VARCHAR(36) NOT NULL,
    "controlId" VARCHAR(36) NOT NULL,
    "publicationId" VARCHAR(36),
    "publicationVersionId" VARCHAR(36),
    "frameworkReferenceId" VARCHAR(36),
    "mappingMethod" "ObligationMappingMethod" NOT NULL DEFAULT 'RULE_SUGGESTED',
    "status" "MappingStatus" NOT NULL DEFAULT 'SUGGESTED',
    "confidence" "ObligationConfidence" NOT NULL DEFAULT 'HIGH',
    "rationale" TEXT NOT NULL,
    "sourceExcerpt" TEXT,
    "ruleMatched" VARCHAR(128),
    "suggestedById" VARCHAR(36),
    "reviewedById" VARCHAR(36),
    "reviewedAt" TIMESTAMPTZ,
    "reviewNotes" TEXT,
    "reassessmentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_obligation_control_mappings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "regulatory_obligation_control_mappings_organizationId_obligationId_controlId_key" UNIQUE ("organizationId", "obligationId", "controlId")
);

-- 3. Create Table: regulatory_obligation_control_mapping_histories
CREATE TABLE IF NOT EXISTS "regulatory_obligation_control_mapping_histories" (
    "id" VARCHAR(36) NOT NULL,
    "mappingId" VARCHAR(36) NOT NULL,
    "organizationId" VARCHAR(36) NOT NULL,
    "previousStatus" "MappingStatus" NOT NULL,
    "newStatus" "MappingStatus" NOT NULL,
    "previousRationale" TEXT,
    "newRationale" TEXT NOT NULL,
    "actorId" VARCHAR(36) NOT NULL,
    "reviewNotes" TEXT,
    "changedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_obligation_control_mapping_histories_pkey" PRIMARY KEY ("id")
);

-- 4. Foreign Key Constraints
ALTER TABLE "regulatory_obligation_control_mappings"
    ADD CONSTRAINT "regulatory_obligation_control_mappings_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "regulatory_obligation_control_mappings"
    ADD CONSTRAINT "regulatory_obligation_control_mappings_obligationId_fkey"
    FOREIGN KEY ("obligationId") REFERENCES "regulatory_obligations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "regulatory_obligation_control_mappings"
    ADD CONSTRAINT "regulatory_obligation_control_mappings_controlId_fkey"
    FOREIGN KEY ("controlId") REFERENCES "controls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "regulatory_obligation_control_mappings"
    ADD CONSTRAINT "regulatory_obligation_control_mappings_publicationId_fkey"
    FOREIGN KEY ("publicationId") REFERENCES "regulatory_publications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "regulatory_obligation_control_mappings"
    ADD CONSTRAINT "regulatory_obligation_control_mappings_publicationVersionId_fkey"
    FOREIGN KEY ("publicationVersionId") REFERENCES "regulatory_publication_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "regulatory_obligation_control_mappings"
    ADD CONSTRAINT "regulatory_obligation_control_mappings_frameworkReferenceId_fkey"
    FOREIGN KEY ("frameworkReferenceId") REFERENCES "framework_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "regulatory_obligation_control_mapping_histories"
    ADD CONSTRAINT "regulatory_obligation_control_mapping_histories_mappingId_fkey"
    FOREIGN KEY ("mappingId") REFERENCES "regulatory_obligation_control_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "regulatory_obligation_control_mapping_histories"
    ADD CONSTRAINT "regulatory_obligation_control_mapping_histories_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS "regulatory_obligation_control_mappings_organizationId_idx" ON "regulatory_obligation_control_mappings"("organizationId");
CREATE INDEX IF NOT EXISTS "regulatory_obligation_control_mappings_obligationId_idx" ON "regulatory_obligation_control_mappings"("obligationId");
CREATE INDEX IF NOT EXISTS "regulatory_obligation_control_mappings_controlId_idx" ON "regulatory_obligation_control_mappings"("controlId");
CREATE INDEX IF NOT EXISTS "regulatory_obligation_control_mappings_status_idx" ON "regulatory_obligation_control_mappings"("status");
CREATE INDEX IF NOT EXISTS "regulatory_obligation_control_mappings_mappingMethod_idx" ON "regulatory_obligation_control_mappings"("mappingMethod");

CREATE INDEX IF NOT EXISTS "regulatory_obligation_control_mapping_histories_mappingId_idx" ON "regulatory_obligation_control_mapping_histories"("mappingId");
CREATE INDEX IF NOT EXISTS "regulatory_obligation_control_mapping_histories_organizationId_idx" ON "regulatory_obligation_control_mapping_histories"("organizationId");
