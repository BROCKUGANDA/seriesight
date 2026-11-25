# syntax=docker/dockerfile:1
# Seriesight production image.
#
# Build stages: bun (deps + build) → node:20-alpine (standalone runtime).
# The runtime expects PROD_DATABASE_URL pointing at a PostgreSQL database
# (see prisma/schema.production.prisma); migrations are applied by the
# `migrate` compose service (deploy/vps/compose.yaml), never by this image.

FROM oven/bun:1 AS build
WORKDIR /app

# Dependency layer — cached unless manifests change
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Source + Prisma client generated for PostgreSQL (runtime is Postgres)
COPY . .
RUN bunx prisma generate --schema prisma/schema.production.prisma \
 && bun run build
# `bun run build` assembles .next/standalone via scripts/postbuild.mjs

FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Patch base-image packages and remove the bundled npm tree. The standalone
# server only needs Node; npm's transitive CLI packages are not runtime code.
RUN apk upgrade --no-cache && apk del --no-cache npm \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

RUN addgroup -S seriesight && adduser -S seriesight -G seriesight

COPY --from=build --chown=seriesight:seriesight /app/.next/standalone ./
COPY --from=build --chown=seriesight:seriesight /app/node_modules/.prisma/client ./node_modules/.prisma/client

USER seriesight
EXPOSE 4180
ENV PORT=4180 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
