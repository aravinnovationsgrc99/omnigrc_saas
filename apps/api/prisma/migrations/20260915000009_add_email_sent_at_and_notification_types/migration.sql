-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'WEEKLY_DIGEST';
ALTER TYPE "NotificationType" ADD VALUE 'RISK_ESCALATION';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "emailSentAt" TIMESTAMP(3);
