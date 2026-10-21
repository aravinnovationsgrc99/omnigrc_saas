# OMNiGRC — Phase 1 Security Remediation Verification Report

**Document Title**: Phase 1 Security Remediation Verification  
**Evaluation Date**: 2026-10-21 (Timezone: Asia/Kolkata, UTC+05:30)  
**Target Repository**: `https://github.com/anudharmik/omnigrc.git`  
**Branch**: `main`  
**Commit Evaluated**: `f835c04f587d5532c7f9e62d0358bff60ef092a1` + Phase 1 Working Tree Diff  
**Verification Scope**: Detailed inspection of Next.js advisory compliance, CORS allowlist & regex security, Next.js 15 compatibility, and lockfile/worktree integrity.

---

## 1. Executive Summary & Verification Matrix

This verification assessment reviews the Phase 1 remediation diff applied to the OMNiGRC repository against authoritative security advisories, lockfile resolutions, deployment configurations, and runtime compatibility constraints.

> [!IMPORTANT]
> **Production Status Disclaimer**: This verification report validates code, configuration, dependency manifests, and local testing only. It does **not** claim that production or staging environments are remediated. Remediations take effect in live environments only after container rebuilds, environment deployments, and post-deployment runtime validation.

| Item | Evaluation Area | Verdict | Primary Finding & Evidence |
| :---: | :--- | :---: | :--- |
| **1** | **Next.js Advisory Compliance** | **PASS** *(apps/web)*<br>**NEEDS REVIEW** *(Monorepo Root)* | `apps/web/node_modules/next` resolves to `15.5.28`, satisfying the `>= 15.5.24` threshold for `GHSA-2xp9-vwfh-vxw4` and `CVE-2026-75604`. `images.unoptimized: true` is supported in Next.js 15 and serves as defense in depth. However, `apps/control-panel-web` remains on `14.2.35` in the root lockfile. |
| **2** | **CORS Origin Validation & Regex** | **PASS** *(Origin Rejection)*<br>**NEEDS REVIEW** *(Vercel Preview Regex)* | Dynamic reflection fallback `callback(null, true)` is eliminated; requests without `Origin` header are permitted; unknown origins are denied via `callback(null, false)`. Valid production (`app.omnigrc.co`, `control.omnigrc.co`), staging (`APP_URL`, `FRONTEND_URL`), and local dev origins are accepted. However, `/^https:\/\/([a-z0-9-]+-)?omnigrc[a-z0-9-]*\.vercel\.app$/` is overly permissive on the public multi-tenant `.vercel.app` domain. |
| **3** | **Next.js 15 Compatibility** | **PASS** | `next@15.5.28` peer dependencies officially support `react: "^18.2.0 || ^19.0.0"`. No async `next/headers` APIs are used in `apps/web`. Targeted component test suite passed (19/19 tests). |
| **4** | **Lockfile & Worktree Integrity** | **PASS** | `package-lock.json` is fully synchronized with `apps/web/package.json`. No pre-existing unstaged modifications or untracked assessment files were overwritten or lost. |

---

## 2. Item-by-Item Detailed Technical Verification

### Item 1: Next.js Advisory Compliance & Image Optimization

#### 1.1 Advisory Cross-Check & Fixed-Version Ranges
We cross-checked the Trivy SCA evidence (`security-assessment/evidence/trivy-vuln.json`) and authoritative advisory catalogs for all Next.js vulnerabilities:

| Advisory ID | Severity | Title | Affected Range | Fixed Versions | Resolved Version (`apps/web`) | Status |
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

#### 1.2 Lockfile Resolution & Dual-Version Monorepo State
The actual resolved versions were verified via `package-lock.json` and `npm ls next`:
- **`apps/web`**:
  - `apps/web/package.json`: `"next": "^15.5.28"`
  - `package-lock.json` (`packages["apps/web/node_modules/next"]`): `version: "15.5.28"`
  - Status: **PASS** — resolved to the secure version.
- **Monorepo Root (`apps/control-panel-web`)**:
  - `apps/control-panel-web/package.json`: `"next": "^14.1.0"`
  - `package-lock.json` (`packages["node_modules/next"]`): `version: "14.2.35"`
  - Status: **NEEDS REVIEW** — `apps/control-panel-web` was excluded from Phase 1 scope and remains on vulnerable Next.js 14.2.35. Upgrading `apps/control-panel-web` must be scheduled for Phase 2.

#### 1.3 `images.unoptimized: true` Assessment
- **Version Support**: Next.js 15 officially supports `images: { unoptimized: true }` in `next.config.mjs`.
- **Mechanism**:
  - When enabled, Next.js renders standard `<img>` tags pointing directly to raw image assets without routing through the `/_next/image` optimization endpoint.
  - Server-side image transcoding (resizing, WebP/AVIF format conversions) is completely bypassed.
