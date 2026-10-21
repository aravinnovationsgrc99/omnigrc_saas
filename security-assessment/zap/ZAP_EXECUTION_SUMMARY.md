# OMNiGRC — OWASP ZAP Baseline Security Scan Execution Summary

**Document Title**: OWASP ZAP Baseline Security Scan Summary  
**Assessment Date**: 2026-10-21 (Execution Time: 20:40:04 – 20:46:35 IST, UTC+05:30)  
**Evaluation Scope**: Passive security baseline assessment of deployed public frontend applications  
**Scan Engine**: Official OWASP ZAP Baseline (`ghcr.io/zaproxy/zaproxy:stable`, ZAP Core v2.17.0)  
**Docker Engine**: Docker Desktop v4.81.0 (Engine v29.6.1, Linux container on Windows)  
**Methodology**: Passive HTTP response/header baseline inspection (`zap-baseline.py -m 3 -I`). Zero active payloads, fuzzing, brute force, or intrusive testing.

---

## 1. Executive Summary & Scan Status Matrix

Both authorized public frontend targets were confirmed reachable (HTTP 200) prior to execution and were scanned independently using the official OWASP ZAP container.

> [!IMPORTANT]
> **Scope & Methodology Disclosure**:
> - This assessment consists strictly of an automated, passive OWASP ZAP Baseline scan inspecting unauthenticated HTTP/HTTPS traffic.
> - **Zero application credentials were supplied**, and no authenticated sessions were crawled.
> - This scan does **not** constitute a certified VAPT, manual penetration test, or proof that the applications are free from vulnerabilities. Deeper business logic, tenant isolation, RBAC enforcement, and authenticated attack surfaces were not assessed by this tool.
> - The scan results reflect the **currently deployed live environment**, not unreleased local code commits.

| Target Application | Target URL | Reachability (Pre-Scan) | ZAP Exit Code | High | Medium | Low | Info | Overall Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Primary Frontend** | `https://app.omnigrc.co` | `200 OK` | `0` | 0 | 3 | 6 | 5 | **Completed (Warnings Detected)** |
| **Control-Panel Frontend** | `https://control.omnigrc.co` | `200 OK` | `0` | 0 | 5 | 2 | 5 | **Completed (Warnings Detected)** |

---

## 2. Detailed Findings by Target

### 2.1 Primary Web Frontend (`https://app.omnigrc.co`)
- **Scan Timestamp**: `20261021-204004`
- **Total URLs Analyzed**: 20
- **Alert Count**: High: 0 | Medium: 3 | Low: 6 | Informational: 5
- **Pass Rules**: 55 rules passed

#### Alert Breakdown:
| Risk Level | Alert Name | CWE | Instances | Target URLs / Notes |
| :--- | :--- | :---: | :---: | :--- |
| **Medium** | Content Security Policy (CSP) Header Not Set | CWE-693 | 3 | `https://app.omnigrc.co`, `/robots.txt`, `/sitemap.xml`. The live production deployment completely lacks a CSP header. |
| **Medium** | Cross-Domain Misconfiguration | CWE-264 | 5 | `https://app.omnigrc.co` and static JS/CSS chunks. CORS/Cross-domain policy requires tightening. |
| **Medium** | Missing Anti-clickjacking Header | CWE-1021 | 1 | `https://app.omnigrc.co`. Lacks `X-Frame-Options` or `frame-ancestors` directive, leaving the login/portal vulnerable to UI redressing (Clickjacking). |
| **Low** | X-Content-Type-Options Header Missing | CWE-693 | 5 | `https://app.omnigrc.co`, `/_next/static/css/*`, `/favicon.ico`. Missing `nosniff` header. |
| **Low** | Permissions Policy Header Not Set | CWE-693 | 5 | Static chunks and root route do not define explicit feature permissions (`camera`, `microphone`, `geolocation`). |
| **Low** | Cross-Origin-Embedder-Policy Header Missing or Invalid | CWE-693 | 1 | COEP header is not set. |
| **Low** | Cross-Origin-Opener-Policy Header Missing or Invalid | CWE-693 | 1 | COOP header is not set. |
| **Low** | Dangerous JS Functions | CWE-749 | 1 | `/_next/static/chunks/412-47385aa13efa98ec.js`. Use of dynamic execution primitives detected in client bundle. |
| **Low** | Timestamp Disclosure - Unix | CWE-497 | 5 | `/_next/static/chunks/891cff7f-0d97d68be649070a.js`. Client chunk contains embedded Unix epoch timestamp values. |
| **Info** | Modern Web Application | N/A | 3 | Next.js SPA routing identified. |
| **Info** | Re-examine Cache-control Directives | CWE-525 | 1 | Root document caching directives. |
| **Info** | Storable and Cacheable / Non-Cacheable Content | CWE-524 | 9 | Static Next.js bundle caching behavior. |
| **Info** | Retrieved from Cache | CWE-525 | 5 | Cache-hit responses. |

---

