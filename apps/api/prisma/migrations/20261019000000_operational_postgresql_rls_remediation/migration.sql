-- Phase C & D: Operational PostgreSQL Row-Level Security (RLS) Remediation
-- Standardizes tenant session variable convention on app.current_tenant,
-- covers all 27 tenant-owned tables, forces RLS against table-owner bypass,
-- creates the dedicated least-privilege application role (omnigrc_app),
-- and preserves authorized MSSP delegation.

-- 1. Dedicated Least-Privilege Application Database Role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'omnigrc_app') THEN
    CREATE ROLE omnigrc_app WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO omnigrc_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO omnigrc_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO omnigrc_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO omnigrc_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO omnigrc_app;

-- 2. Enable and Force Row Level Security on all 27 Tenant Tables
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

ALTER TABLE "regional_pods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "regional_pods" FORCE ROW LEVEL SECURITY;

ALTER TABLE "audit_log_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_entries" FORCE ROW LEVEL SECURITY;

ALTER TABLE "assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assets" FORCE ROW LEVEL SECURITY;

ALTER TABLE "risks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "risks" FORCE ROW LEVEL SECURITY;

ALTER TABLE "controls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "controls" FORCE ROW LEVEL SECURITY;

ALTER TABLE "compliance_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance_tasks" FORCE ROW LEVEL SECURITY;

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;

ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;

ALTER TABLE "vendors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vendors" FORCE ROW LEVEL SECURITY;

ALTER TABLE "vendor_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vendor_assessments" FORCE ROW LEVEL SECURITY;

ALTER TABLE "vulnerabilities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vulnerabilities" FORCE ROW LEVEL SECURITY;

ALTER TABLE "vulnerability_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vulnerability_assets" FORCE ROW LEVEL SECURITY;

ALTER TABLE "policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policies" FORCE ROW LEVEL SECURITY;

ALTER TABLE "policy_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_versions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "policy_attestations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_attestations" FORCE ROW LEVEL SECURITY;

ALTER TABLE "policy_exceptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_exceptions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "policy_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_categories" FORCE ROW LEVEL SECURITY;

ALTER TABLE "incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "incidents" FORCE ROW LEVEL SECURITY;

ALTER TABLE "user_dashboard_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_dashboard_preferences" FORCE ROW LEVEL SECURITY;

ALTER TABLE "audit_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_plans" FORCE ROW LEVEL SECURITY;

ALTER TABLE "audit_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_schedules" FORCE ROW LEVEL SECURITY;

ALTER TABLE "audit_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_assessments" FORCE ROW LEVEL SECURITY;

ALTER TABLE "audit_check_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_check_items" FORCE ROW LEVEL SECURITY;

ALTER TABLE "audit_evidences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_evidences" FORCE ROW LEVEL SECURITY;

ALTER TABLE "audit_findings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_findings" FORCE ROW LEVEL SECURITY;

ALTER TABLE "audit_capas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_capas" FORCE ROW LEVEL SECURITY;

-- 3. Standardize Policies on Direct Tenant Tables (Drop legacy if exists and create standard)

