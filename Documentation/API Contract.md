# RunwayCtrl — API Contract (v0.1)

| Field            | Value                                           |
| ---------------- | ----------------------------------------------- |
| Product          | RunwayCtrl                                      |
| Doc Type         | API Contract                                    |
| Version          | v0.1                                            |
| Date             | January 21, 2026                                |
| Primary Artifact | `Documentation/openapi.yaml`                    |
| Goal             | Keep Control Plane + SDK aligned with one truth |

---

## 1) What this contract is

This is the “constitution” of the RunwayCtrl Control Plane API.

- **OpenAPI is the source of truth**: `openapi.yaml`
- This doc explains **semantics** that don’t fit cleanly into OpenAPI:
  - decision behavior (PROCEED/REPLAY/PENDING)
  - retry behavior (`retry_after_ms`)
  - idempotency strategy guidance
  - invariants that code MUST enforce

---

## 2) Core concepts (glossary-lite)

- **ActionKey**: stable idempotency key for a semantic action.
- **Attempt**: one execution try for an action.
- **OutcomePointer**: opaque pointer (or compact value) referencing the result.
- **ResourceKey**: the serialized resource (for leases).
- **Governor**: policy engine that can deny/delay to prevent storms.

---

## 3) Authentication (v0.1)

All non-meta endpoints require:

- `Authorization: Bearer <api_key>`

Bearer token format (v0.1):

- `Authorization: Bearer <api_key_id>.<api_key_secret>`
- The `api_key_id` is a public identifier used for O(1) lookup.
- The `api_key_secret` is verified against the stored `key_hash` (Argon2id) and is never stored or logged.

Rules:

- API keys are **tenant-scoped**.
- API keys are stored **hashed** (never plaintext).
- Any missing/invalid auth MUST return a safe 401 with `error_code=AUTH_ERROR`.

---

## 4) Decision semantics (BeginAction)

`POST /v1/actions/begin` returns either a 200 **decision**, or an error (409/429/503).

### 4.1 Decision: PROCEED

Meaning: the caller SHOULD execute the tool call now.

Response includes:

- `attempt_id` (recorded in ledger)
- optional `headers` to attach to tool call (e.g., Idempotency-Key)

### 4.2 Decision: REPLAY_SUCCESS

Meaning: the action is already terminal-success within the dedupe window.
The caller SHOULD **not** execute the tool call again. It should replay the outcome.

### 4.3 Decision: REPLAY_FAILURE

Meaning: the action is already terminal-failure and is replayable by policy.
The caller SHOULD not execute again.

### 4.4 Decision: PENDING

Meaning: an attempt is currently in-flight (or the server chose not to proceed).
The caller SHOULD wait at least `retry_after_ms` and then poll `GET /v1/actions/{action_key}`.

---

## 5) Error semantics (409 / 429 / 503)

When BeginAction cannot proceed due to governance or locking:

- **409 CONFLICT**: lease denied or state conflict  
  `error_code=LEASE_DENIED` or `CONFLICT`

- **429 TOO MANY REQUESTS**: budget denied / rate limited  
  `error_code=BUDGET_DENIED` or `RATE_LIMITED`

- **503 SERVICE UNAVAILABLE**: circuit open  
  `error_code=CIRCUIT_OPEN`

All error responses MUST include:

- `request_id`
- `error_code`
- `message`
- `retry_after_ms` when retry is meaningful

All responses (success or error) MUST include the `X-Request-Id` response header.
When an error body includes `request_id`, it MUST match `X-Request-Id`.

---

## 6) Unknown outcomes and retries (the critical path)

When a tool call times out (caller doesn’t know if it executed), the SDK SHOULD:

1. `POST /v1/attempts/{attempt_id}/unknown`
2. `GET /v1/actions/{action_key}`
3. If terminal success exists: **replay** (don’t re-run)
4. If not terminal: begin a new attempt via `POST /v1/actions/begin` (respecting `retry_after_ms`)

---

## 7) Idempotency strategy guidance (tool capability)

`BeginActionRequest.idempotency_support` is a hint that informs the SDK strategy:

- `HEADER`: tool supports an idempotency header (preferred).
- `PAYLOAD_TOKEN`: tool supports a client token in request body.
- `NONE`: use ActionKey + replay logic; be conservative with retries.

The server MAY return `headers` in PROCEED responses:

- e.g., `Idempotency-Key: <derived from action_key>`

---

## 8) Tenant isolation (MUST)

Contract rule:

- Clients never send tenant_id to tenant-scoped endpoints.
- The server derives tenant_id from auth.
- All reads/writes MUST be scoped by `(tenant_id, action_key)` or `(tenant_id, attempt_id)`.
- All insight reads MUST be scoped by `tenant_id` (derived from auth, same as other endpoints).

---

## 8.1) Insights endpoints (read-only analytics)

> Added in Phase 8B. All insight endpoints are tenant-scoped, read-only, and served from pre-aggregated data (`execution_daily_stats`). They never touch the hot write path.

- `GET /v1/insights/cost-summary` — Aggregated cost/efficiency metrics (retry waste, replay savings, denial rates).
- `GET /v1/insights/tool-efficiency` — Per-tool success rate, latency, retry cost.
- `GET /v1/insights/retry-waste` — Wasted attempts and denial breakdown.
- `GET /v1/insights/hotspots` — Top tools/actions by waste and contention.
- `GET /v1/insights/hub` — Pre-computed LLM execution analysis (The Hub). Returns anomaly detection, optimization recommendations, and pattern summaries generated daily from aggregated ledger data. Gated by `ENABLE_HUB` feature flag; returns 404 when disabled or no analysis exists.

Common query parameters: `from` (date), `to` (date), `tool?`, `action?`, `top_n?`.

All responses follow the standard envelope with `request_id`, standard error codes, and rate limiting.

---

## 9) Files included in this export

- `Documentation/openapi.yaml` (source of truth)
- `Documentation/API Contract.md` (this file)
- `Documentation/examples.http` (copy/paste requests for VSCode REST Client)

---

## 10) Change policy (so this stays real)

- Any change to behavior MUST update:
  - OpenAPI schema
  - examples
  - SDK behavior (if applicable)
- Breaking changes require:
  - version bump (v0.1 -> v0.2)
  - migration note (if DB-related)