### 2.2 Control-Panel Frontend (`https://control.omnigrc.co`)
- **Scan Timestamp**: `20261021-204338`
- **Total URLs Analyzed**: 17
- **Alert Count**: High: 0 | Medium: 5 | Low: 2 | Informational: 5
- **Pass Rules**: 60 rules passed

#### Alert Breakdown:
| Risk Level | Alert Name | CWE | Instances | Target URLs / Notes |
| :--- | :--- | :---: | :---: | :--- |
| **Medium** | CSP: Failure to Define Directive with No Fallback | CWE-693 | 3 | `https://control.omnigrc.co`, `/robots.txt`, `/sitemap.xml`. Certain resource types lack explicit directive coverage. |
| **Medium** | CSP: `script-src unsafe-eval` | CWE-693 | 3 | Root and static routes. CSP permits `unsafe-eval`, significantly reducing XSS mitigation efficacy. |
| **Medium** | CSP: `script-src unsafe-inline` | CWE-693 | 3 | CSP allows inline scripts without cryptographic nonces or hashes. |
| **Medium** | CSP: `style-src unsafe-inline` | CWE-693 | 3 | CSP allows inline styles without hashes. |
| **Medium** | Cross-Domain Misconfiguration | CWE-264 | 5 | Static assets and routes exhibit cross-domain header misconfigurations. |
| **Low** | Cross-Origin-Embedder-Policy Header Missing or Invalid | CWE-693 | 1 | COEP header is not configured. |
| **Low** | Cross-Origin-Opener-Policy Header Missing or Invalid | CWE-693 | 1 | COOP header is not configured. |
| **Info** | Modern Web Application | N/A | 3 | React/Next.js single-page application framework detected. |
| **Info** | Cache-Control & Content Storability Notices | CWE-524 / 525 | 9 | Standard Next.js static asset caching notices. |

---

## 3. Comparison with Repository Source Configurations

The live OWASP ZAP scan directly validates the findings in our source-code assessment ([`security-assessment/Report_3_Security_Configuration_and_HTTP_Headers_Assessment.md`](file:///e:/Arav%20Innovations/omnigrc/security-assessment/Report_3_Security_Configuration_and_HTTP_Headers_Assessment.md)):
1. **`app.omnigrc.co` Header Gap**:
   - The live production deployment of `app.omnigrc.co` is completely missing `Content-Security-Policy`, `X-Frame-Options`, and `X-Content-Type-Options`.
   - **Recommended Action**: Deploy the Next.js header configuration from `apps/control-panel-web/next.config.mjs` into `apps/web/next.config.mjs` to inject strict CSP, HSTS, X-Frame-Options: DENY, and X-Content-Type-Options: nosniff into production.
2. **`control.omnigrc.co` CSP Hardening**:
   - The control panel already emits security headers (passing Anti-clickjacking, X-Content-Type-Options, HSTS, and Permissions-Policy), but its CSP currently specifies `'unsafe-eval'` and `'unsafe-inline'`.
   - **Recommended Action**: Refactor Next.js script loading to utilize nonces (`'nonce-...'`) and eliminate `'unsafe-eval'`.

---

## 4. Evidence Files & Artifact Locations

All raw machine-readable JSON and human-readable HTML reports generated by OWASP ZAP have been preserved under [`security-assessment/zap/`](file:///e:/Arav%20Innovations/omnigrc/security-assessment/zap/):

| Target | Format | File Path | File Size |
| :--- | :---: | :--- | :---: |
| **Primary Frontend** | HTML | [`security-assessment/zap/zap-frontend-20261021-204004.html`](file:///e:/Arav%20Innovations/omnigrc/security-assessment/zap/zap-frontend-20261021-204004.html) | ~102 KB |
| **Primary Frontend** | JSON | [`security-assessment/zap/zap-frontend-20261021-204004.json`](file:///e:/Arav%20Innovations/omnigrc/security-assessment/zap/zap-frontend-20261021-204004.json) | ~40 KB |
| **Control Panel** | HTML | [`security-assessment/zap/zap-control-20261021-204338.html`](file:///e:/Arav%20Innovations/omnigrc/security-assessment/zap/zap-control-20261021-204338.html) | ~93 KB |
| **Control Panel** | JSON | [`security-assessment/zap/zap-control-20261021-204338.json`](file:///e:/Arav%20Innovations/omnigrc/security-assessment/zap/zap-control-20261021-204338.json) | ~37 KB |
| **Execution Summary** | Markdown | [`security-assessment/zap/ZAP_EXECUTION_SUMMARY.md`](file:///e:/Arav%20Innovations/omnigrc/security-assessment/zap/ZAP_EXECUTION_SUMMARY.md) | This Document |

---

## 5. Assessment Limitations

1. **Authentication Not Tested**: Scans operated strictly without credentials. Authenticated admin, operator, and customer views were not analyzed by ZAP.
2. **API Data Plane Not Scanned**: Only web frontends were in scope. REST APIs (`api.omnigrc.co` and `control-api.omnigrc.co`) were not crawled.
3. **No Active Exploitation**: The Baseline scan executes passive response parsing only. SQL injection, blind SSRF, RCE, race conditions, and business logic flaws require authenticated active testing in a dedicated staging environment.
