# RunwayCtrl — Implementation Plan (Phases → Tasks → Sub-tasks) (v0.1)

| Field           | Value                                                                        |
| --------------- | ---------------------------------------------------------------------------- |
| Product         | RunwayCtrl                                                                   |
| Doc Type        | Implementation Plan                                                          |
| Version         | v0.1                                                                         |
| Date            | March 2, 2026                                                             |
| Goal            | Build RunwayCtrl end-to-end (SDK + Control Plane + Ledger + Governor + OTel) |
| Execution style | Phased delivery with “definition of done” gates per phase                    |
| Source of truth | This plan + the Flow/PRD/Security/Backend docs in `Documentation/`           |

---

## 0) How to use this plan (important)

This document is designed to be fed into a dev workflow (VSCode / task runner). It is intentionally:

- **Sequential** (dependencies are explicit)
- **Exhaustive** (no “magic happens here” gaps)
- **Spec-driven** (references core docs you already generated)

### 0.1 Deliverables by the end

You will have:

- A working **Control Plane API** with tenant-scoped auth
- A durable **Postgres ledger** (actions/attempts/events/leases)
- A **Governor** that enforces budgets/backoff/circuiting (v1)
- A **TypeScript SDK** that wraps tool calls + OTel instrumentation
- A minimal **dev environment** (docker compose, migrations, tests)
- A release-ready repo with CI/CD and a couple of design-partner integrations

### 0.2 Canonical docs (keep open while building)

- Execution Flow Document: `Documentation/Flow Document.md`
- Flow Charts: `Documentation/Flow Chart.md`
- PRD: `Documentation/PRD Document.md`
- Tech Stack: `Documentation/Tech Stack.md`
- Backend Structure: `Documentation/Backend Structure.md`
- Security Guidelines: `Documentation/Security Guidelines.md`

### 0.3 Release workflow (applied after every phase gate)

Every phase ends with a **Release Checklist** (see individual phases below). The standard workflow is:

1. **Branch per feature** — create short-lived branches (`feat/`, `fix/`, `chore/`, `docs/`, `refactor/`) off `main`. Each branch = one reviewable PR.
2. **Squash-merge to `main`** — every PR becomes one clean commit. Use conventional commit prefixes (`feat:`, `fix:`, `chore:`, `docs:`).
3. **CI must pass** — branch protection requires all status checks green before merge. No direct pushes to `main`.
4. **Tag + Release on gate pass** — when all gate criteria are met and CI is green, tag a release and create a GitHub Release with notes summarizing what shipped.
5. **Update CHANGELOG** — add an entry for each phase completion.

> **Team size note (2-person team):** We use this workflow for hygiene and muscle memory, not ceremony. PRs can be self-merged after CI passes. The goal is clean history and reliable rollback points — not bureaucracy.

---

## 1) Phase map (big picture)

```mermaid
flowchart LR
  P0[Phase 0: Repo + Dev Env + CI] --> P1[Phase 1: Ledger + Schema]
  P1 --> P2[Phase 2: Control Plane API Skeleton]
  P2 --> P3[Phase 3: BeginAction + Attempt Lifecycle]
  P3 --> P4[Phase 4: Dedupe + Replay]
  P4 --> P5[Phase 5: Leases + Concurrency]
  P5 --> P6[Phase 6: Governor v1 (Budgets/Backoff/Circuit)]
  P6 --> P7[Phase 7: TypeScript SDK v0.1]
  P7 --> P8[Phase 8: Observability + Security Hardening]
  P8 --> P8A[Phase 8A: Multi-Instance Correctness + Chaos]
  P8A --> P8B[Phase 8B: Ledger Insights + Cost Optimization]
  P8B --> P9[Phase 9: Integrations + Examples (Jira/ServiceNow/GitHub)]
  P9 --> P10[Phase 10: Minimal Dashboard + Insights Screen]
  P10 --> P11[Phase 11: Beta Release + Design Partners]
  P11 --> P12[Phase 12: Ops Polish + v0.2 Prep]
```

---

## PHASE 0 — Repo Foundation + Dev Environment + CI

**Objective:** Make the repo buildable, testable, and runnable locally in < 10 minutes.

## P0.0 Account Provisioning + API Keys + CLI Access (MUST complete first)

> **Why this section exists:** Every third-party service, hosting platform, and developer tool used across all phases is listed here. Before writing a single line of code, ensure accounts exist, API keys / tokens are generated, and CLI tools are installed. This prevents mid-phase blockers where work stalls on "I need to sign up for X."
>
> **Rule:** Every credential produced here goes into a password manager (1Password / Bitwarden). No secrets in repos, chat logs, or plain-text files. Populate `.env.local` for local dev; use platform secret stores (GitHub Actions Secrets, Vercel env vars, Render env vars) for CI/staging/prod.

---

### P0.0.1 Source Control + CI/CD Platform

| Service                   | What you need                                          | Sign-up / action                                                                                        | Used in                                                                     |
| ------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **GitHub** (github.com)   | Owner account on `RunwayCtrl` org; push access to repo | Already have ✓ — verify org ownership and branch protection settings                                    | All phases (source control, CI, PR workflows, GitHub Actions, release tags) |
| **GitHub Actions**        | Included with GitHub — no separate signup              | Enable Actions in repo settings if not already on; configure `Settings → Actions → General` permissions | Phase 0+ (CI), Phase 10.4 (CD pipelines)                                    |
| **GitHub Packages / npm** | Publish scope for `@runwayctrl/*` packages             | Verify the org has GitHub Packages enabled, OR plan to use npmjs.com (see below)                        | Phase 7 (SDK), Phase 11 (publish)                                           |

**CLI to install:**

- [ ] `gh` (GitHub CLI) — `winget install GitHub.cli` or https://cli.github.com/
  - Authenticate: `gh auth login`
  - Verify: `gh repo view RunwayCtrl/RunwayCtrl`

**Status (verified on 2026-03-02):**

- [x] `gh` installed
- [x] `gh` authenticated to `github.com`
- [x] Repo access verified: `RunwayCtrl/RunwayCtrl`
- [x] GitHub Actions enabled for repo
- [x] Branch protection checked on `main` (required status check present)
- [x] GitHub Packages API accessible (token has `read:packages`)

---

### P0.0.2 Package Registry (npm)

| Service       | What you need                                              | Sign-up / action                                                                                 | Used in                                               |
| ------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| **npmjs.com** | Account + org scope `@runwayctrl` (if publishing publicly) | Sign up at https://www.npmjs.com/signup → create org `runwayctrl` → generate an automation token | Phase 7 (SDK publish prep), Phase 11 (public publish) |

> **Decision:** If publishing only via GitHub Packages, npm signup can be deferred to Phase 11. If you want the `@runwayctrl` scope reserved on npm now, sign up early.

**CLI already available:** `pnpm` (in repo), `npm` (bundled with Node.js).

**Status (verified on 2026-03-02):**

- [x] npm CLI authenticated (`npm whoami` = `remih88`)
- [x] Org created and accessible: `runwayctrl`
- [x] Org membership verified (`npm org ls runwayctrl` shows `remih88 - owner`)

---

### P0.0.3 Runtime + Language Toolchain

| Tool                  | What you need                        | Install / action                                                                  | Used in    |
| --------------------- | ------------------------------------ | --------------------------------------------------------------------------------- | ---------- |
| **Node.js >= 20 LTS** | Local runtime                        | `winget install OpenJS.NodeJS.LTS` or https://nodejs.org/                         | All phases |
| **pnpm >= 9**         | Package manager (monorepo)           | `corepack enable && corepack prepare pnpm@9.15.4 --activate` (or `npm i -g pnpm`) | All phases |
| **TypeScript**        | Dev dependency — no separate install | Included in `devDependencies`                                                     | All phases |

_No account needed — just install._

**Status (verified on 2026-03-02):**

- [x] Node.js installed (local `node --version` = `v24.5.0`)
- [x] Corepack available (`corepack --version` = `0.34.0`)
- [x] pnpm installed and aligned with repo (`pnpm --version` = `9.15.4`, `packageManager` = `pnpm@9.15.4`)

---

### P0.0.4 Container + Local Infrastructure

| Tool                                            | What you need                                                      | Install / action                                                                 | Used in                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Docker Desktop** (or Docker Engine + Compose) | Run Postgres, Redis, OTel Collector, multi-instance tests locally  | https://www.docker.com/products/docker-desktop/ — accept license, install, start | Phase 0+ (Postgres), Phase 8A (multi-instance), Phase 13 (demo mocks) |
| **Docker Hub** _(optional)_                     | Account for pulling rate-limited images (anonymous = 100 pulls/6h) | Sign up at https://hub.docker.com/ (free tier) — `docker login`                  | Phase 0+                                                              |

**CLI:** `docker` and `docker compose` are included with Docker Desktop.

**Status (verified on 2026-03-02):**

- [x] Docker CLI installed (`docker --version` = `29.2.1`)
- [x] Docker Compose available (`docker compose version` = `v5.0.2`)
- [x] Docker daemon reachable (`docker ps` succeeded)

---

### P0.0.5 Database

| Service                             | What you need                                 | Sign-up / action                                                                                                                                                                                                                                                                   | Used in                           |
| ----------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **PostgreSQL (local)**              | Runs via Docker — no account needed           | Included in `docker-compose.yml`                                                                                                                                                                                                                                                   | Phase 0–12 (ledger)               |
| **Managed Postgres (staging/prod)** | A hosted Postgres instance with backups + TLS | **Render:** https://render.com/ → sign up → create PostgreSQL instance (free tier available for dev; paid for prod). **Alternatives:** Neon (https://neon.tech/), Supabase (https://supabase.com/), Railway (https://railway.com/), or cloud-native (RDS/Cloud SQL/Azure Postgres) | Phase 10.4+ (hosted environments) |

> **Action for staging:** Create the managed Postgres instance before Phase 10.4.2. Record the connection string (`DATABASE_URL`) in your secrets manager.

**Status (complete this today):**

- [x] Render Postgres instance created (name: `runwayctrl-staging-db`)
- [x] Region selected (must match future control-plane region): `Oregon`
- [x] Postgres version selected: `16`
- [x] `External Database URL` copied into vault and saved to `.env.local` as `RENDER_DATABASE_URL_EXTERNAL`
- [x] `Internal Database URL` copied into vault and saved to `.env.local` as `RENDER_DATABASE_URL_INTERNAL`
- [x] Confirm local dev still uses Docker Postgres (`DATABASE_URL` remains local unless explicitly overridden)

---

### P0.0.6 Hosting / Deployment Platforms

| Service    | What you need                                               | Sign-up / action                                                      | Used in                                                 |
| ---------- | ----------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------- |
| **Vercel** | Account + project for `apps/console` (Next.js)              | Sign up at https://vercel.com/ → connect GitHub repo → create project | Phase 10.4 (hosted console at `console.runwayctrl.com`) |
| **Render** | Account + web services for control-plane + managed Postgres | Sign up at https://render.com/ → connect GitHub repo                  | Phase 10.4 (hosted control-plane + DB)                  |

