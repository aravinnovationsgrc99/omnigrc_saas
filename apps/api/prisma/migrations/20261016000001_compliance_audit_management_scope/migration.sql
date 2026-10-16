-- AlterTable: Add frameworkId and frameworkVersionId to audit_plans
ALTER TABLE "audit_plans" ADD COLUMN "frameworkId" TEXT;
ALTER TABLE "audit_plans" ADD COLUMN "frameworkVersionId" TEXT;

-- CreateTable: audit_plan_framework_references
CREATE TABLE "audit_plan_framework_references" (
    "id" TEXT NOT NULL,
    "auditPlanId" TEXT NOT NULL,
    "frameworkReferenceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_plan_framework_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_plans_frameworkId_idx" ON "audit_plans"("frameworkId");
CREATE INDEX "audit_plans_frameworkVersionId_idx" ON "audit_plans"("frameworkVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_plan_framework_references_auditPlanId_frameworkReferenceId_key" ON "audit_plan_framework_references"("auditPlanId", "frameworkReferenceId");
CREATE INDEX "audit_plan_framework_references_auditPlanId_idx" ON "audit_plan_framework_references"("auditPlanId");
CREATE INDEX "audit_plan_framework_references_frameworkReferenceId_idx" ON "audit_plan_framework_references"("frameworkReferenceId");

-- AddForeignKey
ALTER TABLE "audit_plans" ADD CONSTRAINT "audit_plans_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "frameworks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_plans" ADD CONSTRAINT "audit_plans_frameworkVersionId_fkey" FOREIGN KEY ("frameworkVersionId") REFERENCES "framework_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_plan_framework_references" ADD CONSTRAINT "audit_plan_framework_references_auditPlanId_fkey" FOREIGN KEY ("auditPlanId") REFERENCES "audit_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_plan_framework_references" ADD CONSTRAINT "audit_plan_framework_references_frameworkReferenceId_fkey" FOREIGN KEY ("frameworkReferenceId") REFERENCES "framework_references"("id") ON DELETE CASCADE ON UPDATE CASCADE;
