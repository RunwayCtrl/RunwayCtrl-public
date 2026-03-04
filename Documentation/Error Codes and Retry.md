\

# RunwayCtrl — Error Codes + Retry Semantics Spec (v0.1)

| Field           | Value                                    |
| --------------- | ---------------------------------------- |
| Product         | RunwayCtrl                               |
| Doc Type        | Error Codes + Retry Semantics Spec       |
| Version         | v0.1                                     |
| Date            | January 21, 2026                         |
| Applies to      | Control Plane API + SDK                  |
| Source of truth | `Documentation/openapi.yaml` + this spec |

---

## 1) Purpose

This document defines **mandatory** error codes and **deterministic** retry semantics so:

- the Control Plane behaves consistently across endpoints
- the SDK can implement safe retries without creating duplicate side-effects
- design partners can integrate without guesswork

This spec is intentionally “mechanical”: it tells the system what to do.

---

## 2) Non-negotiable principles

### P1 — Retries MUST be bounded

No unbounded loops. Every retry path MUST have:

- an attempt cap
- a max total time cap
- jittered backoff

### P2 — Unknown outcome is the core hazard

If a tool call times out, the client MUST treat the outcome as unknown and MUST:

1. record UNKNOWN on the attempt
2. poll action status
3. only re-attempt if the action is not terminal

### P3 — `retry_after_ms` is authoritative

When the server includes `retry_after_ms`, the client MUST wait at least that long.
Client-side backoff MUST NOT be shorter than server guidance.

### P4 — Error codes are stable contracts

`error_code` values MUST NOT change once shipped. If semantics must change, bump API version.

### P5 — Degraded mode MUST fail-closed for side effects

When the Control Plane or Ledger is degraded/unreachable (timeouts, network failure, sustained 5xx), clients MUST assume outcomes are **unsafe to guess**. The SDK MUST NOT execute a tool call unless it has received a `PROCEED` decision for that Action. Instead it MUST:

1. retry `POST /v1/actions/begin` with bounded backoff (P1) and
2. if an `action_key` is known, poll `GET /v1/actions/{action_key}` to replay any terminal outcome (P2), and
3. stop once retry budgets are exhausted and surface a clear error.

Server-side, overload protection MUST prefer safe denials (`BUDGET_DENIED`, `RATE_LIMITED`, `CIRCUIT_OPEN`, `LEASE_DENIED`) with `retry_after_ms` rather than creating new attempts.

---

## 3) Standard error response envelope (MUST)

All error responses MUST follow this envelope:

```json
{
  "request_id": "req_...",
  "error_code": "BUDGET_DENIED",
  "message": "Denied: budget exhausted for jira.create_issue",
  "retry_after_ms": 38000,
  "details": { "tool": "jira", "action": "create_issue" }
}
```

Rules:

- `request_id` MUST be present.
- Every API response (success or error) MUST include `X-Request-Id`, and when a response body includes `request_id` it MUST match the `X-Request-Id` value.
- `message` MUST be safe (no secrets, no raw SQL, no stack traces).
- `details` MUST be optional and MUST never include secrets.
- `retry_after_ms` SHOULD be present when retry is meaningful.

---

## 4) Error taxonomy (stable `error_code` list)

> Note: HTTP status codes are transport; `error_code` is the stable machine contract.

| error_code       | Typical HTTP | Retryable? | Meaning                                                                                                                  |
| ---------------- | -----------: | :--------: | ------------------------------------------------------------------------------------------------------------------------ |
| VALIDATION_ERROR |          400 |     No     | Request schema invalid, missing required fields, invalid ranges                                                          |
| AUTH_ERROR       |          401 |     No     | Missing/invalid API key                                                                                                  |
| NOT_FOUND        |          404 |    No\*    | Resource not found (action/attempt). (\*Usually no retry; except during eventual-consistency windows, which v0.1 avoids) |
| CONFLICT         |          409 |   Maybe    | State conflict (e.g., invalid state transition)                                                                          |
| LEASE_DENIED     |          409 |    Yes     | Resource lock held by another holder                                                                                     |
| RATE_LIMITED     |          429 |    Yes     | Per-IP or per-tenant rate limiter triggered                                                                              |
| BUDGET_DENIED    |          429 |    Yes     | Governor budget exhausted (QPS / concurrency / token budget)                                                             |
| CIRCUIT_OPEN     |          503 |    Yes     | Circuit breaker open (protecting downstream/tool)                                                                        |
| INTERNAL_ERROR   |          500 |   Maybe    | Unexpected server failure                                                                                                |

