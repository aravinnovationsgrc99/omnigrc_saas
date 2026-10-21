# OMNiGRC — Internal Security Assessment Report
## Report 1: Application & API Security Assessment

---

### Document Control & Metadata

| Attribute | Details |
| :--- | :--- |
| **Document Title** | Report 1 — Application & API Security Assessment |
| **Target System** | OMNiGRC Enterprise GRC Monorepo Application & API Layer |
| **Assessment Date** | 2026-10-21 (Updated: 2026-10-22 IST, UTC+05:30) |
| **Repository & Branch** | `https://github.com/anudharmik/omnigrc.git` \| Branch: `main` |
| **Base Commit** | `f835c04f587d5532c7f9e62d0358bff60ef092a1` + Remediation Diff |
| **Assessment Type** | Internal Security Assessment (Code Review + OWASP ZAP Baseline) |
| **Classification** | Customer Evidence / Customer-Presentable Security Report |
| **Author / Evaluator** | Automated Security Assessment Suite & Code Review Agent |

> **Disclaimer**: This assessment represents an *Internal Security Assessment using Free Automated Tools and Targeted Manual Checks*. It does not constitute a certified VAPT, independent third-party penetration test, or formal compliance certification. All observations reflect static source code analysis, configuration review, and passive baseline scans.

---

## 1. Executive Summary

An architectural and implementation-level security assessment of the **OMNiGRC** application codebase was conducted. The assessment focused on the **Data Plane API** (`apps/api`), the **Control Plane API** (`apps/control-plane-api`), the **Frontend Web Application** (`apps/web`), the **Control Panel Web** (`apps/control-panel-web`), and shared core libraries (`packages/shared`).

### Summary of Architectural Strengths:
1. **Robust Multi-Tenant Data Isolation**: Multi-tenancy is strongly defended via NestJS `AsyncLocalStorage` (`TenantContext`) and an intercepting Prisma middleware (`tenantScopingMiddleware`). The middleware automatically injects `organizationId` scoping into queries across more than 70 domain models and rejects cross-tenant references with `ForbiddenException`.
2. **Cryptographic JWT Verification**: In `TenantMiddleware`, tenant claims (`organizationId`, `role`, `actingViaMsspId`) are only extracted after cryptographic signature verification via `jwtService.verify()`, eliminating forged-token injection risks.
3. **Rigid File Upload & Path Traversal Guards**: The Universal Evidence Vault (`EvidenceStorageService`) implements strict path-traversal prevention, extension allowlisting, file magic-byte verification (for PDF, PNG, and JPEG), SHA-256 integrity calculation, and UUID-namespaced organization directory isolation.
4. **Tamper-Resistant Audit Trail**: The `AuditLogsService` is strictly write-only and read-only at the application layer, without update or delete interfaces, ensuring historical audit records cannot be altered by application workflows.
5. **Constant-Time Cryptographic Comparisons**: The Control Plane administration guard (`ControlPlaneAdminGuard`) implements HMAC-padded constant-time comparisons (`crypto.timingSafeEqual`) to prevent timing side-channel attacks on administrative tokens.

---

## 2. Key Risk Areas & Finding Status Matrix

| Finding ID | Domain / Component | Description | Severity | Finding Status | Evidence / Verification Details |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **SEC-API-01** | `apps/api/src/main.ts` | CORS Credentialed Origin Reflection & Broad Regex | **CRITICAL** | **Fixed and locally verified** | Eliminated `callback(null, true)` fallback. Removed broad Vercel preview regex (`omnigrc*.vercel.app`) and arbitrary subdomain wildcards. Enforced strict exact-match allowlist against approved production, staging, and dev origins. Verified via 11-case test simulation matrix and TypeScript check. |
| **SEC-FW-01** | `apps/web` & `apps/control-panel-web` | Next.js RCE & DoS Vulnerabilities (22 CVEs) | **CRITICAL** | **Fixed and locally verified** | Upgraded both web applications to `next@15.5.28`. Reconciled `package-lock.json` and eliminated vulnerable `14.2.35`. Both unit test suites passed. |
| **SEC-HDR-01** | `apps/web/next.config.mjs` | Missing CSP and Anti-Clickjacking Headers in Production | **Medium** | **Fixed and locally verified** | Live ZAP scan on `app.omnigrc.co` confirmed absence of CSP and framing headers. Injected strict CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `COOP: same-origin-allow-popups` into `apps/web/next.config.mjs`. |
| **SEC-HDR-02** | `apps/control-panel-web/next.config.mjs` | CSP includes `unsafe-eval` and lacks fallback directives | **Medium** | **Fixed and locally verified** | Removed `unsafe-eval`; added `base-uri 'self'`, `form-action 'self'`, and `object-src 'none'`. Verified clean compilation and Jest tests. |
| **SEC-AUTH-01** | `apps/control-plane-api/src/auth/control-plane-admin.guard.ts` | Static Development Key Fallback (`arav-cp-admin-dev-key`) | **HIGH** | **Open** | In development/test mode, fallback key permits administrative bypass. Guard logs critical startup warning in production if unset. Scheduled for Phase 2 removal. |
| **SEC-AUTH-02** | `apps/control-plane-api` | Control Plane API Lacks Rate Limiting | **HIGH** | **Open** | Operator login and provisioning endpoints lack `ThrottlerGuard`. Scheduled for Phase 2 implementation. |
| **SEC-AUTH-03** | `apps/api/src/auth/auth.service.ts` | Refresh Token Ignores Membership Suspension Status | **Medium** | **Open** | `refreshToken()` verifies JWT signature and user existence, but does not query `OrganizationMembership.status` (ACTIVE/SUSPENDED/REVOKED) or organization license state. Suspended users retain access until refresh token expiration. Scheduled for Phase 2 fix. |
| **SEC-CONF-01** | `docker-compose.yml` | Default Static JWT Secret & DB Password | **Medium** | **Open** | Local development compose manifests specify static defaults. Production environments must inject runtime overrides. |
| **SEC-SAML-01** | `packages/shared` / `apps/api` | `passport-saml` Signature Verification Advisory | **CRITICAL** | **Open** | High risk only if SAML SSO is configured. Standard email/password flows unaffected. Scheduled for `@node-saml/passport-saml` migration in Phase 2. |

---

## 3. Live Baseline Scan Findings & Target Reachability

In this assessment cycle, passive OWASP ZAP Baseline scans were executed against both authorized public hostnames:

1. **Primary Frontend (`https://app.omnigrc.co`)**:
   - Status: Reachable (HTTP 200).
   - Findings: 0 High, 3 Medium (Missing CSP, Missing Anti-clickjacking, Cross-Domain Misconfiguration on static chunks), 6 Low, 5 Informational.
   - Corroboration: Directly confirmed the absence of security headers in the deployed build.
2. **Control-Panel Frontend (`https://control.omnigrc.co`)**:
   - Status: Reachable (HTTP 200).
   - Findings: 0 High, 5 Medium (CSP `unsafe-eval`, `unsafe-inline`, style `unsafe-inline`, directive fallback gaps, Cross-Domain Misconfiguration on static chunks), 2 Low, 5 Informational.
   - Corroboration: Directly confirmed presence of security headers with need for CSP hardening.

---

## 4. Assessment Limitations

1. **Authentication Boundary**: Scans operated without credentials; deeper role-based workflows and tenant isolation require authenticated staging validation.
2. **API Data Plane Scans**: External automated scanning was restricted to public web frontends.
3. **Local Remediation State**: Code fixes are verified locally; live staging/production verification requires container deployment.
