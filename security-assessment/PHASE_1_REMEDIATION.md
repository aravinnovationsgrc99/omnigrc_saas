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

1. **CORS Origin Validation Defect in Data Plane API** (`apps/api/src/main.ts`):
   - Eliminated the unsafe `callback(null, true)` origin reflection fallback.
   - Enforced a rigid allowlist of approved application origins (`localhost:3000`, `127.0.0.1:3000`, `localhost:3002`, `127.0.0.1:3002`, `app.omnigrc.co`, `control.omnigrc.co`, `process.env.APP_URL`, and `process.env.FRONTEND_URL`).
   - Removed broad multi-tenant Vercel preview regexes (`omnigrc*.vercel.app`) and arbitrary subdomain wildcard matching. Preview deployments must be explicitly configured via `FRONTEND_URL`.
2. **Next.js Framework Remote Code Execution** (`apps/web` & `apps/control-panel-web`):
   - Updated both frontend applications to `"next": "^15.5.28"`.
   - Reconciled `package-lock.json`, hoisting root `next` to `15.5.28` and completely eliminating vulnerable `next@14.2.35` (addressing `GHSA-2xp9-vwfh-vxw4` and `CVE-2026-75604`).
   - Applied `images: { unoptimized: true }` in `apps/web/next.config.mjs` as defense in depth.

---

## 2. Advisory & Code Verification Before Remediation

### 2.1 CORS Origin Handling
- **Pre-Remediation Code**: `apps/api/src/main.ts`:
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
- **React Compatibility Verified**: `peerDependencies` confirm `"react": "^18.2.0 || ^19.0.0"`. Because both frontend packages use React 18.2.0, Next.js 15.5.28 maintains full peer dependency compatibility without forcing a major React upgrade.

---

## 3. Files Modified & Exact Code Changes

### 3.1 `apps/api/src/main.ts`
- **Location**: `apps/api/src/main.ts` (lines 21–62)
- **Change Description**:
  1. Extracted and normalized `process.env.APP_URL` and `process.env.FRONTEND_URL`.
  2. Built an explicit `allowedOrigins` set containing local development ports (`3000`, `3002`), production hostnames (`https://app.omnigrc.co`, `https://control.omnigrc.co`), and configured environment URLs.
  3. Enforced strict exact-match origin validation: `allowedOrigins.includes(normalizedOrigin)`.
  4. Removed broad regexes that previously trusted arbitrary subdomains or `omnigrc*.vercel.app` deployments.
  5. Handled requests without `Origin` headers via `callback(null, true)` (permits curl, mobile apps, and health checks).
  6. Rejected unapproved browser origins via `logger.warn()` and `callback(null, false)`.

### 3.2 `apps/web/package.json` & `apps/web/next.config.mjs`
- **`apps/web/package.json`**: Upgraded `"next"` from `^14.1.0` to `^15.5.28`.
- **`apps/web/next.config.mjs`**: Added `images: { unoptimized: true }` to disable image transcoding at the route layer.

### 3.3 `apps/control-panel-web/package.json`
- **`apps/control-panel-web/package.json`**: Upgraded `"next"` from `^14.1.0` to `^15.5.28`.

### 3.4 `package-lock.json`
- **`package-lock.json`**: Reconciled workspace lockfile. Hoisted `node_modules/next` to `15.5.28`. Completely purged `14.2.35`.

---

## 4. Verification & Compatibility Results

| Target Scope | Check Executed | Result |
| :--- | :--- | :---: |
| **API TypeScript Build** | `npx tsc -p apps/api/tsconfig.json --noEmit` | **PASS (0 errors)** |
| **Control Panel Type Check** | `npx tsc -p apps/control-panel-web/tsconfig.json --noEmit` | **PASS (0 errors)** |
| **CORS Origin Validation** | Simulated test matrix (11 test cases) | **PASS (11/11 passed)** |
| **Control Panel Tests** | `npm test --workspace=@omnigrc/control-panel-web -- confirmation-dialog.spec.tsx` | **PASS (4/4 passed)** |
| **Web Component Tests** | `npm test --workspace=@omnigrc/web -- rag-status-badge.spec.tsx` | **PASS (19/19 passed)** |
| **Lockfile Audit** | `npm ls next` | **PASS (`15.5.28` across all workspaces)** |

---

## 5. Deployment Verification Checklist

Before deploying these changes to production:
1. **Staging Preflight Validation**:
   ```bash
   # Test authorized production origin (expect 204 / 200 with Access-Control-Allow-Origin)
   curl -I -X OPTIONS https://api.staging.omnigrc.co/health \
     -H "Origin: https://app.staging.omnigrc.co" \
     -H "Access-Control-Request-Method: GET"

   # Test unauthorized origin (expect response WITHOUT Access-Control-Allow-Origin)
   curl -I -X OPTIONS https://api.staging.omnigrc.co/health \
     -H "Origin: https://omnigrc-malicious.vercel.app" \
     -H "Access-Control-Request-Method: GET"
   ```
2. **Container Build Verification**: Build standalone Docker containers for `apps/web`, `apps/control-panel-web`, and `apps/api` using Node 20+ runtime base images.
