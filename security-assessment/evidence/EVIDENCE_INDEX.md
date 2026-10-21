# OMNiGRC — Security Evidence Index & Integrity Manifest

**Assessment Date**: 2026-10-21 (Asia/Kolkata, UTC+05:30)  
**Repository**: `https://github.com/anudharmik/omnigrc.git`  
**Branch**: `main`  
**Commit Hash**: `f835c04f587d5532c7f9e62d0358bff60ef092a1`  
**Assessment Type**: Internal Security Assessment (Free Automated Scanners & Targeted Manual Code Review)

---

## Evidence Manifest

| File Name | Tool / Generator | Version | Format | Description | Findings Count |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `trivy-vuln.json` | Trivy (Aqua Security) | 0.76.1 | JSON (Machine-Readable) | Comprehensive dependency & lockfile vulnerability scan | 90 vulnerabilities (5 Critical, 46 High, 32 Medium, 7 Low) |
| `trivy-vuln.txt` | Trivy (Aqua Security) | 0.76.1 | Plaintext Table | Human-readable dependency vulnerability audit summary | Same as above |
| `trivy-config.json` | Trivy (Aqua Security) | 0.76.1 | JSON (Machine-Readable) | Infrastructure-as-Code & Dockerfile misconfiguration scan | 2 misconfigurations (2 Low) |
| `trivy-config.txt` | Trivy (Aqua Security) | 0.76.1 | Plaintext Table | Human-readable IaC/Dockerfile misconfiguration report | Same as above |
| `gitleaks-report.json` | Gitleaks | 8.30.1 | JSON (Machine-Readable, Redacted) | Repository & full Git history secret detection scan (`--redact`) | 21 potential secret findings |
| `gitleaks-summary.txt` | Gitleaks / Audit Script | 8.30.1 | Plaintext Summary | Rule ID, file path, and line number summary (safe, zero secrets) | 21 summarized entries |

---

## Tool Execution Details & Parameters

### 1. Trivy Filesystem Vulnerability Scanner
- **Binary**: Trivy v0.76.1
- **Command**: `trivy fs --scanners vuln --format json -o security-assessment/evidence/trivy-vuln.json .`
- **Vulnerability Database**: `mirror.gcr.io/aquasec/trivy-db:2` (Downloaded & updated: 2026-10-21T19:30:59+05:30)
- **Scope**: Root `package.json`, `package-lock.json`, monorepo workspaces (`apps/api`, `apps/web`, `apps/control-plane-api`, `apps/control-panel-web`, `packages/shared`).

### 2. Trivy Configuration Misconfiguration Scanner
- **Binary**: Trivy v0.76.1
- **Command**: `trivy config --format json -o security-assessment/evidence/trivy-config.json .`
- **Policies Bundle**: Aqua Security Builtin Dockerfile & Config Rules
- **Scope**: `apps/api/Dockerfile`, `apps/web/Dockerfile`, `docker-compose.yml`, `docker-compose.self-hosted.yml`.

### 3. Gitleaks Secret Detector
- **Binary**: Gitleaks v8.30.1
- **Command**: `gitleaks detect --source="." --report-path="security-assessment/evidence/gitleaks-report.json" --report-format=json --redact --exit-code=0`
- **Commits Scanned**: 125 commits (entire Git history from repository inception to `f835c04f...`)
- **Data Scanned**: ~6.47 MB
- **Redaction**: Enabled (`--redact`), ensuring no raw secret values are persisted in the evidence report.

---

## Verification & Integrity Note
All evidence files are preserved in their native, unaltered scanner formats. Redaction flags were enforced at generation time to protect credential confidentiality in customer-facing and third-party contexts.
