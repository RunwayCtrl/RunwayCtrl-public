# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| v0.1.x  | Yes       |

---

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in RunwayCtrl, please report it responsibly:

1. **Email:** Send details to **security@runwayctrl.com** (or open a [GitHub Security Advisory](https://github.com/RunwayCtrl/RunwayCtrl/security/advisories/new) on this repository)
2. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Suggested fix (if you have one)
3. **Response timeline:**
   - Acknowledgment within **48 hours**
   - Initial assessment within **5 business days**
   - Fix timeline communicated within **10 business days**

---

## Security Design Principles

RunwayCtrl is built with security as a foundational concern:

### Data Minimization

- The ledger stores **hashes and pointers** by default — not raw tool request/response payloads
- Payload capture requires explicit tenant opt-in
- See [ADR-0009](Documentation/ADR-0009-payload-capture-stance.md)

### Tenant Isolation

- Every database table is scoped by `tenant_id`
- All uniqueness constraints are tenant-scoped
- API keys are tenant-bound; cross-tenant access is architecturally impossible
- Row Level Security (RLS) recommended as defense-in-depth
- See [ADR-0007](Documentation/ADR-0007-multi-tenant-isolation.md)

### Credential Handling

- API keys are stored as **hashed values** (never plaintext)
- API keys are returned in plaintext exactly once (at creation) and never again
- The control plane **never executes tool calls** — eliminating SSRF and credential-forwarding risks
- Integration credentials (Jira, ServiceNow, GitHub) live in the agent runtime, not the control plane

### Telemetry Safety

- Telemetry attributes are **allowlisted**, not filtered
- Only explicitly approved attributes are emitted to the OTel pipeline
- This prevents accidental PII/secret leaks in traces, metrics, and logs
- See [OTel Contract](Documentation/02-otel-contract.md)

### Abuse Prevention

- Per-tenant and per-IP rate limiting
- Request size and time limits
- Circuit breakers prevent cascading failures
- Kill-switch surface: disable tenant or tool immediately

---

## Dependency Management

- Dependencies are monitored via Dependabot/Renovate
- Critical security updates are applied within 48 hours
- CodeQL (SAST) runs on every PR

---

## Security Controls Checklist (v0.1)

For the detailed security requirements checklist, see [Security Guidelines](Documentation/Security%20Guidelines.md).

Key controls that must exist (not just be documented):

- [ ] Per-tenant auth with hashed key storage and immediate revocation
- [ ] Per-tenant and per-IP rate limiting
- [ ] Append-only audit log for sensitive operations
- [ ] Enforced retention/deletion jobs
- [ ] Request size and time limits
- [ ] Kill-switch surface (disable tenant/tool)
- [ ] No secrets in logs or telemetry
