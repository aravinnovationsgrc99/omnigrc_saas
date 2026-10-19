-- Phase 1: Comprehensive PostgreSQL Row-Level Security (RLS) Policy Expansion
-- Extends RLS coverage to all 32 remaining direct tenant-owned tables and 8 child relation tables,
-- enforces FORCE ROW LEVEL SECURITY, establishes standardized fail-closed policies,
-- and grants least-privilege DML access to the dedicated application role (omnigrc_app).

-- 1. Ensure Dedicated Application Role exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'omnigrc_app') THEN
    CREATE ROLE omnigrc_app WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT;
  END IF;
END $$;

-- 2. Direct Tenant-Owned Tables: Enable and Force Row Level Security (32 tables)
ALTER TABLE "organization_control_state_projections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_control_state_projections" FORCE ROW LEVEL SECURITY;

ALTER TABLE "organization_service_override_projections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_service_override_projections" FORCE ROW LEVEL SECURITY;

ALTER TABLE "organization_framework_entitlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_framework_entitlements" FORCE ROW LEVEL SECURITY;

ALTER TABLE "risk_controls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "risk_controls" FORCE ROW LEVEL SECURITY;

ALTER TABLE "deployments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deployments" FORCE ROW LEVEL SECURITY;

ALTER TABLE "system_license_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "system_license_state" FORCE ROW LEVEL SECURITY;

ALTER TABLE "organization_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_memberships" FORCE ROW LEVEL SECURITY;

ALTER TABLE "departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "departments" FORCE ROW LEVEL SECURITY;

ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;

ALTER TABLE "evidences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evidences" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control_evidences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "control_evidences" FORCE ROW LEVEL SECURITY;

ALTER TABLE "risk_evidences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "risk_evidences" FORCE ROW LEVEL SECURITY;

ALTER TABLE "policy_evidences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_evidences" FORCE ROW LEVEL SECURITY;

ALTER TABLE "audit_check_item_evidences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_check_item_evidences" FORCE ROW LEVEL SECURITY;

ALTER TABLE "audit_finding_evidences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_finding_evidences" FORCE ROW LEVEL SECURITY;

ALTER TABLE "vendor_evidences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vendor_evidences" FORCE ROW LEVEL SECURITY;

ALTER TABLE "vulnerability_evidences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vulnerability_evidences" FORCE ROW LEVEL SECURITY;

ALTER TABLE "incident_evidences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "incident_evidences" FORCE ROW LEVEL SECURITY;

ALTER TABLE "approval_workflows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_workflows" FORCE ROW LEVEL SECURITY;

ALTER TABLE "approval_instances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_instances" FORCE ROW LEVEL SECURITY;

ALTER TABLE "approval_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_decisions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "control_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "control_approvals" FORCE ROW LEVEL SECURITY;

ALTER TABLE "risk_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "risk_approvals" FORCE ROW LEVEL SECURITY;

ALTER TABLE "policy_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_approvals" FORCE ROW LEVEL SECURITY;

ALTER TABLE "audit_finding_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_finding_approvals" FORCE ROW LEVEL SECURITY;

ALTER TABLE "vendor_assessment_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vendor_assessment_approvals" FORCE ROW LEVEL SECURITY;

ALTER TABLE "vulnerability_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vulnerability_approvals" FORCE ROW LEVEL SECURITY;

ALTER TABLE "incident_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "incident_approvals" FORCE ROW LEVEL SECURITY;

ALTER TABLE "policy_exception_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_exception_approvals" FORCE ROW LEVEL SECURITY;

ALTER TABLE "evidence_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evidence_approvals" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document_analyses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_analyses" FORCE ROW LEVEL SECURITY;

ALTER TABLE "extracted_findings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "extracted_findings" FORCE ROW LEVEL SECURITY;

-- 3. Child Relation Tables: Enable and Force Row Level Security (8 tables)
ALTER TABLE "control_framework_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "control_framework_mappings" FORCE ROW LEVEL SECURITY;

ALTER TABLE "audit_plan_framework_references" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_plan_framework_references" FORCE ROW LEVEL SECURITY;

ALTER TABLE "user_departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_departments" FORCE ROW LEVEL SECURITY;

ALTER TABLE "user_projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_projects" FORCE ROW LEVEL SECURITY;

ALTER TABLE "evidence_framework_references" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evidence_framework_references" FORCE ROW LEVEL SECURITY;

ALTER TABLE "approval_workflow_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_workflow_steps" FORCE ROW LEVEL SECURITY;

ALTER TABLE "approval_instance_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_instance_steps" FORCE ROW LEVEL SECURITY;

ALTER TABLE "analysis_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analysis_runs" FORCE ROW LEVEL SECURITY;

