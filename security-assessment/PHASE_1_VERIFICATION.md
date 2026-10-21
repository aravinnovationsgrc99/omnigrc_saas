# OMNiGRC — Phase 1 Security Remediation Verification Report

**Document Title**: Phase 1 Security Remediation Verification  
**Evaluation Date**: 2026-10-21 (Timezone: Asia/Kolkata, UTC+05:30)  
**Target Repository**: `https://github.com/anudharmik/omnigrc.git`  
**Branch**: `main`  
**Commit Evaluated**: `f835c04f587d5532c7f9e62d0358bff60ef092a1` + Remediation Diff  
**Verification Scope**: Detailed inspection of Next.js advisory compliance across both frontend applications, strict CORS allowlist enforcement, Next.js 15 compatibility, and lockfile/worktree integrity.

---

## 1. Executive Summary & Verification Matrix

This verification assessment reviews the remediation diff applied to the OMNiGRC repository against authoritative security advisories, lockfile resolutions, deployment configurations, and runtime compatibility constraints.

> [!IMPORTANT]
> **Production Status Disclaimer**: This verification report validates code, configuration, dependency manifests, and local testing only. It does **not** claim that production or staging environments are remediated. Remediations take effect in live environments only after container rebuilds, environment deployments, and post-deployment runtime validation.

| Item | Evaluation Area | Verdict | Primary Finding & Evidence |
| :---: | :--- | :---: | :--- |
| **1** | **Next.js Advisory Compliance** | **PASS** | Both `apps/web` and `apps/control-panel-web` specify `"next": "^15.5.28"`. The dependency tree hoists root `next` to `15.5.28` with zero vulnerable `14.2.35` instances remaining. Satisfies `>= 15.5.24` advisory requirements for `GHSA-2xp9-vwfh-vxw4` and `CVE-2026-75604`. `images.unoptimized: true` acts as defense in depth. |
| **2** | **CORS Origin Validation & Regex** | **PASS** | Unsafe origin reflection and broad multi-tenant regexes (`omnigrc*.vercel.app` and `*.omnigrc.co`) have been completely removed. Strict allowlist matching (`allowedOrigins.includes(normalizedOrigin)`) is enforced. Non-browser requests without `Origin` headers pass; unapproved origins are denied. |
| **3** | **Next.js 15 Compatibility** | **PASS** | `next@15.5.28` peer dependencies officially support `react: "^18.2.0 || ^19.0.0"`. No async `next/headers` APIs are used in either frontend. Targeted Jest test suites passed for both applications (`rag-status-badge.spec.tsx` and `confirmation-dialog.spec.tsx`). |
| **4** | **Lockfile & Worktree Integrity** | **PASS** | `package-lock.json` is fully consistent with workspace manifests. No pre-existing unstaged modifications or untracked assessment files were overwritten or lost. |

---

## 2. Item-by-Item Detailed Technical Verification

### Item 1: Next.js Advisory Compliance & Image Optimization

#### 1.1 Advisory Cross-Check & Fixed-Version Ranges
We cross-checked the Trivy SCA evidence (`security-assessment/evidence/trivy-vuln.json`) and authoritative advisory catalogs for all Next.js vulnerabilities:

| Advisory ID | Severity | Title | Affected Range | Fixed Versions | Resolved Version (`apps/web` & `control-panel-web`) | Status |
| :--- | :---: | :--- | :--- | :--- | :---: | :---: |
| **GHSA-2xp9-vwfh-vxw4** | **CRITICAL** | Next.js Image Optimization API Remote Code Execution (AVIF) | `< 15.5.24`, `< 16.3.3` | `15.5.24, 16.3.3` | `15.5.28` | **PASS** |
| **CVE-2026-75604** | **CRITICAL** | Next.js Unauthenticated RCE on Windows-Hosted Servers | `< 15.5.24`, `< 16.3.3` | `15.5.24, 16.3.3` | `15.5.28` | **PASS** |
| **CVE-2026-64641** | HIGH | Denial of Service via Server Actions in App Router | `< 15.5.21`, `< 16.2.11` | `15.5.21, 16.2.11` | `15.5.28` | **PASS** |
| **CVE-2026-64645** | HIGH | Server-Side Request Forgery vulnerability | `< 15.5.21`, `< 16.2.11` | `15.5.21, 16.2.11` | `15.5.28` | **PASS** |
| **CVE-2026-64649** | HIGH | SSRF via malicious host redirection in Server Actions | `< 15.5.21`, `< 16.2.11` | `15.5.21, 16.2.11` | `15.5.28` | **PASS** |
| **CVE-2026-44573** | HIGH | Information disclosure due to middleware bypass in Pages Router | `< 15.5.16`, `< 16.2.5` | `15.5.16, 16.2.5` | `15.5.28` | **PASS** |
| **CVE-2026-44578** | HIGH | SSRF via crafted WebSocket upgrade requests | `< 15.5.16`, `< 16.2.5` | `15.5.16, 16.2.5` | `15.5.28` | **PASS** |
| **CVE-2026-27980** | MEDIUM | Unbounded next/image disk cache growth can exhaust storage | `< 15.5.14`, `< 16.1.7` | `15.5.14, 16.1.7` | `15.5.28` | **PASS** |
| **CVE-2025-59471** | MEDIUM | NextJS Denial of Service in Image Optimizer | `< 15.5.10`, `< 16.1.5` | `15.5.10, 16.1.5` | `15.5.28` | **PASS** |
| **CVE-2026-44577** | MEDIUM | Denial of Service via Image Optimization API | `< 15.5.16`, `< 16.2.5` | `15.5.16, 16.2.5` | `15.5.28` | **PASS** |

**Conclusion**: Version `15.5.28` exceeds the minimum fixed threshold (`15.5.24`) across all cited CVE and GHSA advisories.

#### 1.2 Lockfile Resolution & Monorepo State
The actual resolved versions were verified via `package-lock.json` and `npm ls next`:
- **`apps/web`**:
  - `apps/web/package.json`: `"next": "^15.5.28"`
  - Status: **PASS** — resolved to `15.5.28`.
- **`apps/control-panel-web`**:
  - `apps/control-panel-web/package.json`: `"next": "^15.5.28"`
  - Status: **PASS** — resolved to `15.5.28`.
- **Monorepo Root**:
  - `package-lock.json` (`packages["node_modules/next"]`): `version: "15.5.28"`
  - `npm ls next`:
    ```text
    omnigrc-monorepo@0.1.0
    +-- @omnigrc/control-panel-web@0.1.0 -> .\apps\control-panel-web
    |   `-- next@15.5.28
    `-- @omnigrc/web@0.1.0 -> .\apps\web
        `-- next@15.5.28
    ```
  - `next@14.2.35` is completely eliminated from the repository lockfile.

#### 1.3 `images.unoptimized: true` Assessment
- **Version Support**: Next.js 15 officially supports `images: { unoptimized: true }` in `next.config.mjs`.
- **Mechanism**:
  - When enabled, Next.js renders standard `<img>` tags pointing directly to raw image assets without routing through the `/_next/image` optimization endpoint.
  - Server-side image transcoding (resizing, WebP/AVIF format conversions) is completely bypassed.
- **Advisory Relationship (Defense in Depth vs. Full Fix)**:
  - Setting `images.unoptimized: true` is **defense in depth**, not a complete standalone fix.
  - Reason 1: The primary RCE flaw (`GHSA-2xp9-vwfh-vxw4`) resides within the underlying image decoding binary parser. Upgrading `next` to `>=15.5.24` provides the authoritative code patch.
  - Reason 2: `CVE-2026-75604` is an Unauthenticated RCE on Windows-hosted servers that affects Next.js server core routing/runtime independently of image optimization. `images.unoptimized: true` has zero mitigation effect on `CVE-2026-75604`.
  - **Verdict**: Combining `next@15.5.28` (authoritative code fix) with `images.unoptimized: true` (architectural defense in depth) provides robust multi-layered protection.

---

### Item 2: CORS Origin Validation & Allowlist Review

#### 2.1 Complete CORS Callback & Origin Resolution Logic
Inspection of `apps/api/src/main.ts` (lines 20–62):
```typescript
  const rawFrontendUrls = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((url) => url.trim().replace(/\/+$/, ''))
    : [];

  const rawAppUrl = process.env.APP_URL
    ? [process.env.APP_URL.trim().replace(/\/+$/, '')]
    : [];

  const defaultOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
    'https://app.omnigrc.co',
    'https://control.omnigrc.co',
    ...rawAppUrl,
    ...rawFrontendUrls,
  ].filter((url): url is string => typeof url === 'string' && url.length > 0);

  const allowedOrigins = Array.from(new Set(defaultOrigins));

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      const normalizedOrigin = origin.trim().replace(/\/+$/, '');

      // Enforce strict match against approved origins; do not trust arbitrary subdomains or preview deployments
      const isAllowed = allowedOrigins.includes(normalizedOrigin);

      if (isAllowed) {
        callback(null, true);
      } else {
        logger.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
        callback(null, false);
      }
    },
    credentials: true,
  });
