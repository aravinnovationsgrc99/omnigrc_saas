-- Add departmentId and projectId optional foreign keys to GRC resources for department/project resource authorization scoping.

ALTER TABLE "assets" ADD COLUMN "departmentId" TEXT, ADD COLUMN "projectId" TEXT;
ALTER TABLE "risks" ADD COLUMN "departmentId" TEXT, ADD COLUMN "projectId" TEXT;
ALTER TABLE "controls" ADD COLUMN "departmentId" TEXT, ADD COLUMN "projectId" TEXT;
ALTER TABLE "compliance_tasks" ADD COLUMN "departmentId" TEXT, ADD COLUMN "projectId" TEXT;
ALTER TABLE "vendors" ADD COLUMN "departmentId" TEXT, ADD COLUMN "projectId" TEXT;
ALTER TABLE "vulnerabilities" ADD COLUMN "departmentId" TEXT, ADD COLUMN "projectId" TEXT;
ALTER TABLE "policies" ADD COLUMN "departmentId" TEXT, ADD COLUMN "projectId" TEXT;
ALTER TABLE "audit_plans" ADD COLUMN "departmentId" TEXT, ADD COLUMN "projectId" TEXT;
ALTER TABLE "incidents" ADD COLUMN "departmentId" TEXT, ADD COLUMN "projectId" TEXT;
ALTER TABLE "evidences" ADD COLUMN "departmentId" TEXT, ADD COLUMN "projectId" TEXT;

-- Create Indexes for performance on scope filtering
CREATE INDEX "assets_departmentId_idx" ON "assets"("departmentId");
CREATE INDEX "assets_projectId_idx" ON "assets"("projectId");

CREATE INDEX "risks_departmentId_idx" ON "risks"("departmentId");
CREATE INDEX "risks_projectId_idx" ON "risks"("projectId");

CREATE INDEX "controls_departmentId_idx" ON "controls"("departmentId");
CREATE INDEX "controls_projectId_idx" ON "controls"("projectId");

CREATE INDEX "compliance_tasks_departmentId_idx" ON "compliance_tasks"("departmentId");
CREATE INDEX "compliance_tasks_projectId_idx" ON "compliance_tasks"("projectId");

CREATE INDEX "vendors_departmentId_idx" ON "vendors"("departmentId");
CREATE INDEX "vendors_projectId_idx" ON "vendors"("projectId");

CREATE INDEX "vulnerabilities_departmentId_idx" ON "vulnerabilities"("departmentId");
CREATE INDEX "vulnerabilities_projectId_idx" ON "vulnerabilities"("projectId");

CREATE INDEX "policies_departmentId_idx" ON "policies"("departmentId");
CREATE INDEX "policies_projectId_idx" ON "policies"("projectId");

CREATE INDEX "audit_plans_departmentId_idx" ON "audit_plans"("departmentId");
CREATE INDEX "audit_plans_projectId_idx" ON "audit_plans"("projectId");

CREATE INDEX "incidents_departmentId_idx" ON "incidents"("departmentId");
CREATE INDEX "incidents_projectId_idx" ON "incidents"("projectId");

CREATE INDEX "evidences_departmentId_idx" ON "evidences"("departmentId");
CREATE INDEX "evidences_projectId_idx" ON "evidences"("projectId");

-- Foreign Key Constraints
ALTER TABLE "assets" ADD CONSTRAINT "assets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "risks" ADD CONSTRAINT "risks_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "risks" ADD CONSTRAINT "risks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "controls" ADD CONSTRAINT "controls_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "controls" ADD CONSTRAINT "controls_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "compliance_tasks" ADD CONSTRAINT "compliance_tasks_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "compliance_tasks" ADD CONSTRAINT "compliance_tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vendors" ADD CONSTRAINT "vendors_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "policies" ADD CONSTRAINT "policies_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "policies" ADD CONSTRAINT "policies_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_plans" ADD CONSTRAINT "audit_plans_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_plans" ADD CONSTRAINT "audit_plans_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "evidences" ADD CONSTRAINT "evidences_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evidences" ADD CONSTRAINT "evidences_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
