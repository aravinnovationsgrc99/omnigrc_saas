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

---

## Compliance Board & Drag-and-Drop Accessibility

The Compliance Board (Phase 5) provides a 4-column Kanban workflow (**Not Started**, **In Progress**, **Under Review**, **Complete**) for tracking compliance activities across controls.

### Drag-and-Drop Interaction
- **Mouse Users**: Drag any task card and drop it onto a target column header or container. The status updates instantly and triggers a dedicated audit log entry (`COMPLIANCE_TASK_STATUS_CHANGED`).
- **Visual Feedback**: Dragged cards show a subtle shadow shift, while active column drop targets highlight with a colored border ring.

### Keyboard & Screen Reader Accessibility
- **Accessible Menu**: Every task card includes a quick-action status selector menu accessible via `Tab` key navigation.
- **Keyboard Shortcut**: Press `Enter` or `Space` on the task status menu button to open column options (**Move to In Progress**, **Move to Under Review**, etc.).
- **Immediate Dispatch**: Selecting an option dispatches the exact same status-change PATCH payload as mouse drag-and-drop, complete with audit trail logging.

---

## Notifications & Integrations Setup

OMNiGRC (Phase 7) provides a unified notifications and webhooks engine supporting Resend email delivery, Slack channel alerts, and structured stubs for Jira and Google Workspace.

### 1. Resend Email Provider Setup (`RESEND_API_KEY`)
Configure your Resend API Key in `apps/api/.env`:

```env
# Resend API Key for transactional emails
RESEND_API_KEY="re_123456789_your_resend_api_key"

# Optional Sender Address
RESEND_FROM="OMNiGRC Notifications <notifications@omnigrc.co>"
```

- **Obtaining a Key**: Sign up at [resend.com](https://resend.com), verify your domain, and generate an API key.
- **Mock Mode Fallback**: If `RESEND_API_KEY` is not present in `.env`, the system operates in **Mock Mode**, logging full email subjects, recipients, and HTML bodies to the NestJS server console with zero API call costs.

### 2. Slack Incoming Webhook Setup
To enable org-level critical alerts (`MAPPING_OVERRIDDEN`, `POD_STATUS_CHANGED`) in Slack:
1. Create an Incoming Webhook in your Slack Workspace ([api.slack.com/messaging/webhooks](https://api.slack.com/messaging/webhooks)).
2. Navigate to **Settings → Integrations** in the OMNiGRC Web App (signed in as `ADMIN`).
3. Paste your Webhook URL into the Slack card and click **Save Webhook**.
4. Click **Send Test Alert** to verify live message delivery.

### 3. Jira & Google Workspace Integrations
- Jira Software and Google Workspace are scaffolded as structured stubs in `/apps/api/src/integrations/jira/` and `/apps/api/src/integrations/google-workspace/`.
- Both folders contain an `IntegrationProvider` service stub, commented-out controller scaffold, and a `README.md` documenting required OAuth 2.0 scopes (`read:jira-work`, `write:jira-work`, `admin.directory.user.readonly`, `drive.readonly`).

---

## Pilot-Launch Readiness (Phase 8)

Phase 8 elevates OMNiGRC to production-credible status with end-to-end testing, observability, containerization, and a skippable POC onboarding wizard.

### 1. System Health Check & Observability
- Endpoint: `GET /health` (Public)
- Returns a comprehensive status matrix covering Database (`SELECT 1`), Redis ping/queue, Gemini/Claude AI keys, Resend Email, Slack Webhook, and Sentry DSN.
- Every HTTP request receives an auto-generated or passed `x-request-id` header for trace propagation across logs and Sentry error interceptors.

### 2. Testing Suite
- **Unit Tests**: Run service-layer unit tests covering tenant scoping and audit logging across all modules:
  ```bash
  npm test --workspace=apps/api
  ```
- **E2E Smoke Test**: Run the 8-phase straight-line integration test exercising registration, asset seeding, risk calculation, control mapping, task board status updates, audit exploration, and onboarding completion:
  ```bash
  npm run test:e2e --workspace=apps/api
  ```

### 3. Containerization & Deployment Stack
- **Docker Compose**: Start PostgreSQL, Redis, NestJS API, and Next.js Web concurrently:
  ```bash
  docker-compose up --build
  ```
- **Regional Deployment Environments**: Per-region `.env` templates are provided in `apps/api/`:
  - `.env.india.example` (Region: INDIA, ap-south-1)
  - `.env.uk.example` (Region: UK, eu-west-2)
  - `.env.eu.example` (Region: EU, eu-central-1)
  - `.env.australia.example` (Region: AUSTRALIA, ap-southeast-2)

### 4. POC Onboarding Wizard
- On first login after registration, new organization administrators are greeted by a non-blocking 4-step wizard:
  1. Primary Framework selection (ISO27001, SOC2, GDPR, DPDP, ISO42001, HIPAA).
  2. Quick CSV Asset import & batch seeding.
  3. Team invitations (ADMIN & ANALYST roles).
  4. Instant platform launch.
- The wizard is skippable at every step to ensure immediate platform access.