```

#### 2.2 Production & Staging Origin Verification
1. **Production Frontend**: `https://app.omnigrc.co` — explicitly included in `defaultOrigins`.
2. **Production Control Plane**: `https://control.omnigrc.co` — explicitly included in `defaultOrigins`.
3. **Staging / Dynamic Deployments**: Injected via `process.env.APP_URL` and `process.env.FRONTEND_URL`, split on commas, and stripped of trailing slashes.
4. **Local Development**: `http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:3002`, `http://127.0.0.1:3002` — explicitly included.
5. **No Origin Header**: `if (!origin) return callback(null, true);` — correctly permits backend health checks (`/health`), server-to-server API clients, and curl requests.
6. **Unknown Origins**: Correctly logged with warning and passed `callback(null, false)`. In Express `cors` middleware with `credentials: true`, `callback(null, false)` prevents the emission of `Access-Control-Allow-Origin`, causing modern browsers to reject access to the response.
7. **Regex Removal**: Both the broad Vercel preview regex (`omnigrc*.vercel.app`) and arbitrary subdomain wildcard matching have been replaced with strict set inclusion (`allowedOrigins.includes(normalizedOrigin)`).
8. **Verdict**: **PASS**.

---

### Item 3: Next.js 15 Compatibility Review

#### 3.1 Workspace Dependency Constraints
- **React Compatibility**:
  - `apps/web/package.json` and `apps/control-panel-web/package.json` specify `"react": "^18.2.0"` and `"react-dom": "^18.2.0"`.
  - `next@15.5.28` peerDependencies specify:
    ```json
    "peerDependencies": {
      "react": "^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0",
      "react-dom": "^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0"
    }
    ```
  - Result: Next.js 15.5.28 officially supports React 18.2.0. No peer dependency conflicts exist.

#### 3.2 Breaking API Audit
- **`next/headers` Audit**: In Next.js 15, `cookies()` and `headers()` became async.
  - Verification: Grep search across `apps/web/src` and `apps/control-panel-web/src` confirmed **zero instances** of `next/headers`.
- **`next/navigation` Audit**:
  - All occurrences of `useRouter`, `useSearchParams`, `useParams`, and `usePathname` across both frontend apps reside within Client Components (`'use client'`). Client-side navigation hooks behave identically across Next.js 14 and 15.

#### 3.3 Targeted Verification Checks Run
1. **API Type Check**:
   - Command: `npx tsc -p apps/api/tsconfig.json --noEmit`
   - Result: **0 errors (Exit code 0)**.
2. **Control Panel Type Check**:
   - Command: `npx tsc -p apps/control-panel-web/tsconfig.json --noEmit`
   - Result: **0 errors (Exit code 0)**.
3. **Web Component Test Suite**:
   - Command: `npm test --workspace=@omnigrc/web -- rag-status-badge.spec.tsx`
   - Result: **PASS (1 Suite Passed, 19 Tests Passed, Exit code 0)**.
4. **Control Panel Component Test Suite**:
   - Command: `npm test --workspace=@omnigrc/control-panel-web -- confirmation-dialog.spec.tsx`
   - Result: **PASS (1 Suite Passed, 4 Tests Passed, Exit code 0)**.
