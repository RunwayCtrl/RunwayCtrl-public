# Contributing to RunwayCtrl

Thank you for your interest in contributing to RunwayCtrl. This document provides guidelines and standards for contributing.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Standards](#code-standards)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)
- [Architecture Decisions](#architecture-decisions)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

---

## Getting Started

1. **Fork the repo** and clone your fork
2. **Install dependencies:** `pnpm install`
3. **Start local infrastructure:** `docker compose up -d`
4. **Run migrations:** `pnpm db:migrate`
5. **Seed dev data:** `pnpm db:seed`
6. **Run tests:** `pnpm test`

See the [README](README.md) for complete setup instructions.

---

## Development Setup

### Prerequisites

- **Node.js** ≥ 20 (LTS)
- **pnpm** (package manager — do not use npm or yarn)
- **Docker** (for Postgres and optional Redis)
- **Git** with conventional commit awareness

### Environment

Copy `.env.example` to `.env.local` for local development:

```bash
cp .env.example .env.local
```

For integration testing with real services (Jira, ServiceNow, GitHub), see [TESTING.md](TESTING.md).

---

## Code Standards

### TypeScript

- **Strict mode** enabled (`strict: true` in tsconfig)
- **No `any`** — use `unknown` and narrow with type guards
- **Explicit return types** on exported functions
- **Zod** for runtime validation of external inputs (API requests, env vars, config)

### File Organization

- Follow the canonical folder structure in [Backend Structure.md](Documentation/Backend%20Structure.md)
- One concept per file; files should be < 300 lines (split if larger)
- Barrel exports (`index.ts`) per package/module

### Naming Conventions

| Thing            | Convention      | Example                           |
| ---------------- | --------------- | --------------------------------- |
| Files            | kebab-case      | `begin-action.service.ts`         |
| Classes          | PascalCase      | `ActionRepository`                |
| Functions        | camelCase       | `beginAction()`                   |
| Constants        | SCREAMING_SNAKE | `MAX_RETRY_ATTEMPTS`              |
| Types/Interfaces | PascalCase      | `BeginActionRequest`              |
| Database columns | snake_case      | `action_key`, `tenant_id`         |
| API fields       | snake_case      | `retry_after_ms`, `failure_class` |
| Env vars         | SCREAMING_SNAKE | `JIRA_API_TOKEN`                  |

### Testing

- **Unit tests:** colocated with source (`*.test.ts`)
- **Integration tests:** colocated with source (`*.integration.test.ts`)
- **Test runner:** Vitest
- **Mocking:** MSW (Node) for external API mocks via `@runwayctrl/testkit`
- **Database tests:** testcontainers-node for real Postgres
- Every new feature must include tests. PRs without tests will be returned.

### Documentation

- Every behavior change must update the relevant docs in the same PR
- ADRs (Architecture Decision Records) for significant technical decisions — see [ADR template](Documentation/adr-template.md)
- Inline code comments for non-obvious "why" decisions (not "what" — code should be self-explanatory)

---

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/) and **enforce them in CI**.

Because we **squash-merge** PRs to `main`, the **PR title becomes the commit message** on `main`.
So: make your PR title a valid conventional commit (e.g. `feat(api): add /healthz`).

```text
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type       | When to use                                             |
| ---------- | ------------------------------------------------------- |
| `feat`     | New feature                                             |
| `fix`      | Bug fix                                                 |
| `docs`     | Documentation only                                      |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test`     | Adding or updating tests                                |
| `chore`    | Build process, tooling, dependencies                    |
| `perf`     | Performance improvement                                 |
| `ci`       | CI/CD changes                                           |
| `security` | Security fix or improvement                             |

### Scopes (optional but encouraged)

`api`, `sdk`, `ledger`, `governor`, `leases`, `auth`, `otel`, `console`, `jira`, `servicenow`, `github`, `docs`, `ci`, `db`

### Examples

```text
feat(api): implement BeginAction endpoint with dedupe/replay logic
fix(leases): prevent lease grant when existing holder has not expired
docs(adr): add ADR-0010 for rate limit header capture strategy
test(jira): add MSW handlers for 409 transition conflict scenario
chore(deps): update vitest to 3.x

# Squash merge commit examples (PR titles)
chore: phase 0.1 monorepo scaffolding
ci: enforce conventional commits
```

---

## Pull Request Process

### Before submitting

1. **Run the full test suite:** `pnpm test`
2. **Run lint and type check:** `pnpm lint && pnpm typecheck`
3. **Update docs** if behavior changed
4. **Add changelog entry** if the change affects the API or SDK behavior

### PR template

PRs should include:

- **What** — brief summary of the change
- **Why** — link to issue or describe motivation
- **How** — implementation approach (especially for non-obvious decisions)
- **Testing** — what was tested and how
- **Checklist:**
  - [ ] Tests pass
  - [ ] Lint passes
  - [ ] Docs updated (if applicable)
  - [ ] Changelog updated (if API/SDK change)
  - [ ] No secrets in code, logs, or comments

### Review expectations

- All PRs require at least one review
- Security-sensitive changes (auth, tenant isolation, crypto) require explicit security review
- Breaking API changes require an ADR

---

## Issue Guidelines

### Bug reports

Include:

- **Environment** (Node version, OS, Docker versions)
- **Steps to reproduce** (exact commands or API calls)
- **Expected vs actual behavior**
- **Relevant logs** (redact secrets)

### Feature requests

Include:

- **Problem statement** (what gap does this address?)
- **Proposed solution** (how should it work?)
- **Alternatives considered**
- **Impact on guarantees** (A through E — does this change affect any guarantee?)

---

## Architecture Decisions

Significant decisions are tracked as ADRs in `Documentation/ADR-*.md`.

**When to write an ADR:**

- Choosing between technical alternatives with meaningful tradeoffs
- Changing a previously decided approach
- Adding a new integration or storage system
- Modifying guarantee semantics

See the [ADR template](Documentation/adr-template.md) and [ADR log](Documentation/adr-log.md).

---

## Questions?

Open an issue with the `question` label, or start a discussion.
