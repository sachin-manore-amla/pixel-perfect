# Security Review Checklist

All code changes (including AI-assisted code) must pass this checklist before production deployment.

## 1) Authentication & Session Controls
- [ ] Every `/api/*` route requires authentication.
- [ ] No endpoint accepts privileged operations without identity verification.
- [ ] Session/token validation is enforced before route handler execution.
- [ ] No hardcoded secrets/tokens are present in code.

## 2) Authorization
- [ ] Access checks are implemented at resource level (project/issue/user scope).
- [ ] Query endpoints validate caller scope server-side.
- [ ] Admin-only actions are explicitly gated.

## 3) Input Validation
- [ ] All request body/query/path inputs are validated and bounded.
- [ ] Dangerous user-controlled inputs are sanitized or rejected.
- [ ] Error messages do not expose parser internals or stack traces.

## 4) CORS & Browser Security
- [ ] CORS uses explicit trusted origin allowlist (no wildcard in production).
- [ ] Only required request headers are allowed.
- [ ] Response headers include:
  - [ ] `Content-Security-Policy`
  - [ ] `Strict-Transport-Security`
  - [ ] `X-Content-Type-Options`
  - [ ] `Permissions-Policy`
- [ ] `X-Powered-By` is disabled.

## 5) Rate Limiting & Abuse Protection
- [ ] `/api/*` endpoints have per-IP and per-user limits.
- [ ] Data-heavy routes (`/api/jira/search`, `/api/jira/projects`) have stricter limits.
- [ ] `429` responses include `Retry-After` and rate-limit headers.

## 6) Secrets & Configuration
- [ ] Secrets are loaded from environment/secret manager only.
- [ ] Secret rotation procedure exists and is documented.
- [ ] No credentials are persisted in plaintext files.

## 7) Logging, Monitoring & Alerting
- [ ] Security-relevant events (auth failures, rate-limit blocks, denied origin) are logged.
- [ ] Alerts are configured for repeated abuse patterns.
- [ ] Logs exclude sensitive tokens/credentials.

## 8) CI/CD Security Gates
- [ ] SAST runs on every pull request.
- [ ] Dependency audit runs on every pull request.
- [ ] Builds fail on high-severity findings unless explicitly approved.

## 9) Sign-off
- [ ] Developer self-review completed.
- [ ] Security reviewer approval completed.
- [ ] Change ticket links attached.

Reviewer: ____________________  Date: ____________________
