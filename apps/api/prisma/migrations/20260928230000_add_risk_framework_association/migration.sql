-- AlterTable
ALTER TABLE "risks" ADD COLUMN "frameworkId" TEXT,
ADD COLUMN "frameworkReferenceId" TEXT;

-- CreateIndex
CREATE INDEX "risks_frameworkId_idx" ON "risks"("frameworkId");

-- CreateIndex
CREATE INDEX "risks_frameworkReferenceId_idx" ON "risks"("frameworkReferenceId");

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "frameworks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_frameworkReferenceId_fkey" FOREIGN KEY ("frameworkReferenceId") REFERENCES "framework_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;
