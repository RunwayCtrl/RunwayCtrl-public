# RunwayCtrl — Project Overview (v0.1 Source of Truth)

This file is the canonical “project brain” for builders.

If a build decision conflicts with this doc, update this doc first (or treat the decision as out-of-scope).

---

## 1) One-sentence definition

RunwayCtrl is an agent execution control plane that makes tool calls safe in production—preventing duplicate side effects, retry storms, and concurrency meltdowns—while making every run explainable via a ledger-backed execution record and OpenTelemetry.

---

## 2) Reality snapshot (what exists today vs what is planned)

RunwayCtrl is being built spec-first, but we explicitly track implementation reality so we don’t confuse “documented” with “shipped.”

### 2.1 Implemented in this repo (Phase 1 ledger + Phase 2 skeleton)

- Postgres ledger migration and tables exist: tenants, api_keys, actions, attempts, attempt_events, leases.
  - `apps/control-plane/src/migrations/0001_ledger_schema.sql`
- Tenant-scoped ledger repositories exist (Action/Attempt/Event/Lease) and are integration-tested.
  - `apps/control-plane/src/ledger/repos/*`
  - `apps/control-plane/src/ledger/repos/ledger.integration.test.ts`
- Control-plane service skeleton exists (Fastify app, safe error handler, request id echo, auth middleware).
  - `apps/control-plane/src/app.ts`
  - `apps/control-plane/src/auth/plugin.ts`
- OTel attribute allowlist exists (telemetry minimization guardrail).
  - `apps/control-plane/src/observability/attrs.ts`

### 2.2 Not implemented yet (but specified)

- Core governed execution endpoints (`/v1/actions/begin`, attempt lifecycle endpoints, action status endpoint).
- SDK packages are placeholders.
- Governor (budgets/backoff/circuits), dedupe/replay/join behavior, and FIFO lease queueing.
- Jira + ServiceNow + GitHub integration packages.
- Ledger Insights / analytics endpoints (`/v1/insights/*`) — cost optimization and execution intelligence mined from durable ledger data.
- The Hub (`GET /v1/insights/hub`) — LLM-powered execution analysis providing narrative insights, anomaly detection, and optimization recommendations (see `Documentation/ADR-0012-hub-llm-analysis.md`).
- Multi-instance correctness validation harness (testcontainers-node + chaos tests proving CAS/lease/governor correctness across N instances).
  This matters because our product is semantics: if semantics are only in docs, we don’t have a product yet.

---

## 3) The problem (plain English)

Agents turn one intent into many tool calls (paging, tickets, CI, repos, internal APIs). Production reality includes partial failures, ambiguous timeouts (“did it succeed or not?”), rate limits, transient outages, and concurrency collisions.

Naive agents behave like chaos generators:

- A tool call times out; the agent retries; the tool call already succeeded; you get duplicate side effects.
- A dependency degrades; the agent fleet retries in sync; you get retry storms that amplify the outage.
- Multiple agents touch the same resource; you get merge races, conflicting updates, and corrupted state.
- Nobody can reconstruct what happened; debugging becomes screenshots and vibes.

Core thesis: as agents move into production, the bottleneck shifts from “model intelligence” to coordination and governance at the tool boundary.

---

## 4) What RunwayCtrl is (and is not)

### 4.1 What it is

A neutral control plane that wraps tool execution with:

1. Action identity (a universal way to name “the same action”)
2. A durable attempt ledger (system of record for execution facts)
3. Governance (bounded retries, storm prevention, concurrency leases, coalescing)
4. OTel-native observability enriched with execution semantics
5. Execution intelligence (cost optimization, pattern detection, and operational insights mined from the durable ledger)

### 4.2 What it is not (v0.1 non-goals)

- Not an agent framework.
- Not a workflow engine.
- Not a general-purpose LLM observability product.
- Not “agent memory.”

We integrate with those layers; we do not replace them.

### 4.3 Systems of record

- The external tool is authoritative for the external object’s current state (incident, ticket, PR).
- RunwayCtrl is authoritative for execution facts (what we attempted/decided/observed and the best-known outcome pointer).

---

## 5) The contract (guarantees)

RunwayCtrl provides a small set of testable guarantees.

