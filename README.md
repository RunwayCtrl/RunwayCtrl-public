<!-- markdownlint-disable MD033 MD041 -->

<p align="center">
  <img src="assets/wordmark-light.svg#gh-light-mode-only" alt="RunwayCtrl" width="720" />
  <img src="assets/wordmark.svg#gh-dark-mode-only" alt="RunwayCtrl" width="720" />
</p>

<p align="center">
  <strong>Agent execution control plane — make tool calls safe in production.</strong>
</p>

<p align="center">
  <a href="#guarantees">Guarantees</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#integrations">Integrations</a> •
  <a href="#documentation">Docs</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" />
  <img alt="Node" src="https://img.shields.io/badge/Node.js-%E2%89%A520-339933?logo=node.js&logoColor=white" />
  <img alt="Postgres" src="https://img.shields.io/badge/Postgres-16+-336791?logo=postgresql&logoColor=white" />
  <img alt="OpenTelemetry" src="https://img.shields.io/badge/OpenTelemetry-native-blueviolet?logo=opentelemetry" />
  <img alt="Status" src="https://img.shields.io/badge/status-v0.1%20development-orange" />
</p>

---

## The Problem

Agents turn one intent into many tool calls — tickets, pages, merges, deployments. Production reality includes partial failures, ambiguous timeouts, rate limits, and concurrency collisions.

Without coordination:

- A tool call times out → the agent retries → the call already succeeded → **duplicate side effects**
- A dependency degrades → the agent fleet retries in sync → **retry storms** amplify the outage
- Multiple agents touch the same resource → **merge races**, conflicting updates, corrupted state
- Nobody can reconstruct what happened → **debugging becomes screenshots and vibes**

**RunwayCtrl sits at the tool boundary and makes every call safe, governed, and explainable.**

---

## Guarantees

RunwayCtrl provides five testable guarantees:

| #     | Guarantee                      | What it means                                                                              |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| **A** | **Effectively-once execution** | Same action attempted multiple times → replay the outcome, never duplicate the side effect |
| **B** | **Governed retries**           | Bounded budgets, jittered backoff, circuit-breaking — no retry storms                      |
| **C** | **Bounded concurrency**        | TTL leases serialize writes to hot resources — no merge races                              |
| **D** | **Explainable runs**           | Every action/attempt is reconstructible from the ledger + correlated OTel traces           |
| **E** | **Execution intelligence**     | Durable ledger → cost optimization signals, tool efficiency scores, hotspot detection      |

---

## Quick Start

> **Prerequisites:** Node.js ≥ 20, pnpm, Docker (for Postgres)

```bash
# Clone the repo
git clone https://github.com/RunwayCtrl/RunwayCtrl.git
cd RunwayCtrl

# Install dependencies
pnpm install

# Start local infrastructure (Postgres + optional Redis)
docker compose up -d

# Run database migrations
pnpm db:migrate

# Seed a dev tenant + API key
pnpm db:seed

# Start the control plane
pnpm dev
```

The control plane will be running at `http://localhost:8080`. Health check: `GET /healthz`.

### Your first governed tool call

```typescript
import { RunwayCtrl } from '@runwayctrl/sdk-node';

const rc = new RunwayCtrl({
  baseUrl: 'http://localhost:8080',
  apiKey: process.env.RUNWAYCTRL_API_KEY,
});

// Wrap any tool call with RunwayCtrl
const result = await rc.execute('jira.create_issue', {
  resourceKey: 'jira:project:ENG',
  args: {
    project: 'ENG',
    summary: 'Deploy monitoring for auth service',
    issueType: 'Task',
  },
});

// result.decision is PROCEED | REPLAY_SUCCESS | REPLAY_FAILURE | PENDING
// result.outcome contains the Jira issue key (e.g., ENG-1847)
// Retries? Duplicates? Unknown timeouts? RunwayCtrl handles it.
```

---

## Architecture

