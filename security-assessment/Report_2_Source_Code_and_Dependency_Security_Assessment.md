# OMNiGRC — Internal Security Assessment Report
## Report 2: Source Code & Dependency Security Assessment

---

### Document Control & Metadata

| Attribute | Details |
| :--- | :--- |
| **Document Title** | Report 2 — Source Code & Dependency Security Assessment |
| **Target System** | OMNiGRC Monorepo Dependencies, Secrets, and Configuration Manifests |
| **Assessment Date** | 2026-10-21 (Timezone: Asia/Kolkata, UTC+05:30) |
| **Repository & Branch** | `https://github.com/anudharmik/omnigrc.git` \| Branch: `main` |
| **Commit Identifier** | `f835c04f587d5532c7f9e62d0358bff60ef092a1` |
| **Assessment Type** | Internal Security Assessment (Automated SCA, Secret Scanning & Static Code Review) |
| **Classification** | Customer Evidence / Customer-Presentable Security Report |
| **Primary Scanners** | Trivy v0.76.1 (Aqua Security) & Gitleaks v8.30.1 |

> **Disclaimer**: This assessment represents an *Internal Security Assessment using Free Automated Tools and Targeted Manual Checks*. It is intended for customer due diligence and internal remediation planning. Dependency findings and secret exposures reflect static analysis of package manifests and Git history at the stated commit.

---

## 1. Executive Summary

A comprehensive source code and supply-chain security assessment was conducted across the **OMNiGRC** repository. The automated assessment integrated **Trivy v0.76.1** for Software Composition Analysis (SCA) and infrastructure misconfiguration scanning, alongside **Gitleaks v8.30.1** across 125 Git commits.

### Supply Chain & Static Findings Summary:
- **Total Dependency Vulnerabilities**: **90** detected in `package-lock.json`
  - **CRITICAL**: 5
  - **HIGH**: 46
  - **MEDIUM**: 32
  - **LOW**: 7
- **Infrastructure Misconfigurations**: **2** low-severity findings in Dockerfiles (missing `HEALTHCHECK` directive).
- **Gitleaks Secret Findings**: **21** findings across commit history and repository files.
  - **Confirmed Historical Exposure**: 1 private key committed in historical commit `401f270f...` in `packages/shared/src/index.ts`.
  - **Hardcoded Development Fallback Keys**: 2 findings in application files (`license-signing.service.ts` and `grc-intelligence-chat.service.ts`).
  - **False Positives / Test Fixtures**: 18 findings verified as unit test mocks, redaction test fixtures, or `.env.example` templates.

---

## 2. Software Composition Analysis (SCA) — Trivy Vulnerability Scan

**Target**: `package-lock.json` (npm ecosystem)  
**Database**: Aqua Security Vulnerability Database (`mirror.gcr.io/aquasec/trivy-db:2`)  
**Raw Evidence Reference**: `security-assessment/evidence/trivy-vuln.json` & `security-assessment/evidence/trivy-vuln.txt`

### 2.1 Critical Vulnerabilities Breakdown

| Package | Installed Version | Fixed Version | Vulnerability ID | Title & CVE Summary | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`next`** | 14.2.35 | 15.5.24, 16.3.3 | **CVE-2026-75604** | **Unauthenticated Remote Code Execution on Windows servers**: Crafted request routing allows arbitrary command execution. | **FINDING** |
| **`next`** | 14.2.35 | 15.5.24, 16.3.3 | **GHSA-2xp9-vwfh-vxw4** | **Unauthenticated RCE in Image Optimization API**: Malicious AVIF file processing triggers buffer overflow / arbitrary code execution. | **FINDING** |
| **`passport-saml`** | 3.2.4 | N/A (Migrate to `@node-saml/passport-saml` 5.x) | **CVE-2025-54419** | **Node-SAML Cryptographic Signature Bypass**: Flawed XML assertion verification allows SAML identity spoofing. | **FINDING** |
| **`proxy-addr`** | 2.0.7 | 2.0.8 | **CVE-2026-90711** | **Client IP Header Spoofing**: Crafted `X-Forwarded-For` headers bypass trusted proxy validation, subverting rate limiting and IP audits. | **FINDING** |
| **`tar`** | 6.2.1 | 7.5.19 | **CVE-2026-59873** | **node-tar Denial of Service**: Uncontrolled memory and CPU exhaustion via crafted gzip archive decompression bomb. | **FINDING** |

---

### 2.2 Key High-Severity Vulnerabilities Breakdown

