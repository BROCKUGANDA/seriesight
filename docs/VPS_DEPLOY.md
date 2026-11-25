# Seriesight — VPS deployment (OVH, aiazimara.com shared front door)

Live at **`https://seriesight.aiazimara.com`** — Cloudflare (proxied, Full
Strict) → shared nginx front door (`edge-router-router-1`, L4 SNI routing) →
`seriesight-edge-caddy-1` (loopback :8089/:8453) → `seriesight-app` →
`seriesight-db` (internal-only PostgreSQL).

One compose project (`name: seriesight`), three services:

| Service | Port | Purpose |
|---|---|---|
| `seriesight-app` | internal :4180 (no host publish) | Next.js standalone server |
| `seriesight-db` | internal :5432 (no host publish) | PostgreSQL 16 (Prisma, production schema) |
| `seriesight-edge-caddy-1` | `127.0.0.1:8089→80`, `127.0.0.1:8453→443` | Origin TLS (Cloudflare Origin CA wildcard) |

The shared front door only forwards SNI names present in
`/home/ubuntu/edge/nginx/edge.d/*.sni.map` — the tables live in this repo at
`deploy/edge/nginx/edge.d/seriesight.{host,sni}.map` and are copied to the box
after each change.

## First deploy

### Block-storage placement

The application source/release directory is `/mnt/data/apps/seriesight` on `/dev/sdb`, mounted at `/mnt/data`. Docker's `/var/lib/docker` is also mounted on `/dev/sdb`, so images and the existing `seriesight_seriesight-pgdata` named volume remain on block storage. Do not remove/recreate the database volume during redeployment. The original `/home/ubuntu/seriesight` checkout is retained as a fallback, not the active deployment directory.

Confirm placement with `df -h /mnt/data/apps/seriesight /var/lib/docker` and `docker volume inspect seriesight_seriesight-pgdata`. Runtime secrets stay in the deployment directory's private `.env`; never include that file in source archives. Use `--env-file /mnt/data/apps/seriesight/.env` explicitly with Compose because the Compose file is nested.

For subsequent deployments, copy the reviewed source (excluding `.env`, `.git`, `node_modules`, and `.next`) into `/mnt/data/apps/seriesight`, then run:

```bash
cd /mnt/data/apps/seriesight
docker compose --env-file .env -f deploy/vps/compose.yaml build app
docker compose --env-file .env -f deploy/vps/compose.yaml run --rm migrate
docker compose --env-file .env -f deploy/vps/compose.yaml up -d --no-deps app
curl --fail https://seriesight.aiazimara.com/api/health | grep '"status":"healthy"'
node scripts/judge-smoke.mjs https://seriesight.aiazimara.com --draft
```

The Dockerfile explicitly includes the generated Prisma client and Alpine query engine. `GET /api/health` now queries the database and returns `503` when it is unreachable, but still check Data Sources and a persisted draft session. Back up PostgreSQL before schema changes; apply schema changes with `prisma migrate deploy`, never a destructive reset. If the existing volume was created with `db push`, baseline it once with `bunx prisma migrate resolve --applied 20261125000000_init --schema prisma/schema.production.prisma` before the first migration deploy; the subsequent `20261125010000_tenant_foundation` migration then creates the tenant tables and backfills existing coaches.

### Authentication upgrade

Back up PostgreSQL before adding the additive `AuthUserRecord`, `AuthSessionRecord`, and `AuthThrottleRecord` tables. Build the new image, run the migration profile against the existing volume, then recreate the app. No existing draft is assigned to a new account: old shared `ws-demo` drafts intentionally remain inaccessible through private accounts.

Run `node scripts/ensure-auth-env.mjs` in the private deployment directory (or with the Node container) to create a random `AUTH_INVITE_CODE` without printing it. The script preserves existing invitations and locks `.env` to mode 600. Retrieve that code via your secure server administration channel, then use **Have an invitation? Create account** at `/#/signin`. Do not put the invitation in judge instructions or commit it. The compose configuration sets the exact external `APP_ORIGIN` for same-origin mutation checks.

