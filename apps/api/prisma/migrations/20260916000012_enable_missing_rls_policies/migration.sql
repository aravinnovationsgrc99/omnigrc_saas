-- Enable Row Level Security on tenant tables missing RLS policies
ALTER TABLE "controls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation policy for controls
CREATE POLICY control_tenant_isolation ON "controls"
    FOR ALL
    USING ("organizationId" = current_setting('app.current_organization_id', true));

-- Create tenant isolation policy for compliance_tasks
CREATE POLICY compliance_task_tenant_isolation ON "compliance_tasks"
    FOR ALL
    USING ("organizationId" = current_setting('app.current_organization_id', true));

-- Create tenant isolation policy for notifications
CREATE POLICY notification_tenant_isolation ON "notifications"
    FOR ALL
    USING ("organizationId" = current_setting('app.current_organization_id', true));

-- Create tenant isolation policy for invitations
CREATE POLICY invitation_tenant_isolation ON "invitations"
    FOR ALL
    USING ("organizationId" = current_setting('app.current_organization_id', true));
