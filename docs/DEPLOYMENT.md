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
bun run db:push:pg                                     # create/update tables — never touches the runtime client
```

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
| `SERIESIGHT_DISPATCH_INTERVAL_MS` | no | Set `0` when an external cron owns integration dispatch |

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

- Health probe: `GET /api/health`.
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

- [ ] `GET /api/health` returns success with a request id.
- [ ] Draft Room: create a BO5 session, make legal picks, finalize, confirm
      the persisted session survives a server restart.
- [ ] Concurrent write check: replaying an action with a stale
      `stateVersion` returns `409 DRAFT_STALE_VERSION`.
- [ ] Data Sources: without `GRID_API_KEY`, the GRID panel shows the honest
      `GRID_CREDENTIAL_MISSING` state and the workspace keeps working.
- [ ] Security headers present on `/` and `/api/*`.
- [ ] Fixture badge visible; no unlabelled synthetic data anywhere.
