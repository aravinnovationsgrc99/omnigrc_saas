-- ============================================================================
-- Phase 5: Vendor Risk Automation & Active Directory / Microsoft Entra Integration
-- Migration: 20261102180000_phase5_vendor_import_and_directory_integration
-- ============================================================================

-- Create Enums
DO $$ BEGIN
    CREATE TYPE "VendorImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "DirectoryProvider" AS ENUM ('ENTRA_ID', 'AZURE_AD');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "DirectorySyncSchedule" AS ENUM ('MANUAL', 'HOURLY', 'DAILY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "DirectorySyncStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Create vendor_import_batches
CREATE TABLE IF NOT EXISTS "vendor_import_batches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "status" "VendorImportStatus" NOT NULL DEFAULT 'PENDING',
    "columnMapping" JSONB,
    "errorLog" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "vendor_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vendor_import_batches_organizationId_idx" ON "vendor_import_batches"("organizationId");
CREATE INDEX IF NOT EXISTS "vendor_import_batches_createdAt_idx" ON "vendor_import_batches"("createdAt");

-- 2. Alter vendors table
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "contactEmail" TEXT;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "taxId" TEXT;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "importBatchId" TEXT;

CREATE INDEX IF NOT EXISTS "vendors_importBatchId_idx" ON "vendors"("importBatchId");

-- 3. Alter users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "externalDirectoryId" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "directorySyncedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" "ProductAccessStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "jobTitle" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "users_externalDirectoryId_idx" ON "users"("externalDirectoryId");

-- 4. Create directory_integration_configs
CREATE TABLE IF NOT EXISTS "directory_integration_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "DirectoryProvider" NOT NULL DEFAULT 'ENTRA_ID',
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretEncrypted" TEXT NOT NULL,
    "clientSecretMasked" TEXT NOT NULL,
    "domain" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultRole" "Role" NOT NULL DEFAULT 'ANALYST',
    "syncSchedule" "DirectorySyncSchedule" NOT NULL DEFAULT 'MANUAL',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" "DirectorySyncStatus",
    "lastSyncMessage" TEXT,
    "autoDeactivateUsers" BOOLEAN NOT NULL DEFAULT true,
    "deactivationThresholdPct" INTEGER NOT NULL DEFAULT 20,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "directory_integration_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "directory_integration_configs_organizationId_key" ON "directory_integration_configs"("organizationId");
CREATE INDEX IF NOT EXISTS "directory_integration_configs_organizationId_idx" ON "directory_integration_configs"("organizationId");

-- 5. Create directory_group_mappings
CREATE TABLE IF NOT EXISTS "directory_group_mappings" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "directoryGroupId" TEXT NOT NULL,
    "directoryGroupName" TEXT NOT NULL,
    "targetRole" "Role" NOT NULL DEFAULT 'ANALYST',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "directory_group_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "directory_group_mappings_configId_directoryGroupId_key" ON "directory_group_mappings"("configId", "directoryGroupId");
CREATE INDEX IF NOT EXISTS "directory_group_mappings_organizationId_idx" ON "directory_group_mappings"("organizationId");

-- 6. Create directory_sync_logs
CREATE TABLE IF NOT EXISTS "directory_sync_logs" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "syncType" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" "DirectorySyncStatus" NOT NULL DEFAULT 'SUCCESS',
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "deactivatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "errorDetails" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "directory_sync_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "directory_sync_logs_organizationId_idx" ON "directory_sync_logs"("organizationId");
CREATE INDEX IF NOT EXISTS "directory_sync_logs_configId_idx" ON "directory_sync_logs"("configId");
CREATE INDEX IF NOT EXISTS "directory_sync_logs_startedAt_idx" ON "directory_sync_logs"("startedAt");

-- Foreign key constraints (using DO blocks to prevent failure if constraint already exists)
DO $$ BEGIN
    ALTER TABLE "vendor_import_batches" ADD CONSTRAINT "vendor_import_batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "vendors" ADD CONSTRAINT "vendors_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "vendor_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "directory_integration_configs" ADD CONSTRAINT "directory_integration_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "directory_group_mappings" ADD CONSTRAINT "directory_group_mappings_configId_fkey" FOREIGN KEY ("configId") REFERENCES "directory_integration_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "directory_group_mappings" ADD CONSTRAINT "directory_group_mappings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "directory_sync_logs" ADD CONSTRAINT "directory_sync_logs_configId_fkey" FOREIGN KEY ("configId") REFERENCES "directory_integration_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "directory_sync_logs" ADD CONSTRAINT "directory_sync_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

