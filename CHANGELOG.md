# Changelog

All notable changes to RunwayCtrl are documented in this file.

This project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Release entries are managed via Changesets.

## Phase 2 (v0.1.0-phase2)

### Added (Phase 2)

- Control-plane HTTP API skeleton (Fastify):
  - `X-Request-Id` on every response (with safe echo/generation)
  - Standard error envelope across all failures (including 404)
  - Liveness/readiness split: `GET /healthz` (cheap) and `GET /readyz` (DB dependency)
  - Basic abuse guardrails: per-IP and per-tenant fixed-window rate limiting
- API key authentication with DB-friendly bearer token format:
  - `Authorization: Bearer <api_key_id>.<api_key_secret>` (O(1) lookup by `api_key_id`)
  - Argon2id secret verification with short-lived in-process success cache
  - Revocation enforcement (`revoked_at`)
- Minimal authenticated sanity endpoint: `GET /v1/whoami`.
- Zod validation utilities with a consistent `VALIDATION_ERROR` response mapping.
- OpenTelemetry bootstrapping (Node SDK) + contract instrumentation:
  - Internal span: `runwayctrl.auth.verify_api_key`
  - Metric: `runwayctrl.http.server.duration` (histogram, seconds)

## Phase 1 (v0.1.0-phase1)

### Added (Phase 1)

- Durable Postgres ledger schema: tenants, API keys, actions, attempts, attempt events, and leases.
- `@runwayctrl/db` workspace package (Postgres pool + transaction helper).
- Ledger data access layer (repos) with tenant-scoped queries.
- First DB-backed integration test suite verifying tenant isolation, transaction atomicity, and stable attempt-event ordering.
- Dev seed for a tenant + API key:
  - Hash-only storage (Argon2id)
  - Plaintext key provided via env (`RUNWAYCTRL_DEV_API_KEY_PLAINTEXT`) when creating a new key
  - No plaintext output/logging (secret hygiene)

### Changed (Phase 1)

- CI now runs the DB-backed integration-test job.

## Phase 0 (v0.0.1-phase0)

### Added (Phase 0)

- Monorepo scaffolding with pnpm workspaces and shared TypeScript configuration.
- Local dev environment via Docker Compose (Postgres, plus optional Redis and an optional OTel Collector).
- Minimal, runnable control-plane dev server with a `/healthz` endpoint.
- Real `db:migrate` and `db:seed` scripts (Phase 0 seed is a canary; dev tenant/API key seed is deferred).

### Changed (Phase 0)

- CI baseline now runs formatting, lint, tests, and workspace build/typecheck, and applies DB migrations.
- Conventional Commits are enforced (local hook + CI gate for PR titles).

## 0.1.1

### Patch Changes

- Set up Changesets for versioning, changelog entries, and release automation.

## 0.1.0

### Added

- Project documentation (specs, ADRs, runbooks, guidelines)
- Repository scaffolding (README, LICENSE, CONTRIBUTING, SECURITY, CI)
- Apache 2.0 license
- GitHub Actions CI workflow
- Issue and PR templates

<!-- ## [0.1.0] - YYYY-MM-DD -->
<!-- ### Added -->
<!-- - Control Plane API (BeginAction, CompleteAttempt, MarkUnknown, GetAction) -->
<!-- - Durable Postgres ledger (actions, attempts, events, leases) -->
<!-- - Governor v1 (budgets, backoff, circuit-breaking) -->
<!-- - TypeScript SDK (sdk-core, sdk-node) -->
<!-- - Jira integration package -->
<!-- - ServiceNow integration package -->
<!-- - GitHub integration package -->
<!-- - Ledger Insights endpoints (cost-summary, tool-efficiency, retry-waste, hotspots) -->
<!-- - Interactive read-only dashboard with Integration Health panel -->
<!-- - OpenTelemetry instrumentation -->
<!-- - Multi-instance correctness tests -->
