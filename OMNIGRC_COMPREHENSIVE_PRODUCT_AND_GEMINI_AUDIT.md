# OMNiGRC comprehensive product and Gemini audit

Audit date: 2026-11-16. This is a source-level and targeted-runtime audit. It deliberately distinguishes inspected code from workflows that could not be exercised because a live database, authenticated browser session, or usable Gemini billing configuration was unavailable.

## A. Product-flow audit

### Architecture discovered

- `apps/web`: Next.js user application; its shared layout, navigation, page headers, searchable select, tables, drawers, and modal components form the principal user interface.
- `apps/api`: NestJS API with Prisma/PostgreSQL, tenant context, JWT authentication, RBAC/resource-scoping, service licensing, audit logging, notifications, BullMQ document/control jobs, evidence storage/scanning, and API modules.
- `apps/control-plane-api` and `apps/control-panel-web`: operator/deployment, licensing, organization-control, and system-health surfaces.
- `packages/shared`: common API contracts, enums, DTOs, and health types.

### Discovered modules and primary workflows

| Area | Main workflow observed | Audit state |
|---|---|---|
| Authentication, tenant, RBAC and licensing | JWT → tenant context/resource authorization → module capability checks | Inspected; no live login test |
| Dashboard and metrics | Tenant-scoped KPI/widget views and metrics endpoints | Inspected; no live data test |
| Assets, risks, controls and mappings | CRUD; asset/risk/control links; mapping queue; audit log | Inspected; ownership changes implemented for assets |
| Policies | CRUD/version/review/approval/publish/attest/import/export; AI draft and validation | Inspected; Gemini-only routing implemented |
| Evidence and document intelligence | Upload/scan/storage → extraction → analysis run → finding persistence | Inspected; see known defect below |
| Audits, findings and CAPA | Plans, assessments, evidence, findings, approval and remediation lifecycle | Inspected; no live lifecycle test |
| Compliance, frameworks and regulatory intelligence | Entitlements, obligations, mappings, gaps, remediation and impact analysis | Inspected; see known defect below |
| Vulnerabilities, incidents, remediation and notifications | CRUD, ownership, status/due-date escalation and task aggregation | Inspected; no live lifecycle test |
| Vendors/TPRM | Vendor intake → assessments/questionnaires/actions/documents/offboarding | Owner selector and server validation implemented for vendor intake |
| Organization members, departments, projects and directory | Member access, invitations, hierarchy and directory configuration | Inspected; used as selector data source |
| Reports, integrations, MSSP and control plane | Reports/exports, connector catalogue, tenant administration and operations | Inspected; no live integration test |

### Defects identified

1. Multiple production code paths could choose Claude even though Gemini-only operation was required.
2. The default Gemini model was the legacy `gemini-1.5-flash` identifier.
3. Vendor intake accepted a free-text business owner and stored it without server-side organization-member validation.
4. Asset UI exposed a **Custom / Team Name** field, allowing a new free-text assignment.
5. Regulatory impact analysis falls back to invented publication, controls, and findings when live data is absent. This is unsafe for a production GRC result.
6. The document-intelligence queue labels its analysis as AI but uses `generateDocumentFindings` deterministic output rather than invoking Gemini.

### Fixes implemented

- Removed the Claude provider, all Claude routing/injection, environment configuration, connector card, health field, control-plane reporting, documentation, and the Anthropic SDK dependency.
- Made Gemini the only external LLM provider in control mapping, GRC Intelligence, policy generation, and policy validation. Gemini failure now falls back only to clearly labeled deterministic/database-grounded behavior where that behavior already exists.
- Changed the default model to `gemini-2.5-flash`; a `GEMINI_MODEL` override is documented in the API environment example.
- Converted Asset Treatment Owner and Vendor Internal Business Owner UI controls to searchable active-organization-member selectors. The selector shows name, email/role metadata, handles loading/no-results, and sends the stable `userId` rather than a display name.
- Server-side vendor create/update now verifies that a selected owner is an active member of the current organization. Asset create/reassignment now requires the stable ID of an active member. Existing text assignments remain readable and can remain untouched during unrelated edits; no schema migration or historical-data rewrite was made.

## B. Gemini AI audit

### AI entry-point inventory

| Capability | Frontend entry point | Backend path | Result |
|---|---|---|---|
| GRC Intelligence chat/predefined questions | `grc-intelligence-view` / support chat | `GrcIntelligenceController` → `GrcIntelligenceChatService` → `GeminiProvider` | PARTIAL: source verified; live request blocked by Gemini 403 |
| Control mapping suggestions/import | Control mapping UI | `ControlsController`/mapping queue → `AiRouterService` → `GeminiProvider` | PARTIAL: Gemini-only routing implemented; no authenticated workflow test |
| Policy drafting | Policy list/editor AI draft action | `PoliciesController` → `PoliciesService.generatePolicyWithAi` → `GeminiProvider` | PARTIAL: Gemini-only routing implemented; no authenticated workflow test |
| Policy validation | Policy validation action | `PoliciesController` → `PoliciesService.validatePolicyWithAi` → `GeminiProvider` | PARTIAL: source verified; no authenticated workflow test |
| Regulatory impact analysis | Regulatory Intelligence impact-analysis action | `RegulatoryImpactAnalysisService` → `GeminiProvider` | FAIL: unsafe hard-coded fallback remains; live test blocked |
| Document intelligence | Evidence/document-analysis UI | `AnalysisQueueService` | FAIL: current code uses deterministic finding generation, not Gemini |

