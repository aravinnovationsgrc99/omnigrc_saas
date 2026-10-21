# OMNiGRC — Critical & High Security Findings Validation Report

**Assessment Target**: OMNiGRC Application & Infrastructure Codebase  
**Evaluation Date**: 2026-10-21 (Timezone: Asia/Kolkata, UTC+05:30)  
**Repository**: `https://github.com/anudharmik/omnigrc.git`  
**Branch**: `main`  
**Evaluated Commit Hash**: `f835c04f587d5532c7f9e62d0358bff60ef092a1`  
**Document Classification**: Security Due Diligence & Technical Validation Record  
**Purpose**: Rigorous finding-by-finding technical validation of all reported CRITICAL and HIGH severity issues across the codebase, dependencies, Git history, and configuration manifests.

---

## 1. Executive Summary & Raw Evidence Audit

Every Critical and High finding reported in the initial security assessment suite was re-examined against the active source code, dependency manifests (`package-lock.json`, workspace `package.json` files), Git commit history, and raw scanner output files stored in `security-assessment/evidence/`.

### 1.1 Tool Output & Report Count Reconciliation

| Scanner & Evidence File | Raw Artifact Metric | Report 1 & 2 Tallies | Reconciliation Status |
| :--- | :--- | :--- | :--- |
| **Trivy SCA** (`trivy-vuln.json`) | **90 Total CVEs**:<br>• Critical: 5<br>• High: 46<br>• Medium: 32<br>• Low: 7 | 90 Total CVEs (5 Critical, 46 High, 32 Medium, 7 Low) | **MATCH (100% Reconciled)** |
| **Trivy Config** (`trivy-config.json`) | **2 Misconfigurations**:<br>• Low: 2 (`DS-0026` in `apps/api/Dockerfile` & `apps/web/Dockerfile`) | 2 Misconfigurations (2 Low) | **MATCH (100% Reconciled)** |
| **Gitleaks** (`gitleaks-report.json`) | **21 Findings** across 125 commits | 21 Findings classified (1 historical private key, 2 dev fallback keys, 18 test mocks/templates) | **MATCH (100% Reconciled)** |
| **Application & API Review** | 4 Critical/High Architectural Findings | SEC-CRIT-001 (CORS), SEC-CRIT-004 (Secrets), SEC-HIGH-002 (Admin Key), SEC-HIGH-003 (Rate Limit), SEC-HIGH-004 (Refresh Token) | **MATCH (100% Reconciled)** |

---

## 2. Comprehensive Findings Validation Matrix

| Finding ID | Evaluated Item | Defect Classification | Confidence | Production Exposure Status | Urgency Level |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **VAL-001** | Permissive CORS with Credential Reflection | **Confirmed Code Defect** | **High (Verified)** | **CONFIRMED** | **Critical (P0)** |
| **VAL-002** | Next.js Remote Code Execution (CVE-2026-75604, GHSA-2xp9-vwfh-vxw4) | **Confirmed Vulnerable Dependency** | **High (Verified)** | **CONFIRMED (Image API) / NOT APPLICABLE (Windows RCE on Linux Docker)** | **Critical (P0)** |
| **VAL-003** | Passport-SAML Signature Verification Bypass (CVE-2025-54419) | **Confirmed Vulnerable Dependency** | **High (Verified)** | **DORMANT / NOT APPLICABLE IN RUNTIME** (Inactive Stub) | **Medium (P2)** |
| **VAL-004** | Default Hardcoded JWT/Database Secrets in Docker Compose | **Confirmed Configuration Defect** | **High (Verified)** | **UNCONFIRMED / POTENTIAL** (Dependent on deployment orchestrator) | **High (P1)** |
| **VAL-005** | Historical Private Key Exposure in Git History | **Confirmed Historical Secret Exposure** | **High (Verified)** | **POTENTIAL RISK** (Key is in Git history & `@omnigrc/shared`) | **High (P1)** |
| **VAL-006** | Control Plane Administrative Key Fallback | **Confirmed Insecure Default Defect** | **High (Verified)** | **UNCONFIRMED / POTENTIAL** (Exposed if `NODE_ENV` is not production) | **High (P1)** |
| **VAL-007** | Missing Rate Limiting on Control Plane API | **Confirmed Code Defect** | **High (Verified)** | **CONFIRMED IN APPLICATION LAYER** | **High (P1)** |
| **VAL-008** | Refresh Token Behavior for Suspended Users | **Confirmed Code Defect / Partially Mitigated** | **High (Verified)** | **CONFIRMED (Refresh Endpoint) / MITIGATED (Protected Routes)** | **High (P1)** |
| **VAL-009** | Client IP Header Spoofing in `proxy-addr` (CVE-2026-90711) | **Confirmed Vulnerable Dependency** | **High (Verified)** | **POTENTIAL RISK** (Dependent on upstream reverse proxy header stripping) | **High (P1)** |
| **VAL-010** | Server-Sent Events (SSE) Injection in `@nestjs/core` (CVE-2026-35515) | **Confirmed Vulnerable Dependency** | **High (Verified)** | **NOT APPLICABLE IN RUNTIME** (No SSE endpoints implemented) | **Low (P3)** |