- **Advisory Relationship (Defense in Depth vs. Full Fix)**:
  - Setting `images.unoptimized: true` is **defense in depth**, not a complete standalone fix.
  - Reason 1: The primary RCE flaw (`GHSA-2xp9-vwfh-vxw4`) resides within the underlying image decoding binary parser. Upgrading `next` to `>=15.5.24` provides the authoritative code patch.
  - Reason 2: `CVE-2026-75604` is an Unauthenticated RCE on Windows-hosted servers that affects Next.js server core routing/runtime independently of image optimization. `images.unoptimized: true` has zero mitigation effect on `CVE-2026-75604`.
  - Reason 3: `apps/control-panel-web` lacks this configuration and remains on 14.2.35.
  - **Verdict**: Combining `next@15.5.28` (authoritative code fix) with `images.unoptimized: true` (architectural defense in depth) provides defense in depth for `apps/web`.

---

### Item 2: CORS Origin Validation & Allowlist Review

#### 2.1 Complete CORS Callback & Origin Resolution Logic
Inspection of `apps/api/src/main.ts` (lines 20–60):
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

      // Allow exact matches in configured allowedOrigins or legitimate scoped OMNiGRC domains
      const isAllowed =
        allowedOrigins.includes(normalizedOrigin) ||
        /^https:\/\/([a-z0-9-]+\.)?omnigrc\.co$/.test(normalizedOrigin) ||
        /^https:\/\/([a-z0-9-]+-)?omnigrc[a-z0-9-]*\.vercel\.app$/.test(normalizedOrigin);

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
We cross-checked configured deployment origins across repository deployment manifests (`docker-compose.self-hosted.yml`, `apps/api/.env`, `apps/control-plane-api/src/main.ts`, `apps/web/src/lib/api-client.ts`):
1. **Production Frontend**: `https://app.omnigrc.co` — explicitly included in `defaultOrigins`.
2. **Production Control Plane**: `https://control.omnigrc.co` — explicitly included in `defaultOrigins`.
3. **Staging / Dynamic Deployments**: Injected via `process.env.APP_URL` and `process.env.FRONTEND_URL`, split on commas, and stripped of trailing slashes.
4. **Local Development**: `http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:3002`, `http://127.0.0.1:3002` — explicitly included.
5. **No Origin Header**: `if (!origin) return callback(null, true);` — correctly permits backend health checks (`/health`), server-to-server API clients, and curl requests.
6. **Unknown Origins**: Correctly logged with warning and passed `callback(null, false)`. In Express `cors` middleware with `credentials: true`, `callback(null, false)` prevents the emission of `Access-Control-Allow-Origin`, causing modern browsers to reject access to the response.
7. **Verdict**: **PASS** for core allowlist enforcement.

#### 2.3 Regex Security & Defect Identification (NEEDS REVIEW)
We evaluated the two regular expressions:
1. **Domain Check**: `/^https:\/\/([a-z0-9-]+\.)?omnigrc\.co$/`
   - Correctly anchors start (`^`) and end (`$`).
   - Requires HTTPS scheme.
   - Requires dot before `omnigrc.co`. Matches `https://omnigrc.co`, `https://app.omnigrc.co`, `https://staging.omnigrc.co`.
   - Rejects `https://attacker-omnigrc.co` and `https://omnigrc.co.attacker.com`.
   - **Status**: **PASS**.
2. **Vercel Preview Regex**: `/^https:\/\/([a-z0-9-]+-)?omnigrc[a-z0-9-]*\.vercel\.app$/`
   - **Specific Defect Confirmed**: The `.vercel.app` domain is a public, multi-tenant platform where project names are registered on a first-come, first-served basis.
   - Any external party or attacker can register a project such as `https://omnigrc-malicious.vercel.app` or `https://omnigrc-poc.vercel.app` on Vercel.
   - Because the regex matches `omnigrc[a-z0-9-]*\.vercel\.app`, requests from an attacker-controlled Vercel deployment would be accepted as trusted origins with `Access-Control-Allow-Credentials: true`!
   - **Status**: **NEEDS REVIEW / REPORTED DEFECT**.
   - **Recommended Remediation**: Remove the broad `.vercel.app` regex in production environments. Preview URLs should be passed explicitly via `FRONTEND_URL` during staging/preview deployments, or restricted to a private custom domain (e.g., `*.preview.omnigrc.co`).

---

### Item 3: Next.js 15 Compatibility Review

#### 3.1 Workspace Dependency Constraints
- **React Compatibility**:
  - `apps/web/package.json` specifies `"react": "^18.2.0"` and `"react-dom": "^18.2.0"`.
  - `apps/web/node_modules/next/package.json` peerDependencies specify:
    ```json
    "peerDependencies": {
      "react": "^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0",
      "react-dom": "^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0"
    }
    ```
  - Result: Next.js 15.5.28 officially supports React 18.2.0. No peer dependency conflicts exist.
