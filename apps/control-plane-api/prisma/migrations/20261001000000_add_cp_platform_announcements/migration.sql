-- CreateEnum
CREATE TYPE "AnnouncementSeverity" AS ENUM ('INFO', 'NOTICE', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL_OPERATORS', 'ALL_ORGANIZATIONS', 'SPECIFIC_ORGANIZATION');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('NOT_REQUESTED', 'QUEUED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "platform_announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" "AnnouncementSeverity" NOT NULL DEFAULT 'INFO',
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "audience" "AnnouncementAudience" NOT NULL DEFAULT 'ALL_ORGANIZATIONS',
    "targetOrganizationId" TEXT,
    "createdByOperatorId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "sendEmail" BOOLEAN NOT NULL DEFAULT false,
    "emailDeliveryStatus" "EmailDeliveryStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "emailSentAt" TIMESTAMP(3),
    "emailRecipientCount" INTEGER NOT NULL DEFAULT 0,
    "emailErrorDetails" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_announcements_status_idx" ON "platform_announcements"("status");

-- CreateIndex
CREATE INDEX "platform_announcements_severity_idx" ON "platform_announcements"("severity");

-- CreateIndex
CREATE INDEX "platform_announcements_audience_idx" ON "platform_announcements"("audience");

-- CreateIndex
CREATE INDEX "platform_announcements_targetOrganizationId_idx" ON "platform_announcements"("targetOrganizationId");

-- CreateIndex
CREATE INDEX "platform_announcements_createdByOperatorId_idx" ON "platform_announcements"("createdByOperatorId");

-- CreateIndex
CREATE INDEX "platform_announcements_createdAt_idx" ON "platform_announcements"("createdAt");

-- AddForeignKey
ALTER TABLE "platform_announcements" ADD CONSTRAINT "platform_announcements_createdByOperatorId_fkey" FOREIGN KEY ("createdByOperatorId") REFERENCES "operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;
