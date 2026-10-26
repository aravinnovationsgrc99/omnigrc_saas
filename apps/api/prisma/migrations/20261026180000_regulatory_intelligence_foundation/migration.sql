-- Phase 2: Regulatory Intelligence and Ingestion Foundation Additive Migration
-- Creates: regulatory_catalogue_entries, regulatory_sources, regulatory_publications, regulatory_publication_versions, manual_source_intakes
-- Creates Enums: RegulatoryInstrumentType, RegulatoryVerificationStatus, RegulatoryIngestionMethod, RegulatoryConnectorStatus, RegulatorySourceType, RegulatoryHealthStatus, RegulatoryPublicationState, ManualIntakeReviewStatus

-- 1. Create Enums safely if not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RegulatoryInstrumentType') THEN
    CREATE TYPE "RegulatoryInstrumentType" AS ENUM ('LAW', 'REGULATION', 'DIRECTIVE', 'FRAMEWORK', 'STANDARD', 'GUIDANCE', 'CIRCULAR', 'OTHER');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RegulatoryVerificationStatus') THEN
    CREATE TYPE "RegulatoryVerificationStatus" AS ENUM ('VERIFIED', 'UNVERIFIED', 'REQUIRES_REVIEW');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RegulatoryIngestionMethod') THEN
    CREATE TYPE "RegulatoryIngestionMethod" AS ENUM ('AUTOMATED_FEED', 'AUTOMATED_SCRAPER', 'MANUAL_INTAKE', 'UNAVAILABLE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RegulatoryConnectorStatus') THEN
    CREATE TYPE "RegulatoryConnectorStatus" AS ENUM ('ACTIVE', 'PLANNED', 'MANUAL_ONLY', 'UNAVAILABLE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RegulatorySourceType') THEN
    CREATE TYPE "RegulatorySourceType" AS ENUM ('RSS', 'ATOM', 'API', 'HTML_LISTING', 'MANUAL');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RegulatoryHealthStatus') THEN
    CREATE TYPE "RegulatoryHealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'FAILING', 'PAUSED', 'UNTESTED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RegulatoryPublicationState') THEN
    CREATE TYPE "RegulatoryPublicationState" AS ENUM ('DISCOVERED', 'FETCHED', 'FAILED', 'ARCHIVED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ManualIntakeReviewStatus') THEN
    CREATE TYPE "ManualIntakeReviewStatus" AS ENUM ('PENDING_REVIEW', 'ACCEPTED', 'REJECTED');
  END IF;
END $$;

-- 2. Create Table "regulatory_catalogue_entries"
CREATE TABLE IF NOT EXISTS "regulatory_catalogue_entries" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "issuingAuthority" TEXT NOT NULL,
    "instrumentType" "RegulatoryInstrumentType" NOT NULL DEFAULT 'REGULATION',
    "officialSourceUrl" TEXT,
    "verificationStatus" "RegulatoryVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "lastVerifiedAt" TIMESTAMP(3),
    "publicationMetadata" JSONB,
    "ingestionMethod" "RegulatoryIngestionMethod" NOT NULL DEFAULT 'MANUAL_INTAKE',
    "connectorStatus" "RegulatoryConnectorStatus" NOT NULL DEFAULT 'PLANNED',
    "monitoringFrequency" TEXT DEFAULT 'MANUAL_REVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_catalogue_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "regulatory_catalogue_entries_code_key" ON "regulatory_catalogue_entries"("code");
CREATE INDEX IF NOT EXISTS "regulatory_catalogue_entries_jurisdiction_idx" ON "regulatory_catalogue_entries"("jurisdiction");
CREATE INDEX IF NOT EXISTS "regulatory_catalogue_entries_connectorStatus_idx" ON "regulatory_catalogue_entries"("connectorStatus");
CREATE INDEX IF NOT EXISTS "regulatory_catalogue_entries_verificationStatus_idx" ON "regulatory_catalogue_entries"("verificationStatus");