| Package | Installed Version | Vulnerability IDs | Summary of Impact | Fixed Version | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`@xmldom/xmldom`** | 0.7.13 | CVE-2026-34601, CVE-2026-41672, CVE-2026-41673, CVE-2026-41674, CVE-2026-41675, CVE-2026-83605, CVE-2026-83607, CVE-2026-83608, CVE-2026-83613, CVE-2026-83614, CVE-2026-83615, CVE-2026-83616, CVE-2026-83619 | Deeply nested XML structure injection, node injection, quadratic-time parsing denial of service, and cross-site scripting via unvalidated element names. | 0.8.15, 0.9.12 | **FINDING** |
| **`multer`** | 2.0.2 | CVE-2026-2359, CVE-2026-3304, CVE-2026-3520, CVE-2026-5079, CVE-2026-77078, CVE-2026-82333 | Multiple Denial of Service flaws triggered by deeply nested multipart field names, dropped connections, and oversized array indices. | 2.3.0 | **FINDING** |
| **`glob`** | 10.4.5 | CVE-2025-64756 | Command Injection Vulnerability via crafted filenames during pattern matching. | 10.5.0, 11.1.0 | **FINDING** |
| **`brace-expansion`** | 1.1.18, 2.1.4 | CVE-2026-102276, CVE-2026-102278 | Denial of Service via stack exhaustion and uncontrolled recursion from crafted nested brace patterns. | 1.1.20, 2.1.6 | **FINDING** |
| **`braces`** | 3.0.3 | CVE-2026-93687 | Stack overflow Denial of Service from deeply nested regex patterns. | Vendor advisory pending | **FINDING** |
| **`next`** | 14.2.35 | CVE-2026-44573, CVE-2026-44578, CVE-2026-64641 | Information disclosure via middleware bypass, SSRF via crafted WebSocket upgrade requests, and DoS via App Router requests. | 15.5.21, 16.2.11 | **FINDING** |

---

### 2.3 Key Medium-Severity Vulnerabilities Breakdown

| Package | Installed Version | Vulnerability ID | Summary of Impact | Fixed Version | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`@nestjs/core`** | 10.4.22 | CVE-2026-35515 | Server-Sent Events (SSE) injection and message spoofing via unsanitized newline characters. | 11.1.18 | **FINDING** |
| **`ajv`** | 8.12.0 | CVE-2025-69873 | Regular Expression Denial of Service (ReDoS) via `$data` reference schema resolution. | 8.18.0 | **FINDING** |
| **`file-type`** | 20.4.1 | CVE-2026-31808, CVE-2026-32630 | Infinite loop and excessive memory growth in file signature analysis during archive inspection. | 21.3.2 | **FINDING** |
| **`multer`** | 2.0.2 | CVE-2026-5038 | Denial of Service via aborted or malformed multipart file upload streams. | 2.2.0 | **FINDING** |

---

## 3. Infrastructure & Container Configuration — Trivy Misconfiguration Scan

**Targets Scanned**: `apps/api/Dockerfile`, `apps/web/Dockerfile`, `docker-compose.yml`, `docker-compose.self-hosted.yml`  
**Raw Evidence Reference**: `security-assessment/evidence/trivy-config.json` & `security-assessment/evidence/trivy-config.txt`

| Target File | Check ID | Severity | Policy Title | Assessment Finding | Recommended Fix |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `apps/api/Dockerfile` | **DS-0026** | **LOW** | Add HEALTHCHECK instruction | Docker image does not declare an in-container `HEALTHCHECK` directive. | Add `HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://localhost:4000/health \|\| exit 1` to Dockerfile. |
| `apps/web/Dockerfile` | **DS-0026** | **LOW** | Add HEALTHCHECK instruction | Docker image does not declare an in-container `HEALTHCHECK` directive. | Add `HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://localhost:3000/api/health \|\| exit 1` to Dockerfile. |

---

## 4. Secret Exposure Analysis — Gitleaks Scan Results

**Tool**: Gitleaks v8.30.1 (`--redact` mode enforced)  
**Commits Evaluated**: 125 commits (entire Git history)  
**Raw Evidence Reference**: `security-assessment/evidence/gitleaks-report.json` & `security-assessment/evidence/gitleaks-summary.txt`

> **Customer Safety Note**: In compliance with strict assessment standards, all secret values have been redacted (`REDACTED`) to prevent credential leakage in customer reports.

### 4.1 Detailed Findings Classification Table