-- 4. Standardize Policies on Direct Tenant Tables (Drop legacy if exists and create standard)
DROP POLICY IF EXISTS "organization_control_state_projections_tenant_isolation" ON "organization_control_state_projections";
CREATE POLICY "organization_control_state_projections_tenant_isolation" ON "organization_control_state_projections"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "organization_service_override_projections_tenant_isolation" ON "organization_service_override_projections";
CREATE POLICY "organization_service_override_projections_tenant_isolation" ON "organization_service_override_projections"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "organization_framework_entitlements_tenant_isolation" ON "organization_framework_entitlements";
CREATE POLICY "organization_framework_entitlements_tenant_isolation" ON "organization_framework_entitlements"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "risk_controls_tenant_isolation" ON "risk_controls";
CREATE POLICY "risk_controls_tenant_isolation" ON "risk_controls"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "deployments_tenant_isolation" ON "deployments";
CREATE POLICY "deployments_tenant_isolation" ON "deployments"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "system_license_state_tenant_isolation" ON "system_license_state";
CREATE POLICY "system_license_state_tenant_isolation" ON "system_license_state"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "organization_memberships_tenant_isolation" ON "organization_memberships";
CREATE POLICY "organization_memberships_tenant_isolation" ON "organization_memberships"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "departments_tenant_isolation" ON "departments";
CREATE POLICY "departments_tenant_isolation" ON "departments"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "projects_tenant_isolation" ON "projects";
CREATE POLICY "projects_tenant_isolation" ON "projects"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "evidences_tenant_isolation" ON "evidences";
CREATE POLICY "evidences_tenant_isolation" ON "evidences"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "control_evidences_tenant_isolation" ON "control_evidences";
CREATE POLICY "control_evidences_tenant_isolation" ON "control_evidences"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "risk_evidences_tenant_isolation" ON "risk_evidences";
CREATE POLICY "risk_evidences_tenant_isolation" ON "risk_evidences"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "policy_evidences_tenant_isolation" ON "policy_evidences";
CREATE POLICY "policy_evidences_tenant_isolation" ON "policy_evidences"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "audit_check_item_evidences_tenant_isolation" ON "audit_check_item_evidences";
CREATE POLICY "audit_check_item_evidences_tenant_isolation" ON "audit_check_item_evidences"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "audit_finding_evidences_tenant_isolation" ON "audit_finding_evidences";
CREATE POLICY "audit_finding_evidences_tenant_isolation" ON "audit_finding_evidences"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "vendor_evidences_tenant_isolation" ON "vendor_evidences";
CREATE POLICY "vendor_evidences_tenant_isolation" ON "vendor_evidences"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "vulnerability_evidences_tenant_isolation" ON "vulnerability_evidences";
CREATE POLICY "vulnerability_evidences_tenant_isolation" ON "vulnerability_evidences"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "incident_evidences_tenant_isolation" ON "incident_evidences";
CREATE POLICY "incident_evidences_tenant_isolation" ON "incident_evidences"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "approval_workflows_tenant_isolation" ON "approval_workflows";
CREATE POLICY "approval_workflows_tenant_isolation" ON "approval_workflows"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "approval_instances_tenant_isolation" ON "approval_instances";
CREATE POLICY "approval_instances_tenant_isolation" ON "approval_instances"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "approval_decisions_tenant_isolation" ON "approval_decisions";
CREATE POLICY "approval_decisions_tenant_isolation" ON "approval_decisions"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "control_approvals_tenant_isolation" ON "control_approvals";
CREATE POLICY "control_approvals_tenant_isolation" ON "control_approvals"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "risk_approvals_tenant_isolation" ON "risk_approvals";
CREATE POLICY "risk_approvals_tenant_isolation" ON "risk_approvals"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "policy_approvals_tenant_isolation" ON "policy_approvals";
CREATE POLICY "policy_approvals_tenant_isolation" ON "policy_approvals"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "audit_finding_approvals_tenant_isolation" ON "audit_finding_approvals";
CREATE POLICY "audit_finding_approvals_tenant_isolation" ON "audit_finding_approvals"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "vendor_assessment_approvals_tenant_isolation" ON "vendor_assessment_approvals";
CREATE POLICY "vendor_assessment_approvals_tenant_isolation" ON "vendor_assessment_approvals"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "vulnerability_approvals_tenant_isolation" ON "vulnerability_approvals";
CREATE POLICY "vulnerability_approvals_tenant_isolation" ON "vulnerability_approvals"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "incident_approvals_tenant_isolation" ON "incident_approvals";
CREATE POLICY "incident_approvals_tenant_isolation" ON "incident_approvals"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "policy_exception_approvals_tenant_isolation" ON "policy_exception_approvals";
CREATE POLICY "policy_exception_approvals_tenant_isolation" ON "policy_exception_approvals"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "evidence_approvals_tenant_isolation" ON "evidence_approvals";
CREATE POLICY "evidence_approvals_tenant_isolation" ON "evidence_approvals"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "document_analyses_tenant_isolation" ON "document_analyses";
CREATE POLICY "document_analyses_tenant_isolation" ON "document_analyses"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