```text
┌─────────────────────────────────────────────────────┐
│                   Agent / Runner                     │
│                                                      │
│   ┌──────────────────────────────────────────────┐  │
│   │            RunwayCtrl SDK (TypeScript)        │  │
│   │  begin → tool call → complete/unknown → poll  │  │
│   └──────────────┬───────────────────────────────┘  │
└──────────────────┼───────────────────────────────────┘
                   │ HTTPS
┌──────────────────▼───────────────────────────────────┐
│              RunwayCtrl Control Plane                  │
│                                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │  Dedupe   │ │  Leases  │ │ Governor │ │  Auth   │ │
│  │  Engine   │ │  (TTL)   │ │(budget/  │ │(tenant- │ │
│  │          │ │          │ │ backoff/ │ │ scoped) │ │
│  │          │ │          │ │ circuit) │ │         │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬────┘ │
│       └─────────────┴────────────┴────────────┘      │
│                        │                              │
│  ┌─────────────────────▼──────────────────────────┐  │
│  │         Durable Ledger (Postgres)               │  │
│  │  actions · attempts · events · leases · stats   │  │
│  └─────────────────────────────────────────────────┘  │
│                        │                              │
│  ┌─────────────────────▼──────────────────────────┐  │
│  │         OpenTelemetry Pipeline                   │  │
│  │  traces · metrics · structured logs              │  │
│  └──────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

**Key design decisions:**

- The control plane **never executes tool calls** — agents do. This eliminates SSRF and credential-handling surface.
- Postgres is the **system of record**. Redis is an optional accelerator, never required for correctness.
- The ledger stores **hashes and pointers**, not raw payloads — privacy-first by default.
- Every table is **tenant-scoped** with enforced isolation (RLS recommended).
- Telemetry is **allowlisted**, not filtered — only approved attributes are emitted.

---

## Integrations

v0.1 ships with three production integrations:

| Integration    | Target Audience                       | Why RunwayCtrl matters                                                                                                                                    |
| -------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Jira Cloud** | Platform engineers, sprint automation | Zero native idempotency on creates. 409 on concurrent transitions with no coordination. New points-based rate limits (March 2026).                        |
| **ServiceNow** | Enterprise ITSM, incident management  | Zero native idempotency on ALL Table API writes. No API-level locking (GlideMutex is server-side only). JOURNAL fields append on PUT. Shared rate limits. |
| **GitHub**     | Developers, CI/CD automation          | No idempotency on PR creation, issues, comments, workflow triggers. Merge races under concurrency.                                                        |

### SDK Pattern (identical across all integrations)

```typescript
// Jira
const issue = await rc.execute('jira.create_issue', {
  resourceKey: 'jira:project:ENG',
  args: { project: 'ENG', summary: 'Fix auth timeout', issueType: 'Bug' },
});

// ServiceNow
const incident = await rc.execute('servicenow.create_incident', {
  resourceKey: 'servicenow:service:auth-service:incident',
  args: { short_description: 'Auth service degraded', urgency: 2 },
});