---

## 3. In-Depth Technical Validation by Finding

### Finding 1: CORS Origin Handling with Credentials in Data Plane API
- **Source Location**: `apps/api/src/main.ts` (lines 31–50)
- **Verified Code**:
  ```typescript
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const isAllowed =
        allowedOrigins.some((allowed) => origin.startsWith(allowed)) ||
        /\.vercel\.app$/.test(origin) ||
        /\.onrender\.com$/.test(origin);

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
- **Technical Analysis**:
  The CORS middleware is configured with `credentials: true`. In the `else` branch (when an origin matches neither `allowedOrigins`, Vercel, nor Render), the code explicitly invokes `callback(null, true)`. Under Express/NestJS CORS specifications, this instructs the server to reflect the requesting `Origin` header verbatim in `Access-Control-Allow-Origin` while concurrently returning `Access-Control-Allow-Credentials: true`.
- **Classification**: **Confirmed Code Defect**.
- **Production Exposure**: **CONFIRMED**. This code executes unconditionally across all runtime environments (`production`, `staging`, `development`). An attacker hosting `https://malicious-site.example` can trigger cross-origin `fetch(apiUrl, { credentials: 'include' })` calls from a user's browser, permitting complete exfiltration of confidential GRC records.
- **Recommended Next Action**: Replace `callback(null, true)` in the fallback branch with `callback(new Error('CORS origin not allowed'), false)`. Explicitly mandate domain whitelisting via `FRONTEND_URL`.

---

### Finding 2: Next.js Framework Remote Code Execution Vulnerabilities
- **Verified Installed Version**: `next@14.2.35` (Locked in `package-lock.json` line 9066; declared as `"^14.1.0"` in `apps/web/package.json` line 18).
- **Vulnerability Identifiers**:
  1. `CVE-2026-75604` (Critical): Next.js Unauthenticated Remote Code Execution on Windows-hosted servers.
  2. `GHSA-2xp9-vwfh-vxw4` (Critical): Next.js Unauthenticated Remote Code Execution in Image Optimization API during AVIF processing.
  3. `CVE-2026-44573` (High): Information disclosure via middleware bypass in Pages Router.
  4. `CVE-2026-44578` (High): SSRF via crafted WebSocket upgrade requests.
  5. `CVE-2026-64641` (High): Denial of Service via App Router requests.
- **Authoritative Advisory Fix Versions**: Next.js `>=15.5.24` or `>=16.3.3`.
- **Classification**: **Confirmed Vulnerable Dependency Version**.
- **Production Exposure Breakdown**:
  - `CVE-2026-75604` (Windows RCE): **NOT APPLICABLE TO PRODUCTION CONTAINERS**. `apps/web/Dockerfile` lines 2 and 25 specify `FROM node:20-alpine AS runner`. Because production builds run on Linux Alpine, Windows-specific path resolution exploits cannot execute. However, if any developer or self-hosted customer runs `next start` on a bare-metal Windows server, this vulnerability is fully active.
  - `GHSA-2xp9-vwfh-vxw4` (Image Optimization RCE): **CONFIRMED IN PRODUCTION STANDALONE RUNTIME**. In `apps/web/next.config.mjs`, image optimization is enabled by default (no `images: { unoptimized: true }` directive). The `/_next/image` endpoint is exposed and accepts external image requests unless filtered by an external WAF.