-- Drop prior divergent/legacy policies
DROP POLICY IF EXISTS "user_tenant_isolation" ON "users";
DROP POLICY IF EXISTS "users_tenant_isolation" ON "users";
DROP POLICY IF EXISTS "regional_pod_tenant_isolation" ON "regional_pods";
DROP POLICY IF EXISTS "regional_pods_tenant_isolation" ON "regional_pods";
DROP POLICY IF EXISTS "audit_log_tenant_isolation" ON "audit_log_entries";
DROP POLICY IF EXISTS "audit_log_entries_tenant_isolation" ON "audit_log_entries";
DROP POLICY IF EXISTS "asset_tenant_isolation" ON "assets";
DROP POLICY IF EXISTS "assets_tenant_isolation" ON "assets";
DROP POLICY IF EXISTS "risk_tenant_isolation" ON "risks";
DROP POLICY IF EXISTS "risks_tenant_isolation" ON "risks";
DROP POLICY IF EXISTS "control_tenant_isolation" ON "controls";
DROP POLICY IF EXISTS "controls_tenant_isolation" ON "controls";
DROP POLICY IF EXISTS "compliance_task_tenant_isolation" ON "compliance_tasks";
DROP POLICY IF EXISTS "compliance_tasks_tenant_isolation" ON "compliance_tasks";
DROP POLICY IF EXISTS "notification_tenant_isolation" ON "notifications";
DROP POLICY IF EXISTS "notifications_tenant_isolation" ON "notifications";
DROP POLICY IF EXISTS "invitation_tenant_isolation" ON "invitations";
DROP POLICY IF EXISTS "invitations_tenant_isolation" ON "invitations";
DROP POLICY IF EXISTS "vendors_tenant_isolation" ON "vendors";
DROP POLICY IF EXISTS "vendor_assessments_tenant_isolation" ON "vendor_assessments";
DROP POLICY IF EXISTS "vulnerabilities_tenant_isolation" ON "vulnerabilities";
DROP POLICY IF EXISTS "vulnerability_assets_tenant_isolation" ON "vulnerability_assets";
DROP POLICY IF EXISTS "policies_tenant_isolation" ON "policies";
DROP POLICY IF EXISTS "policy_versions_tenant_isolation" ON "policy_versions";
DROP POLICY IF EXISTS "policy_attestations_tenant_isolation" ON "policy_attestations";
DROP POLICY IF EXISTS "policy_exceptions_tenant_isolation" ON "policy_exceptions";
DROP POLICY IF EXISTS "policy_categories_tenant_isolation" ON "policy_categories";
DROP POLICY IF EXISTS "incidents_tenant_isolation" ON "incidents";
DROP POLICY IF EXISTS "user_dashboard_preferences_tenant_isolation" ON "user_dashboard_preferences";
DROP POLICY IF EXISTS "audit_plans_tenant_isolation" ON "audit_plans";
DROP POLICY IF EXISTS "audit_schedules_tenant_isolation" ON "audit_schedules";
DROP POLICY IF EXISTS "audit_assessments_tenant_isolation" ON "audit_assessments";
DROP POLICY IF EXISTS "audit_check_items_tenant_isolation" ON "audit_check_items";
DROP POLICY IF EXISTS "audit_evidences_tenant_isolation" ON "audit_evidences";
DROP POLICY IF EXISTS "audit_findings_tenant_isolation" ON "audit_findings";
DROP POLICY IF EXISTS "audit_capas_tenant_isolation" ON "audit_capas";

-- Create Standardized Direct Tenant Isolation Policies (PERMISSIVE)
CREATE POLICY "users_tenant_isolation" ON "users"
AS PERMISSIVE FOR ALL
USING (
  "organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
  OR ("organizationId"::text = NULLIF(current_setting('app.acting_mssp_id', true), ''))
)
WITH CHECK (
  "organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
);

CREATE POLICY "regional_pods_tenant_isolation" ON "regional_pods"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "audit_log_entries_tenant_isolation" ON "audit_log_entries"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "assets_tenant_isolation" ON "assets"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "risks_tenant_isolation" ON "risks"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "controls_tenant_isolation" ON "controls"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "compliance_tasks_tenant_isolation" ON "compliance_tasks"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "notifications_tenant_isolation" ON "notifications"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "invitations_tenant_isolation" ON "invitations"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "vendors_tenant_isolation" ON "vendors"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "vendor_assessments_tenant_isolation" ON "vendor_assessments"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "vulnerabilities_tenant_isolation" ON "vulnerabilities"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "vulnerability_assets_tenant_isolation" ON "vulnerability_assets"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "policies_tenant_isolation" ON "policies"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "policy_attestations_tenant_isolation" ON "policy_attestations"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "policy_exceptions_tenant_isolation" ON "policy_exceptions"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "policy_categories_tenant_isolation" ON "policy_categories"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_tenant', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_tenant', true), '')));

CREATE POLICY "incidents_tenant_isolation" ON "incidents"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "user_dashboard_preferences_tenant_isolation" ON "user_dashboard_preferences"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "audit_plans_tenant_isolation" ON "audit_plans"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "audit_schedules_tenant_isolation" ON "audit_schedules"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "audit_assessments_tenant_isolation" ON "audit_assessments"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "audit_check_items_tenant_isolation" ON "audit_check_items"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "audit_evidences_tenant_isolation" ON "audit_evidences"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "audit_findings_tenant_isolation" ON "audit_findings"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

CREATE POLICY "audit_capas_tenant_isolation" ON "audit_capas"
AS PERMISSIVE FOR ALL
USING ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')))
WITH CHECK ("organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), '')));

-- 4. Dependent policy for policy_versions (foreign key join through policies)
CREATE POLICY "policy_versions_tenant_isolation" ON "policy_versions"
AS PERMISSIVE FOR ALL
USING (EXISTS (
  SELECT 1 FROM "policies" p 
  WHERE p."id" = "policy_versions"."policyId" 
    AND p."organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM "policies" p 
  WHERE p."id" = "policy_versions"."policyId" 
    AND p."organizationId"::text = COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), NULLIF(current_setting('app.current_organization_id', true), ''))
));