> **Alternatives (pick one container host):** Fly.io (https://fly.io/), Railway (https://railway.com/), or cloud-native (AWS ECS/Cloud Run/Azure Container Apps). The implementation plan defaults to Render for simplicity.

**CLIs to install:**

- [ ] `vercel` CLI — `pnpm add -g vercel` → `vercel login`
- [ ] Render CLI _(optional)_ — Render is primarily web-dashboard-driven; CLI is nascent. Use the dashboard.

**Status (verified on 2026-03-02):**

- [x] `vercel` CLI installed (`vercel --version` succeeded)
- [x] `vercel` authenticated (`vercel whoami` = `remih88`)
- [x] `pnpm` global installs unblocked (ran `pnpm setup`; ensure a fresh terminal picks up `PNPM_HOME`)

---

### P0.0.7 Domain + DNS

| Service                                     | What you need                               | Sign-up / action                                                                                                                             | Used in                                        |
| ------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Domain registrar** (for `runwayctrl.com`) | DNS management access                       | Verify you own `runwayctrl.com` and can create subdomains (`console.runwayctrl.com`, `api.runwayctrl.com`, `staging.console.runwayctrl.com`) | Phase 10.4.1                                   |
| **Cloudflare** _(recommended)_              | DNS + CDN + WAF for control-plane perimeter | Sign up at https://www.cloudflare.com/ (free tier) → add `runwayctrl.com` zone → point nameservers                                           | Phase 10.4.4 (WAF/perimeter), optional earlier |

**Status (verified on 2026-03-02):**

- [x] Domain owned: `runwayctrl.com`
- [x] DNS access confirmed (can manage records / nameservers)
- [x] Cloudflare account exists (ready to add zone when we cut over)
- [x] Note: domain currently in use on Vercel for marketing site (we’ll add `console.*` / `api.*` when ready)

---

### P0.0.8 Observability + Telemetry

| Service                                             | What you need                                     | Sign-up / action                                                                                                            | Used in                             |
| --------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **OpenTelemetry Collector** (local)                 | Runs via Docker — no account needed               | Included in `docker-compose.yml`                                                                                            | Phase 2+ (OTel bootstrap)           |
| **Observability backend** (traces + metrics + logs) | An OTLP-compatible backend to view traces/metrics | **Pick one (sign up for free tier):**                                                                                       | Phase 8+ (production observability) |
|                                                     |                                                   | • **Grafana Cloud:** https://grafana.com/auth/sign-up/create-user (generous free tier: 50GB logs, 10K metrics, 50GB traces) |                                     |
|                                                     |                                                   | • **Honeycomb:** https://www.honeycomb.io/signup (free tier: 20M events/mo)                                                 |                                     |
|                                                     |                                                   | • **Axiom:** https://axiom.co/ (free tier: 500GB/mo ingest)                                                                 |                                     |
|                                                     |                                                   | • **Jaeger (self-hosted):** add to Docker Compose (no account)                                                              |                                     |

> **Recommendation:** Start with **Grafana Cloud** (free tier covers dev + staging easily) or **Jaeger** self-hosted for local-only. Sign up now so OTLP exporter config is ready when Phase 2 OTel bootstrap begins.

**Decision (2026-03-02):** Grafana Cloud (best DX + broad adoption; one backend for traces/metrics/logs).

**Status (complete this today):**

- [x] Grafana Cloud account created
- [x] A stack created (name: `runwayctrl`)
- [x] OTLP endpoint recorded in vault (env var: `OTEL_EXPORTER_OTLP_ENDPOINT`)
- [x] OTLP auth recorded in vault (env var: `OTEL_EXPORTER_OTLP_HEADERS`)
- [x] OTLP endpoint saved to `.env.local` (gitignored)
- [x] OTLP auth saved to `.env.local` (gitignored)
- [x] (Optional) Grafana Cloud API key stored in vault and/or `.env.local` (env var: `GRAFANA_CLOUD_API_KEY`)
- [ ] (Optional) Non-secret identifiers recorded here for reference (org/stack id): `________________`

**CLI:** The OTel Collector is a Docker container. No separate CLI install needed.

---

### P0.0.9 Authentication + Email (Hosted Console)

| Service                                      | What you need                     | Sign-up / action                                                                                                       | Used in                     |
| -------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **Auth.js / NextAuth**                       | Library — no account needed       | Included as dependency in `apps/console`                                                                               | Phase 10.4.3 (console auth) |
| **Email provider** (for magic link delivery) | Transactional email API + API key | **Pick one (sign up for free tier):**                                                                                  | Phase 10.4.3                |
|                                              |                                   | • **Resend:** https://resend.com/ (free: 3K emails/mo, 100/day) — sign up → generate API key → record `RESEND_API_KEY` |                             |
|                                              |                                   | • **Postmark:** https://postmarkapp.com/ (free: 100 emails/mo on dev)                                                  |                             |
|                                              |                                   | • **AWS SES:** https://aws.amazon.com/ (free tier for 12 months)                                                       |                             |

> **Recommendation:** **Resend** — simple API, good free tier, great DX. Sign up before Phase 10.4.3.

**Status (verified on 2026-03-02):**

- [x] Resend account created
- [x] Resend API key created (name: `runwayctrl staging email`)
- [x] `RESEND_API_KEY` saved to vault
- [x] `RESEND_API_KEY` staged in `.env.local` (gitignored)

---

### P0.0.10 LLM Provider (The Hub — Phase 8B.6)

| Service    | What you need        | Sign-up / action                                                                                | Used in                       |
| ---------- | -------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------- |
| **OpenAI** | API access + API key | Sign up at https://platform.openai.com/ → generate API key → record as `RUNWAYCTRL_HUB_API_KEY` | Phase 8B.6 (Hub LLM analysis) |

> **Gated by `ENABLE_HUB` flag.** Not required until Phase 8B, but API key provisioning takes < 5 minutes. Budget: ~$0.01/tenant/day.
>
> **Alternative providers:** Anthropic (https://console.anthropic.com/), Google AI (https://aistudio.google.com/), or any OpenAI-compatible endpoint. Swap via `RUNWAYCTRL_HUB_PROVIDER` + `RUNWAYCTRL_HUB_MODEL` env vars.

**Decision (2026-03-02):** Provision now (OpenAI).

**Status (complete this today):**

- [x] OpenAI account verified
- [x] API key created (name: `runwayctrl-hub-staging`)
- [x] `RUNWAYCTRL_HUB_API_KEY` saved to vault
- [x] (Optional) `RUNWAYCTRL_HUB_API_KEY` staged in `.env.local` (gitignored)

---

### P0.0.11 Integration Test Instances (Phase 9 — provision early)

> These are free-tier developer instances for testing real API behavior. Provision them now so they exist when Phase 9 coding begins.

<!-- markdownlint-disable MD060 -->
| Service                                           | What you need                 | Sign-up / action                                                                                                                                                                                                                                       | Used in                             |
| ------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **Jira Cloud Developer Site** (free)              | A sandbox Jira instance       | Sign up at <https://developer.atlassian.com/> → "Create a cloud development site" → create project `RCTEST` → generate API token at <https://id.atlassian.com/manage-profile/security/api-tokens> → record `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` | Phase 9.2 (Jira integration)        |
| **ServiceNow Personal Developer Instance** (free) | A sandbox ServiceNow instance | Sign up at <https://developer.servicenow.com/> → "Request Instance" → note instance URL → record `SERVICENOW_INSTANCE_URL`, `SERVICENOW_USERNAME`, `SERVICENOW_PASSWORD`                                                                                 | Phase 9.2B (ServiceNow integration) |
| **GitHub** (test repo)                            | Dedicated test repository     | Create `RunwayCtrl/runwayctrl-integration-test` (private) → generate fine-grained PAT scoped to test repo → record `GITHUB_TOKEN`                                                                                                                      | Phase 9.3 (GitHub integration)      |
<!-- markdownlint-enable MD060 -->

**Status (complete this today):**

- [x] Jira dev site created (project: `RCTEST`)
- [x] Jira credentials saved to vault (`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`)
  - `JIRA_BASE_URL`: <https://runwayctrl-team.atlassian.net>
- [x] ServiceNow dev instance created
- [x] ServiceNow credentials saved to vault (`SERVICENOW_INSTANCE_URL`, `SERVICENOW_USERNAME`, `SERVICENOW_PASSWORD`)
  - `SERVICENOW_INSTANCE_URL`: <https://dev181426.service-now.com>
- [x] GitHub test repo created: `RunwayCtrl/runwayctrl-integration-test` (private)
  - repo: <https://github.com/RunwayCtrl/runwayctrl-integration-test>
- [x] Fine-grained PAT created and saved to vault (`GITHUB_TOKEN`)

---

### P0.0.12 Code Quality + Security Scanning

<!-- markdownlint-disable MD060 -->
| Service                                    | What you need                            | Sign-up / action                                                                               | Used in                  |
| ------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------ |
| **GitHub CodeQL**                          | SAST — included with GitHub              | Enable in repo: `Settings → Code security → Code scanning → Set up → Default`                | Phase 0.3 (CI)           |
| **Dependabot**                             | Dependency scanning — included with GitHub | Enable: `Settings → Code security → Dependabot alerts → Enable` + add `dependabot.yml`       | Phase 0.3 (CI)           |
| **Renovate** _(alternative to Dependabot)_ | Dependency update PRs                    | Install GitHub App: <https://github.com/apps/renovate> → authorize for `RunwayCtrl` org      | Phase 0.3 (CI)           |
| **Codecov** _(optional)_                   | Coverage reporting                       | Sign up at <https://codecov.io/> → connect GitHub → add repo → record `CODECOV_TOKEN`        | Phase 0.3+ (CI coverage) |
<!-- markdownlint-enable MD060 -->

**Status (verified on 2026-03-02):**

- [x] Dependabot configuration added: `.github/dependabot.yml`
- [x] CodeQL workflow added: `.github/workflows/codeql.yml`
- [x] GitHub settings: **Dependabot alerts** enabled (repo → `Settings → Code security`)
- [x] GitHub settings: **Dependabot security updates** enabled
- [x] GitHub settings: **Code security** enabled (required for private repo CodeQL uploads)
- [x] GitHub settings: **Code scanning** enabled and CodeQL results uploaded successfully
- [x] Decide updater: use **Dependabot** (Renovate not installed)
- [ ] (Optional) Add Codecov only if you truly want external coverage reporting (otherwise keep coverage local)

---

### P0.0.13 SDK Publishing + Changelog

| Tool           | What you need                        | Install / action                                              | Used in                    |
| -------------- | ------------------------------------ | ------------------------------------------------------------- | -------------------------- |
| **Changesets** | Versioning + changelog (npm package) | `pnpm add -D @changesets/cli` in repo → `pnpm changeset init` | Phase 7 (SDK version prep) |

_No account needed — just a dev dependency._

**Status (verified on 2026-03-02):**

- [x] Changesets installed: `@changesets/cli`
- [x] Changesets initialized: `.changeset/config.json` + `.changeset/README.md`
- [x] Root scripts added: `pnpm changeset`, `pnpm changeset:status`, `pnpm changeset:version`
- [x] Changesets GitHub Action workflow added for automated versioning + publishing (publishing requires `NPM_TOKEN` secret)

---

### P0.0.14 Testing Tools

| Tool                          | What you need                             | Install / action                                          | Used in                               |
| ----------------------------- | ----------------------------------------- | --------------------------------------------------------- | ------------------------------------- |
| **Vitest**                    | Test runner (already in devDeps)          | Already installed ✓                                       | All phases                            |
| **testcontainers-node**       | Programmatic Docker for integration tests | `pnpm add -D testcontainers` (when needed)                | Phase 8A (multi-instance tests)       |
| **MSW (Mock Service Worker)** | API mocking for integration tests         | `pnpm add -D msw` (when needed)                           | Phase 9 (mock Jira/ServiceNow/GitHub) |
| **Playwright** _(optional)_   | Browser E2E tests for console             | `pnpm add -D @playwright/test` → `npx playwright install` | Phase 10.4.9 (console E2E)            |

_No accounts needed — just dev dependencies installed when their phase arrives._

**Status (verified on 2026-03-02):**

- [x] Unit vs integration test commands split (`pnpm test:unit`, `pnpm test:integration`)
- [x] Vitest config files added: `vitest.unit.config.ts`, `vitest.integration.config.ts`
- [x] Integration suite set to pass when empty during Phase 0 (`passWithNoTests: true`)
- [x] Coverage provider installed (`@vitest/coverage-v8`) and `pnpm test:coverage` wired
- [x] `TESTING.md` updated to match current tooling (MSW/testcontainers marked as planned)

---

### P0.0.15 Secrets Management (Production)

| Service                                  | What you need                                   | Sign-up / action                                                                                 | Used in                                |
| ---------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------- |
| **1Password / Bitwarden** _(team vault)_ | Secure storage for all credentials listed above | Create a shared vault for RunwayCtrl team secrets                                                | All phases (credential storage)        |
| **Platform secret stores**               | Per-environment secret injection                | Configure when each platform is set up: GitHub Actions Secrets, Vercel env vars, Render env vars | Phase 0.3+ (CI), Phase 10.4+ (hosting) |

---

### P0.0 Checklist Summary (Quick Reference)

_Status: checked off as complete as of 2026-03-02 (repo work verified + owner confirmation for external accounts/tokens)._

**Accounts to create / sign into (action required):**

- [x] **GitHub** — verify org ownership + enable Actions, CodeQL, Dependabot
- [x] **npm** _(optional now, required by Phase 11)_ — reserve `@runwayctrl` org scope
- [x] **Docker Hub** _(optional)_ — sign up to avoid anonymous pull rate limits
- [x] **Render** — sign up, connect GitHub repo (staging/prod control-plane + Postgres)
- [x] **Vercel** — sign up, connect GitHub repo (console hosting)
- [x] **Cloudflare** _(recommended)_ — sign up, add `runwayctrl.com` zone
- [x] **Grafana Cloud** or **Honeycomb** or **Axiom** — sign up for observability backend
- [x] **Resend** or **Postmark** — sign up for transactional email (console magic links)
- [x] **OpenAI** — sign up for Hub LLM API key
- [x] **Jira Cloud Developer Site** — sign up for free sandbox
- [x] **ServiceNow Developer Instance** — sign up for free sandbox
- [x] **GitHub test repo** — create `runwayctrl-integration-test` + generate PAT
- [] **Codecov** _(optional)_ — sign up for coverage reporting

**CLI tools to install locally:**

- [x] `node` (>= 20 LTS)
- [x] `pnpm` (>= 9)
- [x] `gh` (GitHub CLI)
- [x] `docker` + `docker compose` (Docker Desktop)
- [x] `vercel` (Vercel CLI)

**API keys / tokens to generate and store:**

- [x] GitHub PAT (fine-grained, for integration tests) → `GITHUB_TOKEN`
- [x] Jira API token → `JIRA_API_TOKEN`
- [x] ServiceNow credentials → `SERVICENOW_USERNAME` / `SERVICENOW_PASSWORD`
- [x] OpenAI API key → `RUNWAYCTRL_HUB_API_KEY`
- [x] Resend API key → `RESEND_API_KEY`
- [x] npm automation token _(when publishing; see Phase 11 “Publish readiness” checklist)_ → `NPM_TOKEN`
- [x] Render API key _(if using CLI)_ → platform-managed
- [x] Grafana Cloud / Honeycomb / Axiom OTLP endpoint + auth token → `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`
- [] Codecov token _(optional)_ → `CODECOV_TOKEN`

> **All credentials go into your team vault (1Password / Bitwarden) and are populated into `.env.local` (local dev) or platform secret stores (CI/staging/prod). Never commit secrets.**

---

## P0.1 Repo scaffolding (monorepo)

> **See [Backend Structure.md](Backend%20Structure.md) Section 3 for canonical folder structure.**

- [ ] Create repo structure:
  - [x] `/apps/control-plane` — Fastify API
  - [x] `/apps/console` — Next.js dashboard (scaffolded, built in Phase 10)
  - [x] `/packages/shared` — Zod schemas
  - [x] `/packages/db` — DB client + helpers
  - [x] `/packages/sdk-core` — Keying, hashing, OTel
  - [x] `/packages/sdk-node` — Node HTTP client
  - [x] `/docs/*` — Added `docs/` with a pointer README (canonical docs remain in `Documentation/`)
- [ ] Add toolchain
  - [x] Node LTS + `pnpm`
  - [x] Typescript config (`tsconfig.base.json`)
  - [x] Linting (ESLint) + formatting (Prettier)
  - [x] Conventional commits (MANDATORY)


## P0.2 Local environment (Docker Compose)

- [x] Create `docker-compose.yml`
  - [x] Postgres container + volume
  - [x] Redis container (optional toggle)
  - [x] OTel Collector container (optional early)
- [x] Add `.env.example`
  - [x] DB connection string
  - [x] Redis connection string
  - [x] API port + host
  - [x] OTel exporter config
  - [x] Trace link URL template config (`RUNWAYCTRL_TRACE_URL_TEMPLATE`)
- [x] Add local scripts:
  - [x] `pnpm dev` (start control-plane)
  - [x] `pnpm db:migrate`
  - [x] `pnpm db:seed` (Phase 0 canary seed; tenant + API key seed lands in P1.3)
  - [x] `pnpm test`

## P0.3 CI/CD baseline

- [x] GitHub Actions workflows
  - [x] install + lint + test
  - [x] build artifacts
- [x] Secret scanning & dependency scanning
  - [x] Dependabot/Renovate
  - [x] basic SAST (CodeQL) (recommended)

## P0 Gate: Definition of Done

- [x] `pnpm i` succeeds at repo root
- [x] `pnpm dev` runs control plane locally
- [x] Postgres comes up, migrations run
- [x] CI passes on a fresh branch

> **Testing gate note (planned tightening in Phase 1/2):** During Phase 0 it is acceptable for the integration-test job to use `vitest run --passWithNoTests` while no integration tests exist yet.
> Once we add the first real integration tests (expected during **Phase 1** for DB/repos and/or **Phase 2** for HTTP/auth), remove `--passWithNoTests` so CI fails if the integration-test suite is empty.

### P0 Release Checklist

- [ ] All Phase 0 work merged to `main` via squash-merge PRs
- [ ] CI is green on `main`
- [ ] Tag release: `git tag -a v0.0.1-phase0 -m "Phase 0: Repo foundation, dev environment, CI"`
- [ ] Push tag: `git push origin v0.0.1-phase0`
- [ ] Create GitHub Release from tag with summary of what shipped
- [ ] Update `CHANGELOG.md` with Phase 0 entry

---

## PHASE 1 — Ledger + Schema (Postgres)

**Objective:** Build the durable system-of-record that enforces invariants.

> **v0.1 data stance (MUST):** The ledger stores hashes + pointers + metadata only.
> Do **not** store raw tool request/response payloads in Postgres by default.
> See: `Documentation/ADR-0009-payload-capture-stance.md`

## P1.1 Schema design

- [ ] Create migrations for:
  - [ ] `tenants`
  - [ ] `api_keys`
  - [ ] `actions`
  - [ ] `attempts`
  - [ ] `attempt_events`
  - [ ] `leases`
- [ ] Add constraints (MANDATORY):
  - [ ] `actions(tenant_id, action_key)` UNIQUE
  - [ ] `attempts(tenant_id, attempt_id)` PK
  - [ ] `leases(tenant_id, resource_key)` UNIQUE
  - [ ] `attempt_events(tenant_id, attempt_id, ts)` indexed
- [ ] Add indexes for performance:
  - [ ] actions lookup by (tenant_id, action_key)
  - [ ] attempts by (tenant_id, action_key, started_at desc)
  - [ ] leases by (tenant_id, resource_key, expires_at)

- [ ] Payload minimization (MANDATORY):
  - [ ] Store `request_hash` / `outcome_hash` / `outcome_pointer` (or equivalent)
  - [ ] No raw request/response payload columns in ledger tables (v0.1)

## P1.2 Data access layer (`/packages/db` + `/apps/control-plane/src/ledger`)

- [ ] Choose DB driver (prefer lightweight)
  - [ ] **Use `pg` + `pg.Pool`** for runtime DB access
- [ ] Implement transaction helper
  - [ ] `withTx(fn)` acquires a pool client and runs BEGIN/COMMIT/ROLLBACK
- [ ] Tenant scoping guardrail
  - [ ] Introduce `RequestContext`/`TenantContext` (must include `tenant_id`) and pass it to services/repos
- [ ] Implement repositories (tenant-scoped signatures):
  - [ ] `ActionRepo.upsert()`
  - [ ] `ActionRepo.getByKey()`
  - [ ] `AttemptRepo.create()`
  - [ ] `AttemptRepo.setStatus()`
  - [ ] `AttemptRepo.getLatestByActionKey()`
  - [ ] `EventRepo.append()`
  - [ ] `LeaseRepo.acquire()`
  - [ ] `LeaseRepo.renew()`
  - [ ] `LeaseRepo.get()`

- [ ] Repo layering hygiene
  - [ ] `/packages/db`: pool + tx + low-level helpers only
  - [ ] `/apps/control-plane/src/ledger`: domain-shaped repos only (no HTTP types)

- [ ] Event ordering
  - [ ] Always order attempt events by `(ts, event_id)` (stable ordering)

- [ ] Add first real DB integration test (Phase 1.2)
  - [ ] Prove tenant isolation (cannot read another tenant’s rows)
  - [ ] Prove atomicity: action+attempt written in one tx

## P1.3 Seed + fixtures

- [ ] Create seed script (`apps/control-plane/src/ledger/seed.ts`):
  - [ ] Load repo-root `.env` (dev-only convenience)
  - [ ] Create or reuse a dev tenant (idempotent by tenant name)
    - [ ] Env override: `RUNWAYCTRL_DEV_TENANT_NAME` (default: `dev`)
  - [ ] Create an API key for that tenant
    - [ ] Generate a random plaintext key (prefix `rwc_` for recognizability)
    - [ ] Hash with **Argon2id** and store **hash only** in `api_keys.key_hash`
    - [ ] Env override: `RUNWAYCTRL_DEV_API_KEY_LABEL` (default: `dev-key`)
    - [ ] Print the plaintext key **once** to stdout with a warning banner
    - [ ] Avoid accidental secret leakage:
      - [ ] no structured logging around the plaintext
      - [ ] no plaintext written to disk
      - [ ] no plaintext stored in DB
  - [ ] Confirm it works end-to-end locally:
    - [ ] `pnpm --filter @runwayctrl/control-plane db:seed` succeeds
    - [ ] Postgres shows `api_keys.key_hash` populated and plaintext absent

- [ ] Create test fixtures (`apps/control-plane/src/ledger/test/*`):
  - [ ] Create tenant helper (for integration tests)
  - [ ] Add repo-level helpers to create actions/attempts/events in a tx
  - [ ] Guardrails:
    - [ ] fixtures must be tenant-explicit (require `RequestContext` or `tenantId`)
    - [ ] fixtures must be composable inside `withTx(...)`
    - [ ] avoid copy/paste SQL in tests where repos exist

## P1 Gate: Definition of Done

- [ ] Migrations apply cleanly
- [ ] Repos enforce tenant scoping (no unscoped queries)
- [ ] Unique constraints prevent duplicates
- [ ] Seed produces a working dev API key

### P1 Release Checklist

- [ ] All Phase 1 PRs squash-merged to `main` (branch naming: `feat/db-schema-*`, `feat/seed-*`, etc.)
- [ ] CI is green on `main` (including first DB integration tests)
- [ ] Re-enable integration test job in CI (`remove false &&` from `.github/workflows/ci.yml`)
- [ ] Tag release: `git tag -a v0.1.0-phase1 -m "Phase 1: Ledger schema, data access layer, seed"`
- [ ] Push tag: `git push origin v0.1.0-phase1`
- [ ] Create GitHub Release from tag with migration summary and seed instructions
- [ ] Update `CHANGELOG.md` with Phase 1 entry

---

## PHASE 2 — Control Plane API Skeleton (Fastify + Zod)

**Objective:** Establish HTTP structure, auth, error taxonomy, and OTel plumbing.

## P2.1 API framework wiring

- [ ] Create Fastify app with:
  - [ ] request-id middleware
  - [ ] JSON body limits
  - [ ] timeout configuration
- [ ] Add Zod validation utilities
  - [ ] schema parsing
  - [ ] consistent validation errors

## P2.2 Auth middleware (API keys)

- [ ] Implement `Authorization: Bearer <api_key>` auth
- [ ] Hash verification (argon2id/bcrypt/scrypt)
- [ ] Resolve `tenant_id` from api_key
- [ ] Inject `RequestContext` into handlers:
  - [ ] `tenant_id`
  - [ ] `request_id`
  - [ ] `trace_id` (if available)

## P2.3 Error taxonomy + safe responses

- [ ] Implement typed errors:
  - [ ] ValidationError, AuthError, NotFoundError, ConflictError
  - [ ] BudgetDeniedError, CircuitOpenError
- [ ] Map to HTTP status codes (per Backend doc)
- [ ] Ensure no stack traces / SQL errors leak to clients

## P2.4 OTel bootstrapping (backend)

- [ ] Add tracer + meter init
- [ ] Add span helper to attach allowed attributes
- [ ] Add redaction / allowlist enforcement (Security doc)
- [ ] Emit baseline metrics counters

## P2 Gate: Definition of Done

- [ ] `/healthz` endpoint works
- [ ] Authenticated request returns tenant_id in context
- [ ] Errors are safe and structured
- [ ] OTel spans appear locally (collector logs or exporter)

### P2 Release Checklist

- [ ] All Phase 2 PRs squash-merged to `main` (branch naming: `feat/fastify-scaffold`, `feat/auth-middleware`, `feat/error-taxonomy`, etc.)
- [ ] CI is green on `main`
- [ ] Tag release: `git tag -a v0.1.0-phase2 -m "Phase 2: API skeleton, auth, error taxonomy, OTel bootstrap"`
- [ ] Push tag: `git push origin v0.1.0-phase2`
- [ ] Create GitHub Release from tag with endpoint summary and auth setup notes
- [ ] Update `CHANGELOG.md` with Phase 2 entry

---

## PHASE 3 — BeginAction + Attempt Lifecycle (Core Semantics)

**Objective:** Implement the minimal flows that create attempts and record outcomes.

**Phase 3 watch item (consistency guardrail):** As we add endpoints in Phase 3, ensure all request bodies/params are validated via the shared Zod utilities (e.g., `parseOrThrow(...)`) so clients always get the same `VALIDATION_ERROR` error envelope and we avoid “some routes validate, some don’t.”

## P3.1 Endpoint: `POST /v1/actions/begin`

- [ ] Define request schema:
  - [ ] tool, action, args_hash or args, resource_key?, action_key?
  - [ ] idempotency_mode? (tool supports idempotency header?)
- [ ] Implement service: `BeginActionService`
  - [ ] normalize args (bounded size)
  - [ ] derive ActionKey/ResourceKey if not provided
  - [ ] lookup action terminal state
  - [ ] return the **decision envelope** (PROCEED / PENDING / REPLAY\_\*) per `Documentation/openapi.yaml`
    - [ ] Phase 3: implement minimal, deterministic behavior (PROCEED + basic PENDING/REPLAY where possible)
    - [ ] Phase 4 (v0.1): harden policy details (dedupe/join windows, REPLAY_SUCCESS/REPLAY_FAILURE, JOIN behavior)
    - [ ] Phase 6+: finalize broader replayability policy (e.g., which FAILURE classes terminalize/replay) + governor integration
  - [ ] create attempt in TX
  - [ ] append event: ATTEMPT_CREATED
  - [ ] return `attempt_id` + headers (idempotency key when relevant)

## P3.2 Endpoint: `POST /v1/attempts/:attemptId/complete`

- [ ] Define schema:
  - [ ] status SUCCESS/FAILURE
  - [ ] failure_class?
  - [ ] outcome_hash / outcome_pointer?
  - [ ] trace_id?
- [ ] Implement `CompleteAttemptService`
  - [ ] load attempt (tenant-scoped)
  - [ ] transition validation: IN_FLIGHT -> terminal only
  - [ ] append terminal event
  - [ ] Phase 3: minimal safe terminalization (e.g., SUCCESS terminalizes with outcome pointer)
  - [ ] Phase 4 (v0.1): terminal metadata + replayability wiring (SUCCESS terminalizes; AUTH/VALIDATION FAILURE terminalizes)
  - [ ] Phase 6+: finalize failure policy (attempt caps/governor) + richer replayability rules
  - [ ] emit metrics

## P3.3 Endpoint: `POST /v1/attempts/:attemptId/unknown`

- [ ] Define schema:
  - [ ] reason TIMEOUT/NETWORK
- [ ] Implement `MarkAttemptUnknownService`
  - [ ] transition validation
  - [ ] append UNKNOWN event
  - [ ] emit metrics

## P3.4 Endpoint: `GET /v1/actions/:actionKey`

- [ ] Returns action status:
  - [ ] terminal status + outcome pointer
  - [ ] latest attempt status
  - [ ] attempt count

## P3.5 State machine enforcement

- [ ] Implement attempt state transitions:
  - [ ] IN_FLIGHT -> SUCCESS/FAILURE/UNKNOWN
  - [ ] terminal states immutable
- [ ] Add DB-level guardrails where possible (constraints/checks)

## P3 Gate: Definition of Done

- [ ] You can begin an action, complete it, and read status
- [ ] UNKNOWN attempts are recorded
- [ ] All operations are tenant-scoped and traced

### P3 Release Checklist

- [ ] All Phase 3 PRs squash-merged to `main` (branch naming: `feat/begin-action`, `feat/complete-attempt`, `feat/unknown-attempt`, etc.)
- [ ] CI is green on `main`
- [ ] Tag release: `git tag -a v0.1.0-phase3 -m "Phase 3: BeginAction, attempt lifecycle, state machine"`
- [ ] Push tag: `git push origin v0.1.0-phase3`
- [ ] Create GitHub Release from tag with API endpoint summary and example curl commands
- [ ] Update `CHANGELOG.md` with Phase 3 entry

---

## PHASE 4 — Dedupe + Replay + Join/Pending

**Objective:** Make ActionKey meaningful: prevent duplicates and replay outcomes.

## P4.1 Action terminalization rules

- [ ] Decide terminalization behavior:
  - [ ] first SUCCESS makes action terminal
  - [ ] FAILURE terminalization policy is partial (v0.1): AUTH/VALIDATION terminalize; other failure classes remain non-terminal (Phase 6 caps/governor)
- [ ] Implement in `CompleteAttempt` handler:
  - [ ] if SUCCESS: set `actions.terminal_status=SUCCESS` and outcome pointer (+ terminal metadata)
  - [ ] if FAILURE: record failure; terminalize only for AUTH/VALIDATION (Phase 4 default)

## P4.2 BeginAction replay logic

- [ ] Implement action lookup and branching:
  - [ ] if terminal SUCCESS within policy -> return REPLAY_SUCCESS
  - [ ] if terminal FAILURE replayable -> return REPLAY_FAILURE
  - [ ] if in-flight:
    - [ ] JOIN behavior: wait up to join_window_ms for terminal (optional)
    - [ ] else return PENDING with poll suggestion
- [ ] Add/confirm response types:
  - [ ] `PROCEED` (attempt_id)
  - [ ] `REPLAY_SUCCESS` (outcome pointer)
  - [ ] `REPLAY_FAILURE` (failure class)
  - [ ] `PENDING` (in_flight attempt_id + retry_after)

## P4.3 Dedupe window

- [ ] Add/ensure `dedupe_expires_at` support on actions
- [ ] Enforce dedupe window replay semantics at BeginAction (REPLAY\_\* for terminal actions)
- [ ] Phase 7+: Background cleanup job may expire old actions (optional; ops/housekeeping)

## P4.4 Unknown-outcome retry path

- [ ] Ensure retry clients can:
  - [ ] call GET action status
  - [ ] see terminal success and replay
- [ ] Phase 7: Document SDK behavior for unknown outcomes (poll-before-retry; join vs pending)

## P4 Gate: Definition of Done

- [ ] Duplicate BeginAction calls with same ActionKey replay terminal outcomes
- [ ] In-flight actions return PENDING or join behavior
- [ ] Dedupe window is configurable (env or default)

### P4 Release Checklist

- [ ] All Phase 4 PRs squash-merged to `main` (branch naming: `feat/dedupe-replay`, `feat/join-pending`, etc.)
- [ ] CI is green on `main`
- [ ] Tag release: `git tag -a v0.1.0-phase4 -m "Phase 4: Dedupe, replay, join/pending — Guarantee A complete"`
- [ ] Push tag: `git push origin v0.1.0-phase4`
- [ ] Create GitHub Release from tag — highlight Guarantee A (effectively-once) now proven
- [ ] Update `CHANGELOG.md` with Phase 4 entry

---

## PHASE 5 — Leases + Concurrency Control (ResourceKey)

**Objective:** Prevent concurrent writers to the same resource.

## P5.1 Lease model

- [ ] Implement lease acquisition and renewal with TTL
  - [ ] acquire: grant if no lease or expired
  - [ ] deny: return retry_after_ms based on expires_at
  - [ ] renew: only holder may renew
- [ ] Add request context holder_id (e.g., instance_id or attempt_id)
- [ ] **Release-on-complete (Option B):** when an in-flight attempt completes and it is the current lease holder,
      release the lease early (or set expires_at=now()) to reduce queue wait time. TTL remains the safety net.

## P5.1.1 FIFO Lease Queueing

- [ ] Create `lease_waiters` table:
  - [ ] `waiter_id` (PK)
  - [ ] `tenant_id`
  - [ ] `resource_key`
  - [ ] `action_key` (optional; derived from BeginAction even when denied)
  - [ ] `client_request_id` (optional; caller-provided correlation id)
  - [ ] `queued_at` (timestamp for FIFO ordering)
  - [ ] `expires_at` (waiter timeout, default 10s)
  - [ ] `status` (WAITING, GRANTED, EXPIRED, CANCELLED)
- [ ] Implement queue logic:
  - [ ] On lease deny (and lease_mode=WAIT): insert waiter into queue
  - [ ] On lease release/expiry: next waiter becomes eligible (FIFO by `queued_at`)
  - [ ] Return `waiter_id` + queue position in denial response (so SDK can poll)
- [ ] Implement waiter cleanup:
  - [ ] Expire waiters past `expires_at` (best-effort on access/poll)
  - [ ] Cancel waiters if attempt completes/fails (deferred: waiter rows are short-lived via TTL in v0.1)
- [ ] Notification mechanism (v0.1: polling recommended):
  - [ ] `GET /v1/leases/wait/{waiter_id}` — poll for grant
  - [ ] Response: `{ "status": "WAITING" | "GRANTED" | "EXPIRED", "position": N }`
  - [ ] When GRANTED: client retries `POST /v1/actions/begin` with `lease_waiter_id` to preserve FIFO fairness.

## P5.2 Wire leases into BeginAction TX

- [ ] Add lease step to BeginAction when resource_key exists and leases enabled:
  - [ ] attempt to acquire lease
  - [ ] if denied:
    - [ ] minimal v0.1 behavior (Phase 5): `lease_mode` decides WAIT vs FAIL_FAST
      - [ ] WAIT: enqueue waiter and return 409 LEASE_DENIED with retry_after + waiter_id + queue position
      - [ ] FAIL_FAST: return 409 LEASE_DENIED with retry_after (no queue entry)
  - [ ] if granted:
    - [ ] append event: LEASE_GRANTED
- [ ] Ensure lease is renewed during in-flight (v0.1: SDK pings `POST /v1/leases/renew`; control plane auto-renew is deferred)

## P5.3 Lease endpoints

- [ ] `POST /v1/leases/acquire`
- [ ] `POST /v1/leases/renew`
      (Or internal-only if lease is only acquired during BeginAction.)

## P5.4 Coalescing (v0.1-lite)

- [ ] Add optional coalescing policy:
  - [ ] if same ActionKey in-flight, join/pending (already; implemented in Phase 4 decision logic)
  - [ ] if different ActionKeys but same ResourceKey hot:
    - [ ] surface “resource hot” metrics (deferred)
    - [ ] optionally deny/slow down via governor (Phase 6; deferred)

## P5 Gate: Definition of Done

- [ ] Two parallel BeginActions with same ResourceKey cannot both PROCEED
- [ ] Lease expiration prevents deadlocks
- [ ] Lease denies provide retry_after
- [ ] **FIFO queueing:** waiters are granted in order of arrival
- [ ] **Queue position:** clients can poll their position in queue

### P5 Release Checklist

- [ ] All Phase 5 PRs squash-merged to `main` (branch naming: `feat/lease-model`, `feat/fifo-queue`, etc.)
- [ ] CI is green on `main`
- [ ] Tag release: `git tag -a v0.1.0-phase5 -m "Phase 5: Leases, concurrency control — Guarantee C complete"`
- [ ] Push tag: `git push origin v0.1.0-phase5`
- [ ] Create GitHub Release from tag — highlight Guarantee C (bounded concurrency) now proven
- [ ] Update `CHANGELOG.md` with Phase 5 entry

---

## PHASE 6 — Governor v1 (Budgets + Backoff + Circuit Breaker)

**Objective:** Stop retry storms and enforce bounded load.

## P6.1 Policy model (minimal)

- [ ] Define default policies (in code or DB):
  - [ ] per-tool QPS budget (global per tenant) (Postgres token-bucket; env-gated)
  - [ ] per-resource budget (hot key protection) (Postgres token-bucket; env-gated)
  - [ ] max attempts per action (attempt cap)
  - [ ] backoff strategy (jittered exponential) (env-gated)
  - [ ] circuit thresholds (error rate / consecutive failures) (consecutive-failure v0.1)
- [ ] Define override shape:
  - [ ] env-configurable defaults
  - [ ] DB-stored policies with versioning (Phase 6.6)

## P6.2 Governor engine implementation

- [ ] Implement `Governor.evaluateBeginAction(ctx)`:
  - [ ] check attempt cap
  - [ ] check circuit state
  - [ ] check budgets (Postgres is source of truth; Redis optional accelerator)
  - [ ] compute retry plan (jittered `retry_after_ms`, bounded)
  - [ ] return ALLOW or DENY (with `retry_after_ms`)
- [ ] Implement `Governor.observeAttemptOutcome(...)`:
  - [ ] record failures/successes for circuit logic
  - [ ] update durable circuit state (Postgres) and any optional ephemeral counters/hints (Redis)

## P6.3 Wire governor into BeginAction

- [ ] Before TX:
  - [ ] evaluate attempt caps / budgets / circuit
  - [ ] MUST run before Attempt creation so denials do not create Attempt rows (preserve invariant)
  - [ ] deny with 429/503 if needed
  - [ ] apply retry-after semantics (v0.1): return `retry_after_ms` to the caller; SDK waits/backoff and retries
    - [ ] (later) internal scheduling/queues may be introduced, but are out of scope for v0.1

## P6.4 Wire governor into complete/unknown

- [ ] On complete/unknown:
  - [ ] observe outcomes
  - [ ] update circuit/budgets

## P6.5 Terminalization + replayability policy (follow-ups)

> This section exists to carry forward the v0.1 deferred items from earlier phases so we don’t have to “scroll back” later.

- [ ] Define failure terminalization policy under governor/attempt-cap control:
  - [ ] which `failure_class` values are terminal vs retryable
  - [ ] when attempt cap is reached, define the terminal FAILURE semantics (Phase 6.6: `ATTEMPT_CAP_EXCEEDED`)
  - [ ] ensure BeginAction returns `REPLAY_FAILURE` when an action is terminal FAILURE and replayable
- [ ] Define dedupe window edge semantics:
  - [ ] if dedupe window expires, clarify whether BeginAction MAY PROCEED again vs continues to replay (v0.1 currently replays for safety)
  - [ ] clamp/override rules for tenant policy vs request overrides (`dedupe_window_ms`, `join_window_ms`)

## P6 Gate: Definition of Done

- [ ] Under simulated 429 storms, the system denies with `retry_after_ms` rather than amplifying load
- [ ] Attempt caps prevent infinite retries
- [ ] Circuit can open and recover (basic)

### P6 Release Checklist

- [ ] All Phase 6 PRs squash-merged to `main` (branch naming: `feat/governor-engine`, `feat/budget-limits`, `feat/circuit-breaker`, etc.)
- [ ] CI is green on `main`
- [ ] Tag release: `git tag -a v0.1.0-phase6 -m "Phase 6: Governor v1 — budgets, backoff, circuits — Guarantee B complete"`
- [ ] Push tag: `git push origin v0.1.0-phase6`
- [ ] Create GitHub Release from tag — highlight Guarantee B (governed retries) now proven
- [ ] Update `CHANGELOG.md` with Phase 6 entry

## P6.6 Governor v1.1 hardening (make it production-credible)

> This section captures the “do better” items: smoother limiting, stronger circuit semantics, better backoff, better performance, and better SDK clarity.

- [ ] Policy storage + overrides:
  - [ ] add DB-backed `governor_policies` with versioning + activation
  - [ ] allow per-tenant defaults + per (tool, action) overrides
  - [ ] allow optional `resource_key_prefix` overrides (hot-prefix policy)
  - [ ] keep env vars as bootstrap defaults / safe fallback

- [ ] Rate limiting correctness (avoid fixed-window pathologies):
  - [ ] replace fixed 1s windows with Postgres token-bucket (burst + refill)
  - [ ] ensure “denied” requests do **not** consume tokens (no amplification under storms)
  - [ ] compute deterministic `retry_after_ms` from token deficit

- [ ] Circuit breaker semantics:
  - [ ] treat only failure classes that indicate downstream/tool trouble as circuit signals
    - ignore `AUTH`/`VALIDATION` (caller bug)
    - ignore governance denials (`BUDGET_DENIED`/`LEASE_DENIED`/etc.)
  - [ ] implement true single-probe HALF_OPEN (CAS/lock so only one probe proceeds)
  - [ ] preserve durable OPEN/next_probe timing in Postgres

- [ ] Backoff quality:
  - [ ] base backoff on consecutive failure/unknown streak (not just “last attempt”)
  - [ ] persist streak hints so backoff is cheap to compute (no per-request scans)
  - [ ] keep v0.1 semantics: server returns `retry_after_ms` only; no sleeping/scheduling

- [ ] Performance / query shape:
  - [ ] avoid `count(*)` and latest-attempt reads in hot paths (store counters on `actions`)
  - [ ] add/maintain `actions.attempt_count` (monotonic)
  - [ ] add/maintain `actions.last_attempt_ended_at` + `actions.last_attempt_status`

- [ ] Observability (SDK clarity + ops):
  - [ ] add governor decision metrics with reason breakdown
  - [ ] add governor evaluate latency histogram
  - [ ] ensure denials expose stable machine-readable reasons/details for SDK

- [ ] Attempt cap terminalization policy (SDK clarity):
  - [ ] when attempt cap is reached, terminalize action to `FAILURE` with `failure_class=ATTEMPT_CAP_EXCEEDED`
  - [ ] BeginAction should return `REPLAY_FAILURE` for that action thereafter

---

## PHASE 7 — TypeScript SDK v0.1 (Dev-first)

**Objective:** Make adoption easy: one wrapper to get governed execution.

## P7.1 SDK project setup

- [ ] Replace Phase-0 SDK placeholders with real implementations:
  - [ ] `@runwayctrl/sdk-core` (keying/hashing/OTel helpers)
  - [ ] `@runwayctrl/sdk-node` (HTTP client + execution wrapper)
- [ ] Shared schemas in `/packages/shared` (Zod)
- [ ] Release tooling (Changesets)
  - [ ] Ensure `.changeset/` exists and `pnpm changeset` works
  - [ ] Publishing remains Phase 11 (Phase 7 is versioning/changelog readiness)

## P7.2 SDK core features

- [ ] ActionKey derivation (stable hashing + normalization)
- [ ] ResourceKey support (pass-through + lease support via `resourceKey`)
- [ ] BeginAction client
- [ ] Tool execution wrapper:
  - [ ] starts OTel span `tool.execute`
  - [ ] calls tool API
  - [ ] completes attempt success/failure
  - [ ] handles timeout -> mark unknown
  - [ ] retry loop:
    - [ ] check action status, replay if terminal
    - [ ] obey retry_after from control plane
    - [ ] when contended and lease_mode=WAIT: poll `GET /v1/leases/wait/{waiter_id}` until GRANTED/EXPIRED, then retry BeginAction with `lease_waiter_id` to preserve FIFO fairness

### P7.2.0 Cancellation + ceilings (MUST for SDK ergonomics)

- [ ] Add `AbortSignal` support so callers can cancel:
  - [ ] lease wait polling
  - [ ] PENDING polling/backoff
  - [ ] tool execution
- [ ] Add retry ceilings:
  - [ ] max total time (wall clock)
  - [ ] max retry count
  - [ ] max sleep/backoff per iteration

> **Alignment note (Phase 6):** SDK MUST obey `retry_after_ms` and SHOULD NOT “fight” the governor with an independent retry policy.

## P7.2.1 Unknown-outcome protocol (docs + behavior)

- [ ] Document and implement the SDK’s unknown-outcome flow:
  - [ ] on timeout/network uncertainty: mark attempt UNKNOWN
  - [ ] poll action status before re-attempting
  - [ ] if status is terminal -> replay (do not re-run tool call)
  - [ ] if in-flight -> respect PENDING (and optional join behavior if configured)

> **Tool idempotency note:** UNKNOWN safety is strongest when the underlying tool supports idempotency (HEADER or PAYLOAD_TOKEN) or when outcomes are externally verifiable. SDK docs MUST state this clearly.

## P7.3 SDK ergonomics

- [ ] structured error types with `request_id` pass-through

> **Deferred to Phase 9 (by design):** ResourceKey helpers, default config object, and examples are most valuable once we have real integrations (Jira/ServiceNow/GitHub) to ground the ergonomics and key patterns. We will also make the jitter policy explicit in Phase 9.

### P7.3.1 Outcome pointer strategy (clarify early)

- [ ] Define the v0.1 outcome contract for the SDK:
  - [ ] SDK MAY return a caller-provided typed result
  - [ ] SDK MUST always be able to return/replay `outcome_pointer` (opaque string)
  - [ ] SDK MUST NOT store raw payloads by default (aligns with ADR-0009)

> **CLI UX note (optional, Option B):** When we introduce a `runwayctrl` CLI entrypoint (likely alongside the SDK release work), add a startup banner that renders **RUNWAYCTRL** using `figlet` + `gradient-string` (TTY-aware, respects `NO_COLOR`, and supports `--no-banner`).

## P7.4 SDK security requirements (from Security doc)

- [ ] Never log api keys
- [ ] Never emit payloads in telemetry by default
- [ ] Bound payload sizes before hashing

## P7 Gate: Definition of Done

- [ ] A developer can wrap one tool call and get:
  - [ ] dedupe + replay
  - [ ] unknown outcome safety
  - [ ] lease enforcement (if configured)
  - [ ] OTel spans and correlation IDs

### P7 Release Checklist

- [ ] All Phase 7 PRs squash-merged to `main` (branch naming: `feat/sdk-core`, `feat/sdk-node`, `feat/sdk-otel`, etc.)
- [ ] CI is green on `main`
- [ ] Tag release: `git tag -a v0.1.0-phase7 -m "Phase 7: TypeScript SDK v0.1"`
- [ ] Push tag: `git push origin v0.1.0-phase7`
- [ ] Create GitHub Release from tag with SDK usage examples and install instructions
- [ ] Update `CHANGELOG.md` with Phase 7 entry

---

## PHASE 8 — Observability + Security Hardening (Ship Gates)

**Objective:** Make it production-grade for early customers.

## P8.1 Observability completeness

- [ ] Ensure required OTel attributes are present everywhere:
  - [ ] action_key, attempt_id, tenant_id, tool, action, resource_key
- [ ] Add metrics:
  - [ ] begin_action latency
  - [ ] complete_attempt latency
  - [ ] budget/lease denials
  - [ ] unknown outcomes
- [ ] Add log correlation:
  - [ ] request_id in logs
  - [ ] trace_id in logs

## P8.2 Security controls implementation (MUST)

- [ ] Enforce request size limits
- [ ] Enforce per-tenant and per-IP rate limiting (edge + app)
- [ ] Ensure hashed API keys in DB and safe verification
- [ ] Ensure all queries tenant-scoped
- [ ] Ensure error responses sanitized
- [ ] Ensure telemetry/log redaction filter is active
- [ ] Ensure payload capture is OFF by default

> If payload capture is added later (post-v0.1), require: external artifact storage (no blobs in Postgres), retention TTL + deletion job, and audited access.

## P8.3 Compliance-ready features (lite)

- [ ] Retention jobs:
  - [ ] purge attempts older than N days
  - [ ] purge/expire terminal actions older than dedupe window + retention buffer (optional; ensure this cannot break replay guarantees)
  - [ ] purge payloads (if enabled) older than M days (N/A: payload capture is OFF by default)
- [ ] Audit logging for auth/key events
  - [ ] API key successful authentication event (no secrets)
  - [ ] key created / revoked events
  - [ ] rejected key reasons (revoked/invalid)
- [ ] Document restore procedure for Postgres

---

## PHASE 8A — Multi-Instance Correctness + Chaos Validation

**Objective:** Prove that RunwayCtrl behaves correctly when multiple control-plane instances share the same Postgres, under both normal concurrency and chaotic failure conditions.

> RunwayCtrl externalizes all state to Postgres and uses CAS patterns (no in-process singletons, no local caches that affect correctness). This phase **validates** that claim with real multi-instance tests.

## P8A.1 Multi-instance test infrastructure

- [ ] Add `testcontainers-node` to dev dependencies
- [ ] Create `docker-compose.multi-instance.yml`:
  - [ ] 3 control-plane instances (different ports)
  - [ ] 1 shared Postgres
  - [ ] Health-check readiness gates
- [ ] Create test harness in `apps/control-plane/src/__tests__/multi-instance/`:
  - [ ] `harness.ts` — spin up N instances, provide HTTP clients
  - [ ] `helpers.ts` — concurrent request helpers, assertion utilities
  - [ ] Configurable instance count (default: 3)
- [ ] CI integration:
  - [ ] GitHub Actions workflow: `multi-instance-tests.yml`
  - [ ] Runs on PR merge to `main` and nightly schedule
  - [ ] Docker-in-Docker or service containers

## P8A.2 CAS correctness tests

- [ ] **Concurrent BeginAction (same ActionKey):**
  - [ ] Fire identical `POST /v1/actions/begin` at all instances simultaneously
  - [ ] Assert: exactly ONE gets `PROCEED`, others get `PENDING` or `REPLAY_*`
  - [ ] Assert: exactly ONE attempt record created
- [ ] **Concurrent CompleteAttempt:**
  - [ ] Two instances try to complete the same attempt simultaneously
  - [ ] Assert: exactly ONE succeeds, the other gets `409 CONFLICT`
  - [ ] Assert: action terminal state is consistent
- [ ] **Cross-instance terminalization:**
  - [ ] Instance A creates attempt via BeginAction
  - [ ] Instance B completes that attempt
  - [ ] Instance C queries action status
  - [ ] Assert: all see consistent terminal state within read-after-write guarantees

## P8A.3 Lease contention tests

- [ ] **Concurrent lease acquisition:**
  - [ ] Two instances request leases on the same ResourceKey simultaneously
  - [ ] Assert: exactly ONE acquires the lease
  - [ ] Assert: the other gets `PENDING` with lease info
- [ ] **Lease expiry under partition:**
  - [ ] Instance A acquires a lease, then is killed (simulated crash)
  - [ ] Assert: lease TTL expires and another instance can acquire it
  - [ ] Assert: no orphaned lease blocks progress indefinitely
- [ ] **Lease renewal from wrong instance:**
  - [ ] Instance A holds a lease; Instance B tries to renew it
  - [ ] Assert: renewal rejected (holder mismatch)

## P8A.4 Governor + circuit breaker under concurrency

- [ ] **Budget exhaustion across instances:**
  - [ ] All instances fire retries concurrently against the same budget
  - [ ] Assert: total attempts do not exceed budget limit (no over-count)
- [ ] **Circuit breaker state consistency:**
  - [ ] Instance A triggers circuit OPEN
  - [ ] Instance B immediately reads circuit state
  - [ ] Assert: circuit is OPEN for all instances (no stale CLOSED reads)

## P8A.5 Resilience tests (chaos)

- [ ] **Connection pool exhaustion:**
  - [ ] Saturate one instance’s connection pool
  - [ ] Assert: other instances remain healthy
  - [ ] Assert: saturated instance recovers after connections are freed
- [ ] **Instance crash mid-transaction:**
  - [ ] Kill an instance during an active BeginAction transaction
  - [ ] Assert: Postgres rolls back the partial transaction
  - [ ] Assert: subsequent request from another instance sees consistent state
- [ ] **Postgres restart:**
  - [ ] Restart Postgres while instances are running
  - [ ] Assert: all instances recover and resume normal operation
  - [ ] Assert: no data corruption or phantom writes

## P8A.6 Reporting + regression

- [ ] Multi-instance test report: pass/fail summary per category
- [ ] Failure screenshots/logs captured in CI artifacts
- [ ] Any discovered bug → create regression test + fix before P8A gate

## P8A Gate: Definition of Done

- [ ] All 6 test categories pass with 3 concurrent instances
- [ ] CI runs green on the multi-instance workflow
- [ ] No correctness violations found (or all fixed and regression-tested)
- [ ] Test harness is documented in `Documentation/RB-OPS-005-write-heavy-load-harness.md`

---

## PHASE 8B — Ledger Insights + Cost Optimization

**Objective:** Mine the durable ledger data to surface cost savings, execution patterns, retry waste, and operational intelligence — turning RunwayCtrl’s durability into a competitive advantage.

> The ledger already captures every action, attempt, outcome, and governor decision. This phase adds a read-only analytics layer that extracts value from that data without affecting the write path.

## P8B.1 Analytics schema

- [ ] Create migration for `execution_daily_stats` table:

```sql
CREATE TABLE execution_daily_stats (
  tenant_id    TEXT        NOT NULL REFERENCES tenants(id),
  stat_date    DATE        NOT NULL,
  tool         TEXT        NOT NULL,
  action       TEXT        NOT NULL,
  -- Volume
  total_actions      INT  NOT NULL DEFAULT 0,
  total_attempts     INT  NOT NULL DEFAULT 0,
  successful_actions INT  NOT NULL DEFAULT 0,
  failed_actions     INT  NOT NULL DEFAULT 0,
  unknown_outcomes   INT  NOT NULL DEFAULT 0,
  replay_hits        INT  NOT NULL DEFAULT 0,
  -- Latency
  avg_latency_ms     INT,
  p95_latency_ms     INT,
  -- Waste & governance
  total_retry_waste  INT  NOT NULL DEFAULT 0,  -- attempts beyond first per action
  budget_denials     INT  NOT NULL DEFAULT 0,
  lease_denials      INT  NOT NULL DEFAULT 0,
  circuit_opens      INT  NOT NULL DEFAULT 0,
  -- Metadata
  computed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, stat_date, tool, action)
);

-- Index for tenant-scoped time-range queries
CREATE INDEX idx_exec_stats_tenant_date
  ON execution_daily_stats (tenant_id, stat_date DESC);
```

- [ ] Add row-level security (RLS) policy: `tenant_id = current_setting('app.tenant_id')`
- [ ] Add to ERD in `Documentation/Data Model Spec.md`

## P8B.2 Background aggregation worker

- [ ] Create `apps/control-plane/src/analytics/` module:
  - [ ] `aggregation-worker.ts` — scheduled job (cron or pg_cron)
  - [ ] `insights-queries.ts` — parameterized SQL for aggregation
  - [ ] `insights-service.ts` — business logic for insight endpoints
- [ ] Aggregation logic:
  - [ ] Run daily (configurable interval) during off-peak hours
  - [ ] Query `actions` + `attempts` + `attempt_events` for the target date range
  - [ ] UPSERT into `execution_daily_stats` (idempotent re-runs)
  - [ ] Emit OTel metric: `runwayctrl.insights.aggregation.duration_ms`
  - [ ] Emit OTel metric: `runwayctrl.insights.aggregation.rows_computed`
- [ ] Worker health:
  - [ ] Expose `/internal/insights/health` endpoint
  - [ ] Log aggregation start/complete with row counts
  - [ ] Alert if aggregation hasn’t run in > 36 hours

## P8B.3 Insights API endpoints (read-only)

> All endpoints are tenant-scoped (`X-Tenant-Id` header required), rate-limited, and served from the `execution_daily_stats` table (never query the hot write path).

- [ ] `GET /v1/insights/cost-summary`
  - [ ] Query params: `from`, `to` (date range), `tool?`, `action?`
  - [ ] Response: total actions, total attempts, retry waste ratio, replay savings, budget denial rate, unknown outcome rate
- [ ] `GET /v1/insights/tool-efficiency`
  - [ ] Query params: `from`, `to`, `tool?`
  - [ ] Response: per-tool breakdown — success rate, avg latency, retry cost, replay rate
- [ ] `GET /v1/insights/retry-waste`
  - [ ] Query params: `from`, `to`, `tool?`, `action?`
  - [ ] Response: wasted attempts, denial breakdown (budget/lease/circuit), cost-per-successful-action
- [ ] `GET /v1/insights/hotspots`
  - [ ] Query params: `from`, `to`, `top_n?` (default 10)
  - [ ] Response: top tools/actions by retry waste, contention, unknown outcomes
- [ ] Zod schemas for all request/response shapes (in `@runwayctrl/shared`)
- [ ] Add endpoints to `Documentation/openapi.yaml`

## P8B.4 OTel instrumentation for insights

- [ ] New metrics (added to `Documentation/02-otel-contract.md`):
  - [ ] `runwayctrl.insights.aggregation.duration_ms` (histogram)
  - [ ] `runwayctrl.insights.aggregation.rows_computed` (counter)
  - [ ] `runwayctrl.insights.query.duration_ms` (histogram, per endpoint)
- [ ] Spans:
  - [ ] `insights.aggregate` — wraps each aggregation run
  - [ ] `insights.query.<endpoint>` — wraps each API query
- [ ] Log events:
  - [ ] `insights.aggregation.started` / `insights.aggregation.completed`
  - [ ] `insights.aggregation.failed` (with error details)

## P8B.5 Console integration preparation

- [ ] Define Insights screen wireframe (see `Documentation/Frontend Guidelines.md` Section 4.6):
  - [ ] Cost efficiency cards: retry waste %, replay savings, budget denial rate
  - [ ] Tool efficiency table: tool, success rate, avg latency, retry cost
  - [ ] Trend sparklines: daily action volume, retry waste, unknown outcomes
  - [ ] Time range selector: 7d, 30d, 90d
- [ ] API client methods in console for all `/v1/insights/*` endpoints
- [ ] Placeholder screen in Phase 10 dashboard

## P8B.6 The Hub — LLM execution analysis

> See `Documentation/ADR-0012-hub-llm-analysis.md` for the decision record.

- [ ] **Schema migration:** create `hub_analyses` table (see Data Model Spec Section 5.10)
  - [ ] Columns: `tenant_id`, `analysis_id`, `analysis_date`, `insights` (jsonb), `model_provider`, `model_name`, `input_summary` (jsonb), `generated_at`, `created_at`
  - [ ] PK: `(tenant_id, analysis_id)`
  - [ ] Unique: `(tenant_id, analysis_date)` — one analysis per tenant per day
  - [ ] FK: `tenant_id → tenants(tenant_id)`
  - [ ] RLS policy: `tenant_id = current_setting('app.tenant_id')`
- [ ] **Hub provider adapter** (`hub-provider.ts`):
  - [ ] Abstract provider interface: `analyze(prompt: string): Promise<string>`
  - [ ] OpenAI implementation (default): uses `RUNWAYCTRL_HUB_API_KEY`, `RUNWAYCTRL_HUB_MODEL`
  - [ ] Provider resolution from `RUNWAYCTRL_HUB_PROVIDER` env var
- [ ] **Hub analyzer job** (`hub-analyzer.ts`):
  - [ ] Read aggregated stats from `execution_daily_stats` for the tenant
  - [ ] Build structured prompt with stats summary (never raw payloads/keys/PII)
  - [ ] Call LLM provider via adapter
  - [ ] Validate response with Zod schema (array of insights with severity/title/summary/recommendation/data_points)
  - [ ] Persist validated insights to `hub_analyses`
  - [ ] Skip if `ENABLE_HUB=false` or insufficient data (`< RUNWAYCTRL_HUB_MIN_DATA_DAYS`)
- [ ] **Hub service** (`hub-service.ts`):
  - [ ] `getLatestAnalysis(tenantId, options?)` — reads from `hub_analyses`
  - [ ] Returns pre-computed insights (never calls LLM at request time)
- [ ] **Hub API endpoint:**
  - [ ] `GET /v1/insights/hub` — tenant-scoped, read-only
  - [ ] Query params: `from?`, `to?`
  - [ ] Response: `{ analysis_date, insights: [...], model_provider, model_name, generated_at }`
  - [ ] 404 if Hub is disabled or no analysis exists yet
- [ ] **Hub Zod schemas** (in `packages/shared`):
  - [ ] `HubInsightSchema` (severity, title, summary, recommendation, data_points)
  - [ ] `HubAnalysisResponseSchema` (analysis_date, insights, model_provider, model_name, generated_at)
- [ ] **OTel instrumentation:**
  - [ ] `runwayctrl.hub.analysis.duration_ms` (histogram)
  - [ ] `runwayctrl.hub.analysis.insights_generated` (counter)
  - [ ] `runwayctrl.hub.query.duration_ms` (histogram)
  - [ ] Spans: `runwayctrl.hub.analyze`, `runwayctrl.hub.query`
- [ ] **Feature flag:** `ENABLE_HUB` (default `false`)
  - [ ] Hub job is a no-op when disabled
  - [ ] Hub endpoint returns 404 with clear message when disabled
- [ ] **Configuration:**
  - [ ] `RUNWAYCTRL_HUB_PROVIDER` (default: `openai`)
  - [ ] `RUNWAYCTRL_HUB_MODEL` (default: `gpt-5.2`)
  - [ ] `RUNWAYCTRL_HUB_API_KEY` (required when Hub enabled)
  - [ ] `RUNWAYCTRL_HUB_MIN_DATA_DAYS` (default: `7`)
- [ ] **Tests:**
  - [ ] Unit tests: Zod validation of LLM responses, prompt construction, threshold gating
  - [ ] Integration tests: Hub analyzer writes valid analysis to `hub_analyses`; Hub endpoint serves correct data
  - [ ] Provider adapter mock: test with deterministic LLM response

## P8B Gate: Definition of Done

- [ ] `execution_daily_stats` table created with RLS
- [ ] Aggregation worker runs daily and produces correct stats (verified against raw ledger)
- [ ] All 4 insight endpoints return correct data for test tenant
- [ ] OTel metrics emitted for aggregation and query paths
- [ ] Console wireframe approved and API client ready
- [ ] `hub_analyses` table created with RLS
- [ ] Hub analyzer job produces valid insights when enabled (with mock LLM in tests)
- [ ] `GET /v1/insights/hub` returns correct data for test tenant
- [ ] Hub is correctly gated by `ENABLE_HUB` flag and minimum-data threshold
- [ ] Hub OTel metrics emitted for analysis and query paths

## P8 Gate: Definition of Done

- [ ] Security guideline checklist in `Documentation/Security Guidelines.md` is satisfied for v0.1
- [ ] Observability shows “one-click traceability” from attempt_id
- [ ] Load test doesn’t collapse under basic abuse patterns (see `Documentation/RB-OPS-004-basic-load-test.md`)
- [ ] Write-heavy correctness harness passes invariants under concurrency (see `Documentation/RB-OPS-005-write-heavy-load-harness.md`)
- [ ] Multi-instance correctness tests all pass (P8A Gate satisfied)
- [ ] Ledger Insights endpoints return valid data (P8B Gate satisfied)

### P8 Release Checklist

- [ ] All Phase 8/8A/8B PRs squash-merged to `main`
- [ ] CI is green on `main` (including multi-instance correctness tests)
- [ ] Tag release: `git tag -a v0.1.0-phase8 -m "Phase 8: Observability, security hardening, multi-instance correctness, ledger insights — Guarantees D+E complete"`
- [ ] Push tag: `git push origin v0.1.0-phase8`
- [ ] Create GitHub Release from tag — highlight all 5 guarantees (A–E) now proven
- [ ] Update `CHANGELOG.md` with Phase 8 entry

---

## PHASE 9 — Production Integrations: Jira + ServiceNow + GitHub (v0.1)

**Objective:** Ship full production-ready integrations for our three launch verticals: project management / ticketing (Jira), enterprise ITSM (ServiceNow), and developer workflows (GitHub).

> **v0.1 Scope Lock:** GitHub + Jira + ServiceNow. PagerDuty demoted to future nice-to-have (native `incident_key`/`dedup_key` covers most dedupe value).

> **Integration research (Feb 2026):** Deep analysis of Jira and ServiceNow APIs confirmed both have zero native idempotency on write operations, no API-level external locking, and aggressive/shared rate limits. Jira scored 19/40 HIGH+ on the guarantee×action matrix; ServiceNow scored 30/50 HIGH+. See `Documentation/_INTEGRATION_RESEARCH.md` for full findings.

### P9.0 Authentication + credential contract (MUST clarify before coding)

**Jira (v0.1):**

- **Basic Auth** (simplest for v0.1, sufficient for design partners):
  - env: `JIRA_EMAIL` (account email)
  - env: `JIRA_API_TOKEN` (API token from id.atlassian.com)
  - Header: `Authorization: Basic base64(email:api_token)`
  - used for: all Jira REST API v3 endpoints
- **OAuth 2.0 (3LO)** (supported as follow-up for enterprise):
  - env: `JIRA_OAUTH_CLIENT_ID`, `JIRA_OAUTH_CLIENT_SECRET`
  - note: implement only if/when needed for Atlassian Marketplace or enterprise OAuth requirements.
- **Instance URL:**
  - env: `JIRA_BASE_URL` (e.g., `https://yourcompany.atlassian.net`)

**ServiceNow (v0.1):**

- **Basic Auth** (simplest for v0.1):
  - env: `SERVICENOW_USERNAME`
  - env: `SERVICENOW_PASSWORD`
  - Header: `Authorization: Basic base64(username:password)`
  - used for: all ServiceNow Table API endpoints
- **OAuth 2.0** (supported as follow-up for enterprise):
  - env: `SERVICENOW_OAUTH_CLIENT_ID`, `SERVICENOW_OAUTH_CLIENT_SECRET`
  - note: implement only if/when needed for enterprise SSO requirements.
- **Instance URL:**
  - env: `SERVICENOW_INSTANCE_URL` (e.g., `https://yourcompany.service-now.com`)

**GitHub (v0.1):**

- **PAT (fine-grained preferred)**:
  - env: `GITHUB_TOKEN`
  - used for: all GitHub actions in P9.3
- **GitHub App auth** is supported as an optional follow-up once PAT path is stable:
  - env: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_PEM`, `GITHUB_APP_INSTALLATION_ID`
  - note: implement only if/when needed for enterprise orgs that disallow PATs.

Reference (canonical for Phase 9):

- `Documentation/_INTEGRATION_RESEARCH.md`

### P9.0.1 Provision Test Instances (MUST complete before P9.2)

> **Why now:** Real-instance validation during Phase 9 catches error-mapping, rate-limit, and idempotency surprises that MSW mocks cannot reproduce. Both services offer free tiers specifically designed for developer testing.

- [ ] **Jira Cloud Developer Site** (free):
  - [ ] Sign up at <https://developer.atlassian.com/> → "Create a cloud development site"
  - [ ] Create test project with key `RCTEST`
  - [ ] Generate API token at <https://id.atlassian.com/manage-profile/security/api-tokens>
  - [ ] Record: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
- [ ] **ServiceNow Personal Developer Instance** (free):
  - [ ] Sign up at <https://developer.servicenow.com/> → "Request Instance"
  - [ ] Note instance URL (e.g., `https://devXXXXX.service-now.com`)
  - [ ] Record: `SERVICENOW_INSTANCE_URL`, `SERVICENOW_USERNAME`, `SERVICENOW_PASSWORD`
  - [ ] Create a test assignment group `RunwayCtrl Dev` and a test category `RunwayCtrl Test`
- [ ] **GitHub** (existing PAT is sufficient):
  - [ ] Create a test repository `runwayctrl-integration-test` (private)
  - [ ] Generate a fine-grained PAT scoped to the test repo
  - [ ] Record: `GITHUB_TOKEN`
- [ ] Document all test instance URLs, project keys, and naming conventions in `TESTING.md` (root of repo)

### P9.0.2 Test Data Conventions

- [ ] **Jira:** all test issues use project `RCTEST`, label `runwayctrl-test`
  - [ ] Create a standard set of issue types for testing: Task, Bug, Story
  - [ ] Define cleanup: after CI runs, archive or bulk-delete issues with `runwayctrl-test` label
- [ ] **ServiceNow:** all test records use category `RunwayCtrl Test`, assignment group `RunwayCtrl Dev`
  - [ ] Use caller `RunwayCtrl Test User` (or integration user)
  - [ ] Define cleanup: set a scheduled job or manual script to close/delete test incidents older than 7 days
- [ ] **GitHub:** all test PRs/issues use label `runwayctrl-test` in the test repo
  - [ ] Define cleanup: close stale test PRs/issues after CI runs
- [ ] Document conventions in `TESTING.md`

### P9.0.3 Dev Credential Management

- [ ] Create `.env.local.example` with placeholders for all integration credentials:

  ```env
  # Jira Cloud (Developer Site)
  JIRA_BASE_URL=https://YOUR-SITE.atlassian.net
  JIRA_EMAIL=your-email@example.com
  JIRA_API_TOKEN=your-api-token

  # ServiceNow (Personal Developer Instance)
  SERVICENOW_INSTANCE_URL=https://devXXXXX.service-now.com
  SERVICENOW_USERNAME=admin
  SERVICENOW_PASSWORD=your-password

  # GitHub
  GITHUB_TOKEN=ghp_your-fine-grained-pat

  # RunwayCtrl Control Plane (local dev)
  RUNWAYCTRL_BASE_URL=http://localhost:8080
  RUNWAYCTRL_API_KEY=dev-api-key
  ```

- [ ] Add `.env.local` to `.gitignore` (verify it's present)
- [ ] Document: local dev uses `.env.local` (never committed)
- [ ] Document: CI uses GitHub Actions encrypted secrets (`Settings → Secrets → Actions`)
- [ ] Store CI secrets:
  - [ ] `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
  - [ ] `SERVICENOW_INSTANCE_URL`, `SERVICENOW_USERNAME`, `SERVICENOW_PASSWORD`
  - [ ] `GITHUB_TOKEN`
- [ ] Verify: secrets are available in integration test workflow but NOT in PR workflows from forks

### P9.0.4 OAuth 2.0 Expansion Path (decision record)

> **v0.1 uses Basic Auth for Jira and ServiceNow.** This is locked. OAuth 2.0 is v0.2 scope.

- [ ] Document migration path in an ADR or this section:
  - [ ] Add `AuthStrategy` interface to integration adapters (`BasicAuth | OAuth2`)
  - [ ] Swap auth strategy at config level — no SDK API change required
  - [ ] Jira OAuth 2.0 (3LO): requires Atlassian Connect app registration + token refresh flow
  - [ ] ServiceNow OAuth 2.0: requires OAuth application registration in instance + client credentials / authorization code flow
  - [ ] GitHub App auth: requires app registration + installation token flow (already noted in P9.0 above)
- [ ] Design partners who ask about OAuth can be told: "v0.1 Basic Auth works for development and small teams. OAuth 2.0 ships in v0.2 with zero SDK API changes."

---

## P9.1 Integration Package Structure

- [ ] Create `/packages/integrations-jira`
  - [ ] Package setup (tsconfig, package.json)
  - [ ] Export wrapped actions
  - [ ] README with usage examples
- [ ] Create `/packages/integrations-servicenow`
  - [ ] Package setup (tsconfig, package.json)
  - [ ] Export wrapped actions
  - [ ] README with usage examples
- [ ] Create `/packages/integrations-github`
  - [ ] Package setup (tsconfig, package.json)
  - [ ] Export wrapped actions
  - [ ] README with usage examples

## P9.1.1 SDK ergonomics (deferred from Phase 7)

- [ ] Add **ResourceKey helpers** in the SDK to standardize key construction for integrations:
  - [ ] e.g., `resourceKey.jira.project(projectKey)`
  - [ ] e.g., `resourceKey.jira.issue(projectKey, issueNumber)`
  - [ ] e.g., `resourceKey.jira.issueComments(projectKey, issueNumber)`
  - [ ] e.g., `resourceKey.servicenow.incident(sysId)`
  - [ ] e.g., `resourceKey.servicenow.service(serviceName)`
  - [ ] e.g., `resourceKey.servicenow.catalogItem(itemId)`
  - [ ] e.g., `resourceKey.github.pullRequest(owner, repo, pullNumber)`
  - [ ] MUST keep keys within the server’s ResourceKey constraints
- [ ] Add a **default config object / factory** for SDK ergonomics:
  - [ ] base_url, api_key, timeouts (env helpers)
  - [ ] retry ceilings (maxAttempts/maxElapsedMs/maxSleepMs) via executor defaults
  - [ ] clientName tagging
- [ ] Jitter policy (polling/backoff ergonomics; governor remains authoritative):
  - [ ] v0.1 default: **NO jitter** (deterministic sleeps; simplest debugging)
  - [ ] optional: bounded jitter (opt-in) for SDK-local polling loops to reduce thundering herd
    - [ ] MUST NOT sleep _less_ than `retry_after_ms` from the control plane
- [ ] Ensure `/examples/*` are complete, runnable, and aligned with integrations (see P9.4)

---

## P9.2 Jira Integration (Full Scope)

**Target Audience:** Platform/agent engineers, sprint automation, CI-linked ticketing

> **Research basis:** Jira Cloud REST API v3 has zero native idempotency on issue creation, comments, subtasks, and links. Concurrent transitions return 409 with no coordination primitive (Atlassian tells callers to "employ a retry mechanism" without offering one). New points-based rate limits (`jira-per-issue-on-write`) enforcing March 2026. See `Documentation/_INTEGRATION_RESEARCH.md`.

### P9.2.1 Core Actions

- [ ] `jira.create_issue`
  - [ ] API: `POST /rest/api/3/issue`
  - [ ] ResourceKey: `jira:project:{project_key}`
  - [ ] Dedupe: via ActionKey (args hash) — Jira has NO native idempotency key
  - [ ] Lease: Supported via ResourceKey + leaseMode=WAIT (recommended when creating from same trigger event)
- [ ] `jira.add_comment`
  - [ ] API: `POST /rest/api/3/issue/{issueIdOrKey}/comment`
  - [ ] ResourceKey: `jira:issue:{project_key}:{issue_number}:comments`
  - [ ] Dedupe: via ActionKey (args hash; callers can hash long content) — Jira has NO native comment dedup
  - [ ] Lease: Not recommended (comments can be concurrent); supported if desired
- [ ] `jira.transition_issue`
  - [ ] API: `POST /rest/api/3/issue/{issueIdOrKey}/transitions`
  - [ ] ResourceKey: `jira:issue:{project_key}:{issue_number}`
  - [ ] Dedupe: via ActionKey (args hash) — concurrent transitions return 409 in Jira
  - [ ] Lease: **STRONGLY recommended** via ResourceKey + leaseMode=WAIT — this is the highest-value guarantee for Jira. Prevents the 409 race condition entirely.
- [ ] `jira.create_issue_link`
  - [ ] API: `POST /rest/api/3/issueLink`
  - [ ] ResourceKey: `jira:issuelink:{inward_issue}:{outward_issue}`
  - [ ] Dedupe: via ActionKey (args hash) — Jira creates duplicate links on repeat calls
  - [ ] Lease: Not recommended; supported if desired
- [ ] `jira.update_fields`
  - [ ] API: `PUT /rest/api/3/issue/{issueIdOrKey}`
  - [ ] ResourceKey: `jira:issue:{project_key}:{issue_number}`
  - [ ] Dedupe: Natively idempotent (PUT, last-write-wins) — ActionKey still recorded for forensics
  - [ ] Lease: **Recommended** — prevents silent last-write-wins overwrites between agents
- [ ] `jira.assign_issue`
  - [ ] API: `PUT /rest/api/3/issue/{issueIdOrKey}/assignee`
  - [ ] ResourceKey: `jira:issue:{project_key}:{issue_number}:assignee`
  - [ ] Dedupe: Natively idempotent (PUT) — ActionKey still recorded
  - [ ] Lease: **Recommended** — prevents competing assignment overwrites
- [ ] `jira.bulk_create_issues`
  - [ ] API: `POST /rest/api/3/issue/bulk`
  - [ ] ResourceKey: `jira:project:{project_key}:bulk:{batch_id}`
  - [ ] Dedupe: via ActionKey (args hash) — Jira has NO native bulk dedup
  - [ ] Lease: Supported via ResourceKey + leaseMode=WAIT
- [ ] `jira.add_attachment`
  - [ ] API: `POST /rest/api/3/issue/{issueIdOrKey}/attachments`
  - [ ] ResourceKey: `jira:issue:{project_key}:{issue_number}:attachments`
  - [ ] Dedupe: via ActionKey (args hash) — every POST creates new attachment
  - [ ] Lease: Not recommended; supported if desired

### P9.2.2 Jira-Specific Logic

- [ ] Map Jira API errors to failure_class:
  - [ ] 429 -> RATE_LIMIT (parse new rate limit headers: `X-RateLimit-*`, `Retry-After`)
  - [ ] 409 -> CONFLICT (concurrent transition race — the critical case for leases)
  - [ ] 401/403 -> AUTH
  - [ ] 404 -> VALIDATION (issue not found)
  - [ ] 400 -> VALIDATION (invalid fields, invalid transition)
  - [ ] 5xx -> SERVER_ERROR
- [ ] Parse Jira's new points-based rate limit headers for governor integration:
  - [ ] `jira-quota-global-based`, `jira-quota-tenant-based`, `jira-burst-based`, `jira-per-issue-on-write`
  - [ ] Feed `Retry-After` values to RunwayCtrl's governor
- [ ] **During development:** log all rate limit header values on every Jira response (track points consumption against your Developer Site quota)
- [ ] Handle 409 on transitions as a coordination signal (not a terminal failure)
- [ ] Map Jira issue key from response (e.g., `ENG-1847`) as `outcome_pointer`

### P9.2.3 Jira Testing

- [ ] Mock Jira API server for integration tests
  - [ ] Standardize on **MSW (Node)** handlers via `@runwayctrl/testkit` so tests are deterministic and do not make external network calls.
- [ ] Test scenarios:
  - [ ] Duplicate issue creation -> REPLAY_SUCCESS (ActionKey replay, Jira never called twice)
  - [ ] Duplicate comment -> REPLAY_SUCCESS
  - [ ] Concurrent transitions on same issue -> Lease serializes, no 409 race
  - [ ] Rate limit (429) -> governor budget denial + backoff using Jira's `Retry-After`
  - [ ] Per-issue-on-write throttle -> governed retry
  - [ ] Timeout -> UNKNOWN -> retry succeeds (SDK unit tests cover UNKNOWN/poll/replay behavior)
  - [ ] Duplicate issue link -> REPLAY_SUCCESS (no duplicate link in Jira)
- [ ] **Required:** test against real Jira Cloud Developer Site (free tier, provisioned in P9.0.1)
  - [ ] Run at least: happy-path issue creation, one 409 transition race, one rate-limit observation
  - [ ] Verify error mapping matches real Jira responses (not just MSW mocks)
  - [ ] Log rate limit header values on every response to track points consumption
  - [ ] Record evidence: action_keys, outcome_pointers, response headers

---

## P9.2B ServiceNow Integration (Full Scope)

**Target Audience:** Enterprise platform engineers, ITSM automation, incident/change management agents

> **Research basis:** ServiceNow Table API has zero native idempotency on ALL write operations. GlideMutex is server-side only — REST API callers get zero locking. Shared rate limits per instance (~100K req/hr Enterprise). Work notes/comments are JOURNAL-type fields that APPEND despite being PUT. See `Documentation/_INTEGRATION_RESEARCH.md`.

### P9.2B.1 Core Actions

- [ ] `servicenow.create_incident`
  - [ ] API: `POST /api/now/table/incident`
  - [ ] ResourceKey: `servicenow:service:{service_name}:incident`
  - [ ] Dedupe: via ActionKey (args hash) — ServiceNow has NO native idempotency key
  - [ ] Lease: Supported via ResourceKey + leaseMode=WAIT (recommended when creating from same alert/trigger)
- [ ] `servicenow.create_change_request`
  - [ ] API: `POST /api/now/table/change_request`
  - [ ] ResourceKey: `servicenow:ci:{ci_name}:change`
  - [ ] Dedupe: via ActionKey (args hash) — NO native dedup. Duplicate change requests = audit/compliance violation risk.
  - [ ] Lease: **STRONGLY recommended** — prevents duplicate changes against same CI
- [ ] `servicenow.add_work_note`
  - [ ] API: `PUT /api/now/table/incident/{sys_id}` (with `work_notes` field)
  - [ ] ResourceKey: `servicenow:incident:{sys_id}:notes`
  - [ ] Dedupe: via ActionKey (args hash) — CRITICAL: `work_notes` is a JOURNAL-type field that APPENDS on every PUT despite being a PUT request. No native dedup.
  - [ ] Lease: Not recommended; supported if desired
- [ ] `servicenow.add_comment`
  - [ ] API: `PUT /api/now/table/incident/{sys_id}` (with `comments` field)
  - [ ] ResourceKey: `servicenow:incident:{sys_id}:comments`
  - [ ] Dedupe: via ActionKey (args hash) — same JOURNAL-type append behavior as work notes
  - [ ] Lease: Not recommended; supported if desired
- [ ] `servicenow.update_state`
  - [ ] API: `PUT /api/now/table/incident/{sys_id}` (with `state` field)
  - [ ] ResourceKey: `servicenow:incident:{sys_id}`
  - [ ] Dedupe: Partially idempotent (PUT, last-write-wins) — but state transitions can trigger Business Rules/SLA timers that fire again
  - [ ] Lease: **STRONGLY recommended** — this is the highest-value guarantee for ServiceNow. No API-level locking exists. GlideMutex is server-side only.
- [ ] `servicenow.assign_incident`
  - [ ] API: `PUT /api/now/table/incident/{sys_id}` (with `assigned_to` field)
  - [ ] ResourceKey: `servicenow:incident:{sys_id}:assignee`
  - [ ] Dedupe: Natively idempotent (PUT, last-write-wins) — ActionKey still recorded
  - [ ] Lease: **Recommended** — prevents competing assignment overwrites
- [ ] `servicenow.create_cmdb_ci`
  - [ ] API: `POST /api/now/table/cmdb_ci_{type}`
  - [ ] ResourceKey: `servicenow:cmdb:{ci_class}:{ci_name}`
  - [ ] Dedupe: via ActionKey (args hash) — direct Table API has zero dedup (IRE engine only works via Import Sets)
  - [ ] Lease: Supported via ResourceKey + leaseMode=WAIT
- [ ] `servicenow.create_problem`
  - [ ] API: `POST /api/now/table/problem`
  - [ ] ResourceKey: `servicenow:service:{service_name}:problem`
  - [ ] Dedupe: via ActionKey (args hash) — NO native dedup
  - [ ] Lease: Supported via ResourceKey + leaseMode=WAIT
- [ ] `servicenow.order_service_request`
  - [ ] API: `POST /api/sn_sc/servicecatalog/items/{id}/order_now`
  - [ ] ResourceKey: `servicenow:catalog:{item_id}:order:{requester_id}`
  - [ ] Dedupe: via ActionKey (args hash) — NO native dedup. Duplicate orders = real money (duplicate hardware, licenses, etc.)
  - [ ] Lease: **STRONGLY recommended** — prevents duplicate procurement
- [ ] `servicenow.close_resolve`
  - [ ] API: `PUT /api/now/table/incident/{sys_id}` (with `state=6` resolved or `state=7` closed)
  - [ ] ResourceKey: `servicenow:incident:{sys_id}`
  - [ ] Dedupe: Partially idempotent — but closing can trigger workflows (notification, satisfaction survey)
  - [ ] Lease: **Recommended** — same as update_state

### P9.2B.2 ServiceNow-Specific Logic

- [ ] Map ServiceNow API errors to failure_class:
  - [ ] 429 -> RATE_LIMIT (shared per-instance pool)
  - [ ] 401/403 -> AUTH
  - [ ] 404 -> VALIDATION (record not found)
  - [ ] 400 -> VALIDATION (invalid fields, bad state transition)
  - [ ] 5xx -> SERVER_ERROR
- [ ] Handle JOURNAL-type field semantics:
  - [ ] `work_notes` and `comments` fields APPEND on PUT — treat as non-idempotent despite HTTP method
  - [ ] Document this gotcha clearly in SDK + integration guide
- [ ] Parse ServiceNow rate limit context from response headers
- [ ] **During development:** log rate limit header values on every ServiceNow response (track shared-instance consumption against ~100K req/hr pool)
- [ ] Map ServiceNow `sys_id` and `number` from response as `outcome_pointer`
- [ ] Handle ServiceNow Business Rule side effects (notifications, SLA timers) in dedup strategy

### P9.2B.3 ServiceNow Testing

- [ ] Mock ServiceNow Table API server for integration tests
  - [ ] Standardize on **MSW (Node)** handlers via `@runwayctrl/testkit` (same approach as Jira/GitHub)
- [ ] Test scenarios:
  - [ ] Duplicate incident creation -> REPLAY_SUCCESS (ActionKey replay, ServiceNow never called twice)
  - [ ] Duplicate work note -> REPLAY_SUCCESS (journal append prevented)
  - [ ] Duplicate change request -> REPLAY_SUCCESS (compliance-safe)
  - [ ] Concurrent state update on same incident -> Lease serializes (no GlideMutex needed by caller)
  - [ ] Duplicate service request order -> REPLAY_SUCCESS (no double procurement)
  - [ ] Rate limit (429) -> governor budget denial + backoff
  - [ ] Timeout -> UNKNOWN -> retry succeeds
  - [ ] Duplicate CMDB CI creation -> REPLAY_SUCCESS
- [ ] **Required:** test against real ServiceNow Personal Developer Instance (free tier, provisioned in P9.0.1)
  - [ ] Run at least: happy-path incident creation, one journal-append dedup, one state transition lease
  - [ ] Verify error mapping matches real ServiceNow responses (not just MSW mocks)
  - [ ] Log rate limit context from response headers to track shared-instance consumption
  - [ ] Record evidence: action_keys, outcome_pointers (sys_id, number), response headers

---

## P9.3 GitHub Integration (Full Scope)

**Target Audience:** Developers, CI/CD automation, agent-driven code workflows

### P9.3.1 Core Actions

- [ ] `github.merge_pr`
  - [ ] ResourceKey: `github:{owner}/{repo}:pr:{pull_number}`
  - [ ] Dedupe: via ActionKey (args hash)
  - [ ] Lease: Supported via ResourceKey + leaseMode=WAIT (recommended)
- [ ] `github.create_pr`
  - [ ] ResourceKey: `github:{owner}/{repo}:branch:{head_branch}`
  - [ ] Dedupe: via ActionKey (args hash)
  - [ ] Lease: Supported via ResourceKey + leaseMode=WAIT (recommended)
- [ ] `github.close_pr`
  - [ ] ResourceKey: `github:{owner}/{repo}:pr:{pull_number}`
  - [ ] Dedupe: via ActionKey (args hash)
  - [ ] Lease: Supported via ResourceKey + leaseMode=WAIT (recommended)
- [ ] `github.create_issue`
  - [ ] ResourceKey: `github:{owner}/{repo}:issues`
  - [ ] Dedupe: via ActionKey (args hash; callers can hash long bodies)
  - [ ] Lease: Not recommended (issues can be concurrent); supported if desired
- [ ] `github.close_issue`
  - [ ] ResourceKey: `github:{owner}/{repo}:issue:{issue_number}`
  - [ ] Dedupe: via ActionKey (args hash)
  - [ ] Lease: Not recommended; supported if desired
- [ ] `github.add_comment`
  - [ ] ResourceKey: `github:{owner}/{repo}:issue:{issue_number}:comments`
  - [ ] Dedupe: via ActionKey (args hash; callers can hash long bodies)
  - [ ] Lease: Not recommended; supported if desired
- [ ] `github.create_release`
  - [ ] ResourceKey: `github:{owner}/{repo}:release:{tag_name}`
  - [ ] Dedupe: via ActionKey (args hash)
  - [ ] Lease: Supported via ResourceKey + leaseMode=WAIT (recommended)
- [ ] `github.trigger_workflow`
  - [ ] ResourceKey: `github:{owner}/{repo}:workflow:{workflow_id}:{ref}`
  - [ ] Dedupe: via ActionKey (args hash)
  - [ ] Lease: Optional (supported via ResourceKey + leaseMode)

### P9.3.2 GitHub-Specific Logic

- [ ] Map GitHub API errors to failure_class:
  - [ ] 403 rate limit -> RATE_LIMIT (header-based detection)
  - [ ] 401/403 auth -> AUTH
  - [ ] 404 -> VALIDATION (not found)
  - [ ] 409 conflict -> context-dependent (already-merged treated as SUCCESS; otherwise VALIDATION)
  - [ ] 422 -> VALIDATION
  - [ ] 5xx -> SERVER_ERROR
- [ ] Handle "already merged" as REPLAY_SUCCESS (not error)
- [ ] Handle "PR not mergeable" as FAILURE with clear failure_class
- [ ] Support GitHub Apps auth + PAT auth

### P9.3.3 GitHub Testing

- [ ] Mock GitHub API server (using msw or similar)
  - [ ] Standardize on **MSW (Node)** handlers via `@runwayctrl/testkit` (same approach as Jira/ServiceNow)
- [ ] Test scenarios:
  - [ ] Duplicate merge attempt -> REPLAY_SUCCESS (ActionKey replay)
  - [ ] Concurrent merges on same PR -> FIFO queue, one wins (covered by control-plane lease FIFO integration tests)
  - [ ] Create PR when PR exists for branch -> REPLAY_SUCCESS (adapter tests)
  - [ ] Merge conflict / not mergeable -> FAILURE (adapter logic + failure class mapping)
  - [ ] Rate limit -> budget denial + backoff (SDK unit tests cover retry_after_ms behavior)
  - [ ] Timeout during merge -> UNKNOWN -> poll for state (SDK unit tests cover UNKNOWN/poll/replay behavior)

---

## P9.4 Example Applications

- [ ] `examples/jira-auto-triage`
  - [ ] Agent creates a Jira issue from a monitoring alert
  - [ ] Demonstrates dedupe/replay (second identical call replays, no duplicate issue)
  - [ ] Demonstrates lease on project-level creation
- [ ] `examples/jira-sprint-close`
  - [ ] Agent transitions multiple issues to Done
  - [ ] Demonstrates lease on transitions (no 409 races)
  - [ ] Demonstrates rate-limit governance under Jira’s new per-issue write limits
- [ ] `examples/servicenow-incident-response`
  - [ ] Agent creates a ServiceNow incident, adds work notes, resolves
  - [ ] Demonstrates full lifecycle with dedupe at every step
  - [ ] Demonstrates lease on state transitions (no GlideMutex needed)
- [ ] `examples/servicenow-onboarding-request`
  - [ ] Agent orders a service catalog item (e.g., laptop for new hire)
  - [ ] Demonstrates dedupe preventing duplicate procurement orders
- [ ] `examples/github-auto-merge`
  - [ ] Attempts to merge a PR
  - [ ] Demonstrates lease + dedupe/replay
  - [ ] Demonstrates a safe fallback (comment on failure)
- [ ] `examples/github-issue-triage`
  - [ ] Creates an issue with optional labels/assignees
  - [ ] Demonstrates safe-body hashing pattern
  - [ ] Demonstrates follow-up comment (optional) without leasing

## P9.5 Integration Documentation

- [ ] Jira integration guide:
  - [ ] Setup (Basic auth / OAuth 2.0 3LO)
  - [ ] Action reference with ResourceKey patterns
  - [ ] Common patterns: transition leasing, comment dedup, rate limit governance
  - [ ] Known gotchas: 409 on concurrent transitions, per-issue-on-write throttle
- [ ] ServiceNow integration guide:
  - [ ] Setup (Basic auth / OAuth 2.0)
  - [ ] Action reference with ResourceKey patterns
  - [ ] Common patterns: incident lifecycle, work note dedup, catalog ordering
  - [ ] Known gotchas: JOURNAL field append-on-PUT, GlideMutex unavailable to REST callers, shared instance rate limits
- [ ] GitHub integration guide:
  - [ ] Setup (GitHub App or PAT)
  - [ ] Action reference with ResourceKey patterns
  - [ ] Common patterns and production tips

## P9 Gate: Definition of Done

- [ ] Jira: All 8 actions implemented and tested
- [ ] ServiceNow: All 10 actions implemented and tested
- [ ] GitHub: All 8 actions implemented and tested
- [ ] All three integrations have working example apps
- [ ] README walkthroughs are copy/paste runnable
- [ ] Dashboard shows integration-specific metrics (Phase 10)

### P9 Release Checklist

- [ ] All Phase 9 PRs squash-merged to `main` (branch naming: `feat/integration-jira`, `feat/integration-servicenow`, `feat/integration-github`, etc.)
- [ ] CI is green on `main` (including integration-specific tests)
- [ ] Tag release: `git tag -a v0.1.0-phase9 -m "Phase 9: Production integrations — Jira, ServiceNow, GitHub"`
- [ ] Push tag: `git push origin v0.1.0-phase9`
- [ ] Create GitHub Release from tag with per-integration summaries and example app links
- [ ] Update `CHANGELOG.md` with Phase 9 entry

---

## PHASE 10 — Minimal Dashboard (v0.1)

**Objective:** Provide read-only visibility into execution state for debugging and demos.

> **See [Frontend Guidelines.md](Frontend%20Guidelines.md) for UI patterns and component library.**

## P10.1 Dashboard scaffolding

- [ ] Create Next.js app in `/apps/console`
  - [ ] App Router structure
  - [ ] Tailwind CSS setup
  - [ ] Simple server-side `fetch` + runtime validation (Zod schemas in `@runwayctrl/shared`)
  - [ ] Tables implemented with native HTML (TanStack Table deferred)
  - [ ] Adopt a small, consistent component system (recommended for v0.1 polish)
    - [ ] Option A: shadcn/ui (Radix primitives) for tables, dialogs, menus, toasts
    - [ ] Option B: keep custom components but define tokens + variants (button, chip, panel, table)
  - [ ] Motion system (v0.1): tasteful micro-interactions + route transitions
    - [ ] Respect `prefers-reduced-motion`
    - [ ] Skeletons/empty/error states feel “finished” (no jank)
- [ ] API client connecting to Control Plane
  - [ ] Auth with API key
  - [ ] Error handling

## P10.2 Core screens (read-only, interactive)

> **2026 Design Language:** Bento grid layout (asymmetric card grid), dark mode first with light mode toggle, glassmorphism depth on cards, micro-interactions on hover/focus, animated number counters, sparkline-embedded table cells, command palette (Cmd+K / Ctrl+K) for global search, collapsible side panels for drill-down instead of full-page navigation. All read-only — no mutations from the console.

- [ ] **Global UX shell:**
  - [ ] Command palette (`Cmd+K` / `Ctrl+K`): search actions by `action_key`, `resource_key`, tool, status — instant fuzzy results
  - [ ] Collapsible side panel: clicking any row in a table opens a slide-over detail panel (no page navigation for quick forensics)
  - [ ] Persistent time-range selector (sticky top bar): last 1h / 6h / 24h / 7d / 30d / custom range
  - [ ] Dark mode first (system preference detection + manual toggle)
  - [ ] Animated route transitions (cross-fade, 150ms)
  - [ ] Skeleton loading for all cards and tables (no spinners)
  - [ ] Toast notifications for background data refreshes

- [ ] **Actions List**
  - [ ] Table: time, tool, action, status, resource_key, attempts count, latency (sparkline in cell)
  - [ ] Inline sparklines: mini latency trend per action (last 7 data points, rendered in cell)
  - [ ] Filters: status, tool, time range, resource_key prefix
  - [ ] Search by action_key (via `q`) — also accessible via command palette
  - [ ] Row hover: preview card appears showing attempt count + last outcome + trace link
  - [ ] Row click: opens collapsible side panel with Action Detail

- [ ] **Action Detail (side panel + full page)**
  - [ ] Vertical timeline of attempts (animated expansion, each attempt is a timeline node)
  - [ ] Metadata: action_key, resource_key, created_at, terminal_at, ARF fingerprint
  - [ ] Integration badge: shows which provider (Jira / ServiceNow / GitHub) with provider-specific icon and rate limit context at time of execution
  - [ ] Link to OTel traces (if trace_id available) — "Open trace" button
  - [ ] Copy deep-link button (for incident sharing)

- [ ] **Attempts List**
  - [ ] Table: time, action_key, status, duration, failure_class, tool_http_status
  - [ ] Filter by status, failure_class
  - [ ] Inline status chips with micro-animation on state transitions (pulse on UNKNOWN)

- [ ] **Attempt Detail**
  - [ ] Governor decision shown (PROCEED / DENY / PENDING with reason)
  - [ ] Lease info (if applicable): holder_id, wait time, queue position
  - [ ] Request/response hashes
  - [ ] Envelope identifiers (request_id, tool_request_id, tool_http_status, latency_ms)
  - [ ] Trace click-through ("Open trace") when `RUNWAYCTRL_TRACE_URL_TEMPLATE` is configured
  - [ ] Rate limit context at time of attempt: show the provider rate limit headers captured during this attempt

## P10.3 Scoreboard (Bento Grid)

> **Layout:** Asymmetric bento grid — large hero card (top-left, 2×2) for "Duplicates Prevented", three standard cards (1×1) along the right and bottom. All cards have animated number counters on load and hover-to-expand detail panels.

- [ ] **Hero card: Duplicates Prevented**
  - [ ] Large animated counter: total REPLAY_SUCCESS count (lifetime + selected time range)
  - [ ] Subtitle sparkline: daily trend over selected range
  - [ ] Hover: expand to show per-tool breakdown (Jira / ServiceNow / GitHub)
  - [ ] Visual: glassmorphism card with subtle depth shadow
- [ ] **Card: Retries Governed**
  - [ ] Counter: total retry budget denials
  - [ ] Subtitle: "storms prevented" (estimated saved API calls)
  - [ ] Hover: per-tool denial breakdown
- [ ] **Card: Leases Active / Contended**
  - [ ] Counter: current active leases + current waiters
  - [ ] Subtitle: avg wait time (ms)
  - [ ] Hover: top 5 most contended resource_keys
- [ ] **Card: Circuit Breaker Health**
  - [ ] Status indicators: CLOSED (green pulse) / OPEN (red pulse) / HALF_OPEN (amber pulse)
  - [ ] Per-tool circuit state with live pulsing dot
  - [ ] Hover: last state change timestamp + failure count
- [ ] Time range selector (applies globally)

## P10.3A Integration Health Panel (NEW — per-provider connection + rate limits)

> **Purpose:** Answer "Are my integrations healthy? Am I about to hit a rate limit?" in one glance. This is the equivalent of a "hotel connection" dashboard — each integration is a connection with health, latency, and quota status.

> **Data source:** Rate limit headers are captured and stored on each attempt record during tool execution (P9.2.2 / P9.2B.2 / P9.3.2). The dashboard reads the most recent captured values from the ledger.

- [ ] **Integration Connection Cards** (one per configured provider):
  - [ ] **Jira Cloud**
    - [ ] Connection status: live pulsing dot (green = healthy, amber = degraded, red = down)
    - [ ] Last successful call timestamp
    - [ ] Success rate (last 1h): percentage + sparkline
    - [ ] **Rate Limit Gauges (4 radial gauges, Jira-specific):**
      - [ ] Global quota (`jira-quota-global-based`): radial gauge showing consumed/remaining (green→amber→red gradient)
      - [ ] Tenant quota (`jira-quota-tenant-based`): radial gauge
      - [ ] Burst budget (`jira-burst-based`): radial gauge
      - [ ] Per-issue-on-write (`jira-per-issue-on-write`): radial gauge — **this is the one most likely to bite; highlight with amber border when > 60% consumed**
    - [ ] Rate limit trend: mini line chart showing quota consumption over last 1h (horizontal sparkline)
    - [ ] Last 429 event: timestamp + action that triggered it (if any in the time range)
    - [ ] Hover: expand to show raw header values from last response
  - [ ] **ServiceNow**
    - [ ] Connection status: live pulsing dot
    - [ ] Last successful call timestamp
    - [ ] Success rate (last 1h): percentage + sparkline
    - [ ] **Rate Limit Gauge (1 shared pool gauge, ServiceNow-specific):**
      - [ ] Instance pool consumption: radial gauge showing estimated usage against ~100K req/hr shared pool
      - [ ] Color thresholds: green (< 40%), amber (40–70%), red (> 70%)
      - [ ] Warning callout when approaching shared limit: "Shared instance — other apps count against this pool"
    - [ ] Last 429 event: timestamp + action (if any)
    - [ ] Hover: expand to show raw header values
  - [ ] **GitHub**
    - [ ] Connection status: live pulsing dot
    - [ ] Last successful call timestamp
    - [ ] Success rate (last 1h): percentage + sparkline
    - [ ] **Rate Limit Gauges (2 gauges, GitHub-specific):**
      - [ ] Primary rate limit: `X-RateLimit-Remaining` / `X-RateLimit-Limit` radial gauge
      - [ ] Reset timer: countdown to `X-RateLimit-Reset` (formatted as "resets in Xm Ys")
    - [ ] Last 403-rate-limit event: timestamp + action (if any)
    - [ ] Hover: expand to show raw header values

- [ ] **Integration Health Summary Bar** (top of panel):
  - [ ] 3 provider icons in a row with status dots: Jira (●) ServiceNow (●) GitHub (●)
  - [ ] Overall status: "All integrations healthy" or "1 degraded" or "2 rate-limited"
  - [ ] Click any icon → scroll to that provider's card

- [ ] **Rate Limit Alerting (visual only, read-only):**
  - [ ] Amber badge on integration card when any gauge > 60% consumed
  - [ ] Red badge when any gauge > 85% consumed
  - [ ] Animated attention pulse on red badges (subtle, respects `prefers-reduced-motion`)

- [ ] **UX notes:**
  - [ ] Rate limit data is derived from the most recent attempt's captured response headers — not real-time API polling (read-only console does not call external APIs)
  - [ ] If no recent data (> 1h since last call), show "Stale — no recent activity" with dimmed gauge
  - [ ] Empty state: "No integration activity yet. Rate limit data will appear after the first tool execution."
  - [ ] All gauges use CSS `conic-gradient` for radial rendering (no heavy chart library dependency)

## P10.4 Insights screen (Ledger Analytics — Interactive)

> See `Documentation/Frontend Guidelines.md` Section 4.6 for wireframe patterns.

- [ ] **Cost Efficiency Panel (Bento grid, 4 cards):**
  - [ ] Retry waste % card (total_retry_waste / total_attempts) — animated counter + trend arrow (↑ worse / ↓ better)
  - [ ] Replay savings card (replay_hits) — animated counter + "$ saved" estimate (configurable cost-per-call)
  - [ ] Budget denial rate card — with per-tool breakdown on hover
  - [ ] Unknown outcome rate card — pulsing amber border when > 5% (dangerous territory)
- [ ] **Tool Efficiency Table (interactive):**
  - [ ] Columns: tool, action, success rate (with cell-embedded bar chart), avg latency, p95 latency, retry cost, replay rate
  - [ ] Sortable by any column (click header)
  - [ ] Filter by tool (dropdown) or type in command palette
  - [ ] Inline sparklines in latency columns (last 7 data points per tool/action)
  - [ ] Row click: drill-down to filtered Actions List for that tool/action (side panel or filtered view)
  - [ ] **NEW: Provider grouping toggle** — group rows by integration provider (Jira / ServiceNow / GitHub) with collapsible sections
- [ ] **Trend Sparklines (animated):**
  - [ ] Daily action volume (7d/30d/90d selector) — area chart with gradient fill
  - [ ] Daily retry waste trend — line chart with threshold indicator (red line at "wasteful" threshold)
  - [ ] Unknown outcome trend — line chart with danger zone shading
  - [ ] **NEW: Per-provider volume overlay** — toggle to split trends by Jira / ServiceNow / GitHub (stacked area)
- [ ] **Hotspots Panel (interactive):**
  - [ ] Top 10 tools/actions by retry waste — horizontal bar chart, click to drill
  - [ ] Top 10 by contention (lease denials) — horizontal bar chart, click to drill
  - [ ] Visual indicators: efficiency scores (green/amber/red gradient bars)
  - [ ] **NEW: Provider-specific hotspot breakout** — separate tabs for Jira / ServiceNow / GitHub hotspots
- [ ] **NEW: Rate Limit Impact Panel:**
  - [ ] Shows correlation between rate limit events (429s) and governor decisions (BUDGET_DENIED)
  - [ ] Timeline: 429 events overlaid on action volume chart (dual-axis)
  - [ ] Per-provider breakdown: which integration is causing the most 429s?
  - [ ] "Rate limit efficiency" metric: how many 429s did RunwayCtrl prevent vs. how many leaked through?
- [ ] All data fetched from `/v1/insights/*` endpoints (P8B)
- [ ] **NEW: Hub Insights Panel:**
  - [ ] Card list showing pre-computed LLM analysis from `GET /v1/insights/hub`
  - [ ] Each card: severity badge (info=blue, warning=amber, critical=red), title, summary
  - [ ] Expand card to see full recommendation and supporting data points
  - [ ] Most recent analysis date displayed at top ("Last analyzed: YYYY-MM-DD")
  - [ ] Empty/dormant state: "The Hub is gathering data — insights will appear after [N] days of execution history" (when Hub is enabled but below threshold)
  - [ ] Disabled state: "The Hub is not enabled. Enable it to receive LLM-powered execution insights." (when `ENABLE_HUB=false`)

## P10 Gate: Definition of Done

- [ ] Developer can answer "what happened to action X?" in < 30 seconds (via command palette or table search)
- [ ] Scoreboard shows value metrics for demos with animated counters
- [ ] Integration Health Panel shows per-provider connection status + rate limit gauges
- [ ] Insights screen shows cost efficiency, tool performance, and per-provider analytics
- [ ] Rate limit gauges correctly reflect captured header data from most recent attempts
- [ ] Bento grid layout renders correctly on 1280px+ screens (responsive, not mobile-optimized in v0.1)
- [ ] Dark mode + light mode both functional
- [ ] All interactive elements (hover, click, drill-down) work without mutations (strictly read-only)
- [ ] `prefers-reduced-motion` disables all animations and pulsing indicators

### P10 Release Checklist

- [ ] All Phase 10 PRs squash-merged to `main`
- [ ] CI is green on `main`
- [ ] Tag release: `git tag -a v0.1.0-phase10 -m "Phase 10: Dashboard v0.1 — action explorer, scoreboard, integration health, insights"`
- [ ] Push tag: `git push origin v0.1.0-phase10`
- [ ] Create GitHub Release from tag with dashboard screenshots and feature summary
- [ ] Update `CHANGELOG.md` with Phase 10 entry

---

## P10.3.1 Stripe-grade semantics hardening

- [ ] P10.3.1 complete (semantics + docs + CI discipline)

**Objective:** Lock in the “Stripe moat” semantics (safe-by-default, deterministic, supportable) **before** we add hosted console complexity.

This block is intentionally **pre-console-hosting** because hosted console amplifies the cost of getting semantics, naming, and retention wrong.

### P10.3.1.1 ActionKey parameter binding mismatch (MUST)

When the same `action_key` is reused with different canonical request parameters, the system MUST fail closed.

- [ ] Define the canonical **Action Request Fingerprint** (ARF):
  - [ ] Inputs MUST include: `tool`, `action`, `resource_key` (or empty), and **canonical args hash** (`args_hash` or server-derived hash of `args`).
  - [ ] Inputs MUST NOT include: lease mode, join window, dedupe window overrides, client_request_id (operational hints; not semantic identity).
  - [ ] Output: `action_request_fingerprint = sha256(canonical_fields_json)`.
- [ ] Ledger requirements:
  - [ ] Persist the ARF on the Action record when the ActionKey is first created.
  - [ ] On subsequent BeginAction for an existing ActionKey:
    - [ ] If ARF matches: proceed with normal dedupe/replay/governance.
    - [ ] If ARF mismatches: return **409** with `error_code=ACTION_KEY_MISMATCH`.
      - [ ] MUST NOT create an Attempt.
      - [ ] MUST NOT consume budgets.
      - [ ] MUST include `request_id` and safe diagnostic details (hashes only).
      - [ ] MUST NOT include `retry_after_ms` (not retryable).
- [ ] Spec + docs updates (same PR):
  - [ ] Update `Documentation/openapi.yaml` to include `ACTION_KEY_MISMATCH` and document the behavior.
  - [ ] Update `Documentation/API Contract.md` and `Documentation/Error Codes and Retry.md` with deterministic client behavior.
  - [ ] Add an ADR describing the binding model and tradeoffs.

### P10.3.1.2 Retention + TTL contract

Make retention semantics explicit so customers and operators can reason about replay guarantees and data minimization.

- [ ] Define retention policy defaults (v0.1):
  - [ ] Attempts + attempt events: retain **>= 30 days**.
  - [ ] Actions (terminal): retain **>= dedupe_window + safety_buffer**.
  - [ ] Lease waiters: retain for operational debugging (short TTL, e.g., 7–30 days).
  - [ ] Audit/security events: retain **>= 90 days**.
- [ ] Define deletion invariants:
  - [ ] The system MUST NOT delete an Action record while it is required for dedupe/replay guarantees.
  - [ ] Cleanup MUST be safe under concurrency (idempotent job runs).
- [ ] Update docs:
  - [ ] `Documentation/Security Guidelines.md` (retention + enforceability)
  - [ ] `Documentation/Backend Structure.md` (job boundaries + invariants)
  - [ ] `Documentation/PRD Document.md` (compliance-ready requirement)
  - [ ] Add ADR for retention contract.

### P10.3.1.3 Versioning + changelog discipline

Stripe-level trust requires that developers can rely on stable behavior and understand changes.

- [ ] Decide and document a v0.1 contract policy:
  - [ ] OpenAPI `info.version` is the API contract version.
  - [ ] Any change to behavior, error codes, or response shapes MUST bump API contract version and update changelog.
- [ ] Add changelog discipline:
  - [ ] Create `CHANGELOG.md` (Keep a human-readable record of API/SDK behavior changes).
  - [ ] Update `Documentation/01-cicd-release-process-spec.md` to require changelog entries when `Documentation/openapi.yaml` or retry semantics change.
- [ ] Optional (recommended pre-hosted console): define an API version header strategy:
  - [ ] Response includes `RunwayCtrl-Version: <info.version>`.
  - [ ] Request MAY include `RunwayCtrl-Version: <info.version>` as an assertion (server rejects mismatches).
  - [ ] Document negotiation rules (no silent behavior drift).

### P10.3.1.4 Developer cockpit loop

Before we host the console, ensure there is a crisp “developer cockpit” path for local debugging and support.

- [ ] Document a minimal operator workflow (copy/paste friendly):
  - [ ] Find action by `action_key` → view attempts → follow trace links → interpret decisions.
  - [ ] Include “what to do next” playbooks for common error codes (LEASE_DENIED, BUDGET_DENIED, CIRCUIT_OPEN, ACTION_KEY_MISMATCH).
- [ ] Define minimal CLI surface (implementation later, but the contract should be stable now):
  - [ ] `runwayctrl actions get <action_key>`
  - [ ] `runwayctrl attempts list --action-key <action_key>`
  - [ ] `runwayctrl leases wait <waiter_id>`
  - [ ] `runwayctrl explain <action_key>` (summarize decision chain)
- [ ] Update console UX spec (`Documentation/Frontend Guidelines.md`) to display:
  - [ ] ActionKey mismatch errors clearly (operator-friendly)
  - [ ] Retention/policy visibility as read-only (no editing in v0.1)

## P10.4 Hosted Console (Option A) — console.runwayctrl.com

**Objective:** Ship a hosted, login-protected console for early adopters with minimal friction.

### Principles for early adoption

- **No customer infra required**: customers should not need to run Postgres, collectors, or dashboards.
- **Secure by default**: no long-lived API keys in browsers; least privilege between console ↔ control-plane.
- **Fast onboarding**: invite-only first; self-serve later.
- **Small surface area**: keep Phase 10 console read-only; move admin/provisioning to controlled paths.

### P10.4 Decisions (locked for v0.1 hosted)

- **Console hosting:** Vercel (Next.js first-party hosting).
- **Login:** Email magic link via a proven auth framework (Auth.js / NextAuth). Invite-only initially.
- **Control-plane boundary:** BFF/Proxy (browser talks only to the console; console server talks to control-plane).
  - No long-lived control-plane API keys in the browser.
  - Tenant isolation enforced at the console boundary (org → tenant mapping).

### P10.4.1 Domain + DNS

- [ ] Use existing apex domain `runwayctrl.com` (no new domain purchase)
- [ ] Create subdomain `console.runwayctrl.com`
  - [ ] DNS record (CNAME or A/AAAA depending on host)
  - [ ] TLS certificate issuance via hosting platform
  - [ ] Enforce HTTPS + HSTS (staged rollout)
- [ ] (Recommended) also reserve `staging.console.runwayctrl.com` for pre-prod verification
- [ ] Optional: reserve `api.runwayctrl.com` for the public control-plane edge (if needed)

### P10.4.2 Hosting targets (recommended defaults)

- [ ] Choose hosting providers
  - [ ] Console (Next.js): Vercel
  - [ ] Control-plane (Fastify): container host (Cloud Run / Fly.io / Render / ECS)
  - [ ] Postgres: managed Postgres with backups (daily backups + PITR recommended)
- [ ] Create environments
  - [ ] `staging` and `prod`
    - [ ] `staging`: Render Postgres + Render Web Service (control-plane) deployed and serving `/healthz`
      - [ ] Run schema migrations on staging DB
      - [ ] Seed a staging tenant for the hosted console
      - [ ] Create a staging API key for the console (store in Vercel env vars; do not commit)
      - [ ] Wire the console to staging control-plane
        - [ ] `RUNWAYCTRL_CONSOLE_API_BASE_URL` → Render staging control-plane URL
        - [ ] `RUNWAYCTRL_CONSOLE_API_KEY` → staging API key
    - [ ] `prod`: provision matching infra
      - [ ] Create prod Postgres (separate instance) + keep external access locked down
      - [ ] Deploy prod control-plane service and verify `/healthz`
      - [ ] Run schema migrations on prod DB
      - [ ] Seed a prod tenant for the hosted console
      - [ ] Create a prod API key for the console (store in Vercel env vars; do not commit)
      - [ ] Wire the console to prod control-plane
        - [ ] `RUNWAYCTRL_CONSOLE_API_BASE_URL` → Render prod control-plane URL
        - [ ] `RUNWAYCTRL_CONSOLE_API_KEY` → prod API key
  - [ ] Separate DBs (at minimum separate schemas/instances) + separate API keys

### P10.4.3 Authentication + tenants (invite-first)

**Tomorrow checklist (short):**

- [ ] Confirm auth approach + provider
  - [ ] Use Auth.js (NextAuth) with **invite-only magic links**
  - [ ] Pick email provider (Resend/Postmark) and define required env vars (no secrets committed)
- [ ] Add minimal console identity + org mapping
  - [ ] Create `orgs` (1:1 with control-plane `tenant_id`), `users`, `memberships` (admin/viewer)
  - [ ] Add `invites` (single-use, short TTL) and basic audit timestamps
- [ ] Implement invite flow (happy path)
  - [ ] Admin: create invite (email) → send magic link
  - [ ] Recipient: accept invite → establish session → land in org
- [ ] Harden authentication (must-haves)
  - [ ] Session cookies: HttpOnly + Secure + SameSite
  - [ ] Magic link tokens: **hashed at rest**, single-use, expiry 10–15m
  - [ ] Rate limit: invite send + verify endpoints
- [ ] Enforce authorization policy
  - [ ] Viewer: read-only
  - [ ] Admin: org membership + settings
- [ ] Add a simple “Who am I?” screen for debugging
  - [ ] Shows current org + role + environment (no control-plane secrets)
- [ ] Validation
  - [ ] Smoke test: invite → login → load dashboard pages
  - [ ] Negative tests: expired token, reused token, wrong-org access

**What we shipped (implementation notes / security hardening):**

- Auth implementation: Auth.js / NextAuth v5 (DB sessions) in `apps/console/src/auth.ts` with the Postgres adapter.
- Identity + tenant model (orgs/users/memberships/invites) via migrations + repo helpers:
  - Schema: `apps/control-plane/src/migrations/0008_phase10_4_3_console_auth.sql`
  - Repo: `apps/console/src/lib/identityRepo.ts`
- Invite tokens are **single-use**, **short TTL**, and **hashed at rest** (`hashInviteToken()` in `apps/console/src/lib/crypto.ts`).
- Abuse resistance / rate limiting:
  - DB-backed distributed limiter (multi-instance safe):
    - Schema: `apps/control-plane/src/migrations/0009_phase10_4_3_console_rate_limits.sql`
    - Implementation: `apps/console/src/lib/rateLimitDb.ts`
    - Used for invite _send_ (`apps/console/src/app/admin/invites/page.tsx`) and invite _verify_ (`apps/console/src/auth.ts`).
  - In-memory fallback remains for local/dev resilience if DB buckets are unavailable.
- Token leakage reduction:
  - Invite links use the URL **fragment** (`/auth/invite#token=...`) so the token is not sent in HTTP requests.
  - The invite accept page (`apps/console/src/app/auth/invite/page.tsx`) reads token from fragment (or legacy `?token=`) and then scrubs it from the address bar.
- Response hardening:
  - `apps/console/src/middleware.ts` sets baseline security headers (incl. `Referrer-Policy: no-referrer`) and forces `Cache-Control: no-store` for auth routes.
- Secrets at rest:
  - Per-org control-plane API keys are encrypted with AES-256-GCM.
  - Supports key rotation via `RUNWAYCTRL_CONSOLE_ENCRYPTION_KEYS` (comma-separated) while keeping `RUNWAYCTRL_CONSOLE_ENCRYPTION_KEY` as a backward-compatible fallback.
- Automated validation:
  - `apps/console/src/lib/identityRepo.test.ts` covers smoke + negative invite cases and encryption key rotation.

- [ ] Add hosted auth to console
  - [ ] Start with **email magic link** (invite-only first)
  - [ ] Implement with **Auth.js (NextAuth)** (avoid rolling our own auth)
  - [ ] Session cookie: HttpOnly + Secure + SameSite
  - [ ] Magic link hardening (MUST): short expiry (10–15m), single-use tokens, store tokens hashed, rate limit send/verify
  - [ ] Email provider (recommended): Resend or Postmark (SES acceptable later)
- [ ] Add a minimal console identity model
  - [ ] `orgs` (maps 1:1 to control-plane `tenant_id`)
  - [ ] `users` and membership roles (admin/viewer)
  - [ ] Invite flow: owner invites by email; recipients join org
- [ ] Authorization policy
  - [ ] Viewer: read-only dashboard
  - [ ] Admin: can manage org membership and integration setup (if/when added)

### Revision Update v0.1 addendum — agent-grade guardrails (authority + blast radius + degraded mode)

**Why now (2026 reality):** teams are increasingly running production automation via agents and internal tools. Our position is not “agents can’t be operators” — it is “operators (human or agent) must not be able to cause outages by accident.”

**Goal:** add the smallest set of primitives that (1) preserves fast-path DX, (2) adds friction only when risk is real, and (3) can be validated end-to-end before we proceed further.

#### DX + latency targets (contracts, not measured yet)

- **Fast path (PROCEED):** one additional control-plane round trip only (BeginAction). No human steps.
- **Budget target:** BeginAction evaluation should be “cheap” (policy + one DB txn) and aim for **sub-100ms p95** in-region.
- **Slow path (approval):** becomes an async workflow (GitHub/ServiceNow). The SDK returns a handle immediately.

#### 1) Signed approval capability (“second key”)

- [ ] Add a decision kind: `REQUIRES_APPROVAL`
  - [ ] Response includes: `approval_request_id`, `risk_class`, `reason_code`, `action_digest`
    - `action_digest` = canonical hash of tool + normalized params + scope (stable, deterministic)
- [ ] Define a signed “permit” token bound to `action_digest` + TTL + optional scope caps
  - [ ] Without the permit, execution MUST NOT proceed for actions requiring approval
- [ ] Record approval events in the ledger (who approved, when, why)
- [ ] Document approvals endpoints in OpenAPI (`Documentation/openapi.yaml`).
- [ ] Default policy:
  - [ ] `destructive` ⇒ approval required
  - [ ] `risky` ⇒ approval required when blast radius estimate exceeds thresholds

#### 2) Blast radius compiler (structural preflight)

- [ ] Implement a deterministic preflight that computes an upper-bound estimate:
  - [ ] target count / fan-out estimate (or “unknown/unbounded”)
  - [ ] wildcard detection
  - [ ] “global rollout” intent flag
- [ ] BeginAction uses the preflight result to decide:
  - [ ] `PROCEED` (bounded + within caps)
  - [ ] `REQUIRES_APPROVAL` (bounded but risky)
  - [ ] `DENY` (unbounded or violates hard caps)
- [ ] Return actionable remediation: how to narrow scope or switch to progressive rollout.

#### 3) Progressive rollout protocol (canary → ramp → global)

- [ ] Enforce progressive rollout envelope validation (stage + percent + requiredness)
- [ ] For any action whose blast radius is “large,” require staged execution:
  - [ ] Stage 0: canary partition (cell / small slice)
  - [ ] Stage 1+: ramp in steps (10% → 50% → 100%)
- [ ] Each stage is a separate action with its own ActionKey, policy evaluation, budgets, and explicit operator intent
- [ ] Provide a “stop the bleeding” switch: freeze rollout and deny new stages when anomalies spike (circuit open)

#### 4) Degraded-mode policy: fail-closed + safe cached permits

- [ ] Define client behavior when control-plane is unreachable:
  - [ ] `destructive` / `risky`: **fail-closed** (do not execute)
  - [ ] `safe`: optional **safe cached permit**
- [ ] Safe cached permits requirements:
  - [ ] only for explicitly safe action types
  - [ ] only for identical `(action_type, resource_key, parameter_hash)`
  - [ ] short TTL + local monotonic budgets (only decrease) + strict rate limits

#### First integrations (v0.1 scope): GitHub + Jira + ServiceNow approvals

**Principle:** approvals must be easy for developers: no new proprietary UI required. Use tools teams already live in.

- [ ] GitHub-based approvals (default)
  - [ ] On `REQUIRES_APPROVAL`, create/attach to a GitHub Issue or PR comment with:
    - [ ] action summary + reason
    - [ ] scope estimate + blast radius classification
    - [ ] approval instructions (comment commands)
    - [ ] action digest (for transparency)
  - [ ] Approve by GitHub comment command (e.g., `/runwayctrl approve <id>`)
    - [ ] Approval recorded in ledger; signed permit emitted

- [ ] ServiceNow-based approvals (enterprise / ITSM)
  - [ ] On `REQUIRES_APPROVAL` for `destructive` or “after hours,” create a ServiceNow change request or approval request assigned to relevant team
  - [ ] Approval occurs via explicit “approve” step/link; recorded in ledger
  - [ ] If ServiceNow request closes/times out without approval ⇒ action remains blocked

#### Validation (must pass before we proceed)

- [ ] Smoke tests (staging)
  - [ ] Local: `pnpm -w -r test` (workspace unit tests)
  - [ ] Fast path: tool call → BeginAction `PROCEED` → attempt executes (no noticeable friction)
  - [ ] Authority: tool call → `REQUIRES_APPROVAL` → GitHub approval → permit issued → execution succeeds
  - [ ] ServiceNow: tool call → `REQUIRES_APPROVAL` → ServiceNow change request created → approve → execution succeeds
  - [ ] Blast radius: wildcard/unbounded scope ⇒ `DENY` with actionable fix
  - [ ] Progressive rollout: large-scope action forced into staged actions; freeze/circuit stops further stages
  - [ ] Degraded mode: control-plane unreachable ⇒ destructive blocked; safe cached permit allows only safe calls within TTL

### P10.4.4 Control-plane access model (no browser keys)

- [ ] Use **BFF/Proxy (best-practice for v0.1):** console server talks to control-plane; browser never sees CP key
- [ ] BFF implementation notes (MUST):
  - [ ] Browser calls `console.runwayctrl.com` only (session cookie). No direct calls to the control-plane from client code.
  - [ ] Console exposes internal `/api/*` endpoints that proxy to the control-plane.
  - [ ] Console uses a **server-side credential per tenant** (stored in platform secrets; encrypted at rest).
  - [ ] Console enforces org→tenant mapping on every request; rejects cross-tenant requests.
  - [ ] Add request correlation: propagate `x-request-id` from console → control-plane.
  - [ ] Rate limit at the console edge (basic abuse protection).
- [ ] Control-plane perimeter hardening (recommended):
  - [ ] Protect the control-plane with a gateway/WAF so only the console can call it (do not rely on Vercel stable egress IPs).
  - [ ] Consider Cloudflare in front of the control-plane for WAF + bot/rate controls.
- [ ] Future upgrade path (not v0.1): user-scoped short-lived tokens/JWTs to the control-plane.

### P10.4.5 Secrets + configuration

- [ ] Move secrets out of `.env` for hosted environments
  - [ ] Console: auth provider secrets, session secret
  - [ ] Control-plane: DB URL, service keys, OTel settings
- [ ] Adopt a secrets manager (platform-native)
- [ ] Add documented required env vars + safe defaults

### P10.4.6 CI/CD and deploy

> **Source of truth:** `Documentation/03-cd-promotion-pipeline-spec.md`

- [ ] Adopt **release channels** (pragmatic v0.1)
  - [ ] `main` = staging channel (auto deploy)
  - [ ] `release/prod` = production channel (manual promotion)
  - [ ] Protect `release/prod` branch (PR required + approvals)
  - [ ] Define rollback primitive: move `release/prod` back to prior SHA (see `RB-OPS-001-deploy-rollback.md`)
- [ ] Add CD pipelines (GitHub Actions preferred for auditability)
  - [ ] `deploy-staging`: deploy the exact SHA from `main` to staging and verify
  - [ ] `promote-prod`: promote a SHA already validated on staging to prod
  - [ ] (Optional) `rollback-prod`: one-click rollback to last known good SHA
  - [ ] Use GitHub **Environments** for manual approvals + secret scoping (staging vs prod)
- [ ] Hosting mapping (Render + Vercel)
  - [ ] Render staging service tracks `main`
  - [ ] Render prod service tracks `release/prod` (disable auto-deploy or ensure deploy is driven by branch updates only)
  - [ ] Vercel console: staging and prod projects remain environment-separated; prod promotions are manual
- [ ] Post-deploy verification (minimum viable gates)
  - [ ] Health: control-plane `/healthz`
  - [ ] Smoke: BeginAction → Complete → Status
  - [ ] Observability: “golden trace” exists and matches OTel contract requirements
  - [ ] Regression watch window: error rate + p99 + UNKNOWN + denials + circuit opens
- [ ] Database migrations (release-critical)
  - [ ] Staging migrations run first
  - [ ] Prod migrations are explicit (not implicit) and follow expand→backfill→contract where needed
  - [ ] Prefer forward-only; document rollback posture per release

### P10.4.7 Observability + ops basics

- [ ] Centralized logs for console + control-plane
- [ ] Basic metrics and alerts
  - [ ] 5xx rate, latency, DB saturation, error budget
- [ ] Trace linking (optional) via `RUNWAYCTRL_TRACE_URL_TEMPLATE`

### P10.4.8 Rollout path (optimize for adoption)

- [ ] Stage 0: internal dogfood
  - [ ] Single tenant, single org, manual provisioning
- [ ] Stage 1: invite-only design partners
  - [ ] Manual tenant provisioning + invite links
  - [ ] Support playbook (onboarding checklist + common failures)
- [ ] Stage 2: light self-serve
  - [ ] Create org + tenant automatically
  - [ ] Create API key automatically + show SDK quickstart

### P10.4.9 Validation plan (tests + monitoring + safe rollout)

**Goal:** Prove the hosted console + control-plane works end-to-end under real conditions _before_ onboarding real users.

- [ ] Contract tests (API ↔ console compatibility)
  - [ ] Define a minimal **read-only contract suite** that exercises the console-critical endpoints:
    - [ ] `/v1/scoreboard`
    - [ ] `/v1/actions` (+ paging / filters)
    - [ ] `/v1/actions/:action_key`
    - [ ] `/v1/attempts` (+ paging / filters)
    - [ ] `/v1/attempts/:attempt_id` (+ `/events`)
    - [ ] `/v1/leases` (+ `/contended`)
    - [ ] `/v1/governor/circuits`
  - [ ] Validate responses against shared schemas (Zod in `@runwayctrl/shared`) to catch breaking changes early.
  - [ ] Run this suite against **staging** on every deploy (and against prod on a schedule, read-only).

- [ ] Integration tests (control-plane + DB + auth)
  - [ ] Stand up Postgres + control-plane in CI (or ephemeral staging) and run the integration test suite.
  - [ ] Include tenant isolation + auth checks (401/403 paths) and pagination invariants.
  - [ ] Gate promotion to prod on passing integration tests.

- [ ] E2E smoke tests (hosted console UX)
  - [ ] Add a small browser smoke suite (e.g., Playwright) for:
    - [ ] login flow (invite-only / magic link path)
    - [ ] dashboard pages load without fatal errors
    - [ ] basic filters apply and render expected empty/data states
  - [ ] Run on every staging deploy; optionally run a lighter subset on prod deploy.

- [ ] Synthetic monitoring (outside-in)
  - [ ] Add periodic checks from outside the cluster/host:
    - [ ] console reachable + basic page render
    - [ ] control-plane `/healthz` reachable
    - [ ] at least one read-only API path works via the console BFF
  - [ ] Alert on: sustained 5xx rate, elevated latency, auth failures, and failed synthetics.

- [ ] Canary + rollback (deployment safety)
  - [ ] Canary release process for console and control-plane (staging → prod):
    - [ ] small % rollout (or phased deploy by environment)
    - [ ] verify key SLOs (latency, 5xx, DB saturation) before full rollout
  - [ ] Rollback plan is written and tested:
    - [ ] application rollback (deploy previous build)
    - [ ] database migration strategy documented (forward-only preferred; if rollback required, document it)
    - [ ] “stop the bleeding” procedure (rate-limit, circuit, or temporarily disable affected routes)

- [ ] CI gate wiring (make validation automatic)
  - [ ] PR gates (fast):
    - [ ] lint + typecheck
    - [ ] unit tests
    - [ ] control-plane integration tests (DB-backed)
  - [ ] Staging deploy gates (must pass on every `main` → staging deploy):
    - [ ] deploy the SHA
    - [ ] run contract suite against staging
    - [ ] run Playwright console smoke against staging
    - [ ] run a minimal outside-in synthetic (healthz + one read-only BFF path)
  - [ ] Nightly gates (slower, non-blocking for day-to-day dev):
    - [ ] longer-running smoke subset (auth + dashboard + key read-only queries)
    - [ ] short soak / load sanity (see P10.4.11)

## P10.4 Gate: Definition of Done (hosted)

- [ ] `console.runwayctrl.com` reachable over HTTPS
- [ ] Users can login and only see their org/tenant
- [ ] Console reads from control-plane without exposing long-lived API keys to browsers
- [ ] Staging + prod deploy flow exists (with migrations)
- [ ] Contract tests run against staging on every deploy
- [ ] Integration test suite passes (control-plane + DB + auth)
- [ ] E2E smoke tests pass on staging deploy
- [ ] Synthetic monitoring enabled with actionable alerts
- [ ] Canary + rollback process documented and exercised at least once

### P10.4.10 Pre-beta real-world smoke validation (no mocks)

**Why this exists:** Phase 11 is about design partners and onboarding. Before anyone outside the core team sees this, we want a repeatable, real-world validation pass that uses the _actual_ integrations (GitHub + Jira + ServiceNow), not simulated gates.

**Goal:** a DevOps/operator can deploy the current `main` SHA to staging and, in < 60 minutes, prove:

- control-plane writes are correct (BeginAction, attempts, approval state transitions)
- console auth + BFF boundary is correct (no browser keys)
- guardrails behave in the real world (blast radius, staged rollout, degraded mode)
- external approval providers are correctly coupled (webhooks, signature verification)

#### A) Staging environment prerequisites (Layer B)

This assumes a publicly reachable staging ("Layer B") that external providers can call.

- [ ] Control-plane staging base URL is HTTPS and publicly reachable (required for provider webhooks)
  - [ ] `GET /healthz` returns 200
  - [ ] Request size bounds are enforced (reject very large webhook payloads)
- [ ] Console staging base URL is HTTPS and publicly reachable
  - [ ] Login works end-to-end (invite → magic link → session)
  - [ ] Console calls control-plane via BFF only (no browser-to-control-plane calls)
- [ ] Secrets are configured in staging (do not use local `.env` secrets)
  - [ ] Control-plane:
    - [ ] `DATABASE_URL`
    - [ ] `RUNWAYCTRL_API_KEYS` (or equivalent) for trusted callers
    - [ ] `RUNWAYCTRL_GITHUB_WEBHOOK_SECRET`
    - [ ] `RUNWAYCTRL_SERVICENOW_WEBHOOK_SECRET`
  - [ ] SDK runner / job environment (where the tool calls originate):
    - [ ] GitHub token/identity (to create issues/comments for approvals)
    - [ ] Jira API token + base URL (to create issues for approvals)
    - [ ] ServiceNow instance credentials + base URL (to create change requests for approvals)
- [ ] Migrations are applied in staging using the documented process
  - [ ] Migrations run before app deploy when required
  - [ ] Expand → backfill → contract followed for any breaking schema changes
- [ ] Observability is wired
  - [ ] Logs are searchable for: `action_key`, `attempt_id`, `approval_request_id`
  - [ ] Traces exist for BeginAction + attempt execution (OTel contract)
  - [ ] Alerts exist (at least): sustained 5xx, elevated latency, DB saturation

- [ ] Safety + security posture is reasonable for beta
  - [ ] Control-plane inbound webhooks are protected by:
    - [ ] strict request size limits
    - [ ] signature verification (fail closed)
    - [ ] rate limiting (or upstream WAF rate limits)
  - [ ] Secrets rotation is possible without downtime (document the steps)
  - [ ] Backups are configured for the staging DB (and a restore procedure exists)

#### B) Provider wiring (real integrations)

- [ ] GitHub approvals are enabled for the staging tenant
  - [ ] The repo/org and issue destination is configured
  - [ ] The GitHub webhook endpoint is reachable and signature verification is enabled
- [ ] ServiceNow approvals are enabled for the staging tenant
  - [ ] ServiceNow change request creation is configured (instance URL / assignment group / category)
  - [ ] ServiceNow webhook or polling integration is configured for approval status
  - [ ] Webhook signature verification is enabled (fail closed on invalid signatures) if webhook-based
  - [ ] Webhook replay/duplication is safe
    - [ ] repeated events do not break invariants (idempotent deny)

#### C) Smoke test runbook (record evidence)

**Evidence to record for every test:** timestamp, environment (staging), `action_key`, `attempt_id` (if any), `approval_request_id` (if any), and the external artifact ID (GitHub issue URL / Jira issue key / ServiceNow change request number).

- **Fast path (no human steps):**
  - [ ] Run a bounded, safe action that should evaluate to `PROCEED`
  - [ ] Expect: BeginAction `PROCEED` → attempt executes → action completes
  - [ ] Verify: console can answer "what happened" via action page (events + trace link)
  - [ ] Performance sanity: capture latency for BeginAction and the attempt execution (p50/p95 if available)

- **Authority (GitHub approval):**
  - [ ] Run a destructive (or high blast-radius) action that should evaluate to `REQUIRES_APPROVAL`
  - [ ] Expect: BeginAction returns `approval_request_id` + `action_digest`
  - [ ] Verify: a GitHub Issue/comment is created with instructions
  - [ ] Approve via the documented GitHub command/flow
  - [ ] Expect: ledger records approval event; a permit is issued; execution succeeds
  - [ ] Negative: attempt approval with an invalid/expired approval capability
  - [ ] Expect: approval remains blocked; audit event recorded

- **ServiceNow (approval + lifecycle coupling):**
  - [ ] Trigger an action that routes to ServiceNow approvals (enterprise policy or forced config)
  - [ ] Expect: ServiceNow change request created and mapped to the approval request
  - [ ] Approve via the explicit approve step/link
  - [ ] Expect: approval becomes APPROVED; permit issued; execution succeeds
  - [ ] Negative: trigger another action requiring ServiceNow approval, then close the change request **without** approving
  - [ ] Expect: change request closure marks approval as DENIED; action remains blocked
  - [ ] Negative: send a webhook with an invalid signature
  - [ ] Expect: request is rejected and no state changes occur

- **Blast radius (hard deny):**
  - [ ] Submit an unbounded/wildcard scope action
  - [ ] Expect: BeginAction `DENY` with actionable remediation guidance

- **Progressive rollout enforcement + freeze:**
  - [ ] Submit a large-scope action that must be staged
  - [ ] Expect: the system forces stage semantics (CANARY → RAMP → GLOBAL) and prevents skipping stages
  - [ ] Force/trigger a circuit open condition (or use the operator switch)
  - [ ] Expect: new stages are denied while frozen ("stop the bleeding")

- **Degraded mode (real failure injection):**
  - [ ] Simulate control-plane unreachable from the runner (network block / DNS override / service stop)
  - [ ] Destructive/risky action:
    - [ ] Expect: fail-closed (no execution)
  - [ ] Safe action with a valid cached permit:
    - [ ] Expect: executes only within TTL and only for identical parameters
    - [ ] Expect: rate limits / monotonic budgets apply

- **Provider + dependency failure modes (quick sanity):**
  - [ ] Simulate GitHub API failure (token revoked / rate limited)
  - [ ] Expect: approval artifact creation fails safe and the action remains blocked (no silent proceed)
  - [ ] Simulate ServiceNow API failure
  - [ ] Expect: same (blocked), with operator-friendly remediation surfaced

- **Tenant isolation sanity:**
  - [ ] Create two staging orgs/tenants
  - [ ] Verify console cannot read cross-tenant data (403/empty)
  - [ ] Verify control-plane rejects cross-tenant API key usage

#### D) Exit criteria (before Phase 11 / design partners)

- [ ] All smoke tests above pass on staging using real integrations
- [ ] Any failure produces a ticket with:
  - [ ] reproduction steps
  - [ ] recorded evidence IDs (action_key / approval_request_id / external incident/issue)
  - [ ] logs/traces links
- [ ] Rollback drill completed at least once on staging (app rollback + documented DB posture)
- [ ] Backup/restore drill completed at least once on staging (at minimum: restore to a new DB and verify read-only forensics still work)
- [ ] The P10.4 hosted DoD checklist can be honestly checked based on this validation

### P10.4.11 Reliability validation (v0.1 scope)

**Intent:** v0.1 does not need full-scale chaos engineering, but it _does_ need evidence that the system remains safe and operable over time, and under basic failure modes.

#### A) Soak (short) — required for v0.1

- [ ] Run a low-to-moderate traffic soak in staging for **1–4 hours**
  - [ ] Verify: error rate is stable, memory does not grow unbounded, and DB connections do not leak
  - [ ] Verify: approvals + webhooks continue to function throughout the run
  - [ ] Capture: p50/p95 for BeginAction and key read paths

#### B) Load sanity (step test) — required for v0.1

- [ ] Run a simple step test (not a full load test): ramp to an expected beta-level QPS for 10–15 minutes
  - [ ] Identify obvious cliffs (DB saturation, timeouts, 5xx spikes)
  - [ ] Record the “safe operating envelope” for v0.1 (rough numbers are OK)

#### C) Failure drills (targeted) — required for v0.1

- [ ] Control-plane restart during:
  - [ ] a fast-path action
  - [ ] a pending approval
  - [ ] Expect: system remains safe (no accidental proceed), state remains consistent
- [ ] Dependency failures:
  - [ ] GitHub API rate limit / auth failure
  - [ ] ServiceNow API failure
  - [ ] Expect: actions remain blocked with operator-friendly remediation
- [ ] Webhook negative cases:
  - [ ] invalid signature rejected
  - [ ] duplicate events are idempotent

#### D) Optional (recommended before scaling beyond first 1–2 partners)

- [ ] Chaos experiments (controlled, documented)
  - [ ] inject latency and partial outage
  - [ ] kill one instance / one zone (if applicable)
  - [ ] verify SLOs and invariants hold under degradation
- [ ] Capacity planning (lightweight)
  - [ ] document scaling assumptions (CPU/mem/DB)
  - [ ] define a “beta ceiling” (max tenants, max QPS, max concurrent actions) and an escalation plan

---

## PHASE 11 - Beta Release + Design Partner Onboarding

**Objective:** Ship v0.1 to early users and gather feedback.

## P11.1 Packaging and distribution

- [ ] Publish SDK packages (private or public)
- [ ] Version SDKs + API (semver)
- [ ] Publish `@runwayctrl/sdk-core` and `@runwayctrl/sdk-node` to npm
- [ ] Build + ship control plane + console containers
- [ ] Provide helm chart or simple deploy guide (v0.1 can be "docker run")
- [ ] Release notes + changelog

### Publish readiness (npm) — when to add `NPM_TOKEN`

The Changesets release workflow is intentionally “safe by default”: it can open version PRs without publishing.
Actual publishing is enabled once you add the repo secret `NPM_TOKEN`.

Before adding `NPM_TOKEN`, confirm:

- [ ] You are ready for external consumption (at least design partners) and you’re comfortable with the release being permanent history
- [ ] Package names/scopes are final (e.g. `@runwayctrl/*`)
- [ ] Packages intended to publish are **not** marked `"private": true`
- [ ] License + README are acceptable for distribution
- [ ] CI is green on `main`
- [ ] `CHANGELOG.md` entry for the release looks correct

Then enable publishing:

- [ ] Create npm automation token (npmjs.com) with the minimum scopes needed for your org/packages
- [ ] Add GitHub repo secret: `Settings → Secrets and variables → Actions → New repository secret`
  - Name: `NPM_TOKEN`
  - Value: your npm automation token
- [ ] Re-run the release workflow (or merge the next Changesets “version packages” PR) to publish

## P11.2 Onboarding kit

- [ ] Quickstart:
  - [ ] get API key
  - [ ] wrap one tool call (Jira example)
  - [ ] view in dashboard
  - [ ] view traces
- [ ] Security FAQ:
  - [ ] what data is stored
  - [ ] retention controls
  - [ ] payload capture policy
- [ ] Operational runbook:
  - [ ] common errors and fixes
  - [ ] how to interpret PENDING/REPLAY/DENY

## P11.3 Feedback loop

- [ ] Set up issue templates:
  - [ ] bug
  - [ ] performance
  - [ ] semantics question
- [ ] Track:
  - [ ] "duplicate side effects prevented"
  - [ ] "storms prevented"
  - [ ] integration pain points

## P11 Gate: Definition of Done

- [ ] At least 1-2 design partners can integrate without internal help
- [ ] Bugs discovered are triaged into P0/P1/P2

### P11 Release Checklist

- [ ] All Phase 11 PRs squash-merged to `main`
- [ ] CI is green on `main`
- [ ] Tag release: `git tag -a v0.1.0-beta -m "v0.1.0-beta: Beta release — design partner ready"`
- [ ] Push tag: `git push origin v0.1.0-beta`
- [ ] Create GitHub Release (mark as pre-release) with onboarding guide and known limitations
- [ ] Update `CHANGELOG.md` with beta entry

---

## PHASE 12 - Ops Polish + v0.2 Prep

**Objective:** Prepare for scale and next iteration.

## P12.1 Operational hardening

- [ ] Connection pooling and DB tuning
- [ ] Read replicas for forensics queries
- [ ] Partition attempts by time/tenant if needed
- [ ] Multi-region story (documented, not required)

## P12.2 v0.2 planning

- [ ] Python SDK specification
- [ ] Policy versioning (if editing is introduced)
- [ ] Advanced lease policies (priority queues, fairness weights)
- [ ] Ledger Insights maturation:
  - [ ] Pattern detection (frequently successful action patterns for few-shot extraction)
  - [ ] Anomaly detection (sudden spikes in unknown outcomes or retry waste)
  - [ ] Recommendation engine (suggest governor policy tuning based on historical data)
  - [ ] Cost projection (estimate future costs based on trends)
- [ ] Multi-instance chaos expansion:
  - [ ] Network partition simulation (split-brain scenarios)
  - [ ] Slow Postgres simulation (latency injection)
  - [ ] Rolling deployment correctness (old + new instances simultaneously)

## P12 Gate: Definition of Done

- [ ] System stable under sustained load
- [ ] v0.2 roadmap documented

### P12 Release Checklist

- [ ] All Phase 12 PRs squash-merged to `main`
- [ ] CI is green on `main`
- [ ] Tag release: `git tag -a v0.1.0 -m "v0.1.0: Production release"`
- [ ] Push tag: `git push origin v0.1.0`
- [ ] Create GitHub Release (mark as latest) with full v0.1 feature summary
- [ ] Update `CHANGELOG.md` with v0.1.0 stable entry
- [ ] Archive v0.1 milestone in GitHub Issues/Projects

---

## 2) Cross-cutting requirements (do not skip)

These are “always on” tasks that must be applied throughout phases.

### C1 — Documentation (every phase)

- [ ] Update docs in the same PR as behavior change
- [ ] Add ADRs (Architecture Decision Records) for major decisions:
  - [ ] Postgres vs Dynamo
  - [ ] lease strategy
  - [ ] dedupe window defaults
  - [ ] payload capture stance (`Documentation/ADR-0009-payload-capture-stance.md`)

### C2 — Testing (every phase)

- [ ] Unit tests for:
  - [ ] hashing and normalization
  - [ ] governor decisions
  - [ ] state transitions
- [ ] Integration tests for:
  - [ ] atomic BeginAction TX
  - [ ] dedupe and replay correctness
  - [ ] lease contention
- [ ] Concurrency tests:
  - [ ] parallel BeginAction collisions
  - [ ] retry storm simulation
- [ ] Multi-instance tests (Phase 8A+):
  - [ ] CAS correctness across instances
  - [ ] Lease contention across instances
  - [ ] Circuit breaker state consistency
  - [ ] Crash recovery and connection pool resilience
  - [ ] Run via `docker-compose.multi-instance.yml` + `testcontainers-node`

### C3 — Security (every phase)

- [ ] Ensure tenant_id required in repos
- [ ] Ensure no secrets in logs
- [ ] Ensure telemetry allowlist is enforced
- [ ] Ensure request size bounds

### C4 — Performance (every phase)

- [ ] Measure p50/p95 for BeginAction
- [ ] Monitor DB query performance
- [ ] Protect write path from read-heavy forensics queries

---

## 3) Final “End Product” acceptance checklist (v0.1)

A v0.1 RunwayCtrl is “complete” when:

- [ ] SDK wraps a tool call safely and deterministically replays outcomes
- [ ] UNKNOWN outcomes do not create duplicate side effects for idempotent tools
- [ ] Leases prevent concurrent writers on the same ResourceKey
- [ ] Governor prevents runaway retries and supports basic circuiting
- [ ] Ledger is append-only and tenant-scoped
- [ ] OTel spans/metrics correlate action_key ↔ attempt_id ↔ trace_id
- [ ] Security controls meet `Documentation/Security Guidelines.md` (see also `Documentation/07-security-hardening-checklist.md`)
- [ ] Examples demonstrate core value in < 10 minutes
- [ ] Multi-instance correctness tests pass (3+ instances, shared Postgres)
- [ ] Ledger Insights endpoints return accurate cost/efficiency data
- [ ] Insights dashboard shows actionable cost optimization signals

---

## 4) Suggested repo file placement (so VSCode understands)

This repo currently uses `Documentation/` as the canonical docs root.

- `Documentation/Implementation Plan.md` (this file)
- `Documentation/Flow Document.md`
- `Documentation/Flow Chart.md`
- `Documentation/Backend Structure.md`
- `Documentation/Security Guidelines.md`

If you keep these adjacent, “search in workspace” becomes your control-plane.

---

Phase 13 — Demo Harness (Option B: Mock Jira + ServiceNow) (safe, local)

**Objective:** Ship a compelling Jira/ServiceNow demo **without** calling real APIs and without introducing “demo-only semantics” into core product behavior.

**Principles (do not violate):**

- Demo code must be **additive + isolated** (lives under `examples/` only).
- Do **not** fork or weaken execution semantics for the demo.
- No external side effects: all demo runs must target a local mock server.
- Demo must reinforce the real value: **UNKNOWN safety** + **429 governance** + **lease serialization** + **ledger/trace forensics**.

## D0.1 Create local Jira + ServiceNow mock servers

- [ ] Create `examples/jira-mock/` (standalone)
  - [ ] Minimal HTTP server that emulates the Jira REST API v3 surfaces we use
  - [ ] Configurable behavior profiles:
    - [ ] **SUCCESS**: returns deterministic issue key (e.g., `ENG-1847`)
    - [ ] **429**: returns rate limit with `Retry-After` and new points-based headers
    - [ ] **409**: simulates concurrent transition conflict
    - [ ] **TIMEOUT**: hangs/slow response to force SDK timeout → UNKNOWN
  - [ ] Deterministic scenario scripting so demos are repeatable
- [ ] Create `examples/servicenow-mock/` (standalone)
  - [ ] Minimal HTTP server that emulates the ServiceNow Table API surfaces we use
  - [ ] Configurable behavior profiles:
    - [ ] **SUCCESS**: returns deterministic sys_id and number (e.g., `INC0042891`)
    - [ ] **429**: returns rate limit (shared instance pool simulation)
    - [ ] **TIMEOUT**: hangs/slow response to force SDK timeout → UNKNOWN
    - [ ] **JOURNAL_APPEND**: demonstrates work_notes append-on-PUT behavior
  - [ ] Deterministic scenario scripting so demos are repeatable

## D0.2 Add demo runners that use RunwayCtrl (not direct calls)

- [ ] Create `examples/jira-demo/` (standalone)
  - [ ] A small script/app that:
    - [ ] calls the **RunwayCtrl SDK** to `BeginAction`
    - [ ] if `PROCEED`, calls the mock Jira server
    - [ ] calls `CompleteAttempt` or `MarkUnknown`
    - [ ] on UNKNOWN: polls `GET /v1/actions/{action_key}` before retrying (show replay)
  - [ ] Include 3 demo scenarios:
    - [ ] **Duplicate create_issue**: same ActionKey → REPLAY_SUCCESS, no second issue
    - [ ] **Concurrent transition**: lease serializes, no 409 race
    - [ ] **Rate limit**: mock 429 → governed backoff (no storm)
- [ ] Create `examples/servicenow-demo/` (standalone)
  - [ ] Include 3 demo scenarios:
    - [ ] **Duplicate create_incident**: same ActionKey → REPLAY_SUCCESS, no second incident
    - [ ] **Duplicate work note**: REPLAY_SUCCESS prevents journal append
    - [ ] **Timeout/UNKNOWN**: first attempt UNKNOWN → confirm/replay path (no duplicate)

## D0.3 Demo environment wiring (dev-only)

- [ ] Add a demo env file (do not commit secrets):
  - [ ] `.env.demo.example` with:
    - [ ] `RUNWAYCTRL_BASE_URL=http://localhost:8080`
    - [ ] `RUNWAYCTRL_API_KEY=...`
    - [ ] `JIRA_BASE_URL=http://localhost:<jira_mock_port>`
    - [ ] `SERVICENOW_INSTANCE_URL=http://localhost:<servicenow_mock_port>`
- [ ] Ensure demo runner loads `.env.demo` (developer convenience)
- [ ] Optionally add a Docker Compose override for the mock servers (demo-only)

## D0.4 “One command” demo scripts

- [ ] Add root-level `pnpm` scripts (or document commands) to:
  - [ ] start Postgres
  - [ ] run migrations + seed
  - [ ] start control plane
  - [ ] start mock Jira + ServiceNow
  - [ ] run the demo scenarios

## D0 Gate: Definition of Done

- [ ] A clean clone can run the demo end-to-end locally with no external accounts.
- [ ] Demo proves all four claims in < 10 minutes:
  - [ ] **No duplicate side effects** (REPLAY_SUCCESS on Jira issue + ServiceNow incident)
  - [ ] **Governed retries under 429** (jitter/backoff; no herd)
  - [ ] **Lease serialization** (concurrent Jira transition → orderly, no 409)
  - [ ] **UNKNOWN outcome safety** (mark unknown; poll/replay before reattempt)
- [ ] Demo code is isolated under `examples/` and does not alter core semantics.