---

## 5) Retry semantics by class

### 5.1 Retryable governance failures (LEASE_DENIED / BUDGET_DENIED / RATE_LIMITED / CIRCUIT_OPEN)

**Client behavior (MUST):**

1. If `retry_after_ms` present: sleep that long (plus jitter up to 10%).
2. Poll `GET /v1/actions/{action_key}` if an action_key is known.
3. If action is terminal: replay (no new tool call).
4. Else: call `POST /v1/actions/begin` again.

**Server behavior (MUST):**

- Provide `retry_after_ms` whenever denial is expected to clear.
- Do not create new attempts when returning a denial.

### 5.2 CONFLICT

CONFLICT splits into two cases:

**A) Invalid state transition**  
Example: attempting to complete an already terminal attempt.

- Retryable: **No**
- Client should treat as a logic bug and stop.

**B) BeginAction conflict** (rare in v0.1 if dedupe logic is correct)

- Retryable: **Maybe**
- If retryable, server MUST send `retry_after_ms` and/or return `PENDING` instead.

### 5.3 INTERNAL_ERROR

**Retryable: bounded “best effort” only.**

Client behavior:

- Wait a short jittered backoff and retry BeginAction **at most N times**.
- Prefer polling action status first if `action_key` known.

Server behavior:

- Return `request_id` always
- Avoid leaking internal detail in message/details

---

## 6) Retry budgets (SDK defaults) — recommended v0.1

These are safe defaults; the SDK MUST allow override.

| Parameter               |             Default | Rationale                    |
| ----------------------- | ------------------: | ---------------------------- |
| max_attempts_per_action |                   5 | Prevent infinite retries     |
| max_total_retry_time_ms |      180000 (3 min) | Keeps workflows responsive   |
| base_backoff_ms         |                 500 | Avoid hot-looping            |
| max_backoff_ms          |               30000 | Upper bound                  |
| jitter                  | Full jitter or ±20% | Breaks retry synchronization |

Important: If server returns `retry_after_ms`, that overrides the above.

---

## 7) Decision responses are NOT errors (BeginAction)

`POST /v1/actions/begin` can return:

- `PROCEED`: execute tool call now (attach returned headers)
- `REPLAY_SUCCESS`: do not execute, return outcome
- `REPLAY_FAILURE`: do not execute, surface failure
- `PENDING`: do not execute, wait `retry_after_ms`, poll

The SDK MUST treat PENDING as the normal “busy/wait” path — not an exception.

---

## 8) Unknown-outcome protocol (MUST)

### 8.1 When to mark UNKNOWN

The client MUST mark UNKNOWN when it cannot determine if the tool call executed:

- network failure after request was sent
- timeout waiting for response
- process crash after request but before completion reporting

### 8.2 Required sequence

When a tool call returns unknown outcome:

1. `POST /v1/attempts/{attempt_id}/unknown`
2. `GET /v1/actions/{action_key}`
3. Branch:
   - if terminal SUCCESS: **REPLAY_SUCCESS**
   - if terminal FAILURE: **REPLAY_FAILURE**
   - if IN_FLIGHT/PENDING: wait and poll (bounded)
   - if not found: treat as integration error (should not happen if begin succeeded)

Only after these steps MAY the client attempt a new BeginAction.

---

## 9) Polling semantics (GET action status)

The SDK should poll with:

- exponential backoff with jitter
- obey `retry_after_ms` when provided by PENDING responses
- stop polling when:
  - action becomes terminal
  - max_total_retry_time_ms reached

Recommended poll schedule (if server gives no guidance):

- 0.5s, 1s, 2s, 4s, 8s, 15s, 30s (cap)

---

## 10) Canonical retry loop (SDK pseudocode)

