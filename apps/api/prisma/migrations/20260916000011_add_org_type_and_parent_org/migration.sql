-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('STANDALONE', 'MSSP_PROVIDER', 'CLIENT_TENANT');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "type" "OrgType" NOT NULL DEFAULT 'STANDALONE',
ADD COLUMN     "parentOrganizationId" TEXT;

-- CreateIndex
CREATE INDEX "organizations_parentOrganizationId_idx" ON "organizations"("parentOrganizationId");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parentOrganizationId_fkey" FOREIGN KEY ("parentOrganizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
