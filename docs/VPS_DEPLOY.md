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

```bash
git clone --branch staging https://github.com/BROCKUGANDA/seriesight.git ~/seriesight
cd ~/seriesight

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
cd ~/seriesight && git fetch && git checkout staging && git pull
docker compose -f deploy/vps/compose.yaml up -d --build
docker compose -f deploy/vps/compose.yaml --profile migrate run --rm migrate   # when the schema changed
```

## Production notes

- The app builds with `prisma/schema.production.prisma` (PostgreSQL) — the
  dev/demo SQLite client never ships to the VPS.
- `PROD_DATABASE_URL` and `GRID_API_KEY` live only in the VPS `.env` — never in Git.
- GRID runs in read-only Open Access mode; probe: `GET /api/data-sources` shows the live connection.
- Fixture data is fully functional without `GRID_API_KEY`.
- Deploy branch is `staging` (release candidate) until `main` carries v0.3.0.
