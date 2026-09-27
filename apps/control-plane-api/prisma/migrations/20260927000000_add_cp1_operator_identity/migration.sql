-- CreateEnum
CREATE TYPE "OperatorRole" AS ENUM ('PLATFORM_SUPER_ADMIN', 'COMMERCIAL_OPERATOR', 'OPERATIONS_ENGINEER', 'SUPPORT_ENGINEER', 'SECURITY_AUDIT', 'READ_ONLY_AUDITOR');

-- CreateEnum
CREATE TYPE "OperatorStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "operators" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "OperatorRole" NOT NULL,
    "status" "OperatorStatus" NOT NULL DEFAULT 'ACTIVE',
    "totpSecret" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator_sessions" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_sessions_pkey" PRIMARY KEY ("id")
);

-- AlterTable ControlPlaneAuditLog
ALTER TABLE "control_plane_audit_logs" ADD COLUMN IF NOT EXISTS "actorId" TEXT;
ALTER TABLE "control_plane_audit_logs" ADD COLUMN IF NOT EXISTS "actorRole" TEXT;
ALTER TABLE "control_plane_audit_logs" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
ALTER TABLE "control_plane_audit_logs" ADD COLUMN IF NOT EXISTS "correlationId" TEXT;
ALTER TABLE "control_plane_audit_logs" ADD COLUMN IF NOT EXISTS "result" TEXT DEFAULT 'SUCCESS';

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "operators_email_key" ON "operators"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "operator_sessions_operatorId_idx" ON "operator_sessions"("operatorId");
CREATE INDEX IF NOT EXISTS "operator_sessions_familyId_idx" ON "operator_sessions"("familyId");
CREATE INDEX IF NOT EXISTS "operator_sessions_refreshTokenHash_idx" ON "operator_sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "control_plane_audit_logs_actorId_idx" ON "control_plane_audit_logs"("actorId");
CREATE INDEX IF NOT EXISTS "control_plane_audit_logs_action_idx" ON "control_plane_audit_logs"("action");

-- AddForeignKey
ALTER TABLE "operator_sessions" ADD CONSTRAINT "operator_sessions_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;
