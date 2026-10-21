# OMNiGRC — Internal Security Assessment Report
## Report 1: Application & API Security Assessment

---

### Document Control & Metadata

| Attribute | Details |
| :--- | :--- |
| **Document Title** | Report 1 — Application & API Security Assessment |
| **Target System** | OMNiGRC Enterprise GRC Monorepo Application & API Layer |
| **Assessment Date** | 2026-10-21 (Timezone: Asia/Kolkata, UTC+05:30) |
| **Repository & Branch** | `https://github.com/anudharmik/omnigrc.git` \| Branch: `main` |
| **Commit Identifier** | `f835c04f587d5532c7f9e62d0358bff60ef092a1` |
| **Assessment Type** | Internal Security Assessment (Free Automated Scanners & Targeted Manual Code Review) |
| **Classification** | Customer Evidence / Customer-Presentable Security Report |
| **Author / Evaluator** | Automated Security Assessment Suite & Code Review Agent |

> **Disclaimer**: This assessment represents an *Internal Security Assessment using Free Automated Tools and Targeted Manual Checks*. It does not constitute a certified VAPT, independent third-party penetration test, formal compliance certification (such as SOC 2 or ISO 27001), or absolute proof that the OMNiGRC platform is free from vulnerabilities. All observations reflect static source code analysis, configuration review, and targeted automated scanning of the codebase.

---

## 1. Executive Summary

An architectural and implementation-level security assessment of the **OMNiGRC** application codebase was conducted on 2026-10-21. The assessment focused on the **Data Plane API** (`apps/api`), the **Control Plane API** (`apps/control-plane-api`), the **Frontend Web Application** (`apps/web`), the **Control Panel Web** (`apps/control-panel-web`), and shared core libraries (`packages/shared`).

### Summary of Architectural Strengths:
1. **Robust Multi-Tenant Data Isolation**: Multi-tenancy is strongly defended via NestJS `AsyncLocalStorage` (`TenantContext`) and an intercepting Prisma middleware (`tenantScopingMiddleware`). The middleware automatically injects `organizationId` scoping into queries across more than 70 domain models and rejects cross-tenant references with `ForbiddenException`.
2. **Cryptographic JWT Verification**: In `TenantMiddleware`, tenant claims (`organizationId`, `role`, `actingViaMsspId`) are only extracted after cryptographic signature verification via `jwtService.verify()`, eliminating forged-token injection risks.
3. **Rigid File Upload & Path Traversal Guards**: The Universal Evidence Vault (`EvidenceStorageService`) implements strict path-traversal prevention, extension allowlisting, file magic-byte verification (for PDF, PNG, and JPEG), SHA-256 integrity calculation, and UUID-namespaced organization directory isolation.
4. **Tamper-Resistant Audit Trail**: The `AuditLogsService` is strictly write-only and read-only at the application layer, without update or delete interfaces, ensuring historical audit records cannot be altered by application workflows.
5. **Constant-Time Cryptographic Comparisons**: The Control Plane administration guard (`ControlPlaneAdminGuard`) implements HMAC-padded constant-time comparisons (`crypto.timingSafeEqual`) to prevent timing side-channel attacks on administrative tokens.

### Key Risk Areas Identified:
1. **Critical CORS Misconfiguration with Credential Reflection** (`apps/api/src/main.ts`): The Data Plane API allows cross-origin requests with `credentials: true` and falls back to reflecting any request origin (`callback(null, true)`), allowing arbitrary websites to execute authenticated cross-origin reads.
2. **Hardcoded Secrets in Docker Compose** (`docker-compose.yml`): Default static JWT secrets and database passwords are hardcoded in the local deployment template.
3. **Control Plane Fallback Key Vulnerability** (`apps/control-plane-api/src/auth/control-plane-admin.guard.ts`): In non-production/test runtime modes, the Control Plane falls back to a well-known static key (`arav-cp-admin-dev-key`), creating an administrative bypass risk if runtime environment variables are misconfigured.
4. **Stateless Refresh Token Revocation Gap** (`apps/api/src/auth/auth.service.ts`): 7-day refresh tokens cannot be revoked individually upon logout or user status suspension.

