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
