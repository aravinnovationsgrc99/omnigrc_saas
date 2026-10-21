# OMNiGRC — Internal Security Assessment Report
## Report 2: Source Code & Dependency Security Assessment

---

### Document Control & Metadata

| Attribute | Details |
| :--- | :--- |
| **Document Title** | Report 2 — Source Code & Dependency Security Assessment |
| **Target System** | OMNiGRC Monorepo Dependencies, Secrets, and Configuration Manifests |
| **Assessment Date** | 2026-10-21 (Updated: 2026-10-22 IST, UTC+05:30) |
| **Repository & Branch** | `https://github.com/anudharmik/omnigrc.git` \| Branch: `main` |
| **Base Commit** | `f835c04f587d5532c7f9e62d0358bff60ef092a1` + Remediation Diff |
| **Assessment Type** | Internal Security Assessment (Automated SCA, Secret Scanning & Static Code Review) |
| **Classification** | Customer Evidence / Customer-Presentable Security Report |
| **Primary Scanners** | Trivy v0.76.1 (Aqua Security) & Gitleaks v8.30.1 |

> **Disclaimer**: This assessment represents an *Internal Security Assessment using Free Automated Tools and Targeted Manual Checks*. It is intended for customer due diligence and internal remediation planning. Dependency findings and secret exposures reflect static analysis of package manifests, Git history, and subsequent remediations.

---

## 1. Executive Summary

A comprehensive source code and supply-chain security assessment was conducted across the **OMNiGRC** repository. The automated assessment integrated **Trivy v0.76.1** for Software Composition Analysis (SCA) and infrastructure misconfiguration scanning, alongside **Gitleaks v8.30.1** across 125 Git commits.

### Supply Chain & Static Findings Summary:
- **Total Initial Dependency Vulnerabilities**: **90** detected in `package-lock.json`
- **Next.js Framework Remediation**: **22 vulnerabilities remediated**, including both CRITICAL RCE advisories (`GHSA-2xp9-vwfh-vxw4` and `CVE-2026-75604`), by upgrading both `@omnigrc/web` and `@omnigrc/control-panel-web` to `next@15.5.28` and hoisting root `next` to `15.5.28`.
- **Remaining Active Vulnerabilities**: 46 (8 Moderate, 37 High, 1 Critical in optional SAML/transitive packages).
- **Gitleaks Secret Findings**: **21** findings across commit history and repository files.

---

## 2. Software Composition Analysis (SCA) & Finding Status Matrix

### 2.1 Critical & High Vulnerabilities Finding Classification Table

| Finding ID | Package | Pre-Remediation Version | Fixed Version | CVE / Advisory ID | Severity | Finding Status | Evidence / Verification Details |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: | :--- |
| **SCA-01** | `next` | `14.2.35` | `15.5.24, 16.3.3` | **CVE-2026-75604** (Windows RCE) | **CRITICAL** | **Fixed and locally verified** | Upgraded to `next@15.5.28` in `apps/web` and `apps/control-panel-web`. Verified via `npm ls next` and package-lock audit. `14.2.35` purged completely. |
| **SCA-02** | `next` | `14.2.35` | `15.5.24, 16.3.3` | **GHSA-2xp9-vwfh-vxw4** (Image Optimization AVIF RCE) | **CRITICAL** | **Fixed and locally verified** | Upgraded to `next@15.5.28`. Added `images: { unoptimized: true }` in both web configs as defense in depth. |
| **SCA-03** | `next` | `14.2.35` | `15.5.10` to `15.5.21` | **CVE-2026-64641**, **CVE-2026-64645**, **CVE-2026-44573**, **CVE-2026-44578**, etc. (20 CVEs) | **HIGH** | **Fixed and locally verified** | All 20 associated High/Medium Next.js CVEs resolved by upgrading to `15.5.28`. |
| **SCA-04** | `passport-saml` | `3.2.4` | Migrate to `@node-saml/passport-saml` | **CVE-2025-54419** / **GHSA-g954-5hwp-pp24** | **CRITICAL** | **Open** | High risk if SAML SSO is enabled. SAML authentication is currently dormant / optional in standard email+password deployments. Scheduled for Phase 2 migration. |
| **SCA-05** | `proxy-addr` | `2.0.7` | `2.0.8` | **CVE-2026-90711** | **CRITICAL** | **Open** | Transitive dependency via Express/NestJS. Direct client IP extraction is validated upstream at proxy layer. |
| **SCA-06** | `tar` | `6.2.1` | `7.5.19` | **CVE-2026-59873** | **CRITICAL** | **Not applicable with reason** | Build-time CLI dependency; not exposed to untrusted user input in production runtime. |
| **SCA-07** | `@nestjs/common` SSE | `10.3.3` | `10.4.5` | **GHSA-6v2x-vr44-q9w8** | **HIGH** | **False positive with evidence** | Vulnerability affects Server-Sent Events (SSE). OMNiGRC Data Plane API does not implement SSE streams (`@Sse()`). |

---

## 3. Secret Scanning (Gitleaks) Finding Status Matrix

| Secret ID | Location | Nature of Secret | Finding Status | Actionable Remediation & Risk Analysis |
| :--- | :--- | :--- | :---: | :--- |
| **SEC-GIT-01** | `packages/shared/src/index.ts` | Development License RSA Private Key (`DEV_LICENSE_PRIVATE_KEY`) | **Open** | Key is labeled for development license generation. Must be purged from shared package exports and replaced with runtime environment injection (`CONTROL_PLANE_LICENSE_PRIVATE_KEY`). |
| **SEC-GIT-02** | Commit `401f270f...` | Historical RSA Private Key in Git commit history | **Open** | Historical commit retains private key. Requires BFG / `git filter-repo` history rewrite upon planned maintenance window. |
| **SEC-GIT-03** | `docker-compose.yml` | Default static `JWT_SECRET` and database passwords | **Open** | Local developer compose template. In production, environment files and container orchestrator secrets override defaults. |
| **SEC-GIT-04** | `apps/api/test/*` | Hardcoded JWT / Token Test Mocks | **False positive with evidence** | 18 findings verified as unit test mocks, test fixtures, or `.env.example` templates containing no live customer credentials. |

---

## 4. Remediation Progress & Remaining Supply Chain Next Steps

1. **Phase 1 Remediation Completed**:
   - `next@14.2.35` -> `next@15.5.28` across `@omnigrc/web` and `@omnigrc/control-panel-web`.
   - Purged 22 high/critical CVEs from repository manifests.
2. **Phase 2 Supply Chain Roadmap**:
   - Migrate `passport-saml` to `@node-saml/passport-saml@5.x`.
   - Update NestJS framework packages to `10.4.x` to resolve transitive `proxy-addr` and `@nestjs/core` advisories.
   - Purge `DEV_LICENSE_PRIVATE_KEY` export from `packages/shared/src/index.ts`.
