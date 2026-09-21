-- CreateEnum
CREATE TYPE "FrameworkVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'RETIRED');
CREATE TYPE "FrameworkReferenceType" AS ENUM (
  'CLAUSE', 'SUBCLAUSE', 'ARTICLE', 'PARAGRAPH', 'SECTION',
  'CRITERION', 'CONTROL', 'FOCUS_POINT', 'REQUIREMENT',
  'IMPLEMENTATION_SPECIFICATION', 'APPENDIX', 'ANNEX'
);

-- CreateTable framework_versions
CREATE TABLE "framework_versions" (
    "id" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publisher" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "status" "FrameworkVersionStatus" NOT NULL DEFAULT 'ACTIVE',
    "provenance" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "framework_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable framework_references
CREATE TABLE "framework_references" (
    "id" TEXT NOT NULL,
    "frameworkVersionId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "FrameworkReferenceType" NOT NULL,
    "parentRefId" TEXT,
    "provenance" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "framework_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX "framework_versions_frameworkId_version_key" ON "framework_versions"("frameworkId", "version");
CREATE UNIQUE INDEX "framework_references_frameworkVersionId_identifier_key" ON "framework_references"("frameworkVersionId", "identifier");
CREATE INDEX "framework_references_frameworkVersionId_idx" ON "framework_references"("frameworkVersionId");
CREATE INDEX "framework_references_parentRefId_idx" ON "framework_references"("parentRefId");
CREATE INDEX "framework_references_type_idx" ON "framework_references"("type");

-- AddForeignKeys
ALTER TABLE "framework_versions" ADD CONSTRAINT "framework_versions_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "frameworks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "framework_references" ADD CONSTRAINT "framework_references_frameworkVersionId_fkey" FOREIGN KEY ("frameworkVersionId") REFERENCES "framework_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "framework_references" ADD CONSTRAINT "framework_references_parentRefId_fkey" FOREIGN KEY ("parentRefId") REFERENCES "framework_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;