---

## 2. Assessment Scope, Methodology & Environment

### 2.1 Scope of Evaluation

The assessment scope encompasses the source code, modules, endpoints, guards, and test suites within the OMNiGRC monorepo:
- **Data Plane REST API** (`apps/api`): Authentication, RBAC, tenant isolation, evidence vault, audit trails, risks, controls, policies, vendors, vulnerabilities, and licensing guards.
- **Control Plane API** (`apps/control-plane-api`): Operator authentication, license signing, customer tenant provisioning, break-glass access, and administration.
- **Frontend Clients** (`apps/web`, `apps/control-panel-web`): Session token management, API communication client, and proxy configurations.
- **Infrastructure & Deployment Manifests**: `docker-compose.yml`, `docker-compose.self-hosted.yml`, `nginx.conf`, `vercel.json`.

### 2.2 Target Environment & Deployment Runtime

- **Evaluated Target**: Local Source Code & Configuration Repository (`f835c04f...`).
- **Live Deployed Target**: **NOT APPLICABLE / NOT TESTED**. The user did not supply an explicitly authorized live staging or production URL or written permission to execute active/passive web traffic against public hostnames. In accordance with strict assessment constraints, no external hostnames (such as `app.omnigrc.co` or `control.omnigrc.co`) were actively scanned.
- **Docker Daemon Status**: Docker Desktop daemon was inactive on the local assessment host (`npipe:////./pipe/dockerDesktopLinuxEngine` unavailable).

### 2.3 Assessment Methodology

The assessment adhered to OWASP API Security Top 10 (2023), OWASP Top 10 (2021), and ISO/IEC 27001 Annex A controls using:
1. **Static Analysis & Control Verification**: Manual inspection of NestJS controllers, middleware, guards, services, and Prisma query construction.
2. **Automated Security Tooling**: Trivy v0.76.1 and Gitleaks v8.30.1.
3. **Assessment Criteria Classifications**:
   - **PASS**: The specific security mechanism was verified in code/configuration and met stated defense criteria.
   - **FINDING**: A vulnerability, weakness, or deviation from secure best practices was identified.
   - **NEEDS REVIEW**: Evidence is inconclusive or requires live runtime confirmation.
   - **NOT TESTED**: The check could not be performed due to environmental or authorization limits.
   - **NOT APPLICABLE**: The check does not apply to the component architecture.

---

## 3. Automated Scanning Execution & Blockers

### 3.1 OWASP ZAP Baseline Scan Status

| Check | Tool | Intended Target | Status | Reason / Blocker |
| :--- | :--- | :--- | :--- | :--- |
| **OWASP ZAP Baseline Scan** | OWASP ZAP Docker Baseline | Deployed Web / API Entrypoint | **NOT TESTED (BLOCKED)** | 1. No written authorization or explicit staging URL was provided.<br>2. Local Docker daemon was inactive on the test workstation.<br>3. Non-negotiable constraint: Active/passive scans must never be launched against unverified public endpoints. |

---

## 4. Manual Security Assessment & Architecture Review

### 4.1 Authentication & Session Handling

| Check ID | Verification Area | Evaluation Standard | Status | Observations |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-CHK-01** | Password Storage & Hashing | OWASP ASVS V2.4 / bcrypt | **PASS** | `apps/api/src/auth/auth.service.ts` uses `bcrypt.compare()` for credential validation against salted hashes. |
| **SEC-CHK-02** | Registration Exposure | Controlled Onboarding | **PASS** | `POST /auth/register` explicitly throws 403 `ForbiddenException` with code `ORGANIZATION_CREATION_RESTRICTED`. Open self-registration is closed. |
| **SEC-CHK-03** | Access Token Expiration | Short-Lived JWT | **PASS** | JWT Access Tokens expire in 15 minutes (`expiresIn: '15m'`). |
| **SEC-CHK-04** | Refresh Token Revocation & Tracking | Session Lifecycle | **FINDING** | 7-day refresh tokens (`expiresIn: '7d'`) are stateless JWTs not tracked in the database. Token refresh does not check whether user access has been revoked or password reset. |
| **SEC-CHK-05** | Invitation Token Protection | Cryptographic Entropy | **PASS** | Invitations generate 32-byte cryptographically secure random tokens (`crypto.randomBytes(32)`). Only the SHA-256 `tokenHash` is persisted in PostgreSQL. |
| **SEC-CHK-06** | Browser Token Storage | OWASP Session Security | **FINDING** | Frontend stores both Access and Refresh Tokens in `window.localStorage`, exposing them to theft via Cross-Site Scripting (XSS). |