- **Recommended Next Action**: Upgrade `apps/web/package.json` to `next@^15.5.24` (or `16.3.3`), or immediately insert `images: { unoptimized: true }` in `next.config.mjs` as a temporary mitigation.

---

### Finding 3: Passport-SAML Signature Verification Bypass
- **Verified Installed Version**: `passport-saml@3.2.4` (Locked in `package-lock.json` line 9579; declared as `"^3.2.4"` in `apps/api/package.json` line 37).
- **Transitive Impact**: Pulls deprecated `@xmldom/xmldom@0.7.13` (introducing 12 High-severity XML injection CVEs).
- **Vulnerability Identifier**: `CVE-2025-54419` (@node-saml/node-saml signature verification bypass).
- **Source-Level Implementation Review**:
  In `apps/api/src/auth/sso/saml.strategy.ts`:
  ```typescript
  /**
   * Built in Phase 1 per SOW Section 5.1; activation gated to post-POC paid tiers.
   * This SSO/SAML strategy stub is pre-scaffolded for enterprise single sign-on integration.
   * It remains inactive during Phase 1 POC and contains no registered active routes.
   */
  @Injectable()
  export class SamlStrategyStub extends PassportStrategy(Strategy, 'saml-stub') { ... }
  ```
  Review of `apps/api/src/auth/auth.controller.ts` confirmed that **zero routes** reference `@UseGuards(AuthGuard('saml'))` or `saml-stub`. The strategy is registered in NestJS DI but is never invoked by any HTTP handler.
- **Classification**: **Confirmed Vulnerable Dependency Version**, but **DORMANT / NOT RUNTIME EXPLOITABLE**.
- **Production Exposure**: **NOT APPLICABLE IN RUNTIME**. An attacker cannot reach SAML assertion processing because no SAML login or callback endpoints exist in the routing table. However, leaving it unpatched introduces technical debt and will turn into an immediate Critical flaw if SAML routes are activated.
- **Recommended Next Action**: Remove `passport-saml` from `apps/api/package.json` until enterprise SSO is scheduled for implementation, or migrate directly to `@node-saml/passport-saml@^5.0.0`.

---

### Finding 4: Default Hardcoded JWT and Database Secrets in Docker Compose
- **Source Locations**:
  - `docker-compose.yml` (lines 8–10, 41–45)
  - `docker-compose.self-hosted.yml` (lines 9–10, 42–46)
  - `apps/api/src/main.ts` (lines 68–94)
- **Verified Observations**:
  In `docker-compose.yml`:
  ```yaml
  POSTGRES_PASSWORD: postgrespassword
  JWT_SECRET: "omnigrc-prod-jwt-secret-key-change-me"
  JWT_REFRESH_SECRET: "omnigrc-prod-jwt-refresh-secret-key-change-me"
  ```
  In `apps/api/src/main.ts`, the startup audit check tests:
  ```typescript
  if (!jwtSecret || jwtSecret === 'omnigrc-dev-secret-key-change-in-prod') {
    if (isProduction) logger.error('SECURITY CRITICAL: JWT_SECRET is not set...');
  }
  ```
  The startup logger only alerts on `'omnigrc-dev-secret-key-change-in-prod'`. It **fails to alert** on the string hardcoded in `docker-compose.yml` (`'omnigrc-prod-jwt-secret-key-change-me'`).
- **Classification**: **Confirmed Configuration Defect**.
- **Production Exposure**: **UNCONFIRMED / POTENTIAL RISK**.
  - If a production customer deploys directly using `docker-compose up` without an `.env` override, the system runs with public, known JWT signing secrets, enabling arbitrary token forgery.
  - If production is deployed via Kubernetes, Vercel, Render, or `docker-compose.self-hosted.yml` with injected secrets (`${JWT_SECRET}`), the vulnerability does not manifest.
- **Recommended Next Action**: Replace static string literals in `docker-compose.yml` with required environment variable interpolations (`${JWT_SECRET:?JWT_SECRET must be set}`). Update `main.ts` to block startup if `JWT_SECRET` contains any known default substring (`change-me`, `dev-secret`, etc.).

---

