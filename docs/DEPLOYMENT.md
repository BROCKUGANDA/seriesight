# Deployment

Seriesight ships as a Next.js standalone build with a PostgreSQL production
database. The public demo needs **no** environment variables (it runs on the
embedded SQLite fixture database); production provisions PostgreSQL via
`prisma/schema.production.prisma`.

---

## 1. Databases

| Database | Schema | Purpose |
|---|---|---|
| SQLite | `prisma/schema.prisma` (`prisma/db/seriesight.db`) | Zero-config demo/dev — path is embedded, no `.env` needed |
| PostgreSQL | `prisma/schema.production.prisma` (`PROD_DATABASE_URL`) | Production deployments |

The two schemas define identical models; `tests/unit/schema-parity.test.ts`
fails the build if they drift.

### Local production-parity database

```bash
bun run docker:db                                      # postgres:16 on :55432
$env:PROD_DATABASE_URL = "postgresql://seriesight:seriesight@localhost:55432/seriesight"
bun run db:migrate:init:pg                             # first time only: create versioned migrations
bun run db:migrate:pg                                  # subsequent changes: prisma migrate deploy
```

`db:push:pg` is reserved for throwaway local experiments. Shared databases must use `prisma migrate deploy` so schema history is reviewable and repeatable. The checked-in baseline is `prisma/migrations/20261125000000_init`; production databases created with `db push` must be baselined with `prisma migrate resolve --applied 20261125000000_init` before the first deploy. The follow-up `20261125010000_tenant_foundation` migration is idempotent: it creates the organization tables when missing and backfills one personal organization/workspace per existing coach.

The production runtime client is generated from `prisma/schema.production.prisma`
at **build time** via `bun run build:prod` — never during dev, so the SQLite dev
client and the PostgreSQL production client never overwrite each other on the same
machine. Deployments set `PROD_DATABASE_URL` in the secret store and run `bun run build:prod`.

Verify:

```bash
docker exec seriesight-db psql -U seriesight -d seriesight -c "\dt"
```

### Managed production database

1. Create a PostgreSQL 14+ database (Neon, Supabase, RDS, Cloud SQL, self-hosted).
2. Set `PROD_DATABASE_URL` to its connection string in the deployment secret store.
   Never commit it, never log it.
3. Apply the schema:

   ```bash
   bun run db:migrate:init:pg   # first time only: creates prisma/migrations
   bun run db:migrate:pg        # subsequent deploys: prisma migrate deploy
   ```

   Prefer `db:migrate:pg` (deploy of versioned migrations) over `db:push:pg`
   (live diff) for anything shared with real data.

### Data-protection rules that stay in force in production

- Only mutable workflow state is persisted (draft sessions, audit trail,
  ingestion jobs, integration outbox, billing ledger). Analytics are recomputed
  deterministically from provider/fixture data; no GRID raw payloads are stored.
- Provider credentials never touch ordinary metadata tables — `GRID_API_KEY`
  lives only in the server environment.

---

## 2. Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GRID_API_KEY` | demo: no, production: no | Server-side GRID access; without it the fixture workspace runs |
| `PROD_DATABASE_URL` | yes for Postgres deployments | PostgreSQL connection string |
| `SERIESIGHT_DISPATCH_INTERVAL_MS` | no | Set `0` while integration stores are not workspace-isolated |
| `APP_ORIGIN` | yes in production | Exact origin accepted for same-origin mutations |
| `TRUST_AUTH_PROXY` | yes behind Cloudflare/Caddy | Trust `CF-Connecting-IP`/`X-Forwarded-For` for throttling keys only |
| `API_RATE_LIMIT_PER_MIN` | no | Authenticated API requests per client (default 600) |
| `AUTH_RATE_LIMIT_PER_MIN` | no | Auth requests per client (default 60) |
| `LEADS_RATE_LIMIT_PER_MIN` | no | Public lead submissions per client (default 20) |
| `CLOUDFLARE_ACCOUNT_ID` | yes for recovery | Cloudflare account for transactional email |
| `CLOUDFLARE_EMAIL_API_TOKEN` | yes for recovery | API token with Email Sending permission |
| `EMAIL_FROM_ADDRESS` | yes for recovery | Verified sender domain address |
| `EMAIL_REPLY_TO` | no | Reply-to address for recovery emails |
| `REQUIRE_EMAIL_VERIFICATION` | recommended | Block workspace access until coach email is verified |
| `ALERT_WEBHOOK_URL` | no | HTTPS alert endpoint (allowlisted hosts only) |
| `ALERT_WEBHOOK_SECRET` | no | HMAC secret for alert payload signatures |
| `INTEGRATION_APIS_ENABLED` | no | Opt-in flag for integration management routes |

Copy `.env.example` → `.env` for machine-local overrides. `.env` is
git-ignored and must never be committed.

---

## 3. Build and run

```bash
bun install
bun run verify          # typecheck + lint + tests
bun run build           # next build → .next/standalone (+ static/public copied in)
NODE_ENV=production bun .next/standalone/server.js
```

- Health/readiness probe: `GET /api/health` returns `200` only when the database
  and fixture checks pass; otherwise it returns `503 SERVICE_UNAVAILABLE`.
- Logs are newline-delimited JSON on stdout. Attach your log shipper to the
  container stream; no request body, cookie, token or secret is logged.
- The server binds `PORT` (default 3000).
- Docker-compatible: any container image with Node/Bun and the build output
  works; mount nothing except optional secrets.

## 4. HTTP hardening (already configured)

`next.config.ts` applies to every response: HSTS, `X-Content-Type-Options:
nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy:
strict-origin-when-cross-origin`, a strict CSP (`default-src 'self'`,
`object-src 'none'`, `frame-ancestors 'self'`) and a minimal
`Permissions-Policy`. Dev adds `unsafe-eval` for React refresh; production does
not.

## 5. Post-deploy verification checklist

- [ ] `GET /api/health` returns `200` with `checks.database.status=pass` and a request id.
- [ ] `GET /api/health` returns `503` when the database is unavailable (tested in staging).
- [ ] `bun audit` reports zero vulnerabilities in CI.
- [ ] `prisma migrate status` reports all migrations applied.
- [ ] Draft Room: create a BO5 session, make legal picks, finalize, confirm
      the persisted session survives a server restart.
- [ ] Concurrent write check: replaying an action with a stale
      `stateVersion` returns `409 DRAFT_STALE_VERSION`.
- [ ] Data Sources: without `GRID_API_KEY`, the GRID panel shows the honest
      `GRID_CREDENTIAL_MISSING` state and the workspace keeps working.
- [ ] Security headers present on `/` and `/api/*`.
- [ ] Fixture badge visible; no unlabelled synthetic data anywhere.

## 6. Backup and restore

Back up PostgreSQL before every schema change and on a daily schedule. The
VPS deployment stores data in the `seriesight_seriesight-pgdata` volume on
block storage; never recreate that volume during redeployment.

```bash
docker compose -f deploy/vps/compose.yaml exec -T db \
  pg_dump -U seriesight -d seriesight -Fc > seriesight-backup.dump

# Restore drill — creates and drops only a disposable database.
node scripts/backup-restore-drill.mjs
```

The drill dumps the live database to a temporary file, restores it into
`seriesight_restore_drill`, verifies user and draft counts, then drops the
disposable database. The live database is never modified. A backup is not verified until it has been restored into a disposable database
and the restored instance passes `bun run db:migrate:pg` plus `GET /api/health`.
Record the drill date and result in the deployment log.