### 4.2 Role-Based & Capability-Based Access Control (RBAC)

| Check ID | Verification Area | Evaluation Standard | Status | Observations |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-CHK-07** | Route Protection Guards | NestJS Global & Route Guards | **PASS** | Sensitive endpoints are guarded via `@UseGuards(JwtAuthGuard, RolesGuard)` and decorated with `@Roles()`. |
| **SEC-CHK-08** | Capability Gates | Feature Entitlement | **PASS** | Feature endpoints enforce modular capability decorators such as `@RequireCapability('EVIDENCE_VAULT')` via `ServiceCapabilityGuard`. |
| **SEC-CHK-09** | License Enforcement | Write-Action Guarding | **PASS** | Mutating actions check license status via `@RequiresActiveLicense()` and `LicenseWriteGuard`. Expired licenses are restricted to read-only mode. |

### 4.3 Multi-Tenant Isolation & Cross-Organization Boundaries

| Check ID | Verification Area | Evaluation Standard | Status | Observations |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-CHK-10** | Tenant Context Scoping | AsyncLocalStorage Context | **PASS** | `TenantMiddleware` extracts verified JWT claims and mounts `TenantContext.run()`. Unauthenticated requests execute without tenant context. |
| **SEC-CHK-11** | Prisma Query Interception | Row-Level Tenant Enforcement | **PASS** | `tenantScopingMiddleware` in `prisma.service.ts` intercepts all queries across 70+ tenant models. It injects `where.organizationId = orgId` and rejects cross-tenant selectors. |
| **SEC-CHK-12** | Cross-Tenant Mutation Blocking | Tenant Reassignment Defense | **PASS** | The Prisma middleware explicitly detects and rejects foreign `organizationId` values in `create`, `createMany`, `update`, and `upsert` operations. |
| **SEC-CHK-13** | MSSP Delegation Boundaries | Partner / MSP Access Control | **PASS** | Delegated MSSP access requires cryptographic proof (`actingViaMsspId` in token) and verifies that `targetOrg.parentOrganizationId === actingViaMsspId`. Arbitrary cross-tenant hopping is rejected. |

### 4.4 Evidence, File & Report Authorization

| Check ID | Verification Area | Evaluation Standard | Status | Observations |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-CHK-14** | Evidence Vault Path Traversal | File Storage Security | **PASS** | `EvidenceStorageService` rejects filenames containing `..`, `/`, or `\\`. File retrieval enforces `fullPath.startsWith(this.storageBaseDir)`. |
| **SEC-CHK-15** | File Type & Magic Byte Validation | Content Verification | **PASS** | Validates against an extension whitelist and checks file headers/magic signatures for PDF, PNG, and JPEG. |
| **SEC-CHK-16** | Unbounded Multipart Memory Allocation | Denial of Service (DoS) | **FINDING** | `EvidenceController` uses `@UseInterceptors(FileInterceptor('file'))` without configuring Multer memory limits at the controller level. |

### 4.5 API Security, CORS & Network Surface