| # | Secret Category / Rule ID | Affected File & Line Number | Commit Hash | Classification | Verification & Practical Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `private-key` | `packages/shared/src/index.ts` : L1086 | `401f270f...` | **CONFIRMED EXPOSURE (HISTORICAL)** | **High Risk**: A private key was committed into Git history in commit `401f270f...`. While the current working tree has replaced this file with clean DTO interfaces, the key remains extractable from Git history. If this key was ever used in production, it must be invalidated and rotated immediately. |
| **2** | `private-key` | `apps/control-plane-api/src/licenses/license-signing.service.ts` : L16 | Working Tree | **NEEDS REVIEW / DEV FALLBACK** | **High Risk**: Static development fallback RSA private key embedded in source code. Used if `LICENSE_SIGNING_PRIVATE_KEY` is not provided. Must be strictly prohibited in production and injected via AWS Secrets Manager or HashiCorp Vault. |
| **3** | `generic-api-key` | `apps/api/src/controls/ai/grc-intelligence-chat.service.ts` : L65, 143, 149 | Working Tree | **NEEDS REVIEW / DEV FALLBACK** | **Medium Risk**: Static fallback string pattern for mock AI service. Ensure live production keys are exclusively loaded via environment variables. |
| **4** | `generic-api-key` | `apps/control-plane-api/src/auth/operator-auth.service.spec.ts` : L215, 238 | `main` | **FALSE POSITIVE (TEST MOCK)** | Unit test mock fixture verifying operator token hashing. No production credentials involved. |
| **5** | `generic-api-key` | `apps/control-plane-api/src/deployments/deployments.service.spec.ts` : L158 | `main` | **FALSE POSITIVE (TEST MOCK)** | Synthetic test deployment secret used in unit test suite. |
| **6** | `generic-api-key` | `apps/api/src/service-control/service-control-signal.service.spec.ts` : L11 | `main` | **FALSE POSITIVE (TEST MOCK)** | Synthetic test signal key. |
| **7** | `generic-api-key` | `apps/control-plane-api/src/audit/redaction.service.spec.ts` : L16 | `main` | **FALSE POSITIVE (TEST FIXTURE)** | Synthetic mock API key used specifically to test that the audit logger successfully redacts credentials from logs. |
| **8** | `stripe-access-token` | `apps/control-plane-api/src/audit/redaction.service.spec.ts` : L18 | `main` | **FALSE POSITIVE (TEST FIXTURE)** | Synthetic `sk_test_...` token fixture used specifically to verify that the RedactionService strips payment tokens from audit logs. |
| **9** | `generic-api-key` | `.env.self-hosted.example` : L18 | Working Tree | **FALSE POSITIVE (TEMPLATE)** | Documentation placeholder: `REGISTRATION_SECRET=example-shared-secret-change-me`. |
| **10** | `generic-api-key` | `apps/control-plane-api/test/control-plane-activation.e2e-spec.ts` : L235 | `main` | **FALSE POSITIVE (TEST MOCK)** | E2E integration test mock secret. |
| **11** | `generic-api-key` | `apps/control-plane-api/test/control-plane-deployment.e2e-spec.ts` : L120 | `main` | **FALSE POSITIVE (TEST MOCK)** | E2E integration test deployment secret. |
| **12** | `generic-api-key` | `apps/api/src/auth/auth.service.spec.ts` : L237 | `main` | **FALSE POSITIVE (TEST MOCK)** | Unit test synthetic token fixture. |
| **13-16** | `generic-api-key` | `apps/api/.env.{eu,uk,india,australia}.example` : L14 | Working Tree | **FALSE POSITIVE (TEMPLATE)** | Regional deployment configuration template placeholders. |
| **17** | `slack-webhook-url` | `apps/api/.env.example` : L27 | Working Tree | **FALSE POSITIVE (TEMPLATE)** | Example template webhook URL: `https://hooks.slack.com/services/T000...`. |
| **18** | `generic-api-key` | `apps/api/.env.example` : L15 | Working Tree | **FALSE POSITIVE (TEMPLATE)** | Example template placeholder. |

---

## 5. Prioritized Supply-Chain Remediation Roadmap

### Priority 1 (Immediate P0): Next.js Framework Upgrade
- **Action**: Upgrade `apps/web/package.json` dependency from `next@14.2.35` to `next@^15.5.24` (or `16.3.3`).
- **Remediation**: Eliminates critical unauthenticated Remote Code Execution vulnerabilities (CVE-2026-75604 and GHSA-2xp9-vwfh-vxw4).
- **Validation**: Re-run `trivy fs --scanners vuln .` and verify `next` RCE advisories are cleared.

### Priority 2 (Immediate P0): SAML Authentication Migration
- **Action**: Migrate `passport-saml@3.2.4` to the actively maintained `@node-saml/passport-saml` package.
- **Remediation**: Eliminates cryptographic signature verification bypass (CVE-2025-54419) in enterprise single sign-on workflows.

### Priority 3 (High P1): Reverse Proxy & Header Verification (`proxy-addr`)
- **Action**: Upgrade `proxy-addr` dependency to `>=2.0.8`.
- **Remediation**: Prevents IP address spoofing in audit logs and rate-limiting enforcement.

### Priority 4 (High P1): Git History Key Invalidation & Secrets Hygiene
- **Action**: 
  1. Invalidate any cryptographic key pair associated with historical commit `401f270f...`.
  2. Implement a pre-commit hook (e.g., using `gitleaks protect --staged`) in developer environments to block future commits containing high-entropy keys.
  3. Ensure `license-signing.service.ts` throws a fatal error at startup if `LICENSE_SIGNING_PRIVATE_KEY` is absent in production environments.

### Priority 5 (Medium P2): Multer & File Upload Parsing Hardening
- **Action**: Upgrade `multer` to `>=2.3.0` and `@xmldom/xmldom` to `>=0.9.12`.
- **Remediation**: Patches multipart denial of service and XML injection vectors.
