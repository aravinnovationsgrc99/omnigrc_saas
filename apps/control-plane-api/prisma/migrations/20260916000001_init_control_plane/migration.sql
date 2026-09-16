-- CreateEnum
CREATE TYPE "DeploymentModel" AS ENUM ('MSSP_SHARED', 'PRIVATE_MSSP', 'SELF_HOSTED');

-- CreateEnum
CREATE TYPE "DeploymentEnvironment" AS ENUM ('PRODUCTION', 'UAT', 'DR', 'DEVELOPMENT');

-- CreateEnum
CREATE TYPE "ActivationState" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "InfrastructureOwner" AS ENUM ('ARAV', 'CUSTOMER');

-- CreateTable
CREATE TABLE "control_plane_customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "control_plane_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_plane_commercial_agreements" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "control_plane_commercial_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,
    "commercialAgreementId" TEXT,
    "deploymentModel" "DeploymentModel" NOT NULL,
    "environment" "DeploymentEnvironment" NOT NULL DEFAULT 'PRODUCTION',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "activationState" "ActivationState" NOT NULL DEFAULT 'PENDING',
    "infrastructureOwner" "InfrastructureOwner" NOT NULL,
    "licenseId" TEXT,
    "registrationSecretHash" TEXT NOT NULL,
    "lastCheckInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "control_plane_commercial_agreements_customerId_idx" ON "control_plane_commercial_agreements"("customerId");

-- CreateIndex
CREATE INDEX "deployments_organizationId_idx" ON "deployments"("organizationId");

-- CreateIndex
CREATE INDEX "deployments_deploymentModel_idx" ON "deployments"("deploymentModel");

-- CreateIndex
CREATE INDEX "deployments_activationState_idx" ON "deployments"("activationState");

-- AddForeignKey
ALTER TABLE "control_plane_commercial_agreements" ADD CONSTRAINT "control_plane_commercial_agreements_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "control_plane_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "control_plane_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_commercialAgreementId_fkey" FOREIGN KEY ("commercialAgreementId") REFERENCES "control_plane_commercial_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