| Check ID | Verification Area | Evaluation Standard | Status | Observations |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-CHK-17** | CORS Origin Reflection | OWASP API7:2023 / CWE-942 | **FINDING** | `apps/api/src/main.ts` enables `credentials: true` and reflects arbitrary origins via fallback `callback(null, true)`. |
| **SEC-CHK-18** | API Rate Limiting | Brute Force Protection | **PASS** | `ThrottlerModule` is configured globally in `apps/api/src/app.module.ts` (100 req/min global, 10 req/min auth). |
| **SEC-CHK-19** | Control Plane Rate Limiting | Brute Force Protection | **FINDING** | `apps/control-plane-api` lacks rate limiting middleware (`ThrottlerModule` omitted entirely). |
| **SEC-CHK-20** | Control Plane Admin Key Guard | Authentication & Timing Defense | **FINDING** | Employs timing-safe HMAC equality checks, but falls back to static `arav-cp-admin-dev-key` when `NODE_ENV` is not production. |

---

## 5. Consolidated Findings & Remediation Roadmap

### Finding 1: Overly Permissive CORS with Credential Reflection (CRITICAL)

- **Finding Reference**: `SEC-CRIT-001`
- **Vulnerability Classification**: CWE-942: Permissive Cross-Origin Resource Sharing Policy with Wildcard/Reflected Origin
- **Affected Component**: `apps/api/src/main.ts` (lines 31–50)
- **Evidence Reference**: Code inspection `apps/api/src/main.ts`
- **Technical Description**:
  ```typescript
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isAllowed = allowedOrigins.some(...) || /\.vercel\.app$/.test(origin) || /\.onrender\.com$/.test(origin);
      if (isAllowed) {
        callback(null, true);
      } else {
        // Fallback: reflect origin to prevent CORS breakage during deployment
        callback(null, true);
      }
    },
    credentials: true,
  });
  ```
- **Security Impact**: Because `credentials: true` is combined with origin reflection, any malicious website visited by an authenticated OMNiGRC user can execute cross-origin fetch requests to the API and read responses containing confidential GRC data, audit logs, and risk assessments.
- **Remediation Priority**: **P0 (Immediate)**.
- **Recommended Remediation**:
  Replace `callback(null, true)` in the fallback branch with `callback(new Error('CORS origin not allowed'), false)`. Strictly enforce explicit domain whitelists in all environments.

---

### Finding 2: Hardcoded Secrets in Local Docker Compose Configuration (CRITICAL)

- **Finding Reference**: `SEC-CRIT-004`
- **Vulnerability Classification**: CWE-798: Use of Hard-coded Credentials
- **Affected Component**: `docker-compose.yml` (lines 43–44)
- **Evidence Reference**: Code inspection `docker-compose.yml:43-44`
- **Technical Description**:
  The default `docker-compose.yml` sets static environment secrets:
  ```yaml
  JWT_SECRET: "omnigrc-prod-jwt-secret-key-change-me"
  JWT_REFRESH_SECRET: "omnigrc-prod-jwt-refresh-secret-key-change-me"
  ```
- **Security Impact**: If containers are launched using the base docker-compose file without explicit environment variable overrides, an attacker knowing these public repo defaults can generate forged JWT tokens for any user or tenant.
- **Remediation Priority**: **P0 (Immediate)**.
- **Recommended Remediation**:
  Remove static default secrets from `docker-compose.yml` and require them to be supplied via external `.env` files (as is already modeled in `docker-compose.self-hosted.yml`). Ensure container startup halts if secrets match default strings.

---

### Finding 3: Insecure Administrative Key Fallback in Control Plane API (HIGH)

- **Finding Reference**: `SEC-HIGH-002`
- **Vulnerability Classification**: CWE-1188: Initialization with Insecure Default
- **Affected Component**: `apps/control-plane-api/src/auth/control-plane-admin.guard.ts` (lines 13, 35)
- **Evidence Reference**: Code inspection `control-plane-admin.guard.ts:13-35`
- **Technical Description**:
  The guard establishes:
  ```typescript
  const DEV_ADMIN_KEY = 'arav-cp-admin-dev-key';
  ...
  const expectedAdminKey = configuredKey || DEV_ADMIN_KEY;
  ```
  If `NODE_ENV` is unset or evaluates to any value other than `'production'` or `'staging'`, any caller presenting `x-control-plane-admin-key: arav-cp-admin-dev-key` is granted full administrative control plane privileges.
