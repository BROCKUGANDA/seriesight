# Seriesight launch security review

Review date: 2026-11-25  
Reviewed release: `staging` (post-`b50c384` migration packaging fix)

## Scope

- Authentication, session lifecycle, email verification and password recovery.
- Organization/workspace membership and role enforcement.
- Draft, GRID history and billing tenant boundaries.
- Integration event, endpoint and notification tenant scoping.
- API throttling, same-origin checks and error hygiene.
- Runtime container and dependency posture.

## Automated results

| Check | Result |
|---|---|
| `bun run verify` | 180/180 tests; typecheck, lint and production Prisma schema validation pass |
| `bun audit` | 0 vulnerabilities across 696 resolved packages |
| Docker production build | Passes on Node 24 Alpine |
| Trivy image scan (`CRITICAL,HIGH`) | 0 findings after OS upgrades and npm/corepack removal |
| Resend delivery probe | HTTP 200; `aiazimara.com` domain verified |

The first container scan found 29 critical/high issues in the Node 20 base image and bundled npm tree. The runtime now uses Node 24 Alpine, upgrades OS packages during build, and removes npm/corepack because the standalone server does not need them.

## Manual control review

- Session cookies remain HTTP-only, Secure and `__Host-` prefixed in production; tokens are stored only as SHA-256 digests.
- Password reset tokens are single-use, expire after one hour and revoke all existing sessions on success.
- Workspace switching is authorized against server-side membership; client state is never treated as authority.
- Draft, provider history and billing queries are filtered by workspace id.
- Billing mutations require `owner`; payment history requires `analyst`.
- Integration records carry a workspace id, and webhook fan-out only selects same-workspace endpoints.
- Integration management APIs and the background dispatcher remain disabled by default.
- Public reset requests return a generic response to avoid account enumeration.
- Alert payloads exclude request bodies, cookies, tokens and credentials.

## Launch decision

**Integration APIs remain disabled.** Enable `INTEGRATION_APIS_ENABLED=true` and the background dispatcher only after the operator has reviewed approved outbound destinations and inbound adapter authentication for the target deployment.

## Residual items

- No independent human penetration test has been performed; this review combines automated scans with a code-level control review.
- `ALERT_WEBHOOK_URL` / `ALERT_WEBHOOK_SECRET` are not configured on the VPS. Structured logs are available, but external alert delivery is not active.
- Backup/restore drill passed on 2026-11-25 against the VPS volume: 0 users and 17 draft sessions restored into a disposable database. Re-run `scripts/backup-restore-drill.mjs` after each schema change.
- Commercial production use still requires the appropriate business authorization and GRID data terms.
