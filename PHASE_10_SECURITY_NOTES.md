# OMNiGRC — Phase 10 Security Hardening & Architecture Documentation

## Executive Summary

Phase 10 is the final V1 hardening phase for the OMNiGRC platform. This document outlines the hardened security posture, threat model mitigations, verified architectural boundaries, and known V1 design trade-offs.

---

## 1. Multi-Tenant Scoping & Identity Security

### JWT Context Verification (`TenantMiddleware`)
- **Fix (H5)**: Replaced unverified JWT decoding (`jwtService.decode()`) with full signature & expiration validation (`jwtService.verify()`) in `TenantMiddleware`.
- **Mitigation**: Prevents context-tampering attacks where an unauthenticated or expired JWT could inject an arbitrary `organizationId` into `TenantContext` to bypass Prisma database tenant-scoping middleware.

### MSSP Context-Switching & Token Replay
- **Security Control**: `switchContext()` strictly enforces child-tenant hierarchy (`parentOrganizationId === msspOrgId`).
- **Isolation**: MSSP Provider users cannot switch context into independent non-child organizations or other MSSP Provider orgs.
- **Refresh Token Safety**: Context tokens issued for MSSP delegation do not carry refresh tokens; `refreshToken()` drops `actingViaMsspId` claims, preventing persistent MSSP privilege escalation.

---

## 2. Control Plane Licensing & Signing Authority

### Control Plane Isolation & CORS
- **CORS Lockdown (H4)**: Control Plane API (`apps/control-plane-api`) restricts browser access (`origin: false` by default). The Control Plane operates strictly as a server-to-server internal licensing authority.
- **Signing Key Isolation & Fail-Closed Guard (H1, L1, Blocker 1)**: License signing private keys (Ed25519) reside exclusively on the Control Plane. Neither private keys nor signing logic exist in the Data Plane or shared packages (`@omnigrc/shared`). In `production`/`staging`, if `CONTROL_PLANE_LICENSE_SIGNING_PRIVATE_KEY` is not set, `LicenseSigningService` throws an `InternalServerErrorException` (fail-closed), preventing development private keys from signing production artifacts.

### Admin Guard Hardening & Configuration (`ControlPlaneAdminGuard`, Blocker 2)
- **Timing-Safe Comparison (H2)**: Admin authorization headers (`x-control-plane-admin-key` or `Authorization: Bearer <key>`) are compared using `crypto.timingSafeEqual()` with length normalization, eliminating timing oracle attacks.
- **Canonical Environment Configuration**: The canonical environment variable is `CONTROL_PLANE_ADMIN_KEY`.
- **Fail-Closed Strategy (H3)**: If `CONTROL_PLANE_ADMIN_KEY` is omitted in `production` or `staging`, `ControlPlaneAdminGuard` throws an `InternalServerErrorException` (fail-closed), preventing default key fallbacks. Environment template created at `apps/control-plane-api/.env.example`.

---

## 3. Data Plane Hardening & Edge Controls

### HTTP Security Headers (Helmet)
- **Security Headers (M3)**: Data Plane API includes `helmet` middleware setting `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, and cross-origin policies.

### Endpoint Rate Limiting (Throttling)
- **Brute Force Protection (M4)**: `@nestjs/throttler` enforces rate limits on sensitive authentication routes (`/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/invitations/accept`) capped at 10 requests per 60 seconds per IP.
- **Global & Probe Limits**: Global fallback rate limit set to 100 requests per 60 seconds. High-frequency health probes (`/health`) are explicitly exempted via `@SkipThrottle()`.

### Dev Secret Startup Warnings
- **Secret Inspection (M1)**: `apps/api` logs critical startup warnings when `JWT_SECRET` or `JWT_REFRESH_SECRET` match known default development strings in production/staging environments.

---

## 4. Background Processing & Queue Architecture Notes (M5)

- **BullMQ Dependency**: `bullmq` is installed in `apps/api` dependencies, and `onLicenseRenewed` lifecycle event hooks are declared in licensing services.
- **V1 Scope**: Worker processors and active background queue handlers are not instantiated in V1. Scheduled tasks use NestJS `@nestjs/schedule` for in-process periodic jobs where applicable.
- **Future Scale Path (V1.1+)**: When distributed queue workers are enabled in V1.1+, queue workers must inject `TenantContext` and respect `LicenseVerificationService` status checks prior to job execution.

---

## 5. Summary of Accepted V1 Design Trade-Offs

| Finding ID | Area | Description | Risk & Mitigation |
|---|---|---|---|
| **A1** | Self-Hosted Clock | Self-hosted instances control their host system clocks. | Tamper-proof clock is unachievable without hardware attestation. Mitigated by periodic online check-in verification with Control Plane. |
| **A2** | Offline License Cache | Isolated deployment without internet connection retains cached license state until process restart. | Intentional V1 design for air-gapped / offline deployments; mandatory heartbeat re-verification required once connectivity is restored. |
| **A3** | BullMQ Processing | Background job queues scaffolded but not executing jobs in V1. | No background job security bypass surface exists in V1 since no BullMQ workers are consuming tasks. |