- **Security Impact**: Potential unauthorized control plane operations (tenant suspension, license generation, tenant manipulation) if staging or self-hosted instances do not strictly set `NODE_ENV=production`.
- **Remediation Priority**: **P1 (High)**.
- **Recommended Remediation**:
  Enforce that `CONTROL_PLANE_ADMIN_KEY` must always be non-empty regardless of `NODE_ENV`. Remove the static fallback string.

---

### Finding 4: Stateless Refresh Tokens Lacking Invalidation on User Revocation (HIGH)

- **Finding Reference**: `SEC-HIGH-004`
- **Vulnerability Classification**: CWE-613: Insufficient Session Expiration
- **Affected Component**: `apps/api/src/auth/auth.service.ts` (lines 190–210)
- **Evidence Reference**: Code inspection `auth.service.ts:190-210`
- **Technical Description**:
  Refresh tokens are 7-day signed JWTs. When `refreshToken()` is called, it verifies signature and confirms the user exists, but does not check whether the user's membership status is `REVOKED` or `SUSPENDED`, or if their password has been changed.
- **Security Impact**: A user whose access is terminated by an administrator can continue exchanging their refresh token for active access tokens until the 7-day expiration occurs.
- **Remediation Priority**: **P1 (High)**.
- **Recommended Remediation**:
  1. Verify `membership.status === ProductAccessStatus.ACTIVE` inside `refreshToken()`.
  2. Maintain a database-backed refresh token whitelist or token version (`tokenVersion` integer on `User`) to allow immediate revocation upon logout or status changes.

---

### Finding 5: Control Plane API Missing Rate Limiting and Security Headers (HIGH)

- **Finding Reference**: `SEC-HIGH-003`
- **Vulnerability Classification**: CWE-307: Improper Restriction of Excessive Authentication Attempts
- **Affected Component**: `apps/control-plane-api/src/app.module.ts`, `apps/control-plane-api/src/main.ts`
- **Evidence Reference**: Code inspection `apps/control-plane-api/src/app.module.ts`
- **Technical Description**:
  `apps/control-plane-api` does not import `ThrottlerModule` and does not apply `helmet()` middleware in `main.ts`.
- **Security Impact**: Operator authentication routes and administrative endpoints can be subjected to automated brute-force attacks without throttling.
- **Remediation Priority**: **P1 (High)**.
- **Recommended Remediation**:
  Import `ThrottlerModule` into `ControlPlaneAppModule`, apply `ThrottlerGuard` as a global guard, and register `helmet()` in `main.ts`.

---

### Finding 6: Sensitive Tokens Stored in Web LocalStorage (MEDIUM)

- **Finding Reference**: `SEC-MED-002`
- **Vulnerability Classification**: CWE-922: Insecure Storage of Sensitive Information
- **Affected Component**: `apps/web/src/lib/api-client.ts` (lines 29–45)
- **Evidence Reference**: Code inspection `apps/web/src/lib/api-client.ts`
- **Technical Description**:
  Access and Refresh tokens are persisted in `localStorage` under `omnigrc_access_token` and `omnigrc_refresh_token`.
- **Security Impact**: If any client-side injection (XSS) occurs, malicious scripts can read tokens directly and impersonate users.
- **Remediation Priority**: **P2 (Medium)**.
- **Recommended Remediation**:
  Transition session storage to `HttpOnly`, `Secure`, `SameSite=Strict` cookies handled by Next.js middleware and API handlers.

---

### Finding 7: Multer Unbounded Multipart Uploads & Known DoS Vulnerabilities (MEDIUM)