### 5.1 Guarantee A: No duplicate side effects (effectively-once)

If the “same action” is attempted multiple times (retries, restarts, parallel agents), RunwayCtrl ensures the caller either:

- gets a replay of the same outcome, or
- is blocked/coalesced/turned into a no-op per policy.

### 5.2 Guarantee B: Governed retries (no retry storms)

Retries are bounded and coordinated:

- budgets per tool/resource/action
- jittered backoff
- circuit-breaking when failure rates spike
- server-provided `retry_after_ms` is authoritative

### 5.3 Guarantee C: Bounded concurrency (one writer when needed)

RunwayCtrl enforces leases (TTL locks) for write surfaces and hot resources, with fairness policies.

### 5.4 Guarantee D: Explainable runs (auditability)

Every action attempt is reconstructible from ledger records and correlated traces/spans.

### 5.5 Guarantee E: Execution intelligence (durability as value)

The durable ledger is not just a safety net—it is a data asset. RunwayCtrl mines execution history to surface:

- **Cost optimization signals:** retry waste ratios, budget denial rates, replay savings.
- **Tool efficiency scores:** success rates, latency profiles, failure class distributions per tool.
- **Hotspot detection:** high-contention resources, frequent unknown outcomes, governor bottlenecks.
- **Trend analysis:** daily/weekly execution volume, waste trends, efficiency improvements over time.
- **LLM-powered narrative analysis (The Hub):** pre-computed, human-readable insights generated by an LLM (default: OpenAI GPT-5.2) from aggregated execution data — anomaly detection, optimization recommendations, failure mode summaries. Served via `GET /v1/insights/hub`.

This turns durability from a cost center (storage) into a competitive advantage (actionable intelligence).

---

## 6) The “constitution” (how we prevent spec/code drift)

The product is semantics, so the contract must be executable.

Source of truth:

- OpenAPI: `Documentation/openapi.yaml`
- Semantics: `Documentation/API Contract.md` and `Documentation/Error Codes and Retry.md`
- Invariants: `Documentation/01-state-machines-and-invariants.md`
- Security posture: `Documentation/Security Guidelines.md`

Hard rule:

- Every endpoint must have a contract test. CI must fail on drift.
- Error envelopes and `error_code` enums must match OpenAPI exactly.
- Every response must include `X-Request-Id`.

---

## 7) v0.1 scope (what ships)

v0.1 is intentionally narrow: we ship an end-to-end vertical slice that proves the guarantees, plus two integrations.

### 7.1 The minimal vertical slice (must exist before integrations matter)

Endpoints:

1. `POST /v1/actions/begin`
2. `POST /v1/attempts/{attempt_id}/complete`
3. `POST /v1/attempts/{attempt_id}/unknown`
4. `GET /v1/actions/{action_key}`
5. `GET /v1/insights/cost-summary` (Ledger Insights)
6. `GET /v1/insights/tool-efficiency` (Ledger Insights)
7. `GET /v1/insights/retry-waste` (Ledger Insights)
8. `GET /v1/insights/hotspots` (Ledger Insights)
9. `GET /v1/insights/hub` (The Hub — LLM execution analysis)

SDK:

- begin → tool call → complete
- timeout/network ambiguity → mark unknown → poll status → replay or re-attempt (bounded)

### 7.2 Integrations (scope lock)

v0.1 ships with three production integrations:

- GitHub (developer workflows) — PRIMARY, zero native idempotency on PRs, issues, comments, workflow triggers.
- Jira (project management / ticketing) — PRIMARY, zero native idempotency on issue creation, comments, subtasks, links. Concurrent transitions return 409 with no coordination primitive. New points-based rate limits enforcing March 2026.
- ServiceNow (ITSM / enterprise operations) — PRIMARY (build + test; market to enterprise later), zero native idempotency on ALL Table API writes. GlideMutex is server-side only — REST API callers get zero locking. Shared rate limits per instance.

PagerDuty is demoted to a future nice-to-have integration. Research showed that PagerDuty's native `incident_key` / `dedup_key` already covers most of our dedupe value (3 of 5 actions natively idempotent).

Rationale:

- GitHub drives developer adoption and showcases high-stakes concurrency control (merge races, duplicate PRs).
- Jira has the widest technical gap in the project-management space: zero idempotency on creates, no external locking, and aggressive new rate limits. 250K+ organizations.
- ServiceNow has the widest technical gap of any integration researched (30 of 50 guarantee×action cells rated HIGH+). $12.9B revenue platform, 85% Fortune 500. Neither Jira nor ServiceNow expose API-level locking for external callers — RunwayCtrl's lease system is the only coordination layer that exists.
- The SDK pattern is identical across all three: `rc.execute(tool.action, { resourceKey, args })`. Building three in parallel validates the integration architecture and proves the abstraction.

---

## 8) Core primitives (implementation-oriented)

### 8.1 ActionKey

ActionKey is the stable identity for “the same semantic action.”

Canonical formula:

```text
ActionKey = sha256(tenant_id + tool_name + action_name + resource_key + normalized_args_hash + window_epoch?)
```

Policy:

- Writes must have an explicit `resource_key` (fail closed if missing).
- Reads may auto-key from arguments (low risk).
- Normalization is deterministic: sort keys, trim, lowercase strings, stable JSON encoding.

### 8.2 Attempt

An Attempt is one execution try. Attempts are append-only records with strict state transitions.

### 8.3 Action status model (v0.1)

In v0.1, Action status is computed as:

- If `actions.terminal_status` is set: action is terminal (SUCCESS/FAILURE)
- Otherwise, status is derived from the latest attempt:
  - latest attempt IN_FLIGHT → action IN_FLIGHT
  - latest attempt UNKNOWN → action UNKNOWN
  - no attempts yet → action IN_FLIGHT

This avoids writing “derived state” multiple ways and reduces correctness risk.

### 8.4 Leases

Leases serialize writes to a resource with TTL semantics. Denials must be typed (`LEASE_DENIED`) and include deterministic `retry_after_ms` derived from expiry.

---

## 9) Security and compliance posture (SOC2-capable by design)

v0.1 posture:

- Minimize data by default: store hashes/pointers/metadata, not raw payloads.
- API keys are hashed (Argon2) and never logged.
- Tenant isolation is enforced by design: every query is tenant-scoped.
- Telemetry is minimized: only allowlisted attributes are emitted.

Controls that must exist (not just be documented):

- Append-only audit log for sensitive events (API key lifecycle, auth failures, admin actions).
- Enforced retention jobs for ledger data.
- Rate limiting (per-tenant and per-IP) and request size/time limits.
- A kill-switch surface (disable tenant/tool quickly; circuit open).

---

## 10) Go-to-market wedge (design-partner ready)

We win by making adoption inevitable:

- SDK wrapper is tiny and hard to misuse.
- Immediate payoff: dedupe + unknown-outcome safety + leases + traces.
- A minimal scoreboard exists to demonstrate outcomes (duplicates prevented, storms dampened, leases contended).

---

## 11) Success criteria (measurable)

We are “real” when we can demo, under induced failures:

- Duplicate prevention under timeouts (replay rather than duplicate create/merge).
- Storm prevention under 429/5xx conditions (bounded retry + circuit).
- One-writer behavior under concurrency (lease contention).
- Forensics: reconstruct what happened via ledger + trace correlation.
- Cost intelligence: surface retry waste, tool efficiency, and optimization signals from ledger data.
- Hub intelligence: LLM-generated insights surface actionable patterns, anomalies, and recommendations from execution history.
- Multi-instance correctness: all CAS, lease, and governor guarantees hold with 3+ instances sharing one Postgres.

---

## 12) Glossary (builder references)

- [Idempotency](https://en.wikipedia.org/wiki/Idempotence)
- [Idempotency keys (Stripe)](https://stripe.com/docs/idempotency)
- [Retry storm antipattern (Microsoft)](https://learn.microsoft.com/en-us/azure/architecture/antipatterns/retry-storm/)
- [Circuit breaker pattern (Microsoft)](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)
- [OpenTelemetry](https://opentelemetry.io/)
- [Distributed tracing](https://en.wikipedia.org/wiki/Distributed_tracing)
- [Control plane](https://en.wikipedia.org/wiki/Control_plane)
- [Concurrency control](https://en.wikipedia.org/wiki/Concurrency_control)

---

## End of document