### Finding 5: Historical Private Key Exposure in Git History
- **Verified Location**:
  - **Git History**: Commit `401f270f360d21fc9b8d7ee72af397c4580707b3` in `packages/shared/src/index.ts` (line 1086).
  - **Active Working Tree**: `packages/shared/src/index.ts` (line 1378) and `apps/control-plane-api/src/licenses/license-signing.service.ts` (line 22).
- **Secret Category**: Ed25519 Private Key (`DEV_LICENSE_PRIVATE_KEY`).
- **Redacted Fingerprint**: Ed25519 key starting with `MC4CAQAwBQYDK...` and ending with `...ZV7/` associated with Key ID `arav-license-v1-2026`.
- **Technical Analysis**:
  This key was embedded to support offline mock license signing in development. In `license-verification.service.ts` lines 55–58:
  ```typescript
  const isProd = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
  if (!isProd) {
    this.trustedPublicKeyRegistry.set(DEFAULT_KEY_ID, DEV_LICENSE_PUBLIC_KEY);
  }
  ```
  The Data Plane API explicitly rejects this key ID (`arav-license-v1-2026`) in production mode unless the administrator explicitly passes `LICENSE_VERIFICATION_PUBLIC_KEY` with the development public key.
- **Classification**: **Confirmed Secret Exposure in Code & Git History**.
- **Production Exposure**: **POTENTIAL RISK (INVESTIGATION REQUIRED)**.
  - While production code gates this key behind `!isProd`, the private key itself is exported from `@omnigrc/shared`, which is bundled into frontend and backend packages.
  - **Action Required**: Verify whether this key pair was ever utilized to issue licenses for commercial customers. If so, customer licenses must be re-signed with a production key and this key permanently revoked.
- **Recommended Next Action**: Remove `DEV_LICENSE_PRIVATE_KEY` entirely from `@omnigrc/shared`. Generate ephemeral keys in memory for unit test suites.

---

### Finding 6: Control Plane Administrative Key Fallback
- **Source Location**: `apps/control-plane-api/src/auth/control-plane-admin.guard.ts` (lines 13, 20–35)
- **Verified Code**:
  ```typescript
  const DEV_ADMIN_KEY = 'arav-cp-admin-dev-key';
  ...
  canActivate(context: ExecutionContext): boolean {
    const configuredKey = process.env.CONTROL_PLANE_ADMIN_KEY;
    const isProduction =
      process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

    if (!configuredKey && isProduction) {
      throw new InternalServerErrorException(
        'Control Plane administrative key is not configured for this environment.',
      );
    }

    const expectedAdminKey = configuredKey || DEV_ADMIN_KEY;
  ```
- **Technical Analysis**:
  The guard incorporates a fail-closed check for production: `if (!configuredKey && isProduction) throw ...`. However, this relies entirely on the exact string value of `process.env.NODE_ENV`. If a deployment leaves `NODE_ENV` undefined, sets it to `test`, `demo`, or misconfigures it as `prod` (instead of `production`), `isProduction` evaluates to `false`. The guard then falls back to `arav-cp-admin-dev-key`.
- **Classification**: **Confirmed Insecure Default Defect**.
- **Production Exposure**: **UNCONFIRMED / POTENTIAL RISK**.
  - In a standard production environment with `NODE_ENV=production`, the fallback is blocked by the fail-closed check.
  - In non-production, staging, or misconfigured environments, any caller presenting `x-control-plane-admin-key: arav-cp-admin-dev-key` gains complete administrative access over the control plane.
- **Recommended Next Action**: Remove `DEV_ADMIN_KEY` entirely. Require `CONTROL_PLANE_ADMIN_KEY` to be explicitly provided in all environments.

---

### Finding 7: Missing Rate Limiting on Control Plane API
- **Source Location**: `apps/control-plane-api/src/app.module.ts` and `operator-auth.controller.ts`
- **Verified Observations**:
  - `apps/api/src/app.module.ts` properly imports `ThrottlerModule` and applies `ThrottlerGuard` globally, decorating auth routes with `@Throttle()`.
  - In contrast, `apps/control-plane-api/src/app.module.ts` **does not import `ThrottlerModule`**.
  - `OperatorAuthController` (`apps/control-plane-api/src/auth/operator-auth.controller.ts`) exposes `POST /v1/operator-auth/login`, `POST /v1/operator-auth/mfa/verify`, and `POST /v1/operator-auth/bootstrap` with zero rate-limiting decorators or interceptors.
