# OMNiGRC — Internal Security Assessment Report
## Report 3: Security Configuration & HTTP Headers Assessment

---

### Document Control & Metadata

| Attribute | Details |
| :--- | :--- |
| **Document Title** | Report 3 — Security Configuration & HTTP Headers Assessment |
| **Target System** | OMNiGRC Reverse Proxy, Web Frontend, and API HTTP Transport Layer |
| **Assessment Date** | 2026-10-21 (Timezone: Asia/Kolkata, UTC+05:30) |
| **Repository & Branch** | `https://github.com/anudharmik/omnigrc.git` \| Branch: `main` |
| **Commit Identifier** | `f835c04f587d5532c7f9e62d0358bff60ef092a1` |
| **Assessment Type** | Internal Security Assessment (Transport Layer & Header Configuration Audit) |
| **Classification** | Customer Evidence / Customer-Presentable Security Report |
| **Evaluation Standard** | Mozilla HTTP Observatory Standards, OWASP Secure Headers Project |

> **Disclaimer**: This assessment represents an *Internal Security Assessment using Free Automated Tools and Targeted Manual Checks*. It evaluates transport configuration, proxy rules, and HTTP response header policies as implemented in the codebase and infrastructure manifests.

---

## 1. Executive Summary

A transport-layer security and HTTP header configuration assessment was performed for the **OMNiGRC** platform. The review covered the reverse proxy configuration (`nginx.conf`), frontend application headers (`apps/web/next.config.mjs`), API server security middleware (`apps/api/src/main.ts`), and Control Plane API server setup (`apps/control-plane-api/src/main.ts`).

### Key Assessment Findings:
1. **Missing Frontend Security Headers**: The Next.js frontend (`apps/web`) declares no custom security headers in `next.config.mjs`. Critical browser protections—including `Content-Security-Policy` (CSP), `Strict-Transport-Security` (HSTS), `X-Frame-Options`, and `Permissions-Policy`—are absent at the application layer.
2. **Plain HTTP and Missing TLS Redirection in Reverse Proxy**: The primary reverse proxy manifest (`nginx.conf`) only listens on port 80 (`listen 80;`), contains no SSL/TLS termination directives, does not enforce automatic HTTP-to-HTTPS redirection, and injects no defense-in-depth HTTP headers.
3. **Control Plane API Lacks Helmet Middleware**: While the Data Plane API (`apps/api`) implements `helmet()`, the Control Plane API (`apps/control-plane-api`) omits Helmet entirely, serving responses without standard baseline security headers.
4. **Projected Mozilla HTTP Observatory Score**:
   - **Frontend Web Application (`apps/web` behind default Nginx)**: **Grade F (0/100 to 15/100)** due to the absence of CSP, HSTS, and frame protection.
   - **Data Plane API (`apps/api`)**: **Grade C (50/100)** (benefits from Helmet defaults for non-HTML endpoints, but lacks HSTS on plain HTTP and has permissive CORS).
   - **Control Plane API (`apps/control-plane-api`)**: **Grade F (20/100)** (no security header middleware).

---

## 2. Assessment Scope, Target Selection & Tooling Limitations

### 2.1 Scope & Tool Execution Status

| Check | Tool / Standard | Target | Status | Reason / Limitations |
| :--- | :--- | :--- | :--- | :--- |
| **Live Mozilla HTTP Observatory Scan** | Mozilla HTTP Observatory API | Public Hostnames (`app.omnigrc.co`, `control.omnigrc.co`) | **NOT TESTED (BLOCKED)** | 1. No written authorization was provided to initiate scanning of public hostnames.<br>2. Constraint mandate: Do not submit private endpoints, unverified hostnames, or internal configurations to public scanning engines.<br>3. An offline, exhaustive source-code and configuration audit of headers was executed in place of a live scan. |
| **Reverse Proxy Configuration Audit** | Static Configuration Review | `nginx.conf` | **PASS / FINDING** | Evaluated port binding, proxy headers, buffer limits, and TLS redirection. |
| **Next.js Header Configuration Audit** | Static Configuration Review | `apps/web/next.config.mjs` | **PASS / FINDING** | Evaluated `headers()` pipeline, CSP, HSTS, and framing controls. |
| **NestJS API Header Review** | Static Source Code Audit | `apps/api`, `apps/control-plane-api` | **PASS / FINDING** | Evaluated `helmet()` middleware and CORS configurations. |

### 2.2 What Header Scanners Do and Do Not Test

