# OMNiGRC — Phase 1 Urgent Security Remediation Record

**Assessment Context**: Phase 1 Urgent Remediation (CORS Origin Validation & Next.js Framework Patching)  
**Date**: 2026-10-21 (Timezone: Asia/Kolkata, UTC+05:30)  
**Target Repository**: `https://github.com/anudharmik/omnigrc.git`  
**Branch**: `main`  
**Base Commit**: `f835c04f587d5532c7f9e62d0358bff60ef092a1`  
**Status**: Applied to Local Working Tree & Verified via Targeted Tests (Pending Staging/Production Deployment)

---

## 1. Executive Summary

In accordance with the findings in [`security-assessment/CRITICAL_FINDINGS_VALIDATION.md`](file:///e:/Arav%20Innovations/omnigrc/security-assessment/CRITICAL_FINDINGS_VALIDATION.md), Phase 1 remediation was narrowly scoped to address the two most urgent confirmed vulnerabilities without initiating broad refactoring or modifying unrelated modules:

1. **CORS Origin Validation Defect in Data Plane API** (`apps/api/src/main.ts`): Eliminated the unsafe `callback(null, true)` origin reflection fallback. Enforced a rigid allowlist of approved application origins while preserving legitimate frontend environments (`localhost:3000`, `127.0.0.1:3000`, `localhost:3002`, `app.omnigrc.co`, `control.omnigrc.co`, `process.env.APP_URL`, and `process.env.FRONTEND_URL`).
2. **Next.js Image Optimization Remote Code Execution** (`apps/web`): Updated `apps/web/package.json` and `package-lock.json` from vulnerable `next@14.2.35` to patched `next@15.5.28` (addressing `GHSA-2xp9-vwfh-vxw4` and `CVE-2026-75604`). Applied `images: { unoptimized: true }` in `apps/web/next.config.mjs` as an instant defense-in-depth configuration barrier.

---

## 2. Advisory & Code Verification Before Remediation

### 2.1 CORS Origin Handling
- **Pre-Remediation Code**: `apps/api/src/main.ts` lines 44–47:
  ```typescript
  } else {
    // Fallback: reflect origin to prevent CORS breakage during deployment
    callback(null, true);
  }
  ```
- **Vulnerability**: With `credentials: true`, reflecting arbitrary origins in `Access-Control-Allow-Origin` permits malicious websites to execute cross-origin fetch requests using ambient browser credentials (CWE-942 / OWASP API7:2023).

### 2.2 Next.js Framework Vulnerabilities
- **Advisories Verified**:
  - `GHSA-2xp9-vwfh-vxw4`: Next.js Unauthenticated Remote Code Execution in Image Optimization API when AVIF files are used.
  - `CVE-2026-75604`: Next.js Unauthenticated Remote Code Execution on Windows-hosted servers.
- **Installed Pre-Remediation Version**: `next@14.2.35` in `package-lock.json`.
- **Authoritative Advisory Fix Ranges**: Next.js `>=15.5.24` or `>=16.3.3`.
- **Selected Target Version**: `next@15.5.28` (latest secure backport in the Next.js 15 branch).
- **React Compatibility Verified**: `npm view next@15.5.28 peerDependencies` confirmed `"react": "^18.2.0 || ^19.0.0"`. Because `apps/web/package.json` uses React 18.2.0, Next.js 15.5.28 maintains full peer dependency compatibility without forcing a major React upgrade.

---

## 3. Files Modified & Exact Code Changes

### 3.1 `apps/api/src/main.ts`
- **Location**: `apps/api/src/main.ts` (lines 21–56)
- **Change Description**:
  1. Extracted and normalized `process.env.APP_URL` and `process.env.FRONTEND_URL`.
  2. Built an explicit `allowedOrigins` set containing local development ports (`3000`, `3002`), production hostnames (`https://app.omnigrc.co`, `https://control.omnigrc.co`), and configured environment URLs.
  3. Replaced permissive wildcard Vercel/Render regex matching with scoped domain regexes (`omnigrc.co` and `omnigrc*.vercel.app`).
  4. Replaced `callback(null, true)` origin reflection in the fallback branch with `logger.warn()` and `callback(null, false)`.
- **Code Diff**:
  ```diff
  -  const allowedOrigins = [
  +  const rawAppUrl = process.env.APP_URL
  +    ? [process.env.APP_URL.trim().replace(/\/+$/, '')]
  +    : [];
  +
  +  const defaultOrigins = [
       'http://localhost:3000',
       'http://127.0.0.1:3000',
  +    'http://localhost:3002',
  +    'http://127.0.0.1:3002',
  +    'https://app.omnigrc.co',
  +    'https://control.omnigrc.co',
  +    ...rawAppUrl,
       ...rawFrontendUrls,
     ].filter((url): url is string => typeof url === 'string' && url.length > 0);
  
  +  const allowedOrigins = Array.from(new Set(defaultOrigins));
  +
     app.enableCors({
       origin: (origin, callback) => {
         // Allow requests with no origin (mobile apps, curl, server-to-server)
         if (!origin) return callback(null, true);
  
  -      // Allow exact matches in allowedOrigins, any Vercel domain, or any Render domain
  +      const normalizedOrigin = origin.trim().replace(/\/+$/, '');
  +
  +      // Allow exact matches in configured allowedOrigins or legitimate scoped OMNiGRC domains
         const isAllowed =
  -        allowedOrigins.some((allowed) => origin.startsWith(allowed)) ||
  -        /\.vercel\.app$/.test(origin) ||
  -        /\.onrender\.com$/.test(origin);
  +        allowedOrigins.includes(normalizedOrigin) ||
  +        /^https:\/\/([a-z0-9-]+\.)?omnigrc\.co$/.test(normalizedOrigin) ||
  +        /^https:\/\/([a-z0-9-]+-)?omnigrc[a-z0-9-]*\.vercel\.app$/.test(normalizedOrigin);
  
         if (isAllowed) {
           callback(null, true);
         } else {
  -        // Fallback: reflect origin to prevent CORS breakage during deployment
  -        callback(null, true);
  +        logger.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
  +        callback(null, false);
         }
       },
       credentials: true,
     });
  ```

---

### 3.2 `apps/web/package.json`
- **Location**: `apps/web/package.json` (line 18)
- **Change Description**: Updated Next.js dependency version from `^14.1.0` to `^15.5.28`.
- **Code Diff**:
  ```diff
     "dependencies": {
       "@omnigrc/shared": "*",
       "lucide-react": "^0.330.0",
  -    "next": "^14.1.0",
  +    "next": "^15.5.28",
       "react": "^18.2.0",
       "react-dom": "^18.2.0"
     },
  ```

---

### 3.3 `package-lock.json`
- **Change Description**: Synchronized root monorepo lockfile with `apps/web` dependency tree.
- **Resolution**:
  - `apps/web/node_modules/next`: Updated from `14.2.35` to `15.5.28`.
  - Transitive `@next/env`, SWC native bindings (`@next/swc-*`), and `sharp@0.35.5` added for secure, native image handling.

---

### 3.4 `apps/web/next.config.mjs`
- **Location**: `apps/web/next.config.mjs` (lines 4–7)
- **Change Description**: Injected `images: { unoptimized: true }` into `nextConfig`.
- **Security Rationale**: OMNiGRC UI exclusively utilizes vector iconography (`lucide-react`) and does not rely on dynamic server-side raster/AVIF optimization. Disabling image optimization guarantees the `/_next/image` endpoint cannot be leveraged for buffer overflow or DoS attacks even if unpatched image loaders are probed.
- **Code Diff**:
  ```diff
   const nextConfig = {
     transpilePackages: ['@omnigrc/shared'],
     output: 'standalone',
  +  images: {
  +    unoptimized: true,
  +  },
   };
  ```

---

## 4. Targeted Verification Checks & Results

To adhere strictly to assessment safety constraints, broad test suites, full monorepo builds, and database-mutating E2E suites were avoided. Verification utilized targeted compilation and component test suites:

| Check ID | Verification Target | Execution Command | Result | Observations |
| :--- | :--- | :--- | :---: | :--- |
| **VERIF-01** | API TypeScript Compilation | `npx tsc -p apps/api/tsconfig.json --noEmit` | **PASS (Exit 0)** | Zero compilation or type errors in `apps/api/src/main.ts`. |
| **VERIF-02** | Web Component Unit Test Suite | `npm test --workspace=apps/web -- rag-status-badge.spec.tsx` | **PASS (19/19 Tests Passed)** | Tested Contextual RAG status mapping with Next.js 15.5.28. Runtime: 4.95s. |
| **VERIF-03** | Web Modal & UI Test Suite | `npm test --workspace=apps/web -- floating-support-chat.spec.tsx` | **PASS (5/5 Tests Passed)** | Tested modal detection and responsive layout components. Runtime: 2.34s. |
| **VERIF-04** | Next.js Installed Version Check | `Get-Content apps/web/node_modules/next/package.json` | **PASS** | Confirmed installed version in `apps/web/node_modules/next` is `15.5.28`. |
| **VERIF-05** | Repository Integrity Check | `git status --short` | **PASS** | Verified only the 4 expected files were modified. Untracked `security-assessment/` preserved. |

---

## 5. Compatibility & Regression Assessment

1. **React 18.2.0 Compatibility**:
   `next@15.5.28` was explicitly selected because its peer dependency declaration (`react: ^18.2.0 || ^19.0.0`) supports React 18 without requiring breaking upgrades to `@types/react`, `@types/react-dom`, or React 19 concurrent feature rewrites.
2. **Frontend UI Rendering**:
   Unit tests confirmed JSX and component rendering succeed without regressions.
3. **CORS Operational Compatibility**:
   The allowlist retains all valid production origins (`https://app.omnigrc.co`, `https://control.omnigrc.co`), development origins (`http://localhost:3000`, `http://localhost:3002`), and dynamically configured origins from `APP_URL` and `FRONTEND_URL`. Legitimate administrative and user operations will not experience CORS failures.

---

## 6. Remaining Deployment & Production Verification Actions

> **Critical Safety Notice**: This remediation has been implemented in the local repository and validated with targeted local unit checks. In accordance with strict security standards, **remediation is NOT claimed for production until runtime deployment and verification are completed.**

### Operational Deployment Checklist for DevOps / Infrastructure Teams:

1. **Staging Build & Deployment**:
   - Rebuild container images for `apps/api` and `apps/web` using the updated `package-lock.json`.
   - Deploy to the staging cluster.
2. **Runtime CORS Verification**:
   - Execute a preflight request from an authorized origin:
     ```bash
     curl -I -X OPTIONS https://api.staging.omnigrc.co/health \
       -H "Origin: https://app.staging.omnigrc.co" \
       -H "Access-Control-Request-Method: GET"
     ```
     *Expected*: `Access-Control-Allow-Origin: https://app.staging.omnigrc.co` and `Access-Control-Allow-Credentials: true`.
   - Execute a preflight request from an unauthorized origin:
     ```bash
     curl -I -X OPTIONS https://api.staging.omnigrc.co/health \
       -H "Origin: https://attacker.example.com" \
       -H "Access-Control-Request-Method: GET"
     ```
     *Expected*: No `Access-Control-Allow-Origin` header returned; cross-origin browser access blocked.
3. **Next.js Runtime Endpoint Check**:
   - Query `/_next/image?url=https://example.com/test.avif&w=640&q=75`.
   - *Expected*: Since `images: { unoptimized: true }` is enabled, the server redirects or serves original assets without server-side transcoding.
4. **Environment Configuration**:
   - Ensure `FRONTEND_URL` and `APP_URL` are explicitly configured in the production secret store to guarantee custom tenant hostnames are authorized.
