# OMNiGRC — Staging PostgreSQL RLS & Least-Privilege Role Activation Procedure

## 1. Objective and Scope

This runbook specifies the step-by-step operational procedure for activating the dedicated, least-privilege PostgreSQL database role (`omnigrc_app`) in the Staging environment.

By transitioning normal application runtime traffic from the administrative `postgres` role to `omnigrc_app` (configured with `NOSUPERUSER` and `NOBYPASSRLS`), PostgreSQL Row-Level Security (RLS) enforcement is transitioned from an application-only boundary to an authenticated, database engine-enforced security perimeter.

> [!IMPORTANT]
> **Operational Authorization Prerequisite**: This document is an operational runbook. Do NOT execute role modifications, credential rotations, or migration deployments without explicit operational authorization from the Staging Environment Administrator and Security Team.

---

## 2. Preconditions and Required Database Permissions

1. **Database Administrator Access**:
   - Access to PostgreSQL administrative role (`postgres` or RDS master user) via `psql` or administrative CLI.
   - Permissions to execute DDL (`CREATE ROLE`, `ALTER ROLE`, `GRANT`, `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY`).
2. **Secrets Manager Access**:
   - Access to the staging secret store (e.g. AWS Secrets Manager, HashiCorp Vault, Doppler, or Kubernetes Secrets).
3. **Staging Infrastructure Access**:
   - Access to Staging CI/CD deployment pipelines or Kubernetes/ECS service configuration to update environment variables and perform rolling restarts.
4. **Maintenance Window**:
   - Staging downtime or low-traffic window to ensure connection pool recreation does not disrupt ongoing testing.

---

## 3. Migration Status & Comprehensive RLS Policy Deployment

### 3.1 Migration Verification
Inspect current migration status from the staging deployment bastion:
```bash
npx prisma migrate status --schema=apps/api/prisma/schema.prisma
```

Verify that the following migrations are applied or pending:
- `20261019000000_operational_postgresql_rls_remediation` (initial 27 tables & `omnigrc_app` role definition).
- `20261019120000_comprehensive_tenant_rls_expansion` (comprehensive 32 direct tables + 8 child relation tables).

### 3.2 Applying Migration (When Authorized)
Deploy pending migrations using the administrative `DIRECT_URL`:
```bash
npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
```

---

## 4. Database Role & Privilege Verification

Execute the following verification queries as database administrator to confirm role attributes and table grants before switching application traffic:

### 4.1 Verify Role Least-Privilege Attributes
```sql
SELECT
    rolname,
    rolsuper,
    rolinherit,
    rolcreaterole,
    rolcreatedb,
    rolcanlogin,
    rolbypassrls
FROM pg_roles
WHERE rolname IN ('postgres', 'omnigrc_app');
```

**Success Criteria**:
| Role Name | rolsuper | rolbypassrls | rolcanlogin | rolcreaterole |
| :--- | :--- | :--- | :--- | :--- |
| `postgres` | `true` | `true` | `true` | `true` |
| `omnigrc_app` | **`false`** | **`false`** | **`true`** | **`false`** |

### 4.2 Verify RLS Enabled and Forced on All Tenant Tables
```sql
SELECT
    relname AS table_name,
    relrowsecurity AS rls_enabled,
    relforcerowsecurity AS rls_forced
FROM pg_class
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE pg_namespace.nspname = 'public'
  AND relkind = 'r'
  AND relname IN (
    'users', 'regional_pods', 'audit_log_entries', 'assets', 'risks', 'controls',
    'compliance_tasks', 'notifications', 'invitations', 'vendors', 'vendor_assessments',
    'vulnerabilities', 'vulnerability_assets', 'policies', 'policy_versions',
    'policy_attestations', 'policy_exceptions', 'policy_categories', 'incidents',
    'user_dashboard_preferences', 'audit_plans', 'audit_schedules', 'audit_assessments',
    'audit_check_items', 'audit_evidences', 'audit_findings', 'audit_capas',
    'organization_control_state_projections', 'organization_service_override_projections',
    'organization_framework_entitlements', 'risk_controls', 'deployments',
    'system_license_state', 'organization_memberships', 'departments', 'projects',
    'evidences', 'control_evidences', 'risk_evidences', 'policy_evidences',
    'audit_check_item_evidences', 'audit_finding_evidences', 'vendor_evidences',
    'vulnerability_evidences', 'incident_evidences', 'approval_workflows',
    'approval_instances', 'approval_decisions', 'control_approvals', 'risk_approvals',
    'policy_approvals', 'audit_finding_approvals', 'vendor_assessment_approvals',
    'vulnerability_approvals', 'incident_approvals', 'policy_exception_approvals',
    'evidence_approvals', 'document_analyses', 'extracted_findings',
    'control_framework_mappings', 'audit_plan_framework_references',
    'user_departments', 'user_projects', 'evidence_framework_references',
    'approval_workflow_steps', 'approval_instance_steps', 'analysis_runs'
  );
```

**Success Criteria**:
- `rls_enabled` is **`true`** for all rows.
- `rls_forced` is **`true`** for all rows.

### 4.3 Verify omnigrc_app Table Privileges
```sql
SELECT
    table_name,
    privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'omnigrc_app'
  AND table_schema = 'public';
```

