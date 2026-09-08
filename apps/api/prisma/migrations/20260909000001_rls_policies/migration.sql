-- Enable Row Level Security on tenant tables
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "regional_pods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_entries" ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation policy for users
CREATE POLICY user_tenant_isolation ON "users"
    FOR ALL
    USING ("organizationId" = current_setting('app.current_organization_id', true));

-- Create tenant isolation policy for regional_pods
CREATE POLICY regional_pod_tenant_isolation ON "regional_pods"
    FOR ALL
    USING ("organizationId" = current_setting('app.current_organization_id', true));

-- Create tenant isolation policy for audit_log_entries
CREATE POLICY audit_log_tenant_isolation ON "audit_log_entries"
    FOR ALL
    USING ("organizationId" = current_setting('app.current_organization_id', true));
