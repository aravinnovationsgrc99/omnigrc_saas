ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "departmentId" TEXT, ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "departmentId" TEXT, ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "controls" ADD COLUMN IF NOT EXISTS "departmentId" TEXT, ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "compliance_tasks" ADD COLUMN IF NOT EXISTS "departmentId" TEXT, ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "departmentId" TEXT, ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "vulnerabilities" ADD COLUMN IF NOT EXISTS "departmentId" TEXT, ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "departmentId" TEXT, ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "audit_plans" ADD COLUMN IF NOT EXISTS "departmentId" TEXT, ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "departmentId" TEXT, ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "evidences" ADD COLUMN IF NOT EXISTS "departmentId" TEXT, ADD COLUMN IF NOT EXISTS "projectId" TEXT;

-- Create Indexes for performance on scope filtering
CREATE INDEX IF NOT EXISTS "assets_departmentId_idx" ON "assets"("departmentId");
CREATE INDEX IF NOT EXISTS "assets_projectId_idx" ON "assets"("projectId");

CREATE INDEX IF NOT EXISTS "risks_departmentId_idx" ON "risks"("departmentId");
CREATE INDEX IF NOT EXISTS "risks_projectId_idx" ON "risks"("projectId");

CREATE INDEX IF NOT EXISTS "controls_departmentId_idx" ON "controls"("departmentId");
CREATE INDEX IF NOT EXISTS "controls_projectId_idx" ON "controls"("projectId");

CREATE INDEX IF NOT EXISTS "compliance_tasks_departmentId_idx" ON "compliance_tasks"("departmentId");
CREATE INDEX IF NOT EXISTS "compliance_tasks_projectId_idx" ON "compliance_tasks"("projectId");

CREATE INDEX IF NOT EXISTS "vendors_departmentId_idx" ON "vendors"("departmentId");
CREATE INDEX IF NOT EXISTS "vendors_projectId_idx" ON "vendors"("projectId");

CREATE INDEX IF NOT EXISTS "vulnerabilities_departmentId_idx" ON "vulnerabilities"("departmentId");
CREATE INDEX IF NOT EXISTS "vulnerabilities_projectId_idx" ON "vulnerabilities"("projectId");

CREATE INDEX IF NOT EXISTS "policies_departmentId_idx" ON "policies"("departmentId");
CREATE INDEX IF NOT EXISTS "policies_projectId_idx" ON "policies"("projectId");

CREATE INDEX IF NOT EXISTS "audit_plans_departmentId_idx" ON "audit_plans"("departmentId");
CREATE INDEX IF NOT EXISTS "audit_plans_projectId_idx" ON "audit_plans"("projectId");

CREATE INDEX IF NOT EXISTS "incidents_departmentId_idx" ON "incidents"("departmentId");
CREATE INDEX IF NOT EXISTS "incidents_projectId_idx" ON "incidents"("projectId");

CREATE INDEX IF NOT EXISTS "evidences_departmentId_idx" ON "evidences"("departmentId");
CREATE INDEX IF NOT EXISTS "evidences_projectId_idx" ON "evidences"("projectId");

-- Foreign Key Constraints
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_departmentId_fkey";
ALTER TABLE "assets" ADD CONSTRAINT "assets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_projectId_fkey";
ALTER TABLE "assets" ADD CONSTRAINT "assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "risks" DROP CONSTRAINT IF EXISTS "risks_departmentId_fkey";
ALTER TABLE "risks" ADD CONSTRAINT "risks_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "risks" DROP CONSTRAINT IF EXISTS "risks_projectId_fkey";
ALTER TABLE "risks" ADD CONSTRAINT "risks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "controls" DROP CONSTRAINT IF EXISTS "controls_departmentId_fkey";
ALTER TABLE "controls" ADD CONSTRAINT "controls_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "controls" DROP CONSTRAINT IF EXISTS "controls_projectId_fkey";
ALTER TABLE "controls" ADD CONSTRAINT "controls_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "compliance_tasks" DROP CONSTRAINT IF EXISTS "compliance_tasks_departmentId_fkey";
ALTER TABLE "compliance_tasks" ADD CONSTRAINT "compliance_tasks_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "compliance_tasks" DROP CONSTRAINT IF EXISTS "compliance_tasks_projectId_fkey";
ALTER TABLE "compliance_tasks" ADD CONSTRAINT "compliance_tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vendors" DROP CONSTRAINT IF EXISTS "vendors_departmentId_fkey";
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vendors" DROP CONSTRAINT IF EXISTS "vendors_projectId_fkey";
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vulnerabilities" DROP CONSTRAINT IF EXISTS "vulnerabilities_departmentId_fkey";
ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vulnerabilities" DROP CONSTRAINT IF EXISTS "vulnerabilities_projectId_fkey";
ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "policies" DROP CONSTRAINT IF EXISTS "policies_departmentId_fkey";
ALTER TABLE "policies" ADD CONSTRAINT "policies_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "policies" DROP CONSTRAINT IF EXISTS "policies_projectId_fkey";
ALTER TABLE "policies" ADD CONSTRAINT "policies_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_plans" DROP CONSTRAINT IF EXISTS "audit_plans_departmentId_fkey";
ALTER TABLE "audit_plans" ADD CONSTRAINT "audit_plans_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_plans" DROP CONSTRAINT IF EXISTS "audit_plans_projectId_fkey";
ALTER TABLE "audit_plans" ADD CONSTRAINT "audit_plans_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "incidents" DROP CONSTRAINT IF EXISTS "incidents_departmentId_fkey";
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "incidents" DROP CONSTRAINT IF EXISTS "incidents_projectId_fkey";
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "evidences" DROP CONSTRAINT IF EXISTS "evidences_departmentId_fkey";
ALTER TABLE "evidences" ADD CONSTRAINT "evidences_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "evidences" DROP CONSTRAINT IF EXISTS "evidences_projectId_fkey";
ALTER TABLE "evidences" ADD CONSTRAINT "evidences_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
