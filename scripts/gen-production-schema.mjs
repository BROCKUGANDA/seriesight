// One-off generator: prisma/schema.prisma -> prisma/schema.production.prisma
// Keeps model definitions identical; only the datasource block differs.
import fs from "node:fs";

let s = fs.readFileSync("prisma/schema.prisma", "utf8");

const header = `// Seriesight persistence — PRODUCTION (PostgreSQL via Prisma).
// Same models as prisma/schema.prisma (SQLite dev/demo). A unit test
// (tests/unit/schema-parity.test.ts) fails the build if the two schemas drift.
//
// Provision: docker compose up -d db        (local production-parity Postgres)
//            PROD_DATABASE_URL=postgresql://... bun run db:push:pg
// Migrations: for managed production databases prefer \`bun run db:migrate:pg\`
// after generating an initial migration with \`bun run db:migrate:init:pg\`.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("PROD_DATABASE_URL")
}
`;

const rest = s.split("\n").slice(4).join("\n").replace(/^datasource db \{[\s\S]*?\n\}\n/, "");
fs.writeFileSync("prisma/schema.production.prisma", header + "\n" + rest.trim() + "\n");
console.log("written, lines:", (header + rest).split("\n").length);
