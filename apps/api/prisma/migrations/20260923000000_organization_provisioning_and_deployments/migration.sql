-- CreateEnum
CREATE TYPE "DeploymentModel" AS ENUM ('SAAS_MULTI_TENANT', 'MSSP_SHARED', 'PRIVATE_MSSP', 'SELF_HOSTED');

-- CreateTable
CREATE TABLE "deployments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "controlPlaneDeploymentId" TEXT NOT NULL,
    "modelType" "DeploymentModel" NOT NULL DEFAULT 'SAAS_MULTI_TENANT',
    "externalRefId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deployments_organizationId_key" ON "deployments"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "deployments_controlPlaneDeploymentId_key" ON "deployments"("controlPlaneDeploymentId");

-- CreateIndex
CREATE UNIQUE INDEX "deployments_externalRefId_key" ON "deployments"("externalRefId");

-- CreateIndex
CREATE INDEX "deployments_organizationId_idx" ON "deployments"("organizationId");

-- CreateIndex
CREATE INDEX "deployments_controlPlaneDeploymentId_idx" ON "deployments"("controlPlaneDeploymentId");

-- AlterTable SystemLicenseState: Make organizationId unique and add foreign key
ALTER TABLE "system_license_state" ALTER COLUMN "id" DROP DEFAULT;
CREATE UNIQUE INDEX "system_license_state_organizationId_key" ON "system_license_state"("organizationId");
CREATE INDEX "system_license_state_organizationId_idx" ON "system_license_state"("organizationId");
CREATE INDEX "system_license_state_deploymentId_idx" ON "system_license_state"("deploymentId");

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_license_state" ADD CONSTRAINT "system_license_state_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
