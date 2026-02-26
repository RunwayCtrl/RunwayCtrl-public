# Testing Guide

> RunwayCtrl test strategy, conventions, and integration test instance setup.

---

## Table of Contents

- [Test Pyramid](#test-pyramid)
- [Running Tests](#running-tests)
- [Test Naming Conventions](#test-naming-conventions)
- [Mock-First Local Development](#mock-first-local-development)
- [Integration Test Instances](#integration-test-instances)
  - [Jira Cloud (Developer Site)](#jira-cloud-developer-site)
  - [ServiceNow (Personal Developer Instance)](#servicenow-personal-developer-instance)
  - [GitHub (Test Repository)](#github-test-repository)
- [Test Data Conventions](#test-data-conventions)
- [CI Integration Tests](#ci-integration-tests)
- [Concurrency & Stress Tests](#concurrency--stress-tests)

---

## Test Pyramid

| Layer            | Tool                  | Scope                                          | Run in CI |
| ---------------- | --------------------- | ---------------------------------------------- | --------- |
| Unit             | Vitest                | Pure functions, state machines, business logic  | ✅ Always |
| Integration (DB) | Vitest + testcontainers | Repository layer, migrations, CAS invariants  | ✅ Always |
| Integration (API)| Vitest + real APIs    | Real Jira / ServiceNow / GitHub calls           | ✅ Main only |
| Concurrency      | Vitest                | Parallel workers, lease contention, dedup races | ✅ Always |

---

## Running Tests

```bash
# All tests (unit + integration with testcontainers)
pnpm test

# Unit tests only
pnpm test:unit

# Integration tests with real external APIs (requires credentials)
pnpm test:integration

# Watch mode during development
pnpm test:watch

# Coverage report
pnpm test:coverage
```

---

## Test Naming Conventions

```
describe('<ModuleName>')
  describe('<methodName>')
    it('should <expected behavior> when <condition>')
```

**File naming:** `<module>.test.ts` for unit, `<module>.integration.test.ts` for API tests.

**Example:**
```typescript
describe('Governor')
  describe('evaluateRetry')
    it('should return DENY when max_retries exceeded')
    it('should return BACKOFF when rate limit at 85% threshold')
    it('should return ALLOW when all invariants pass')
```

---

## Mock-First Local Development

All external API calls are mocked by default using [MSW (Mock Service Worker)](https://mswjs.io/) in Node mode.

```typescript
// test/mocks/handlers/jira.ts
import { http, HttpResponse } from 'msw';

export const jiraHandlers = [
  http.post('https://test.atlassian.net/rest/api/3/issue', () => {
    return HttpResponse.json({
      id: '10001',
      key: 'RCTEST-1',
      self: 'https://test.atlassian.net/rest/api/3/issue/10001',
    });
  }),
];
```

MSW handlers live in `test/mocks/handlers/` with one file per integration:
- `jira.ts` — Jira Cloud REST API v3 mocks
- `servicenow.ts` — ServiceNow Table API mocks
- `github.ts` — GitHub REST API mocks

---

## Integration Test Instances

Real API integration tests require free developer instances. **These tests run only on `main` branch pushes in CI** and can be run locally with proper credentials.

### Jira Cloud (Developer Site)

**Signup:** [developer.atlassian.com/console/myapps](https://developer.atlassian.com/console/myapps/) → Create a free Cloud developer site.

| Setting           | Value                              |
| ----------------- | ---------------------------------- |
| Project key       | `RCTEST`                           |
| Label (all items) | `runwayctrl-test`                  |
| Issue type        | `Task` (default)                   |
| Cleanup strategy  | Filter by label, bulk delete       |

**Required env vars:**
```
JIRA_BASE_URL=https://<your-site>.atlassian.net
JIRA_EMAIL=<your-atlassian-email>
JIRA_API_TOKEN=<api-token-from-id.atlassian.com>
```

**Generate API token:** [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)

### ServiceNow (Personal Developer Instance)

**Signup:** [developer.servicenow.com](https://developer.servicenow.com/) → Request a Personal Developer Instance (PDI).

| Setting             | Value                          |
| ------------------- | ------------------------------ |
| Category            | `RunwayCtrl Test`              |
| Assignment group    | `RunwayCtrl Dev`               |
| Cleanup strategy    | Script: delete by category, 7-day TTL |

**Required env vars:**
```
SERVICENOW_INSTANCE_URL=https://<instance>.service-now.com
SERVICENOW_USERNAME=admin
SERVICENOW_PASSWORD=<pdi-password>
```

> ⚠️ ServiceNow PDIs hibernate after ~10 days of inactivity. Wake yours before running integration tests.

### GitHub (Test Repository)

**Setup:** Create a private repository named `runwayctrl-integration-test` under your GitHub account.

| Setting           | Value                              |
| ----------------- | ---------------------------------- |
| Repository        | `<owner>/runwayctrl-integration-test` (private) |
| Label (all items) | `runwayctrl-test`                  |
| Cleanup strategy  | Close test issues/PRs by label     |

**Required env vars:**
```
INTEGRATION_GITHUB_TOKEN=ghp_<personal-access-token>
```

**Token scopes needed:** `repo`, `workflow`

---

## Test Data Conventions

All test artifacts MUST be identifiable and cleanable:

| Integration  | Marker                          | Cleanup Method              |
| ------------ | ------------------------------- | --------------------------- |
| Jira         | Label: `runwayctrl-test`        | JQL: `labels = runwayctrl-test` → bulk delete |
| ServiceNow   | Category: `RunwayCtrl Test`     | Script: query by category, delete records > 7 days |
| GitHub       | Label: `runwayctrl-test`        | API: list by label → close/delete |

**Rules:**
1. Every test-created resource MUST carry the marker label/category
2. Test cleanup runs in `afterAll()` hooks — best effort, not fatal on failure
3. Integration tests are idempotent — safe to rerun without manual cleanup
4. Never use production credentials in test instances

---

## CI Integration Tests

Integration tests run in a separate job that only triggers on `main` branch pushes (after all unit/lint/typecheck jobs pass).

**Required GitHub Actions secrets:**

| Secret                     | Description                                    |
| -------------------------- | ---------------------------------------------- |
| `JIRA_BASE_URL`           | Jira Cloud developer site URL                  |
| `JIRA_EMAIL`              | Atlassian account email                        |
| `JIRA_API_TOKEN`          | Jira API token                                 |
| `SERVICENOW_INSTANCE_URL` | ServiceNow PDI URL                             |
| `SERVICENOW_USERNAME`     | ServiceNow admin username                      |
| `SERVICENOW_PASSWORD`     | ServiceNow admin password                      |
| `INTEGRATION_GITHUB_TOKEN`| GitHub PAT for test repo                       |

---

## Concurrency & Stress Tests

Concurrency tests validate RunwayCtrl's core guarantees under parallel load:

```bash
# Run concurrency test suite
pnpm test -- --grep "concurrency"
```

**What they cover:**
- **Guarantee A (Effectively-once):** Parallel `BeginAction` calls with same `action_key` → only one proceeds
- **Guarantee B (Governed retries):** Concurrent retry evaluations respect rate limit thresholds
- **Guarantee C (Bounded concurrency):** Lease acquisition under contention → respects `max_leases`
- **Race conditions:** CAS (Compare-And-Swap) version conflicts resolve correctly
- **Deadlock detection:** Concurrent transactions on the same action don't deadlock

These use Vitest's worker threads to simulate realistic parallel execution.