- **What Scanners Test**: Presence, formatting, and strictness of HTTP response headers (`Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, cookie flags).
- **What Scanners DO NOT Test**: Application business logic, authentication bypasses, database tenant isolation, backend API authorization, or zero-day vulnerabilities in underlying runtimes. A high Observatory grade does not prove an application is secure.

---

## 3. Detailed HTTP Header Evaluation Matrix

### 3.1 Comprehensive Header Audit

| Security Header | Recommended Configuration | Current Status in `apps/web` | Current Status in `apps/api` | Current Status in `control-plane-api` | Practical Security Impact |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`Content-Security-Policy`** | `default-src 'self'; script-src 'self' 'nonce-...'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://api.omnigrc.co; frame-ancestors 'none';` | **MISSING** (Score penalty: -25) | **DISABLED** (Explicitly set `contentSecurityPolicy: false` — appropriate for JSON API) | **MISSING** | **High**: Without a strict CSP, any XSS vulnerability can load arbitrary external scripts and exfiltrate customer GRC data. |
| **`Strict-Transport-Security`** | `max-age=63072000; includeSubDomains; preload` | **MISSING** (Score penalty: -20) | Included by Helmet on HTTPS | **MISSING** | **High**: Users are vulnerable to SSL-stripping and man-in-the-middle (MITM) attacks if initial connection is HTTP. |
| **`X-Frame-Options`** | `DENY` (or `SAMEORIGIN`) | **MISSING** (Score penalty: -20) | `SAMEORIGIN` (via Helmet) | **MISSING** | **Medium**: Protects against clickjacking attacks where the web app is framed within a malicious page. |
| **`X-Content-Type-Options`** | `nosniff` | **MISSING** (Score penalty: -5) | `nosniff` (via Helmet) | **MISSING** | **Low-Medium**: Prevents MIME-type confusion attacks where executable scripts are masqueraded as images/documents. |
| **`Referrer-Policy`** | `strict-origin-when-cross-origin` | **MISSING** (Score penalty: -5) | `no-referrer` (via Helmet) | **MISSING** | **Low**: Prevents path and query parameters (which may contain invitation tokens) from leaking to third parties. |
| **`Permissions-Policy`** | `camera=(), microphone=(), geolocation=(), payment=()` | **MISSING** | **MISSING** | **MISSING** | **Low**: Restricts browser device APIs and hardware access within the application context. |
| **`Cross-Origin-Opener-Policy`** | `same-origin` | **MISSING** | Set by Helmet | **MISSING** | **Low**: Isolates browsing context from cross-origin popups and windows. |
| **`Cross-Origin-Resource-Policy`** | `same-origin` | **MISSING** | `same-origin` (via Helmet) | **MISSING** | Prevents cross-origin reads of static assets and data. |

---

## 4. Transport Security, Proxy & Cookie Analysis

### 4.1 Nginx Reverse Proxy Analysis (`nginx.conf`)

Inspection of `nginx.conf`:
```nginx
server {
    listen 80;
    server_name _;
    client_max_body_size 50M;

    # Route Data Plane API endpoints to NestJS container
    location ~ ^/(assets|risks|controls|compliance-tasks|auth|health|regional-pods|integrations|notifications|audit-log|license)(/|$) {
        proxy_pass http://api:4000;
        ...
    }
    location / {
        proxy_pass http://web:3000;
        ...
    }
}
```

#### Observations:
1. **Cleartext Transport**: The proxy listens exclusively on port 80 without TLS termination or automatic redirection to port 443. In production deployments, if Nginx is deployed as a standalone entry point, all traffic (passwords, JWT tokens, tenant evidence) travels unencrypted over the wire.
2. **Missing `add_header` Directives**: Nginx does not inject HSTS, frame protection, or content-type headers, leaving downstream responses dependent entirely on container configurations.
3. **Proxy Headers**: Properly forwards `X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto`, but because `proxy-addr` in the backend API was vulnerable to header spoofing (CVE-2026-90711), trusted proxy CIDR ranges must be strictly enforced.

---

### 4.2 Cookie Security & Session State Management

| Setting | Evaluation Standard | Observed Implementation | Finding & Risk Assessment |
| :--- | :--- | :--- | :--- |
| **Token Storage** | `HttpOnly; Secure; SameSite=Strict` Cookies | `window.localStorage` (`omnigrc_access_token`, `omnigrc_refresh_token`) | **FINDING**: Storing access and 7-day refresh tokens in `localStorage` invalidates cookie protections and makes tokens accessible to any XSS payload. |
| **Cookie Flags (where applicable)** | `Secure` attribute | N/A (Cookies not used for session tokens) | **FINDING**: If cookies are introduced for SSR or sessions, the `Secure` flag must be enforced so cookies are never transmitted over HTTP. |
| **SameSite Attribute** | `SameSite=Lax` or `Strict` | N/A | **FINDING**: CSRF defenses rely on Bearer tokens in headers, but when switching to cookies, `SameSite=Lax` or `Strict` must be mandated. |

---

## 5. Projected Mozilla HTTP Observatory Scorecards

### 5.1 Frontend Web Application (`apps/web` on `app.omnigrc.co`)
- **Projected Score**: **10 / 100**
- **Projected Grade**: **F**
- **Score Deductions Breakdown**:
  - `Content-Security-Policy`: Missing (-25 points)
  - `Strict-Transport-Security`: Missing (-20 points)
  - `X-Frame-Options`: Missing (-20 points)
  - `X-Content-Type-Options`: Missing (-5 points)
  - `Referrer-Policy`: Missing (-5 points)
  - `Permissions-Policy`: Missing (-5 points)

---

### 5.2 Data Plane API (`apps/api` on `api.omnigrc.co`)
- **Projected Score**: **55 / 100**
- **Projected Grade**: **C**
- **Evaluation**:
  - Benefits from `helmet()` in `apps/api/src/main.ts` (`X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection: 0`, `X-DNS-Prefetch-Control: off`).
  - Score reduced due to:
    - Missing HSTS if accessed directly over HTTP (-20 points)
    - CORS origin reflection fallback (`callback(null, true)`) allowing credentialed cross-origin access (-25 points)
    - Content-Security-Policy disabled (appropriate for JSON API, but penalized by raw web observatory rules).

---

### 5.3 Control Plane API (`apps/control-plane-api` on `control-api.omnigrc.co`)
- **Projected Score**: **20 / 100**
- **Projected Grade**: **F**
- **Score Deductions Breakdown**:
  - `helmet()` middleware is completely omitted from `apps/control-plane-api/src/main.ts`.
  - All standard HTTP security headers are missing from API responses.

---

## 6. Recommendations & Hardened Configuration Blueprints

### Blueprint 1: Hardened Next.js Security Headers (`apps/web/next.config.mjs`)

Add the `headers()` async function to inject a comprehensive security header suite:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@omnigrc/shared'],
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Refine with nonces in production
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://api.omnigrc.co https://*.omnigrc.co",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

---

### Blueprint 2: Hardened Nginx Reverse Proxy (`nginx.conf`)

Configure TLS termination, HTTPS redirection, and proxy security headers:

```nginx
# HTTP server — redirect all traffic to HTTPS
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name _;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    client_max_body_size 25M;

    # Global Transport & Defense-in-Depth Headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Route Data Plane API
    location ~ ^/(assets|risks|controls|compliance-tasks|auth|health|regional-pods|integrations|notifications|audit-log|license)(/|$) {
        proxy_pass http://api:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Route Web Frontend
    location / {
        proxy_pass http://web:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

---

### Blueprint 3: Control Plane API Helmet Integration (`apps/control-plane-api/src/main.ts`)

```typescript
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Apply Helmet security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // API server
      hsts: {
        maxAge: 63072000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  );
  ...
}
```

---

## 7. Configuration Status Summary Table

| Check Item | Target | Evaluation Status | Practical Impact | Action Priority |
| :--- | :--- | :--- | :--- | :--- |
| **HTTP Observatory Live Scan** | Live Public Endpoints | **NOT TESTED (BLOCKED)** | No written target authorization provided; prevented public scanning of internal systems. | Informational |
| **Next.js Security Headers** | `apps/web/next.config.mjs` | **FINDING** | Missing CSP, HSTS, X-Frame-Options, Permissions-Policy. | **P1 (High)** |
| **Nginx Cleartext Port 80** | `nginx.conf` | **FINDING** | No HTTPS redirect or TLS configuration in proxy manifest. | **P1 (High)** |
| **Control Plane Helmet Headers** | `apps/control-plane-api/src/main.ts` | **FINDING** | API responses omit baseline headers (X-Content-Type-Options, etc.). | **P2 (Medium)** |
| **Data Plane Helmet Headers** | `apps/api/src/main.ts` | **PASS** | Applied helmet middleware with baseline headers active. | Verified |
| **JWT Storage in LocalStorage** | `apps/web/src/lib/api-client.ts` | **FINDING** | Exposes tokens to client-side XSS exfiltration. | **P2 (Medium)** |