- **Classification**: **Confirmed Code Defect**.
- **Production Exposure**: **CONFIRMED IN APPLICATION LAYER**.
  - Without external rate-limiting at an edge reverse proxy (such as Cloudflare or AWS WAF), an attacker can conduct high-velocity brute-force password and TOTP token enumeration attacks against control plane operators.
- **Recommended Next Action**: Import `ThrottlerModule` into `ControlPlaneAppModule`, bind `ThrottlerGuard` globally, and decorate operator authentication endpoints with rate limits.

---

### Finding 8: Refresh Token Behavior for Suspended Users
- **Source Location**:
  - `apps/api/src/auth/auth.service.ts` (lines 190–210)
  - `apps/api/src/auth/strategies/jwt.strategy.ts` (lines 53–75)
- **Verified Code & Interaction**:
  1. In `auth.service.ts`:
     ```typescript
     async refreshToken(refreshTokenStr: string) {
       const payload = this.jwtService.verify(refreshTokenStr, ...);
       const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
       if (!user) throw new UnauthorizedException('User not found');
       return this.generateTokens(user.id, user.email, user.organizationId, user.role);
     }
     ```
     `refreshToken()` verifies the JWT signature and confirms the user exists, but **does not query `organizationMembership`** or check `ProductAccessStatus`.
  2. In `jwt.strategy.ts`:
     When the issued access token is subsequently presented to protected endpoints, `JwtStrategy.validate()` executes:
     ```typescript
     const membership = await this.prisma.organizationMembership.findUnique(...);
     if (membership && membership.status !== 'ACTIVE') {
       throw new UnauthorizedException({ message: 'Organization membership has been suspended or revoked.' });
     }
     ```
- **Classification**: **Confirmed Code Defect / Partially Mitigated**.
- **Production Exposure**:
  - **CONFIRMED ON REFRESH ENDPOINT**: A suspended or revoked user can continue to call `POST /auth/refresh` successfully and receive new 15-minute access tokens and 7-day refresh tokens.
  - **MITIGATED ON PROTECTED API ROUTES**: When the user attempts to use the renewed access token against protected business endpoints, `JwtStrategy` intercepts the request and throws `401 Unauthorized` (`PRODUCT_ACCESS_REVOKED`).
  - **Residual Risk**: Any public or semi-protected endpoint that does not invoke `JwtStrategy` remains callable with the renewed session. If a user's membership is reinstated, their refresh session was never revoked.
- **Recommended Next Action**: Add an `organizationMembership` active check inside `auth.service.ts:refreshToken()` and implement a `tokenVersion` counter on the `User` model to immediately invalidate refresh tokens upon suspension or password reset.

---

### Finding 9: Client IP Header Spoofing in `proxy-addr`
- **Verified Installed Version**: `proxy-addr@2.0.7` (Locked in `package-lock.json` line 9992).
- **Vulnerability Identifier**: `CVE-2026-90711` (Critical, CVSS 9.8).
- **Authoritative Advisory Fix Version**: `proxy-addr@2.0.8`.
- **Technical Analysis**:
  `proxy-addr` is utilized by Express to parse the `X-Forwarded-For` header. In version 2.0.7, a flaw in comma-separated IP parsing allows clients to inject forged IP addresses when `trust proxy` is enabled. In `apps/control-plane-api/src/auth/operator-auth.controller.ts` line 28, the code falls back to `req.headers['x-forwarded-for']`.
- **Classification**: **Confirmed Vulnerable Dependency Version**.
- **Production Exposure**: **POTENTIAL RISK**.
  - If the production deployment is behind a reverse proxy (Nginx, AWS CloudFront, Cloudflare) that unconditionally overwrites or resets `X-Forwarded-For` with the true client socket address, the vulnerability is mitigated at the network boundary.
  - If upstream proxies append rather than overwrite headers without strict trusted proxy IP definitions, clients can spoof their IP address in audit trails (`AuditLogEntry`) and bypass IP rate limits.
