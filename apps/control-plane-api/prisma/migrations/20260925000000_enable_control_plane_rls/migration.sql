-- Enable Row-Level Security (RLS) on all control plane tables to remediate Supabase rls_disabled_in_public vulnerability.
ALTER TABLE "control_plane_customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "control_plane_commercial_agreements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "licenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "entitlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deployments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "control_plane_audit_logs" ENABLE ROW LEVEL SECURITY;

-- Revoke all table privileges from public Supabase API roles (anon and authenticated).
-- Direct database connections by Control Plane backend (postgres / service_role) retain full access.
REVOKE ALL ON TABLE "control_plane_customers" FROM anon, authenticated;
REVOKE ALL ON TABLE "control_plane_commercial_agreements" FROM anon, authenticated;
REVOKE ALL ON TABLE "licenses" FROM anon, authenticated;
REVOKE ALL ON TABLE "entitlements" FROM anon, authenticated;
REVOKE ALL ON TABLE "deployments" FROM anon, authenticated;
REVOKE ALL ON TABLE "control_plane_audit_logs" FROM anon, authenticated;