```ts
async function governedExecute(input) {
  const start = Date.now();
  let attempts = 0;

  while (true) {
    if (attempts >= cfg.maxAttempts || Date.now() - start > cfg.maxTotalTimeMs) {
      throw new Error('RunwayCtrl: retry budget exhausted');
    }

    // Step 1: ask control plane what to do
    const decision = await beginAction(input);

    if (decision.decision === 'REPLAY_SUCCESS') return replay(decision);
    if (decision.decision === 'REPLAY_FAILURE') throw replayFailure(decision);

    if (decision.decision === 'PENDING') {
      await sleep(jitter(decision.retry_after_ms ?? backoff(attempts)));
      attempts++;
      continue; // loop to beginAction or poll (implementation choice)
    }

    // PROCEED: execute tool call with returned headers
    const attemptId = decision.attempt_id;

    try {
      const result = await callTool(input, decision.headers);
      await completeAttempt(attemptId, result);
      return result;
    } catch (err) {
      if (isUnknownOutcome(err)) {
        await markUnknown(attemptId, err);
        const status = await getActionStatus(decision.action_key);
        if (status.status === 'SUCCESS') return replayFromStatus(status);
        if (status.status === 'FAILURE') throw replayFailureFromStatus(status);
        // not terminal: retry beginAction (bounded)
        await sleep(jitter(backoff(attempts)));
        attempts++;
        continue;
      }

      await completeAttemptFailure(attemptId, err);

      // Failure is not automatically retryable unless policy says so.
      // SDK should re-enter the loop; server will replay/deny/allow.
      await sleep(jitter(backoff(attempts)));
      attempts++;
    }
  }
}
```

Key point: **the server is the governor**. The SDK only orchestrates bounded retries while respecting server guidance.

---

## 11) Error matrix by endpoint (v0.1)

### 11.1 `POST /v1/actions/begin`

| HTTP | error_code                   | Client action                                                           |
| ---: | ---------------------------- | ----------------------------------------------------------------------- |
|  400 | VALIDATION_ERROR             | Fix request. Do not retry.                                              |
|  401 | AUTH_ERROR                   | Fix credentials. Do not retry.                                          |
|  409 | LEASE_DENIED                 | Wait `retry_after_ms`, then retry begin/poll.                           |
|  429 | BUDGET_DENIED / RATE_LIMITED | Wait `retry_after_ms`, then retry begin/poll.                           |
|  503 | CIRCUIT_OPEN                 | Wait `retry_after_ms`, then retry begin/poll.                           |
|  500 | INTERNAL_ERROR               | Retry begin with tight bounded policy. Prefer poll if action_key known. |

### 11.2 `POST /v1/attempts/{attempt_id}/complete`

| HTTP | error_code       | Client action                                                   |
| ---: | ---------------- | --------------------------------------------------------------- |
|  400 | VALIDATION_ERROR | Fix client bug.                                                 |
|  404 | NOT_FOUND        | Treat as integration bug (attempt_id wrong or tenant mismatch). |
|  409 | CONFLICT         | Treat as client logic bug (double completion).                  |
|  500 | INTERNAL_ERROR   | Retry completion a few times (idempotent by attempt_id).        |

### 11.3 `POST /v1/attempts/{attempt_id}/unknown`

Same as `complete`, except it MUST be safe to call multiple times (idempotent).

### 11.4 `GET /v1/actions/{action_key}`

| HTTP | error_code | Client action                                                            |
| ---: | ---------- | ------------------------------------------------------------------------ |
|  404 | NOT_FOUND  | Treat as integration bug if begin succeeded; otherwise action_key wrong. |
|  401 | AUTH_ERROR | Fix credentials.                                                         |

---

## 12) Server-side requirements (MUST)

- Every response includes `X-Request-Id` header for correlation.
- Denial paths MUST NOT create attempts.
- Complete/Unknown endpoints MUST be idempotent by `(tenant_id, attempt_id, terminal_state)`:
  - repeating the same completion returns 200 with same terminal result
  - attempting a different terminal result returns 409 CONFLICT
- Do not leak secrets or payloads in `message` or `details`.
- `retry_after_ms` MUST be computed from actual policy/lease expiry (not random).

---

## 13) Developer experience requirements (SHOULD)

- Provide consistent JSON shape across all errors.
- Include `request_id` in SDK exceptions.
- SDK should expose a debug mode that logs:
  - decision path (PROCEED/REPLAY/PENDING)
  - retry sleeps
  - request_id and attempt_id
    …but never logs secrets, API keys, or raw tool payloads by default.

---

## 14) Files in this export

- `Documentation/Error Codes and Retry.md` (this file)
- (references) `Documentation/openapi.yaml` and `Documentation/API Contract.md`