// GitHub
const pr = await rc.execute('github.merge_pr', {
  resourceKey: 'github:acme/api:pr:42',
  args: { owner: 'acme', repo: 'api', pull_number: 42, merge_method: 'squash' },
});
```

---

## Project Structure

```text
RunwayCtrl/
├── apps/
│   ├── control-plane/          # Fastify API — the core control plane
│   │   └── src/
│   │       ├── api/            # Route handlers
│   │       ├── domain/         # Core types: Action, Attempt, Lease
│   │       ├── services/       # Use-case orchestration
│   │       ├── governor/       # Budgets, backoff, circuits
│   │       ├── ledger/         # Repository layer (Postgres)
│   │       ├── auth/           # API keys, tenant resolution
│   │       ├── observability/  # OTel wiring
│   │       ├── analytics/      # Ledger Insights
│   │       └── migrations/     # SQL migrations
│   └── console/                # Next.js dashboard (read-only, v0.1)
├── packages/
│   ├── shared/                 # Zod schemas shared across SDK + API
│   ├── db/                     # DB client + query helpers
│   ├── sdk-core/               # Keying, hashing, normalization
│   ├── sdk-node/               # Node.js HTTP client
│   ├── integrations-jira/      # Jira wrapped actions
│   ├── integrations-servicenow/# ServiceNow wrapped actions
│   └── integrations-github/    # GitHub wrapped actions
├── Documentation/              # Specs, ADRs, runbooks, guidelines
├── examples/                   # Demo runners + mock servers
├── docker-compose.yml          # Local dev infrastructure
├── TESTING.md                  # Test instance conventions
└── CHANGELOG.md                # API/SDK change log
```

---

## Documentation

Comprehensive documentation lives in [`Documentation/`](Documentation/):

| Document                                                         | Purpose                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| [Project Overview](Documentation/RUNWAYCTRL_PROJECT_OVERVIEW.md) | Canonical "project brain" — guarantees, scope, primitives |
| [PRD](Documentation/PRD%20Document.md)                           | Product requirements and success criteria                 |
| [Implementation Plan](Documentation/Implementation%20Plan.md)    | Phased build plan with gates                              |
| [API Contract](Documentation/API%20Contract.md)                  | Decision semantics, error semantics, idempotency          |
| [OpenAPI Spec](Documentation/openapi.yaml)                       | Source of truth for all endpoints                         |
| [Data Model](Documentation/Data%20Model%20Spec.md)               | ERD, table definitions, invariants                        |
| [Backend Structure](Documentation/Backend%20Structure.md)        | Service boundaries, request lifecycle                     |
| [Security Guidelines](Documentation/Security%20Guidelines.md)    | Threat model, data handling, controls                     |
| [Frontend Guidelines](Documentation/Frontend%20Guidelines.md)    | Dashboard UX, design system, components                   |
| [Tech Stack](Documentation/Tech%20Stack.md)                      | Technology choices and rationale                          |
| [Error Codes](Documentation/Error%20Codes%20and%20Retry.md)      | Error taxonomy, retry semantics                           |
| [OTel Contract](Documentation/02-otel-contract.md)               | Span naming, attribute allowlist                          |
| [ADRs](Documentation/adr-log.md)                                 | Architecture Decision Records                             |

---

## Tech Stack

| Layer             | Technology                     | Why                                                                   |
| ----------------- | ------------------------------ | --------------------------------------------------------------------- |
| **Runtime**       | Node.js ≥ 20                   | TypeScript-native, async-first, agent ecosystem alignment             |
| **API**           | Fastify                        | Low overhead, schema validation, plugin ecosystem                     |
| **Database**      | PostgreSQL 16+                 | ACID transactions, CAS patterns, tenant isolation via RLS             |
| **Cache**         | Redis (optional)               | Budget counters, rate-limit hints — never source of truth             |
| **Observability** | OpenTelemetry                  | Vendor-neutral traces + metrics, execution-aware spans                |
| **SDK**           | TypeScript                     | First-class types, tree-shakeable packages                            |
| **Dashboard**     | Next.js + Tailwind + shadcn/ui | React ecosystem, dark mode, bento grid layout                         |
| **Monorepo**      | pnpm workspaces                | Fast installs, strict dependency isolation                            |
| **CI/CD**         | GitHub Actions                 | Native to our hosting, OIDC-ready                                     |
| **Testing**       | Vitest + MSW + testcontainers  | Fast unit tests, deterministic mocks, real Postgres integration tests |

---

## API Overview

```http
# Begin a governed action
POST /v1/actions/begin
Authorization: Bearer <api_key>

# Complete an attempt (success or failure)
POST /v1/attempts/{attempt_id}/complete

# Mark an attempt as unknown (timeout/ambiguity)
POST /v1/attempts/{attempt_id}/unknown

# Check action status (poll for replay/resolution)
GET /v1/actions/{action_key}

# Ledger Insights (cost optimization, tool efficiency)
GET /v1/insights/cost-summary
GET /v1/insights/tool-efficiency
GET /v1/insights/retry-waste
GET /v1/insights/hotspots
```

Full API reference: [`Documentation/openapi.yaml`](Documentation/openapi.yaml)

---

## Development

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Lint
pnpm lint

# Type check
pnpm typecheck

# Format
pnpm format

# Run integration tests (requires Docker for Postgres)
pnpm test:integration

# Run multi-instance correctness tests
pnpm test:multi-instance
```

---

## Roadmap

- [x] Spec-first documentation (API, data model, security, observability)
- [ ] Phase 0: Repo foundation + dev environment + CI
- [ ] Phase 1: Durable ledger (Postgres schema + migrations)
- [ ] Phase 2: Control plane API skeleton
- [ ] Phase 3: BeginAction + attempt lifecycle
- [ ] Phase 4: Dedupe + replay (Guarantee A)
- [ ] Phase 5: Leases + concurrency control (Guarantee C)
- [ ] Phase 6: Governor v1 — budgets, backoff, circuits (Guarantee B)
- [ ] Phase 7: TypeScript SDK v0.1
- [ ] Phase 8: Observability + security hardening (Guarantee D)
- [ ] Phase 8A: Multi-instance correctness testing
- [ ] Phase 8B: Ledger Insights + execution intelligence (Guarantee E)
- [ ] Phase 9: Production integrations (Jira + ServiceNow + GitHub)
- [ ] Phase 10: Interactive dashboard + Integration Health panel
- [ ] Phase 11: Beta release + design partners
- [ ] Phase 12: Ops polish + v0.2 planning

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code standards, and submission guidelines.

---

## Security

See [SECURITY.md](SECURITY.md) for our security policy and responsible disclosure process.

---

## License

This project is licensed under the [Apache License 2.0](LICENSE).

```text
Copyright 2026 RunwayCtrl Contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
