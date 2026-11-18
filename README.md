# Seriesight

**The series, in focus.**

Seriesight is a League of Legends esports coaching intelligence and Fearless Draft management platform — the Category 2 (LoL Macro Scouting & Draft Management System) submission for the **Cloud9 × JetBrains: Sky's the Limit 2026** hackathon.

It turns tournament history into a unified coaching workspace: opponent scouting with evidence-backed tendencies, macro objective analytics, a deterministic multi-game draft engine with Hard/Soft Fearless support, and a five-game Series Lab where a pick in one game visibly reshapes the strategic possibilities of the next.

> **Data notice.** This public demo runs entirely on an independently authored fixture dataset. It is illustrative only — **not actual Cloud9 performance and not an official GRID dataset.** Every screen in the product carries this marker. GRID integration is implemented behind a server-side provider adapter and activates when `GRID_API_KEY` is configured; the demo never requires it.

---

## What is implemented

| Workspace | Route | Highlights |
|---|---|---|
| Command Center | `#/dashboard` | Verified dataset metrics, top-3 priority intelligence with evidence links, one-click draft preparation, signal activity |
| Opponent Intelligence | `#/scouting` | Team directory, tournament/patch/side/game filters, pick/ban frequency with Wilson 95% intervals, engine-detected tendencies, observed-fact vs interpretation briefs, player pools |
| Macro Atlas | `#/macro` | Six objective modules + an explicitly **unavailable** economy module, configurable interval breakdowns, clickable per-game event timeline |
| Draft Room | `#/draft` | BO1/BO3/BO5, tournament 10-ban/10-pick sequence, Hard/Soft/Standard Fearless, role assignment, undo/redo/reset, optimistic-concurrency version stamps, transparent 0–100 recommendation scores |
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
- **Persistence** — Prisma/SQLite for draft sessions + audit trail + ingestion jobs + provider connections.
- **Tests** — 82 Vitest unit/integration/contract tests covering the draft engine, Fearless modes, analytics, dataset integrity, provider security and API contracts.
- **Design system** — exact PRD color tokens, original SVG identity (aperture logo, 25 first-party glyphs), four purposeful loaders, skeletons, reduced-motion support, responsive 390 px → 1600 px.

## Quick start

```bash
bun install
bun run db:push        # create SQLite schema
bun run dev            # http://localhost:3000
bun run test           # 82 unit/contract tests
bun run lint           # ESLint (clean)
bun run typecheck      # TypeScript strict (clean)
```

No environment variables are required for the demo. Optional:

```bash
# server-side only — enables real GRID probes/imports
GRID_API_KEY=...
```

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
5. **Data Sources** — run the staged fixture import; trigger the GRID import to see the honest `GRID_CREDENTIAL_MISSING` failure while the workspace keeps working.
6. **Evidence Ledger** — filter and inspect any record behind any number you saw.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — layers, data flow, folder map
- [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md) — envelopes, endpoints, error codes
- [`docs/DATA_DICTIONARY.md`](docs/DATA_DICTIONARY.md) — metric definitions, denominators, provenance rules
- [`docs/GRID_INTEGRATION.md`](docs/GRID_INTEGRATION.md) — adapter, security, licensing boundaries
- [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) — what is tested and how to run it
- [`docs/SECURITY.md`](docs/SECURITY.md) — secrets, allowlist, retention policy
- [`docs/AI_WORKFLOW_STORY.md`](docs/AI_WORKFLOW_STORY.md) — tooling and AI-assisted workflow evidence

## Scope and boundaries

Seriesight is a **pre-match** tool. It does not replace the game client, execute game actions, inject information into live games, lock picks, or claim data its sources do not provide. Recommendation scores are draft-suitability heuristics, never win probabilities. GRID Open Access is used (when configured) strictly within its non-commercial terms; no licensed raw data is committed to this repository.

## License

MIT — see [LICENSE](LICENSE).