- **Node.js Engine Constraint**:
  - `apps/web/package.json` specifies `"engines": { "node": "24.x" }`.
  - Next.js 15 officially supports Node.js `>= 18.18.0`.

#### 3.2 Breaking API Audit
- **`next/headers` Audit**: In Next.js 15, `cookies()` and `headers()` became async.
  - Verification: Grep search across `apps/web/src` confirmed **zero instances** of `next/headers`.
- **`next/navigation` Audit**:
  - Verified `useRouter`, `useSearchParams`, and `usePathname` in:
    - `apps/web/src/app/reports/page.tsx`
    - `apps/web/src/app/invite/accept/page.tsx`
    - `apps/web/src/app/approvals/page.tsx`
  - All three files declare `'use client';` at line 1. Client-side navigation hooks behave identically across Next.js 14 and 15.

#### 3.3 Targeted Verification Checks Run
1. **API Type Check**:
   - Command: `npx tsc -p apps/api/tsconfig.json --noEmit`
   - Result: **0 errors (Exit code 0)**.
2. **Web Component Test Suite**:
   - Command: `npm test --workspace=apps/web -- rag-status-badge.spec.tsx`
   - Result: **PASS (1 Suite Passed, 19 Tests Passed, Exit code 0)**.

---

### Item 4: Lockfile & Worktree Integrity

#### 4.1 Lockfile Consistency
- `package-lock.json` lockfileVersion is `3`.
- Verified that `packages["apps/web"]` points to `next: "^15.5.28"`.
- Verified that `packages["apps/web/node_modules/next"]` resolves to `version: "15.5.28"`.
- All secondary dependencies added to the lockfile (`sharp@0.35.5` and native `@img/sharp-*` optional platform bindings) are standard Next.js 15 image-pipeline and build dependencies.

#### 4.2 Worktree Preservation
A `git status --short` inspection confirms that only the planned Phase 1 remediation files and security assessment artifacts are present in the worktree:
```text
 M apps/api/src/main.ts
 M apps/web/next.config.mjs
 M apps/web/package.json
 M package-lock.json
?? security-assessment/
```
- No unrelated source files were modified.
- No git stashes, commits, resets, or reverts were performed.
- Pre-existing untracked assessment reports and evidence files were fully preserved.

---

## 3. Checks Executed & Tooling Evidence

| Check # | Tool / Command Executed | Target Scope | Output Summary |
| :---: | :--- | :--- | :--- |
| **1** | `git status --short` | Working tree | 4 modified files (`main.ts`, `next.config.mjs`, `package.json`, `package-lock.json`), 1 untracked directory (`security-assessment/`). |
| **2** | `git diff --stat` | Phase 1 Diff | 4 files changed, 970 insertions(+), 144 deletions(-). |
| **3** | `npm ls next` | Dependency tree | `@omnigrc/web`: `next@15.5.28`; `@omnigrc/control-panel-web`: `next@14.2.35`. |
| **4** | Custom Node.js inspection script | `package-lock.json` | Confirmed `apps/web/node_modules/next` = `15.5.28`, `node_modules/next` = `14.2.35`. |
| **5** | Custom Node.js inspection script | `trivy-vuln.json` | Extracted all 22 Next.js CVEs and verified fixed versions (`15.5.24` / `16.3.3`). |
| **6** | Custom Node.js inspection script | `next/package.json` | Confirmed peer dependencies: `react: "^18.2.0 || ^19.0.0"`. |
| **7** | `npx tsc -p apps/api/tsconfig.json --noEmit` | API TypeScript build | 0 compilation errors (Exit code 0). |
| **8** | `npm test --workspace=apps/web -- rag-status-badge.spec.tsx` | Web Jest unit tests | 19 passed, 0 failed (Exit code 0). |
| **9** | Source grep for `next/headers` | `apps/web/src` | 0 occurrences. |
| **10** | Source grep for `next/navigation` | `apps/web/src` | 3 occurrences; all within `'use client'` files. |

---

## 4. Remaining Risks & Recommended Next Steps

1. **Vercel Preview Regex Risk (Item 2 Defect)**:
   - **Risk**: External parties can create Vercel projects matching `https://omnigrc*.vercel.app` and receive credentialed CORS responses.
   - **Remediation**: Eliminate the `.vercel.app` regex or restrict it via environment variable configuration.
2. **Monorepo Control Panel Web Next.js Upgrade (Phase 2)**:
   - **Risk**: Root `node_modules/next` remains at `14.2.35` because `apps/control-panel-web/package.json` was out of scope for Phase 1.
   - **Remediation**: In Phase 2, update `apps/control-panel-web/package.json` to `"next": "^15.5.28"` and reconcile `package-lock.json`.
3. **Staging Deployment & Runtime Verification**:
   - **Risk**: Fixes currently exist only in local source code and package manifests.
   - **Remediation**: Deploy to a dedicated staging environment, test preflight `OPTIONS` requests from authorized and unauthorized origins, and verify Next.js standalone container startup.
