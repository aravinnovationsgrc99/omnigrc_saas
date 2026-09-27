-- CreateEnum
CREATE TYPE "ServiceStateEnum" AS ENUM ('AVAILABLE', 'DISABLED', 'TECHNICAL_OUTAGE', 'COMMERCIAL_DISABLED');

-- CreateTable
CREATE TABLE "control_plane_service_catalog" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'CORE_GRC',
    "isCatalogActive" BOOLEAN NOT NULL DEFAULT true,
    "isCommerciallyControllable" BOOLEAN NOT NULL DEFAULT true,
    "isOrgOverridePermitted" BOOLEAN NOT NULL DEFAULT true,
    "hasBackgroundProcessing" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "control_plane_service_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_plane_global_service_states" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "state" "ServiceStateEnum" NOT NULL DEFAULT 'AVAILABLE',
    "reason" TEXT,
    "sequence" BIGINT NOT NULL DEFAULT 1,
    "updatedByOperatorId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "control_plane_global_service_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_plane_organization_service_overrides" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "overrideState" "ServiceStateEnum" NOT NULL,
    "reason" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT,
    "updatedByOperatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "control_plane_organization_service_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_plane_service_state_transition_logs" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "organizationId" TEXT,
    "serviceCode" TEXT NOT NULL,
    "previousState" "ServiceStateEnum",
    "newState" "ServiceStateEnum" NOT NULL,
    "reason" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "idempotencyKey" TEXT,
    "operatorId" TEXT NOT NULL,
    "operatorRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_plane_service_state_transition_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "control_plane_service_catalog_code_key" ON "control_plane_service_catalog"("code");

-- CreateIndex
CREATE UNIQUE INDEX "control_plane_global_service_states_serviceId_key" ON "control_plane_global_service_states"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "control_plane_organization_service_overrides_idempotencyKey_key" ON "control_plane_organization_service_overrides"("idempotencyKey");

-- CreateIndex
CREATE INDEX "control_plane_organization_service_overrides_organizationId_idx" ON "control_plane_organization_service_overrides"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "control_plane_organization_service_overrides_organizationId_serviceId_key" ON "control_plane_organization_service_overrides"("organizationId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "control_plane_service_state_transition_logs_idempotencyKey_key" ON "control_plane_service_state_transition_logs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "control_plane_service_state_transition_logs_serviceCode_idx" ON "control_plane_service_state_transition_logs"("serviceCode");

-- CreateIndex
CREATE INDEX "control_plane_service_state_transition_logs_organizationId_idx" ON "control_plane_service_state_transition_logs"("organizationId");

-- CreateIndex
CREATE INDEX "control_plane_service_state_transition_logs_sequence_idx" ON "control_plane_service_state_transition_logs"("sequence");

-- AddForeignKey
ALTER TABLE "control_plane_global_service_states" ADD CONSTRAINT "control_plane_global_service_states_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "control_plane_service_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_plane_organization_service_overrides" ADD CONSTRAINT "control_plane_organization_service_overrides_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "control_plane_service_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