DROP POLICY IF EXISTS "extracted_findings_tenant_isolation" ON "extracted_findings";
CREATE POLICY "extracted_findings_tenant_isolation" ON "extracted_findings"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

-- 5. Child Relation Policies (Foreign key joins through tenant-owned parent tables)
DROP POLICY IF EXISTS "control_framework_mappings_tenant_isolation" ON "control_framework_mappings";
CREATE POLICY "control_framework_mappings_tenant_isolation" ON "control_framework_mappings"
AS PERMISSIVE FOR ALL
USING (EXISTS (
  SELECT 1 FROM "controls" p
  WHERE p."id" = "control_framework_mappings"."controlId"
    AND p."organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM "controls" p
  WHERE p."id" = "control_framework_mappings"."controlId"
    AND p."organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
));

DROP POLICY IF EXISTS "audit_plan_framework_references_tenant_isolation" ON "audit_plan_framework_references";
CREATE POLICY "audit_plan_framework_references_tenant_isolation" ON "audit_plan_framework_references"
AS PERMISSIVE FOR ALL
USING (EXISTS (
  SELECT 1 FROM "audit_plans" p
  WHERE p."id" = "audit_plan_framework_references"."auditPlanId"
    AND p."organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM "audit_plans" p
  WHERE p."id" = "audit_plan_framework_references"."auditPlanId"
    AND p."organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
));

DROP POLICY IF EXISTS "user_departments_tenant_isolation" ON "user_departments";
CREATE POLICY "user_departments_tenant_isolation" ON "user_departments"
AS PERMISSIVE FOR ALL
USING (EXISTS (
  SELECT 1 FROM "departments" p
  WHERE p."id" = "user_departments"."departmentId"
    AND p."organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM "departments" p
  WHERE p."id" = "user_departments"."departmentId"
    AND p."organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
));

DROP POLICY IF EXISTS "user_projects_tenant_isolation" ON "user_projects";
CREATE POLICY "user_projects_tenant_isolation" ON "user_projects"
AS PERMISSIVE FOR ALL
USING (EXISTS (
  SELECT 1 FROM "projects" p
  WHERE p."id" = "user_projects"."projectId"
    AND p."organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM "projects" p
  WHERE p."id" = "user_projects"."projectId"
    AND p."organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
));

DROP POLICY IF EXISTS "evidence_framework_references_tenant_isolation" ON "evidence_framework_references";
CREATE POLICY "evidence_framework_references_tenant_isolation" ON "evidence_framework_references"
AS PERMISSIVE FOR ALL
USING (EXISTS (
  SELECT 1 FROM "evidences" p
  WHERE p."id" = "evidence_framework_references"."evidenceId"
    AND p."organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM "evidences" p
  WHERE p."id" = "evidence_framework_references"."evidenceId"
    AND p."organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
));

DROP POLICY IF EXISTS "approval_workflow_steps_tenant_isolation" ON "approval_workflow_steps";
CREATE POLICY "approval_workflow_steps_tenant_isolation" ON "approval_workflow_steps"
AS PERMISSIVE FOR ALL
USING (EXISTS (
  SELECT 1 FROM "approval_workflows" p
  WHERE p."id" = "approval_workflow_steps"."workflowId"
    AND p."organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM "approval_workflows" p
  WHERE p."id" = "approval_workflow_steps"."workflowId"
    AND p."organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
));

DROP POLICY IF EXISTS "approval_instance_steps_tenant_isolation" ON "approval_instance_steps";
CREATE POLICY "approval_instance_steps_tenant_isolation" ON "approval_instance_steps"
AS PERMISSIVE FOR ALL
USING (EXISTS (
  SELECT 1 FROM "approval_instances" p
  WHERE p."id" = "approval_instance_steps"."approvalInstanceId"
    AND p."organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM "approval_instances" p
  WHERE p."id" = "approval_instance_steps"."approvalInstanceId"
    AND p."organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
));

DROP POLICY IF EXISTS "analysis_runs_tenant_isolation" ON "analysis_runs";
CREATE POLICY "analysis_runs_tenant_isolation" ON "analysis_runs"
AS PERMISSIVE FOR ALL
USING (EXISTS (
  SELECT 1 FROM "document_analyses" p
  WHERE p."id" = "analysis_runs"."documentAnalysisId"
    AND p."organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM "document_analyses" p
  WHERE p."id" = "analysis_runs"."documentAnalysisId"
    AND p."organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
));

-- 6. Refresh omnigrc_app Privileges on All Public Tables & Sequences
GRANT USAGE ON SCHEMA public TO omnigrc_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO omnigrc_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO omnigrc_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO omnigrc_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO omnigrc_app;