**Success Criteria**:
- Privileges granted are strictly: `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
- No DDL privileges (`TRUNCATE`, `REFERENCES`, `TRIGGER`) exist unless explicitly documented and required.

---

## 5. Secure Credential Provisioning & Staging Configuration

### 5.1 Provisioning the Role Password
Generate a cryptographically secure 32-character alphanumeric password and store it in the staging secret store:
```bash
# Generate password
OMNIGRC_APP_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)
```

Apply password to `omnigrc_app` role:
```sql
ALTER ROLE omnigrc_app WITH LOGIN PASSWORD 'YOUR_GENERATED_PASSWORD';
```

### 5.2 Updating Staging Environment Variables
Update the staging application runtime configuration:

```env
# 1. DIRECT_URL: Administrative database role used exclusively for Prisma CLI schema migrations (DDL permissions)
DIRECT_URL="postgresql://postgres:STAGING_ADMIN_PASSWORD@staging-db.internal:5432/omnigrc?schema=public"

# 2. DATABASE_URL: Dedicated least-privilege runtime role (omnigrc_app with NOBYPASSRLS)
DATABASE_URL="postgresql://omnigrc_app:YOUR_GENERATED_PASSWORD@staging-db.internal:5432/omnigrc?schema=public"
```

> [!CAUTION]
> Never commit actual passwords or connection strings into Git repositories or untracked local developer files. Use injected runtime environment variables via Secrets Manager.

---

## 6. Restart & Redeployment

Perform a rolling restart of the Staging API service to close old connection pools (which were connected as `postgres`) and initialize new connection pools authenticated as `omnigrc_app`:

```bash
# Example Kubernetes rolling restart:
kubectl rollout restart deployment/omnigrc-api -n staging

# Wait for completion:
kubectl rollout status deployment/omnigrc-api -n staging
```

---

## 7. Minimal Application Health-Check Procedure

Verify that the application successfully started and established database connectivity under `omnigrc_app`:

```bash
curl -f -s -S -X GET https://staging-api.omnigrc.internal/api/v1/health | jq .
```

**Success Criteria**:
- Status: `200 OK`.
- Response: `{"status":"ok","database":{"status":"up"}}`.

---

## 8. Tenant Isolation & Security Verification (Synthetic Data)

Execute synthetic validation using two isolated test organizations: `tenant-alpha` and `tenant-beta`.

### 8.1 Test 1: Fail-Closed Without Tenant Context
Execute a raw query as `omnigrc_app` without setting `app.current_tenant`:
```sql
SET ROLE omnigrc_app;
SELECT count(*) FROM risks;
```
**Expected Result**: `0` rows returned (RLS fails closed).

### 8.2 Test 2: Valid Tenant Context
Execute with session variable established:
```sql
SET ROLE omnigrc_app;
SELECT set_config('app.current_tenant', 'tenant-alpha-uuid', true);
SELECT count(*) FROM risks;
```
**Expected Result**: Returns exactly the risks owned by `tenant-alpha-uuid`.

### 8.3 Test 3: Cross-Tenant API Rejection
1. Obtain JWT access token for Tenant Alpha analyst.
2. Request a resource owned by Tenant Beta:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" -X GET \
     https://staging-api.omnigrc.internal/api/v1/risks/beta-risk-id \
     -H "Authorization: Bearer $TENANT_ALPHA_JWT"
   ```
   **Expected Result**: HTTP `404 Not Found` or `403 Forbidden`.
3. Attempt cross-tenant mutation:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" -X POST \
     https://staging-api.omnigrc.internal/api/v1/risks \
     -H "Authorization: Bearer $TENANT_ALPHA_JWT" \
     -H "Content-Type: application/json" \
     -d '{"title":"Cross-Tenant Injection","organizationId":"tenant-beta-uuid"}'
   ```
   **Expected Result**: HTTP `403 Forbidden` (`Cross-tenant mutation violation`).

---

## 9. MSSP Delegation & System Context Verification

1. **MSSP Context Verification**:
   - Authenticate as MSSP Administrator assigned to managing partner organization.
   - Execute authorized delegation request targeting client organization `tenant-alpha-uuid`.
   - Verify that queries succeed and `SELECT current_setting('app.acting_mssp_id', true)` matches managing partner ID while `app.current_tenant` matches client organization ID.
2. **System Jobs Verification**:
   - Trigger BullMQ background queues (notifications digest, scheduled tasks).
   - Verify jobs complete without permission errors (`runSystemContext` operates as expected).

---

## 10. Rollback Procedure

If unexpected permission starvation or application errors occur during staging activation:

1. **Revert Application Connection String**:
   Update `DATABASE_URL` back to the administrative connection string in the secret store:
   ```env
   DATABASE_URL="postgresql://postgres:STAGING_ADMIN_PASSWORD@staging-db.internal:5432/omnigrc?schema=public"
   ```
2. **Rolling Restart**:
   ```bash
   kubectl rollout restart deployment/omnigrc-api -n staging
   ```
3. **Preserve Database Policies**:
   Do NOT drop or disable RLS policies on the database tables. The policies remain in place; running as `postgres` temporarily bypasses them while the root cause of the permission error is diagnosed.
4. **Log Incident & Capture Diagnostics**:
   Collect application error logs and PostgreSQL log output (`error: permission denied for table ...`) to identify missing table or sequence grants.

---

## 11. Criteria for Declaring Activation Successful

Phase 1 Staging Activation is declared complete when:
- [ ] `omnigrc_app` role verified with `rolsuper = false` and `rolbypassrls = false`.
- [ ] All 58 tenant tables and 9 child relation tables verified with `relrowsecurity = true` and `relforcerowsecurity = true`.
- [ ] Staging API health check returns `200 OK` under `DATABASE_URL` connecting as `omnigrc_app`.
- [ ] Cross-tenant read and mutation attempts fail closed (HTTP 403/404).
- [ ] MSSP delegation and background queue jobs operate normally.
- [ ] Application error rates and query latencies remain within normal staging baselines for 60 minutes.