- **Recommended Next Action**: Upgrade `proxy-addr` to `>=2.0.8` (or update parent dependencies) and configure explicit trusted subnet ranges in NestJS Express configuration (`app.set('trust proxy', 'loopback, linklocal, uniquelocal')`).

---

### Finding 10: Server-Sent Events (SSE) Injection in `@nestjs/core`
- **Verified Installed Version**: `@nestjs/core@10.4.22` (Locked in `package-lock.json` line 1812).
- **Vulnerability Identifier**: `CVE-2026-35515` (Medium).
- **Authoritative Advisory Fix Version**: `@nestjs/core@11.1.18`.
- **Source-Level Implementation Review**:
  A global search for `@Sse`, `Server-Sent`, `text/event-stream`, and `EventSource` across all `apps/` and `packages/` returned **zero results**. OMNiGRC notification delivery is architected around polling (`GET /notifications`) and BullMQ background workers, rather than SSE streams.
- **Classification**: **Confirmed Vulnerable Dependency Version**, but **NOT APPLICABLE IN RUNTIME**.
- **Production Exposure**: **NOT APPLICABLE IN RUNTIME**. Because the vulnerable code path (SSE message serialization) is never invoked by any controller in OMNiGRC, this vulnerability cannot be triggered by external attackers.
- **Recommended Next Action**: Plan upgrade to NestJS v11 during regular dependency maintenance cycles.

---

## 4. The Three Most Urgent Actions Based on Verified Evidence

Based on verified code defects, active exposure, and immediate security impact, the three most urgent actions required are:

```
+-----------------------------------------------------------------------------------------------------+
|                                 TOP 3 URGENT SECURITY ACTIONS                                       |
+---+-----------------------------------+----------+--------------------------------------------------+
| # | Action Description                | Priority | Affected Component & Target File                 |
+---+-----------------------------------+----------+--------------------------------------------------+
| 1 | Remediate Permissive CORS Origin  | P0       | apps/api/src/main.ts                             |
|   | Reflection with Credentials       | Immediate| Line 46: Replace fallback callback(null, true)   |
|   |                                   |          | with callback(new Error('CORS rejected'), false) |
+---+-----------------------------------+----------+--------------------------------------------------+
| 2 | Upgrade Next.js to Patch Image    | P0       | apps/web/package.json & lockfile                 |
|   | Optimization RCE                  | Immediate| Upgrade next from 14.2.35 to >=15.5.24           |
|   |                                   |          | (or set images: { unoptimized: true })           |
+---+-----------------------------------+----------+--------------------------------------------------+
| 3 | Remove Hardcoded Default Secrets  | P1       | docker-compose.yml & packages/shared/src/index.ts|
|   | & Dev Admin Keys                  | High     | Eliminate static JWT secrets from compose and    |
|   |                                   |          | eliminate arav-cp-admin-dev-key fallback         |
+---+-----------------------------------+----------+--------------------------------------------------+
```

1. **Immediate P0 Action — Fix CORS Origin Reflection (`apps/api/src/main.ts`)**:
   This is a confirmed active code defect affecting production. Replace the fallback `callback(null, true)` with an explicit rejection (`callback(new Error('Not allowed by CORS'), false)`). This immediately closes the cross-origin data exfiltration vector.

2. **Immediate P0 Action — Remediate Next.js Remote Code Execution (`apps/web`)**:
   Upgrade `next` to `>=15.5.24` (or `16.3.3`) in `apps/web/package.json` to eliminate `GHSA-2xp9-vwfh-vxw4`. If an immediate major framework upgrade requires testing, temporarily add `images: { unoptimized: true }` in `apps/web/next.config.mjs` to disable the vulnerable image processing endpoint.

3. **High P1 Action — Eliminate Hardcoded Secrets & Dev Fallbacks**:
   - Update `docker-compose.yml` to mandate environment variable interpolation for `JWT_SECRET` and `JWT_REFRESH_SECRET`.
   - Remove `arav-cp-admin-dev-key` fallback in `apps/control-plane-api/src/auth/control-plane-admin.guard.ts` so the control plane fails closed in all environments if `CONTROL_PLANE_ADMIN_KEY` is omitted.
   - Remove `DEV_LICENSE_PRIVATE_KEY` from `@omnigrc/shared`.