-- 3. Create Table "regulatory_sources"
CREATE TABLE IF NOT EXISTS "regulatory_sources" (
    "id" TEXT NOT NULL,
    "regulatorCode" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "catalogueEntryId" TEXT,
    "officialDomain" TEXT NOT NULL,
    "configuredEndpoint" TEXT NOT NULL,
    "sourceType" "RegulatorySourceType" NOT NULL DEFAULT 'RSS',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pollingIntervalMinutes" INTEGER NOT NULL DEFAULT 1440,
    "lastAttemptedFetchAt" TIMESTAMP(3),
    "lastSuccessfulFetchAt" TIMESTAMP(3),
    "nextScheduledFetchAt" TIMESTAMP(3),
    "healthStatus" "RegulatoryHealthStatus" NOT NULL DEFAULT 'UNTESTED',
    "lastErrorMessage" TEXT,
    "sanitizedDiagnostics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_sources_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "regulatory_sources_catalogueEntryId_fkey" FOREIGN KEY ("catalogueEntryId") REFERENCES "regulatory_catalogue_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "regulatory_sources_regulatorCode_configuredEndpoint_key" ON "regulatory_sources"("regulatorCode", "configuredEndpoint");
CREATE INDEX IF NOT EXISTS "regulatory_sources_regulatorCode_idx" ON "regulatory_sources"("regulatorCode");
CREATE INDEX IF NOT EXISTS "regulatory_sources_isEnabled_idx" ON "regulatory_sources"("isEnabled");
CREATE INDEX IF NOT EXISTS "regulatory_sources_healthStatus_idx" ON "regulatory_sources"("healthStatus");

-- 4. Create Table "regulatory_publications"
CREATE TABLE IF NOT EXISTS "regulatory_publications" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "catalogueEntryId" TEXT,
    "externalId" TEXT,
    "canonicalUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publicationNumber" TEXT,
    "publicationDate" TIMESTAMP(3),
    "firstDiscoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentHash" TEXT NOT NULL,
    "currentVersionNumber" INTEGER NOT NULL DEFAULT 1,
    "currentDocumentMetadata" JSONB,
    "processingState" "RegulatoryPublicationState" NOT NULL DEFAULT 'DISCOVERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_publications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "regulatory_publications_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "regulatory_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "regulatory_publications_catalogueEntryId_fkey" FOREIGN KEY ("catalogueEntryId") REFERENCES "regulatory_catalogue_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "regulatory_publications_sourceId_canonicalUrl_key" ON "regulatory_publications"("sourceId", "canonicalUrl");
CREATE INDEX IF NOT EXISTS "regulatory_publications_sourceId_idx" ON "regulatory_publications"("sourceId");
CREATE INDEX IF NOT EXISTS "regulatory_publications_catalogueEntryId_idx" ON "regulatory_publications"("catalogueEntryId");
CREATE INDEX IF NOT EXISTS "regulatory_publications_externalId_idx" ON "regulatory_publications"("externalId");
CREATE INDEX IF NOT EXISTS "regulatory_publications_publicationDate_idx" ON "regulatory_publications"("publicationDate");
CREATE INDEX IF NOT EXISTS "regulatory_publications_processingState_idx" ON "regulatory_publications"("processingState");
CREATE INDEX IF NOT EXISTS "regulatory_publications_contentHash_idx" ON "regulatory_publications"("contentHash");

-- 5. Create Table "regulatory_publication_versions"
CREATE TABLE IF NOT EXISTS "regulatory_publication_versions" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "documentUrl" TEXT NOT NULL,
    "storageKey" TEXT,
    "reasonForVersion" TEXT,
    "rawMetadata" JSONB,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_publication_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "regulatory_publication_versions_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "regulatory_publications"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "regulatory_publication_versions_publicationId_versionNumber_key" ON "regulatory_publication_versions"("publicationId", "versionNumber");
CREATE INDEX IF NOT EXISTS "regulatory_publication_versions_publicationId_idx" ON "regulatory_publication_versions"("publicationId");
CREATE INDEX IF NOT EXISTS "regulatory_publication_versions_contentSha256_idx" ON "regulatory_publication_versions"("contentSha256");
CREATE INDEX IF NOT EXISTS "regulatory_publication_versions_retrievedAt_idx" ON "regulatory_publication_versions"("retrievedAt");

-- 6. Create Table "manual_source_intakes"
CREATE TABLE IF NOT EXISTS "manual_source_intakes" (
    "id" TEXT NOT NULL,
    "catalogueEntryId" TEXT NOT NULL,
    "publicationId" TEXT,
    "title" TEXT NOT NULL,
    "instrumentIdentifier" TEXT,
    "sourceUrl" TEXT,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "reviewStatus" "ManualIntakeReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "provenanceNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_source_intakes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "manual_source_intakes_catalogueEntryId_fkey" FOREIGN KEY ("catalogueEntryId") REFERENCES "regulatory_catalogue_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "manual_source_intakes_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "regulatory_publications"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "manual_source_intakes_catalogueEntryId_idx" ON "manual_source_intakes"("catalogueEntryId");
CREATE INDEX IF NOT EXISTS "manual_source_intakes_reviewStatus_idx" ON "manual_source_intakes"("reviewStatus");
CREATE INDEX IF NOT EXISTS "manual_source_intakes_uploadedById_idx" ON "manual_source_intakes"("uploadedById");

-- 7. Least-Privilege Role Grants to omnigrc_app (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'omnigrc_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "regulatory_catalogue_entries" TO omnigrc_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "regulatory_sources" TO omnigrc_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "regulatory_publications" TO omnigrc_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "regulatory_publication_versions" TO omnigrc_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "manual_source_intakes" TO omnigrc_app;
  END IF;
END $$;
