<!-- markdownlint-disable MD033 MD041 -->

<p align="center">
  <img src="assets/wordmark-light.svg#gh-light-mode-only" alt="RunwayCtrl" width="720" />
  <img src="assets/wordmark.svg#gh-dark-mode-only" alt="RunwayCtrl" width="720" />
</p>

<p align="center">
  <strong>Agent execution control plane. Every tool call — safe, idempotent, auditable.</strong>
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
  <img alt="License" src="https://img.shields.io/badge/license-BUSL--1.1-blue.svg" />
  <img alt="Source Available" src="https://img.shields.io/badge/source--available-yes-6f42c1.svg" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-TypeScript-3178C6?logo=typescript&logoColor=white" />
  <img alt="Node" src="https://img.shields.io/badge/Node.js-Node.js-339933?logo=node.js&logoColor=white" />
  <img alt="Postgres" src="https://img.shields.io/badge/Postgres-Postgres-336791?logo=postgresql&logoColor=white" />
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

> **Licensing note:** RunwayCtrl is **source-available**. Production use requires a commercial license unless explicitly permitted. See [`LICENSE`](LICENSE).

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

> **Prerequisites:** a recent Node.js, pnpm, Docker (for a local database)

```bash
# Clone the repo
git clone https://github.com/RunwayCtrl/RunwayCtrl.git
cd RunwayCtrl

# Install dependencies
pnpm install

# Start local infrastructure (database + optional cache)
docker compose up -d

# Run database migrations
pnpm db:migrate

# Seed a dev tenant (and local credentials)
pnpm db:seed

# Start the control plane
pnpm dev
```

The control plane will be running locally (see logs for the URL).

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

RunwayCtrl sits at the *tool boundary* and helps you make agent actions safe and auditable without changing how your tools work.

At a high level, there are four moving parts:

- **SDKs** used by agents/runners to register actions, record attempts, and retrieve outcomes.
- A **control plane API** that applies coordination policies (idempotency, retry governance, bounded concurrency) and records results.
- A **durable store** that acts as the system of record.
- **Telemetry** emitted in a standards-based format so runs are explainable.

```text
Agent / Runner ──▶ RunwayCtrl SDK ──▶ Control Plane API ──▶ Durable Store
                           │                     │
                           └──── telemetry ───────┘
```

### Design principles

- **Separation of concerns:** your agent executes tools; RunwayCtrl coordinates and records outcomes.
- **Privacy-first:** store the minimum metadata necessary for safety and auditing.
- **Interoperability:** integrate cleanly with existing infrastructure and observability pipelines.

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

This is a pnpm workspace monorepo:

- `apps/*` — runnable services and developer tooling (including the control plane).
- `packages/*` — shared libraries and SDKs.
- `Documentation/*` — public API specification artifacts.
- Root docs — contribution, security, testing, and changelog.

---

## Documentation

High-level docs are linked here. Detailed internal specs/runbooks are intentionally not published in this repository.

- API reference: [`Documentation/openapi.yaml`](Documentation/openapi.yaml)
- Change history: [`CHANGELOG.md`](CHANGELOG.md)
- Testing conventions: [`TESTING.md`](TESTING.md)
- Security policy: [`SECURITY.md`](SECURITY.md)

---

## Tech Stack

RunwayCtrl is built with a modern TypeScript stack and common infrastructure primitives:

- TypeScript / Node.js runtime
- HTTP API service
- SQL database for durable coordination and auditing
- Optional cache for performance hints (never the source of truth)
- OpenTelemetry-compatible observability
- pnpm workspaces monorepo
- Unit + integration testing

Implementation details may evolve over time; the public contract is the API + SDK behavior.

---

## API Overview

RunwayCtrl exposes a small HTTP API used by the SDKs to:

- register an action (idempotent)
- record attempts and outcomes
- resolve unknown/ambiguous outcomes safely
- query action status and ledger-derived insights

The canonical reference is the OpenAPI spec: [`Documentation/openapi.yaml`](Documentation/openapi.yaml).

If you’re integrating, prefer the SDKs in `packages/` rather than calling HTTP endpoints directly.

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

This project is under active development.

We track detailed milestones and build phases internally; public releases and notable changes are reflected in [`CHANGELOG.md`](CHANGELOG.md) and GitHub Releases.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code standards, and submission guidelines.

---

## Security

See [SECURITY.md](SECURITY.md) for our security policy and responsible disclosure process.

---

## License

This project is licensed under the [Business Source License 1.1](LICENSE) (**BUSL-1.1**).
