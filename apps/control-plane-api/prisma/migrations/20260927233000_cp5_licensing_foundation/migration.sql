-- AlterEnum
ALTER TYPE "LicenseStatus" ADD VALUE 'SUSPENDED';
ALTER TYPE "LicenseStatus" ADD VALUE 'REVOKED';

-- AlterTable
ALTER TABLE "licenses" ADD COLUMN "sequence" BIGINT NOT NULL DEFAULT 1;
