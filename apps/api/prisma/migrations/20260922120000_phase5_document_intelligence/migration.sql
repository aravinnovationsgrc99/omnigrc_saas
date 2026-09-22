-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('SUCCESS', 'PARTIAL_TRUNCATED', 'OCR_UNAVAILABLE', 'MALFORMED_DOCUMENT', 'UNSUPPORTED_FORMAT', 'EMPTY_DOCUMENT');

-- CreateEnum
CREATE TYPE "AnalysisContextType" AS ENUM ('GENERAL', 'FRAMEWORK', 'FRAMEWORK_REFERENCE');

-- CreateEnum
CREATE TYPE "FindingType" AS ENUM ('KEY_POINT', 'OBLIGATION', 'DEADLINE', 'REQUIREMENT', 'RISK', 'CONTROL_IMPLICATION', 'FRAMEWORK_REFERENCE', 'ACTION', 'ENTITY', 'CONTACT', 'AMOUNT', 'DATE');

-- CreateEnum
CREATE TYPE "DateCategory" AS ENUM ('DOCUMENT_DATE', 'EFFECTIVE_DATE', 'DEADLINE', 'REVIEW_DATE', 'EXPIRY_DATE', 'REFERENCE_DATE');

-- CreateEnum
CREATE TYPE "FindingConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "FindingReviewStatus" AS ENUM ('UNREVIEWED', 'ACCEPTED', 'REJECTED', 'EDITED', 'DISMISSED');

-- CreateTable
CREATE TABLE "document_analyses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "evidenceId" TEXT,
    "evidenceFileName" TEXT,
    "evidenceChecksum" TEXT,
    "fingerprint" TEXT NOT NULL,
    "analysisVersionNumber" INTEGER NOT NULL DEFAULT 1,
    "analysisContext" "AnalysisContextType" NOT NULL DEFAULT 'GENERAL',
    "frameworkId" TEXT,
    "frameworkVersionId" TEXT,
    "frameworkReferenceId" TEXT,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'QUEUED',
    "extractionStatus" "ExtractionStatus" NOT NULL DEFAULT 'SUCCESS',
    "extractionMethod" TEXT NOT NULL,
    "isTruncated" BOOLEAN NOT NULL DEFAULT false,
    "truncationReason" TEXT,
    "errorMessage" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_runs" (
    "id" TEXT NOT NULL,
    "documentAnalysisId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "modelTier" "ModelTier" NOT NULL DEFAULT 'TIER_1',
    "promptVersion" TEXT NOT NULL DEFAULT 'v1.0',
    "schemaVersion" TEXT NOT NULL DEFAULT 'v1.0',
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "durationMs" INTEGER,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'QUEUED',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracted_findings" (
    "id" TEXT NOT NULL,
    "documentAnalysisId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "findingType" "FindingType" NOT NULL,
    "dateCategory" "DateCategory",
    "aiTitle" TEXT NOT NULL,
    "aiDescription" TEXT NOT NULL,
    "aiConfidence" "FindingConfidence" NOT NULL DEFAULT 'MEDIUM',
    "aiRawScore" DOUBLE PRECISION,
    "aiSourceSnippet" TEXT,
    "aiSourcePage" INTEGER,
    "aiSourceSection" TEXT,
    "aiSourceSheet" TEXT,
    "aiSourceCell" TEXT,
    "aiSourceRow" INTEGER,
    "aiSourceCol" INTEGER,
    "aiCharOffsetStart" INTEGER,
    "aiCharOffsetEnd" INTEGER,
    "aiDueDate" TIMESTAMP(3),
    "aiRelativeExpression" TEXT,
    "aiResponsibleParty" TEXT,
    "aiSuggestedFrameworkCode" TEXT,
    "aiSuggestedReferenceId" TEXT,
    "aiSuggestedControlId" TEXT,
    "aiSuggestedRiskId" TEXT,
    "aiRationale" TEXT,
    "isValidatedControl" BOOLEAN NOT NULL DEFAULT false,
    "isValidatedRisk" BOOLEAN NOT NULL DEFAULT false,
    "isValidatedReference" BOOLEAN NOT NULL DEFAULT false,
    "reviewStatus" "FindingReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "editedTitle" TEXT,
    "editedDescription" TEXT,
    "editedCategory" "FindingType",
    "humanComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extracted_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_analyses_organizationId_idx" ON "document_analyses"("organizationId");
CREATE INDEX "document_analyses_evidenceId_idx" ON "document_analyses"("evidenceId");
CREATE INDEX "document_analyses_status_idx" ON "document_analyses"("status");
CREATE INDEX "document_analyses_fingerprint_idx" ON "document_analyses"("fingerprint");

-- CreateIndex
CREATE INDEX "analysis_runs_documentAnalysisId_idx" ON "analysis_runs"("documentAnalysisId");

-- CreateIndex
CREATE INDEX "extracted_findings_documentAnalysisId_idx" ON "extracted_findings"("documentAnalysisId");
CREATE INDEX "extracted_findings_organizationId_idx" ON "extracted_findings"("organizationId");
CREATE INDEX "extracted_findings_findingType_idx" ON "extracted_findings"("findingType");
CREATE INDEX "extracted_findings_reviewStatus_idx" ON "extracted_findings"("reviewStatus");

-- AddForeignKey
ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "frameworks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_frameworkVersionId_fkey" FOREIGN KEY ("frameworkVersionId") REFERENCES "framework_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_frameworkReferenceId_fkey" FOREIGN KEY ("frameworkReferenceId") REFERENCES "framework_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_documentAnalysisId_fkey" FOREIGN KEY ("documentAnalysisId") REFERENCES "document_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_findings" ADD CONSTRAINT "extracted_findings_documentAnalysisId_fkey" FOREIGN KEY ("documentAnalysisId") REFERENCES "document_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "extracted_findings" ADD CONSTRAINT "extracted_findings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
