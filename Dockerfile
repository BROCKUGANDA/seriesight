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

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S seriesight && adduser -S seriesight -G seriesight

COPY --from=build --chown=seriesight:seriesight /app/.next/standalone ./

USER seriesight
EXPOSE 4180
ENV PORT=4180 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