- **Finding Reference**: `SEC-MED-003`
- **Vulnerability Classification**: CWE-400: Uncontrolled Resource Consumption
- **Affected Component**: `apps/api/src/evidence/evidence.controller.ts:45`, `package-lock.json`
- **Evidence Reference**: Trivy scan `security-assessment/evidence/trivy-vuln.json`
- **Technical Description**:
  `@UseInterceptors(FileInterceptor('file'))` does not configure Multer's `limits` (e.g. `fileSize`) at the interceptor level. Furthermore, `multer@2.0.2` has multiple CVEs for DoS via malformed multipart field names and aborted requests (CVE-2026-2359, CVE-2026-3304, CVE-2026-5079).
- **Security Impact**: High memory consumption during multipart parsing can degrade API availability.
- **Remediation Priority**: **P2 (Medium)**.
- **Recommended Remediation**:
  Configure explicit limits in `FileInterceptor`: `FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } })`. Upgrade Multer to the patched version.

---

## 6. Summary Findings Table

| Reference | Title | Severity | Status | Affected Component | Retest Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-CRIT-001** | Permissive CORS with Credential Reflection | **CRITICAL** | **FINDING** | `apps/api/src/main.ts` | Open |
| **SEC-CRIT-004** | Hardcoded Default Secrets in Docker Compose | **CRITICAL** | **FINDING** | `docker-compose.yml` | Open |
| **SEC-HIGH-002** | Insecure Admin Key Fallback in Control Plane | **HIGH** | **FINDING** | `control-plane-admin.guard.ts` | Open |
| **SEC-HIGH-003** | Missing Rate Limiting in Control Plane API | **HIGH** | **FINDING** | `apps/control-plane-api` | Open |
| **SEC-HIGH-004** | Stateless Refresh Tokens Lack Revocation Verification | **HIGH** | **FINDING** | `apps/api/src/auth/auth.service.ts` | Open |
| **SEC-MED-002** | JWT Tokens Stored in Web LocalStorage | **MEDIUM** | **FINDING** | `apps/web/src/lib/api-client.ts` | Open |
| **SEC-MED-003** | Multer Multipart DoS & Missing Controller Limits | **MEDIUM** | **FINDING** | `evidence.controller.ts` | Open |
| **SEC-PASS-001** | Multi-Tenant Data Isolation in Prisma Service | **INFORMATIONAL** | **PASS** | `apps/api/src/prisma/prisma.service.ts` | Verified |
| **SEC-PASS-002** | Cryptographic JWT Tenant Claims Verification | **INFORMATIONAL** | **PASS** | `apps/api/src/tenant/tenant.middleware.ts` | Verified |
| **SEC-PASS-003** | Universal Evidence Vault Path Traversal Defense | **INFORMATIONAL** | **PASS** | `evidence-storage.service.ts` | Verified |
| **SEC-PASS-004** | Write-Only Immutable Audit Log Trail | **INFORMATIONAL** | **PASS** | `apps/api/src/audit-logs/audit-logs.service.ts` | Verified |
| **SEC-PASS-005** | Closed Self-Registration Endpoint | **INFORMATIONAL** | **PASS** | `apps/api/src/auth/auth.service.ts` | Verified |
| **SEC-PASS-006** | Constant-Time Cryptographic Token Matching | **INFORMATIONAL** | **PASS** | `control-plane-admin.guard.ts` | Verified |
| **SEC-NOTEST-01**| OWASP ZAP Baseline Scan | **INFORMATIONAL** | **NOT TESTED** | Deployed Web / API Entrypoints | Blocked |

---

## 7. Retest & Verification Guidance

1. **CORS Retest**: Inspect response headers for `curl -H "Origin: https://attacker.example.com" -I http://localhost:3001/health`. Ensure `Access-Control-Allow-Origin` is NOT reflected.
2. **Control Plane Guard Retest**: Execute a request without `CONTROL_PLANE_ADMIN_KEY` configured in the environment. Ensure all requests are rejected with a 500/401 error and that `arav-cp-admin-dev-key` does not grant access.
3. **Session Revocation Retest**: Suspend a test user via `organizationMembersService.updateStatus()`, and immediately attempt `POST /auth/refresh` using their existing refresh token. The request must return `403 Forbidden`.
