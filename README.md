# Seriesight

**The series, in focus.**

Seriesight is a League of Legends esports coaching intelligence and Fearless Draft management platform — the Category 2 (LoL Macro Scouting & Draft Management System) submission for the **Cloud9 × JetBrains: Sky's the Limit 2026** hackathon.

It turns tournament history into a unified coaching workspace: opponent scouting with evidence-backed tendencies, macro objective analytics, a deterministic multi-game draft engine with Hard/Soft Fearless support, and a five-game Series Lab where a pick in one game visibly reshapes the strategic possibilities of the next.

> **Data notice.** The public demo runs entirely on an independently authored fixture dataset. It is illustrative only — **not actual Cloud9 performance and not an official GRID dataset.** Every screen in the product carries this marker. A GRID Open Access key is wired server-side on deployments that enable live provider probes; raw GRID data is never persisted to the repository or shared publicly.

[![CI](https://github.com/BROCKUGANDA/seriesight/actions/workflows/ci.yml/badge.svg)](https://github.com/BROCKUGANDA/seriesight/actions/workflows/ci.yml)
[![Release](https://github.com/BROCKUGANDA/seriesight/actions/workflows/release.yml/badge.svg)](https://github.com/BROCKUGANDA/seriesight/actions/workflows/release.yml)

---

## What is implemented

| Workspace | Route | Highlights |
|---|---|---|
| Command Center | `#/dashboard` | Verified dataset metrics, top-3 priority intelligence with evidence links, one-click draft preparation, signal activity |
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
- **Fixture dataset** (`src/fixtures/`) — seeded deterministic generator (17 series / 47 games incl. full BO5s under Fearless), with deliberate coverage gaps that drive honest "unavailable" states.
- **API layer** — 19 endpoints, uniform envelope, Zod validation on every mutation, `DRAFT_STALE_VERSION` (409) optimistic-concurrency checks.
- **Persistence** — Prisma; SQLite for zero-config demo/dev (`prisma/schema.prisma`), **PostgreSQL for production** (`prisma/schema.production.prisma`), with a parity test that fails CI if the schemas drift.
- **Tests** — 109 Vitest unit/integration/contract tests covering the draft engine, Fearless modes, analytics, dataset integrity, provider security and API contracts.
- **Design system** — exact PRD color tokens, original SVG identity (aperture logo, 25 first-party glyphs), four purposeful loaders, skeletons, reduced-motion support, responsive 390 px → 1600 px.
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
bun run verify         # typecheck (strict) + lint + 109 tests
bun run build          # production standalone build
```

## Production database (PostgreSQL)

Production deployments use `prisma/schema.production.prisma` against PostgreSQL 14+; the demo path stays embedded SQLite. Models are identical and enforced by `tests/unit/schema-parity.test.ts`.

```bash
bun run docker:db                               # postgres:16 on localhost:55432
$env:PROD_DATABASE_URL="postgresql://seriesight:seriesight@localhost:55432/seriesight"
bun run db:push:pg                              # first time / schema changes
bun run db:migrate:init:pg                      # or create versioned migrations
bun run db:migrate:pg                           # subsequent deploys: prisma migrate deploy
```

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full runbook (managed databases, secrets, hardening checklist).

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
```

## Judge walkthrough (5 minutes)

1. **Command Center** — note the fixture badge; every number is computed from the dataset.
2. **Opponent Intelligence → Nova Vanguard** — open a tendency card, click its evidence chip and read the full provenance record.
3. **Draft Room** — create *BO5 · Hard Fearless vs Nova Vanguard*, play the draft (you control both sides for planning), assign roles, **Finalize game**.
4. **Series Lab** — see the restriction ledger (pool 80 → 70), then use the **Counterfactual simulator** to swap a Game 1 pick and diff the Fearless fallout.
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

Seriesight is a **pre-match** tool. It does not replace the game client, execute game actions, inject information into live games, lock picks, or claim data its sources do not provide. Recommendation scores are draft-suitability heuristics, never win probabilities. GRID Open Access is used (when configured) strictly within its non-commercial terms; no licensed raw data is committed to this repository.

## License

**Business Source License 1.1** — see [LICENSE](LICENSE).

In short: you may read, use, modify and redistribute Seriesight for **non-production** purposes (including study, evaluation and hackathon judging). **Production and commercial use require a separate written license** from the Licensor (contact `hello@seriesight.ae`). On **2030-11-18**, the code converts automatically to **Apache License 2.0**. This is a source-available license, not an open-source license today, and it keeps Seriesight-related IP and commercialization rights with its author — see [NOTICE.md](NOTICE.md) for third-party components.
