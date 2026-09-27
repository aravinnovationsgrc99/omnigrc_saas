-- CreateEnum
CREATE TYPE "ControlState" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED', 'DECOMMISSIONED');

-- CreateTable
CREATE TABLE "control_plane_organization_control_states" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "state" "ControlState" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL DEFAULT 1,
    "updatedByOperatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "control_plane_organization_control_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_plane_organization_state_transition_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "previousState" "ControlState" NOT NULL,
    "newState" "ControlState" NOT NULL,
    "reason" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "idempotencyKey" TEXT,
    "operatorId" TEXT NOT NULL,
    "operatorRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_plane_organization_state_transition_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "control_plane_organization_control_states_organizationId_key" ON "control_plane_organization_control_states"("organizationId");

-- CreateIndex
CREATE INDEX "control_plane_organization_control_states_organizationId_idx" ON "control_plane_organization_control_states"("organizationId");

-- CreateIndex
CREATE INDEX "control_plane_organization_control_states_state_idx" ON "control_plane_organization_control_states"("state");

-- CreateIndex
CREATE UNIQUE INDEX "control_plane_organization_state_transition_logs_idempotencyKey_key" ON "control_plane_organization_state_transition_logs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "control_plane_organization_state_transition_logs_organizationId_idx" ON "control_plane_organization_state_transition_logs"("organizationId");

-- CreateIndex
CREATE INDEX "control_plane_organization_state_transition_logs_sequence_idx" ON "control_plane_organization_state_transition_logs"("sequence");
