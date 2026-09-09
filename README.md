# OMNiGRC — Multi-Tenant GRC SaaS Platform

OMNiGRC is an enterprise Governance, Risk, and Compliance (GRC) monorepo application built with Next.js 14, NestJS, Prisma, and PostgreSQL.

---

## Monorepo Architecture

- `/apps/web`: Next.js 14 App Router, TypeScript, Tailwind CSS, Lucide icons.
- `/apps/api`: NestJS REST API, Passport JWT Auth, RBAC guards, AsyncLocalStorage multi-tenant scoping, Prisma Client.
- `/packages/shared`: Shared TypeScript types, Enums, and Auth DTOs.

---

## Multi-Tenancy & Security Design

1. **Row-Level Scoping**: Every tenant model (`User`, `RegionalPod`, `AuditLogEntry`) carries an `organizationId` column. Query scoping is automatically applied in NestJS via `AsyncLocalStorage` tenant context & Prisma middleware.
2. **PostgreSQL RLS Defense-in-Depth**: Includes a migration SQL (`20260909000001_rls_policies`) configuring Postgres Row-Level Security policies matching SOW Section 13.2.
3. **Audit Trail Immutability**: `AuditLogsService` is write-only at the application layer. Per AI API Flow doc Section 5, audit logs store metadata only, never raw entity content.

---

## Risk Score Banding Thresholds

Risk scores are calculated server-side as `Likelihood (1–5) × Impact (1–5)` yielding values from 1 to 25.
The score-banding thresholds chosen for UI badge styling and filter categories are:

- **LOW (Teal `#0F6E6A` / `#E4F1F0`)**: Scores **1 – 6** (e.g. 1×1, 1×5, 2×3, 3×2)
- **MEDIUM (Amber `#B5750A` / `#FCEFD9`)**: Scores **8 – 12** (e.g. 2×4, 3×3, 3×4, 4×3)
- **HIGH (Rose `#B23A48` / `#F8E6E8`)**: Scores **15 – 25** (e.g. 3×5, 4×4, 4×5, 5×5)

To adjust these thresholds in the future:
- **Backend**: Modify `RisksService.getScoreBand()` in [`apps/api/src/risks/risks.service.ts`](file:///e:/Arav%20Innovations/omnigrc/apps/api/src/risks/risks.service.ts) and query filter logic in `findAll()`.
- **Frontend**: Update badge styles in [`apps/web/src/components/risks/risk-list-view.tsx`](file:///e:/Arav%20Innovations/omnigrc/apps/web/src/components/risks/risk-list-view.tsx) and matrix helpers in [`apps/web/src/components/risks/risk-heatmap.tsx`](file:///e:/Arav%20Innovations/omnigrc/apps/web/src/components/risks/risk-heatmap.tsx).

---

## Local Setup

Follow these manual steps to initialize your local PostgreSQL database, apply migrations, seed demo data, and run the monorepo dev servers.

### 1. Prerequisites
- Node.js >= 18
- PostgreSQL server running locally

### 2. Environment Setup
Copy the example environment files for both apps:

```bash
# In apps/api/
cp apps/api/.env.example apps/api/.env

# In apps/web/
cp apps/web/.env.example apps/web/.env
```

Ensure `DATABASE_URL` in `apps/api/.env` points to your local PostgreSQL instance:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/omnigrc?schema=public"
```

### 3. Database Creation & Migration

Create the PostgreSQL database named `omnigrc`:
```bash
createdb omnigrc
```

Run Prisma migrations against your PostgreSQL instance:
```bash
npx prisma migrate dev --schema=apps/api/prisma/schema.prisma
```

### 4. Database Seeding

Run the seed script to populate the initial demo Organization, Admin User, Regional Pods, and Core Frameworks:
```bash
npm run seed
```

Default Seed Credentials created:
- **Organization**: `Meridian Health Pvt. Ltd.`
- **Admin Email**: `admin@meridian.com`
- **Password**: `Admin@123456`

### 5. Running the Monorepo

To start both backend (`apps/api` on port `3001`) and frontend (`apps/web` on port `3000`) concurrently:

```bash
npm run dev
```

Alternatively, run each workspace individually:
```bash
# Start backend API (port 3001)
npm run dev --workspace=apps/api

# Start frontend Web App (port 3000)
npm run dev --workspace=apps/web
```

---

## Auth & Role-Based Access Control

- **Register**: `POST /auth/register` — Creates Organization + first `ADMIN` user + default Regional Pods.
- **Login**: `POST /auth/login` — Returns JWT Access Token (15m) + Refresh Token (7d).
- **Refresh**: `POST /auth/refresh` — Rotates tokens using valid Refresh Token.
- **Role Guard**: `@Roles(Role.ADMIN)` decorates administrative routes.
- **SSO/SAML Stub**: Located at `apps/api/src/auth/sso/saml.strategy.ts` (SOW Section 5.1).

---

## AI Provider Setup & Local Redis Queue

The Framework Library & Control Mapping pillar uses a two-tier AI provider layer backed by a BullMQ background job queue.

### 1. API Keys & Configuration
Configure API keys in `apps/api/.env`:

```env
# Gemini API Key (Tier 1 Routine Mappings ~80%)
GEMINI_API_KEY="your-gemini-api-key"

# Anthropic API Key (Tier 2 Escalations ~20%)
ANTHROPIC_API_KEY="your-anthropic-api-key"

# Redis Queue Connection
REDIS_URL="redis://localhost:6379"
```

- **Where to get keys**:
  - **Gemini**: Obtain from Google AI Studio ([aistudio.google.com](https://aistudio.google.com/)).
  - **Anthropic (Claude)**: Obtain from Anthropic Console ([console.anthropic.com](https://console.anthropic.com/)).

### 2. Mock AI Fallback Mode
If either key is absent or Redis is unreachable in local dev:
- The system automatically falls back to `MockAiProvider`, generating deterministic fake suggestions with zero API cost.
- If `ANTHROPIC_API_KEY` is missing, Tier 2 calls seamlessly route to Gemini or Mock mode.
- Log warnings indicate when mock mode or fallback routing is active.

### 3. Local Redis Server Setup
To run the BullMQ job queue with a live Redis instance:
```bash
# Option A: Run via Docker
docker run -d -p 6379:6379 --name omnigrc-redis redis:alpine

# Option B: Run via local Redis installation
redis-server
```
If Redis is not running, the application gracefully processes mapping jobs in an in-memory queue.
