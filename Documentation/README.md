# RunwayCtrl — Public Docs Surface

This `Documentation/` directory is **internal-first**.

However, a small subset of files under `Documentation/` are intentionally safe to publish for design partners and contributors. Our "public snapshot" automation exports only the allowlisted files below.

## Public/partner-safe files (exported)

- `Documentation/openapi.yaml` — Control Plane API schema (source of truth)
- `Documentation/API Contract.md` — Semantics that don’t fit cleanly in OpenAPI
- `Documentation/Error Codes and Retry.md` — Stable error codes + retry/unknown-outcome protocol
- `Documentation/RUNWAYCTRL_PROJECT_OVERVIEW.md` — High-level product + architecture overview
- `Documentation/examples.http` — Copy/paste HTTP requests (VS Code REST Client)

## Everything else in `Documentation/`

Treat all other files here as **internal** by default (runbooks, ADRs, incident playbooks, infra notes, research, etc.). Those files must not be published to the public repository.

## How public snapshots are produced

The internal repo contains a milestone-based workflow:

- `.github/workflows/public-sync.yml`

It builds a sanitized snapshot using an allowlist defined in:

- `public-sync.config.json`

Then it opens a PR against the public repo (`RunwayCtrl/RunwayCtrl`).