### Configuration and live test result

- `GEMINI_API_KEY` is present in the local environment; its value was never displayed or logged.
- The key is consumed on the server by `GeminiProvider`; no frontend environment usage was found.
- A single controlled request (`Return exactly: OMNIGRC_GEMINI_OK`) was sent with no organization data. Google returned HTTP 403 indicating a free-tier/billing restriction. Therefore authentication/billing is **BLOCKED BY CONFIGURATION**, despite a configured local key.
- The provider initializes once, has 8–10 second timeouts and a circuit breaker, and does not retry requests automatically.
- The previous default model was updated to `gemini-2.5-flash`, a supported stable model with structured-output capability according to [Google's Gemini model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash).

### AI test matrix

| AI entry point | Gemini request successful | Correct context fetched | Response valid | UI display correct | Persistence correct | Result |
|---|---:|---:|---:|---:|---:|---|
| GRC Intelligence | BLOCKED | Source inspected | NOT TESTED | NOT TESTED | N/A | BLOCKED BY CONFIGURATION |
| Control mapping | BLOCKED | Candidate clauses scoped in source | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL |
| Policy draft | BLOCKED | Organization context inspected in source | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL |
| Policy validation | BLOCKED | Policy is scope-authorized in source | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL |
| Regulatory impact | BLOCKED | PARTIAL | NOT TESTED | NOT TESTED | NOT TESTED | FAIL |
| Document intelligence | NOT INVOKED | PARTIAL | Deterministic only | NOT TESTED | NOT TESTED | FAIL |

## C. Ownership standardization

Implemented fields:

| Field | Data source | Server validation | Historical handling |
|---|---|---|---|
| Asset Treatment Owner | `/organization-members`, active/non-revoked members | Active membership and same-organization user ID required on create/reassignment | Existing text assignment is displayed as legacy and retained unless changed |
| Vendor Internal Business Owner | `/organization-members`, active/non-revoked members | Active membership and same-organization user ID required on create/update reassignment | Existing records are not rewritten |

Other owner/assignee fields were inventoried but are not converted in this pass; notable manual controls remain in Incident creation/actions and vendor assessment actions. Some fields use text intentionally for external-party/vendor contacts and require a domain decision before conversion. No database migration was applied.

## D. UI/UX review

The shared `SearchableSelect` was reused rather than adding another control. The modified asset/vendor dialogs now use the existing light surfaces, aligned labels, searchable popup, status metadata, loading state, disabled member filtering, and readable empty state. No broad visual redesign, screenshots, or browser/mobile acceptance was claimed because no authenticated browser session was provided.

## E. Testing and regression

| Check | Result |
|---|---|
| API build (`npm run build --workspace=apps/api`) | FAIL: after shared-contract refresh, an unrelated pre-existing `metrics.service.spec.ts` reference to missing `getCachedOverviewMetrics` blocks Nest compilation; the Gemini/ownership changes did not introduce the reported error |
| Web production build (`npm run build --workspace=apps/web`) | NOT CONCLUSIVE: build did not complete within the available command window |
| Web TypeScript check | NOT CONCLUSIVE: did not complete within the available command window |
| Targeted AI-router Jest invocation | NOT CONCLUSIVE: test runner did not finish within the available command window |
| `git diff --check` | PASS: no whitespace errors |
| Live Gemini smoke request | FAIL/BLOCKED: HTTP 403 billing/free-tier response |
| Authenticated browser, CRUD, mobile, RLS, and screenshot verification | NOT TESTED: live database/session unavailable |

## F. Final status

### Completed and verified

- Claude removal from current application source, configuration examples, health/status contracts, documentation, and package dependency.
- Gemini-only routing changes are source-reviewed; full API compilation remains blocked by the unrelated metrics test-type error noted above.
- Asset and vendor selector/validation changes were implemented without a destructive migration.
- A real Gemini endpoint was reached; its failure was accurately captured.

### Implemented but not fully verified

- Gemini-only GRC chat, control mapping, policy drafting, and policy validation.
- Asset and vendor ownership UI and server validation.

### Blocked by configuration or external dependency

- End-to-end Gemini workflows: the configured key received HTTP 403 from Google. The Google Cloud project/key must be attached to an enabled paid Gemini API billing configuration with access to the selected model.
- Live CRUD, tenant isolation, browser/mobile screenshots, and persistence tests: no authenticated test tenant/database workflow was available.

### Not implemented

- Product-wide conversion of every remaining ownership/assignee field.
- Product-wide UI redesign and screenshot baseline.
- Full functional regression across all modules.

### Requires separate authorization

- Any migration that replaces legacy string owner columns with foreign keys across existing records.
- Any production-data modification or use of real organizational test fixtures.

### Required follow-up before acceptance

1. Correct Gemini project billing/access and rerun the matrix through authenticated UI flows.
2. Replace regulatory-intelligence invented fallbacks with an honest no-data/error state and only document-derived deterministic output.
3. Make document intelligence invoke Gemini (or relabel it as deterministic) before presenting it as AI analysis.
4. Convert the remaining internal owner/assignee fields after classifying external-contact fields and agreeing on a backward-compatible schema migration plan.