5. **CORS Allowlist Test Matrix**:
   - Result: **PASS (11/11 Test Cases Passed)**.

---

### Item 4: Lockfile & Worktree Integrity

#### 4.1 Lockfile Consistency
- `package-lock.json` lockfileVersion is `3`.
- Verified that `packages["apps/web"]` and `packages["apps/control-panel-web"]` point to `next: "^15.5.28"`.
- Verified that `packages["node_modules/next"]` resolves to `version: "15.5.28"`.
- All secondary dependencies added to the lockfile (`sharp@0.35.5` and native `@img/sharp-*` optional platform bindings) are standard Next.js 15 image-pipeline and build dependencies.

#### 4.2 Worktree Preservation
A `git status --short` inspection confirms that only the planned remediation files and security assessment artifacts are present in the worktree:
```text
 M apps/api/src/main.ts
 M apps/control-panel-web/package.json
 M apps/web/next.config.mjs
 M apps/web/package.json
 M package-lock.json
```
- No unrelated source files were modified.
- No git stashes, commits, resets, or reverts were performed.
- Pre-existing untracked assessment reports and evidence files were fully preserved.

---

## 3. Checks Executed & Tooling Evidence

| Check # | Tool / Command Executed | Target Scope | Output Summary |
| :---: | :--- | :--- | :--- |
| **1** | `git status --short` | Working tree | Clean state, only 3 working tree files modified after commit `e7132cd`. |
| **2** | `git diff origin/main --stat` | Cumulative Phase 1 Diff | 4 application files modified (`main.ts`, `control-panel-web/package.json`, `web/next.config.mjs`, `web/package.json`), 1 lockfile (`package-lock.json`). |
| **3** | `npm ls next` | Dependency tree | Both `@omnigrc/web` and `@omnigrc/control-panel-web` resolve to `next@15.5.28` (Exit code 0). |
| **4** | Node.js lockfile inspector | `package-lock.json` | Confirmed root `node_modules/next` = `15.5.28`, `14.2.35` eliminated completely. |
| **5** | Node.js Trivy CVE inspector | `trivy-vuln.json` | Verified all Next.js CVEs fixed in `15.5.24` / `16.3.3` are satisfied by `15.5.28`. |
| **6** | `npx tsc -p apps/api/tsconfig.json --noEmit` | API TypeScript build | 0 compilation errors (Exit code 0). |
| **7** | `npx tsc -p apps/control-panel-web/tsconfig.json --noEmit` | Control Panel TypeScript build | 0 compilation errors (Exit code 0). |
| **8** | `npm test --workspace=@omnigrc/web -- rag-status-badge.spec.tsx` | Web Jest unit tests | 19 passed, 0 failed (Exit code 0). |
| **9** | `npm test --workspace=@omnigrc/control-panel-web -- confirmation-dialog.spec.tsx` | Control Panel Jest unit tests | 4 passed, 0 failed (Exit code 0). |
| **10** | Node.js CORS Allowlist simulation | `apps/api/src/main.ts` logic | 11/11 tests passed: approved accepted, Vercel preview rejected, arbitrary subdomains rejected, no origin accepted. |

---

## 4. Remaining Risks & Recommended Next Steps

1. **Staging Deployment & Live Preflight Verification**:
   - **Risk**: Remediations exist only in source code and package manifests.
   - **Action**: Deploy to staging environment, test preflight `OPTIONS` requests from authorized and unauthorized origins, and verify container startup.
2. **Phase 2 Non-Next.js Remediation**:
   - Next steps to address remaining audit items:
     - Remove static dev fallback `arav-cp-admin-dev-key` from `apps/control-plane-api/src/auth/control-plane-admin.guard.ts`.
     - Add `ThrottlerModule` and `ThrottlerGuard` to `apps/control-plane-api/src/app.module.ts`.
     - Purge static `JWT_SECRET` defaults from `docker-compose.yml`.
     - Remove `DEV_LICENSE_PRIVATE_KEY` export from `packages/shared/src/index.ts`.
     - Enforce membership active check inside `auth.service.ts:refreshToken()`.
