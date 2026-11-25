# Seriesight

**The series, in focus.**

Seriesight is an interactive League of Legends pre-match coaching demo — the Category 2 (LoL Macro Scouting & Draft Management System) submission for the **Cloud9 × JetBrains: Sky's the Limit 2026** hackathon.

Explore the workflow from opponent scouting to a versioned draft and multi-game Fearless restrictions. The demo uses independently authored, labelled fixture data and makes no claim to official or live competition results.

> **Data notice.** The public demo uses independently authored fixture records. They are illustrative only—not actual Cloud9 performance, official GRID data, or a live feed. Optional GRID provider access requires deployment configuration and compliance with the applicable data terms; credentials remain server-side.

[![CI](https://github.com/BROCKUGANDA/seriesight/actions/workflows/ci.yml/badge.svg)](https://github.com/BROCKUGANDA/seriesight/actions/workflows/ci.yml)
[![Release](https://github.com/BROCKUGANDA/seriesight/actions/workflows/release.yml/badge.svg)](https://github.com/BROCKUGANDA/seriesight/actions/workflows/release.yml)

---

## Judges: open the demo

Visit **https://seriesight.aiazimara.com/#/signin** and click **Enter fixture demo**. No registration, email, password, payment, or GRID account is required. The server issues an expiring cookie and a separate fixture sandbox for each visitor; it does not grant coach access. Start with the five-minute walkthrough below.

The demo answers opponent tendency and later-game Fearless availability questions using clearly labelled deterministic fixtures. Recommendation scores remain explainable heuristics, **not predicted win rates**. The separate win-probability model requires imported real outcomes, chronological training/calibration/test sets, and stage-specific quality checks; it abstains without sufficient validated data. See [model methodology](docs/WIN_PROBABILITY.md). Official GRID access is optional and server-side; the fixture experience remains reproducible without a key.

**Coach accounts:** use **Have an invitation? Create account** with the operator's invitation code, email, and a password of at least 12 characters. Accounts own separate draft workspaces. Configure `AUTH_INVITE_CODE` privately on the server to enable registration; never publish it in this README. There is no email verification or password-recovery service yet. Judge access remains available without the invitation.

Reproduce locally with Bun 1.x: `bun install --frozen-lockfile`, `bun run db:generate`, `bunx prisma db push`, then `bun run dev`. Open `http://localhost:3000/#/signin`. Run `bun run test`, `bun run typecheck`, `bun run lint`, and `bun run build` separately for cross-platform verification. See [the VPS runbook](docs/VPS_DEPLOY.md) for block-storage deployment and persistent PostgreSQL verification.

Run `node scripts/judge-smoke.mjs https://seriesight.aiazimara.com` for API checks in a newly issued sandbox. Append `--draft` to create one illustrative BO5 draft and verify legal actions, persistence, and stale-write rejection. The script revokes its session afterwards; it never reads or modifies other workspaces.

## What is implemented

| Workspace | Route | Highlights |
|---|---|---|
| Command Center | `#/dashboard` | Fixture-derived metrics with evidence links, priority scouting notes, draft preparation |
| Opponent Intelligence | `#/scouting` | Team directory, tournament/patch/side/game filters, pick/ban frequency with Wilson 95% intervals, engine-detected tendencies, observed-fact vs interpretation briefs, player pools |
| Macro Atlas | `#/macro` | Six objective modules + an explicitly **unavailable** economy module, configurable interval breakdowns, clickable per-game event timeline |
| Draft Room | `#/draft` | BO1/BO3/BO5, tournament 10-ban/10-pick sequence, Hard/Soft/Standard Fearless, role assignment, undo/redo/reset, optimistic-concurrency version stamps, transparent 0-100 recommendation scores |
| Series Lab | `#/series-lab` | Five-game series board, Fearless restriction ledger, pool tracking, counterfactual pick-swap simulator, series strategy map |
| Evidence Ledger | `#/evidence` | Every statistic resolves to a deterministic evidence record (provenance, numerator/denominator, CI, limitations) |
| Data Sources | `#/data-sources` | GRID connection panel with the full status catalogue, circuit breaker, static-data adapter status, six-stage import pipeline, labelled fixture dataset |
| Workspace Settings | `#/settings` | Role policy, haptics preference, reduced-motion status, data-retention and licensing boundaries |

### Engineering substance

- **Deterministic draft domain engine** (`src/domain/draft/`) — validate-then-apply state machine; no illegal action ever partially mutates the board; bans, picks and Fearless restrictions tracked as separate states; event-sourced undo/redo.
- **Analytics engine** (`src/domain/analytics/`) — explicit denominator definitions, Wilson confidence intervals, documented recency half-life, composition scoring that excludes unknown dimensions instead of inventing them, recommendation scores with per-component breakdowns.
- **Evidence system** — every insight/recommendation carries a deterministic `EV-XXXXXXXX` id resolvable through `GET /api/evidence/:id`.
- **GRID provider adapter** (`src/lib/providers/grid/`) — host allowlist, request timeouts, bounded retries with jitter, Retry-After support, circuit breaker, schema-mismatch handling; the UI never talks to GRID.
- **Fixture dataset** (`src/fixtures/`) — seeded deterministic generator with deliberate coverage gaps that drive honest "unavailable" states.
- **API layer** — uniform response envelope, Zod validation on mutations, and `DRAFT_STALE_VERSION` (409) optimistic-concurrency checks.
- **Persistence** — Prisma; SQLite for zero-config demo/dev (`prisma/schema.prisma`) and a PostgreSQL schema path (`prisma/schema.production.prisma`). Database support does not make this demo production-ready.
- **Tests** — Vitest unit/integration/contract coverage for the draft engine, Fearless modes, analytics, dataset integrity, provider security and API contracts.
- **Design system** — original SVG identity, responsive workspace layouts, reduced-motion support, keyboard focus handling, loading and recovery states.
- **HTTP hardening** — CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy` on every response (see `next.config.ts`).

## Quick start

```bash
bun install
bun run db:push        # create the SQLite demo database
bun run dev            # http://localhost:3000
```

No environment variables are required for the demo. Optional server-side variables:

```bash
GRID_API_KEY=...                               # live GRID probes/imports
PROD_DATABASE_URL=postgresql://…               # production PostgreSQL (see below)
```

Quality gates:

```bash
bun run verify         # generated Prisma client + typecheck + lint + tests + schema validation
bun run build          # production standalone build
```

## Production database (PostgreSQL)

Production deployments use `prisma/schema.production.prisma` against PostgreSQL 14+; the demo path stays embedded SQLite. Models are identical and enforced by `tests/unit/schema-parity.test.ts`.

```bash
bun run docker:db                               # postgres:16 on localhost:55432
$env:PROD_DATABASE_URL="postgresql://seriesight:seriesight@localhost:55432/seriesight"
bun run db:migrate:init:pg                      # first time only: create versioned migrations
bun run db:migrate:pg                           # every deploy: prisma migrate deploy
```

`db:push:pg` remains available for local prototyping only; production must use versioned migrations. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full runbook (managed databases, secrets, backups, hardening checklist).

## Readiness and commercial deployment

Seriesight has invite-based coach authentication, salted password hashes, expiring/revocable server sessions, same-origin mutation checks, database-backed sign-in throttling and API rate limiting, real database-aware health checks, versioned PostgreSQL migrations, structured JSON logs, draft workspace ownership checks, and a multi-team foundation with organizations, memberships, roles, invitations and workspace switching. The production Compose stack runs a non-root, capability-dropped app with an app health check, log rotation, a trusted-proxy-aware client key, and the background integration scheduler disabled. Integration events, endpoints and notifications now carry a tenant id; the management APIs stay disabled until their full authorization surface is reviewed. Playbook, player notes, VOD and practice tools remain illustrative, memory-only tools that reset on account changes; only draft workflows are persisted privately.

Phase 2 adds email verification and password recovery through Resend, owner/coach enforcement on billing mutations, tenant-scoped payment history, signed operational alerting, role-aware UI gating for import and invitation actions, and an executable backup-restore drill script. Billing APIs are now available to authorized workspace owners; integration management APIs remain opt-in until webhook egress and inbound adapter authorization are reviewed.

Before public launch, complete an independent security review, configure transactional email and alerting secrets, perform the backup-restore drill on the production volume, and enable integration APIs only after egress review. Production use also requires separate authorization under the Business Source License and compliance with applicable GRID data terms; non-production use and redistribution are governed by the license itself. See [`docs/SECURITY.md`](docs/SECURITY.md) and [`LICENSE`](LICENSE).

## Branches & release automation

| Branch | Purpose | Promoted by |
|---|---|---|
| `dev` | Integration branch — features land here, CI runs on every push | PRs from feature branches |
| `staging` | Release candidate — gates must pass, tagged `vX.Y.Z-rc.N` | `bun run promote:staging` |
| `main` | Production — gated merge, tagged `vX.Y.Z`, GitHub Release created | `bun run promote:main` |

Automation (see [`scripts/release.mjs`](scripts/release.mjs) and [`.github/workflows/`](.github/workflows/)):

- **CI** (`ci.yml`) — typecheck, lint, tests, production build and a live standalone smoke test on every push/PR to `main`, `staging`, `dev`.
- **Auto-promote** — green pushes chain `dev → staging` and `staging → main`, running the same gates and rolling back on failure.
- **Versioning** — semver via `bun run release version <major|minor|patch|prerelease>`; promotions bump RC/final versions, commit `chore(release): vX.Y.Z`, tag and push.
- **Release** (`release.yml`) — on any `v*` tag, gates re-run and a GitHub Release is created with generated notes.

Manual equivalents (identical semantics): `bun run promote:staging`, `bun run promote:main`, `node scripts/release.mjs promote --from dev --to staging --dry-run`.

## API overview

All responses use the uniform envelope `{ success, data, meta: { requestId, generatedAt }, error }`. Full contract: [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md).

```
GET  /api/health                     GET  /api/data-sources      POST /api/data-sources (verify/import)
GET  /api/tournaments                GET  /api/teams             GET  /api/series
POST /api/ingestion/series           GET  /api/champions         GET  /api/dashboard
GET  /api/scouting/opponents/:teamId GET  /api/scouting/opponents/:teamId/trends
GET  /api/macro/teams/:teamId        GET  /api/evidence/:evidenceId
POST /api/draft/recommendations      POST /api/draft/sessions     GET  /api/draft/sessions/:id
POST /api/draft/sessions/:id/actions POST /api/draft/sessions/:id/undo   POST /api/draft/sessions/:id/redo
POST /api/draft/sessions/:id/finalize  POST /api/draft/sessions/:id/next-game
POST /api/draft/sessions/:id/reset   POST /api/draft/sessions/:id/roles
GET  /api/draft/sessions/:id/restrictions
POST /api/series-lab/counterfactual
GET  /api/workspace                     GET  /api/organizations       POST /api/organizations
GET  /api/organizations/:id/members     POST /api/organizations/:id/members
POST /api/organizations/invitations     GET  /api/workspaces         POST /api/workspaces/:id/switch
POST /api/auth/verify-email             POST /api/auth/password-reset/request
POST /api/auth/password-reset/confirm   GET  /api/billing/payments
```

Experimental payment endpoints are omitted from this user-facing API list. They are unauthenticated, unsupported for real payments, and documented in [`docs/SECURITY.md`](docs/SECURITY.md).

## Judge walkthrough (5 minutes)

1. **Command Center** — note the fixture badge; every number is computed from the dataset.
2. **Opponent Intelligence → Nova Vanguard** — open a tendency card, click its evidence chip and read the full provenance record.
3. **Draft Room** — create a BO5 session, play the draft (you control both sides for planning), assign roles, then **Finalize game**.
4. **Series Lab** — inspect the Fearless restriction ledger and use the **Counterfactual simulator** to compare how a pick swap changes later-game availability.
5. **Data Sources** — run the staged fixture import; without `GRID_API_KEY`, the GRID panel shows the honest `GRID_CREDENTIAL_MISSING` state while the workspace keeps working.
6. **Evidence Ledger** — filter and inspect any record behind any number you saw.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — layers, data flow, folder map
- [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md) — envelopes, endpoints, error codes
- [`docs/DATA_DICTIONARY.md`](docs/DATA_DICTIONARY.md) — metric definitions, denominators, provenance rules
- [`docs/GRID_INTEGRATION.md`](docs/GRID_INTEGRATION.md) — adapter, security, licensing boundaries
- [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) — what is tested and how to run it
- [`docs/SECURITY.md`](docs/SECURITY.md) — secrets, allowlist, retention policy
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — production runbook, database provisioning
- [`docs/AI_WORKFLOW_STORY.md`](docs/AI_WORKFLOW_STORY.md) — tooling and AI-assisted workflow evidence
- [`NOTICE.md`](NOTICE.md) — third-party components and their licenses

## Scope and boundaries

Seriesight is a **pre-match** tool. It does not replace the game client, execute game actions, inject information into live games, lock picks, or claim data its sources do not provide. Recommendation scores are draft-suitability heuristics, never win probabilities. Any configured GRID access is subject to applicable GRID data terms; no licensed raw data is committed to this repository.

## License

**Business Source License 1.1** — see [LICENSE](LICENSE).

In short: you may read, use, modify and redistribute Seriesight as allowed by the BSL 1.1 terms. **Production use requires separate authorization** before the change date; the license does not prohibit all commercial non-production activity. On **2030-11-18**, the code converts to **GNU GPL version 2.0 or later**. BSL 1.1 is source-available, not an OSI-approved open-source license; see [NOTICE.md](NOTICE.md) for third-party components and their separate licenses.
