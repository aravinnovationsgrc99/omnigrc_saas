-- CreateTable
CREATE TABLE IF NOT EXISTS "system_license_state" (
    "id" TEXT NOT NULL DEFAULT 'current',
    "deploymentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "signedArtifactJson" JSONB NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_license_state_pkey" PRIMARY KEY ("id")
);
