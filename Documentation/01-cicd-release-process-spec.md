# RunwayCtrl — CI/CD + Release Process Spec (v0.1)

| Field    | Value                                                                 |
| -------- | --------------------------------------------------------------------- |
| Product  | RunwayCtrl                                                            |
| Doc Type | CI/CD + Release Process Spec                                          |
| Version  | v0.1                                                                  |
| Date     | January 21, 2026                                                      |
| Audience | Engineers shipping control-plane services + SDKs                      |
| Goal     | Ship fast **without** breaking idempotency, invariants, or ops safety |

---

## 1) Principles (non-negotiables)

1. **Correctness > speed**, but we still ship frequently.
2. **Repeatability**: builds are deterministic and traceable.
3. **Blast radius control**: staged rollout, canary, safe rollback.
4. **Security by default**: least-privilege, secret hygiene, dependency scanning.
5. **Observability is part of “done”**: releases must preserve OTel contract.

---

## 2) Release model (what we ship, how often)

### 2.1 Artifacts

RunwayCtrl ships multiple artifacts:

- **Control Plane API** service (`runwayctrl-api`)
- **Governor/worker** service(s) (`runwayctrl-governor`, `runwayctrl-ledger-worker`)
- **SDK** packages (`runwayctrl-sdk-*`)

Each artifact has:

- version (SemVer)
- build metadata (git SHA)
- SBOM (software bill of materials)
- changelog / release notes

### 2.2 Release cadence

v0.1 recommended:

- **Daily** merges to `main` (with feature flags)
- **On-demand** staging deployments (every merge or batch)
- **Weekly** production release train (or twice weekly if stable)
- **Hotfix** path for Sev0/Sev1 incidents

---

## 3) Environments + promotion

| Environment | Purpose             | Who uses it | Data                |
| ----------- | ------------------- | ----------- | ------------------- |
| `dev`       | local + integration | engineers   | synthetic           |
| `staging`   | pre-prod validation | QA/on-call  | synthetic + limited |
| `prod`      | real tenants        | customers   | real                |

Promotion rule:

- **only promote immutable artifacts** (image digest / package version), never rebuild.

---

## 4) Branching + PR discipline

### 4.1 Branch strategy

- `main` is always releasable.
- short-lived branches:
  - `feat/*`
  - `fix/*`
  - `chore/*`

### 4.2 Required PR checks (merge gates)

- unit tests pass
- component/integration tests pass (P0/P1)
- lint + formatting pass
- type checks pass (if applicable)
- PR title follows Conventional Commits (squash-merge commit message)
- security scan pass (SCA + secret scan)
- migration check pass (if DB changed)
- OTel contract validation pass (for instrumented paths)

### 4.3 Review policy (v0.1)

- 1 reviewer minimum
- 2 reviewers for:
  - DB migrations
  - invariant logic (state transitions, CAS updates)
  - auth/security changes
  - retry semantics changes
  - deployment config changes

---

## 5) CI pipeline (build + test)

**Pipeline name**: `ci`

### 5.1 Steps (high level)

1. Checkout + set up toolchain
2. Install deps (with lockfiles)
3. Static checks: lint/fmt/type
4. Unit tests
5. Component tests (service + real DB)
6. Integration tests (API + DB + tool simulator)
7. Build artifacts (images + SDK)
8. Generate SBOM
9. Sign artifacts (recommended soon)
10. Publish artifacts to registry (internal)

### 5.2 Test parallelization

- unit tests: parallel shards
- integration tests: shard by suite
- keep P0 suite under ~10 minutes when possible

### 5.3 Caching

- deps cache
- Docker layer cache

---

## 6) CD pipeline (deploy + verify)

**Pipelines**:

- `deploy-staging` (automatic on merge to main)
- `deploy-prod` (manual approval / release train)

### 6.1 Staging deploy flow

1. Deploy new image digest to staging
2. Run smoke + contract + OTel validation
3. Gate: if smoke fails → auto rollback

### 6.2 Production deploy flow (recommended)

1. Pre-flight checks + checklist
2. Canary 1–5% for 10–30 minutes, then ramp
3. Watch 5xx, p99, denial distribution, UNKNOWN, circuits
4. Post-deploy golden trace

### 6.3 Rollback policy (MUST)

Rollback is one command/button; does not mutate terminal ledger states.

---

## 7) Database migrations (release-critical)

- forward-only and safe
- prefer additive + backfill
- breaking migrations require two-phase deploy + review

---

## 8) Versioning + tagging (SemVer)

- SemVer for services and SDKs
- tag images with version and git SHA
- publish release notes (changes, migrations, error codes, telemetry)

---

## 9) Feature flags + config

- feature flags for risky behavior
- tenant-scoped when possible
- default OFF in prod until proven

---

## 10) Security controls in CI/CD

- secret scanning
- dependency scanning (SCA)
- image scanning
- least-privilege tokens
- SBOM generation

---

## 11) Observability gates (OTel contract)

Promote only if:

- required BeginAction spans/attrs exist
- key metrics emit
- logs correlate with trace_id

---

## 12) Hotfix process (Sev0/Sev1)

Surgical change → CI → staging → prod canary → merge back → postmortem.

---

## 13) Files in this export

- `Documentation/01-cicd-release-process-spec.md` (this file)
- `Documentation/02-release-checklist.md`
- `Documentation/04-migrations-playbook.md`
- `Documentation/05-hotfix-playbook.md`
- `Documentation/06-secrets-playbook.md`
