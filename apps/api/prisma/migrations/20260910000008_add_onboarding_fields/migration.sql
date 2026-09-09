-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "primaryFramework" TEXT,
ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;
