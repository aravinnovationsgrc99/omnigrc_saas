-- CreateEnum
CREATE TYPE "BreakGlassStatus" AS ENUM ('REQUESTED', 'APPROVED', 'EXECUTED', 'EXPIRED', 'REVOKED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BreakGlassOperation" AS ENUM ('EMERGENCY_ORG_SUSPEND', 'EMERGENCY_ORG_DISABLE', 'EMERGENCY_SERVICE_KILL_SWITCH', 'EMERGENCY_DEPLOYMENT_SUSPEND', 'EMERGENCY_LICENSE_RECONCILE');

-- CreateTable
CREATE TABLE "control_plane_break_glass_sessions" (
    "id" TEXT NOT NULL,
    "requesterOperatorId" TEXT NOT NULL,
    "approverOperatorId" TEXT,
    "executorOperatorId" TEXT,
    "status" "BreakGlassStatus" NOT NULL DEFAULT 'REQUESTED',
    "operation" "BreakGlassOperation" NOT NULL,
    "reason" TEXT NOT NULL,
    "targetOrganizationId" TEXT,
    "targetDeploymentId" TEXT,
    "targetServiceCode" TEXT,
    "scopeMetadata" JSONB,
    "idempotencyKey" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedByOperatorId" TEXT,
    "isSingleOperatorEmergency" BOOLEAN NOT NULL DEFAULT false,
    "postEventReviewStatus" TEXT DEFAULT 'NOT_APPLICABLE',
    "postEventReviewedBy" TEXT,
    "postEventReviewedAt" TIMESTAMP(3),
    "postEventNotes" TEXT,
    "originatingIp" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "control_plane_break_glass_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "control_plane_break_glass_sessions_idempotencyKey_key" ON "control_plane_break_glass_sessions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "control_plane_break_glass_sessions_targetOrganizationId_idx" ON "control_plane_break_glass_sessions"("targetOrganizationId");

-- CreateIndex
CREATE INDEX "control_plane_break_glass_sessions_targetDeploymentId_idx" ON "control_plane_break_glass_sessions"("targetDeploymentId");

-- CreateIndex
CREATE INDEX "control_plane_break_glass_sessions_status_idx" ON "control_plane_break_glass_sessions"("status");

-- CreateIndex
CREATE INDEX "control_plane_break_glass_sessions_requesterOperatorId_idx" ON "control_plane_break_glass_sessions"("requesterOperatorId");

-- AddForeignKey
ALTER TABLE "control_plane_break_glass_sessions" ADD CONSTRAINT "control_plane_break_glass_sessions_requesterOperatorId_fkey" FOREIGN KEY ("requesterOperatorId") REFERENCES "operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_plane_break_glass_sessions" ADD CONSTRAINT "control_plane_break_glass_sessions_approverOperatorId_fkey" FOREIGN KEY ("approverOperatorId") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