Transactional email requires `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_API_TOKEN`, `EMAIL_FROM_ADDRESS` and optionally `EMAIL_REPLY_TO` in the private `.env`; onboard the sending domain first (`npx wrangler email sending enable aiazimara.com`). `REQUIRE_EMAIL_VERIFICATION=true` blocks workspace access until a coach confirms their email. Configure `ALERT_WEBHOOK_URL` and `ALERT_WEBHOOK_SECRET` for critical alerts; `INTEGRATION_APIS_ENABLED` stays false until webhook egress is reviewed.

Run `node scripts/backup-restore-drill.mjs` on the VPS after every schema change and at least monthly. It restores into a disposable database and never modifies the live one.

`GRID_API_KEY` still requires an authorized GRID account with completed LoL series access and schema introspection. Set it privately in `.env`, recreate the app, sign in as a coach, and import official completed series IDs in Data Sources. Train the model there after importing enough real history; fixture data cannot activate probabilities. See `GRID_INTEGRATION.md` and `WIN_PROBABILITY.md` for access and validation boundaries.

### Original bootstrap reference

```bash
mkdir -p /mnt/data/apps
git clone --branch staging https://github.com/BROCKUGANDA/seriesight.git /mnt/data/apps/seriesight
cd /mnt/data/apps/seriesight

# .env — POSTGRES_PASSWORD strong+unique (openssl rand -hex 24), GRID_API_KEY optional
printf 'POSTGRES_PASSWORD=%s\nGRID_API_KEY=%s\n' "$(openssl rand -hex 24)" "$GRID_API_KEY" > .env

# Seed the Origin CA wildcard cert into the edge volume (same cert the website uses)
docker volume create seriesight_seriesight-edge-certs
docker run --rm -v seriesight_seriesight-edge-certs:/dst -v ai-azimara-edge_caddy-data:/src alpine \
  cp /src/certs/aiazimara.com.pem /src/certs/aiazimara.com.key /dst/

# Start db → apply schema → start app + edge
docker compose -f deploy/vps/compose.yaml up -d db
docker compose -f deploy/vps/compose.yaml --profile migrate run --rm migrate
docker compose -f deploy/vps/compose.yaml up -d --build

# Register the name with the shared front door, then reload it
cp deploy/edge/nginx/edge.d/seriesight.*.map /home/ubuntu/edge/nginx/edge.d/
docker exec edge-router-router-1 nginx -t && docker exec edge-router-router-1 nginx -s reload
```

Verify (three levels):

```bash
curl -s http://127.0.0.1:8089/api/health                                   # local plain HTTP
curl -sk --resolve seriesight.aiazimara.com:8453:127.0.0.1 https://seriesight.aiazimara.com/api/health  # origin TLS
curl -sI https://seriesight.aiazimara.com/                                  # via Cloudflare
```

## Redeploy

```bash
cd /mnt/data/apps/seriesight
# Update the reviewed source here, preserving the private .env and database volume.
docker compose --env-file .env -f deploy/vps/compose.yaml up -d --build
docker compose --env-file .env -f deploy/vps/compose.yaml run --rm migrate   # review first; only when the schema changed
```

## Production notes

- The app builds with `prisma/schema.production.prisma` (PostgreSQL) — the
  dev/demo SQLite client never ships to the VPS.
- Schema changes deploy through versioned migrations in `prisma/migrations`;
  `db push` is never used on the live database.
- The app container runs as a non-root user with all Linux capabilities dropped,
  an `/api/health` health check, and rotated JSON logs. The integration
  scheduler is disabled until tenant isolation is implemented.
- `PROD_DATABASE_URL` and `GRID_API_KEY` live only in the VPS `.env` — never in Git.
- GRID runs in read-only Open Access mode; probe: `GET /api/data-sources` shows the live connection.
- Fixture data is fully functional without `GRID_API_KEY`.
- Deploy branch is `staging` (release candidate) until `main` carries v0.3.0.
