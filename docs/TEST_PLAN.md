# Seriesight Test Plan

## Commands

```bash
bun run test        # Vitest unit + integration + contract suite (176 tests)
bun run lint        # ESLint (0 problems)
bun run typecheck   # TypeScript strict, whole repo (0 errors)
bun audit           # dependency advisories (0 vulnerabilities)
bun run db:push     # recreate SQLite schema
```

## Coverage map (PRD O1–O3)

### Unit — draft engine (`tests/unit/draft-engine.test.ts`)
- Ruleset structure: 20 ordered slots, 10 bans / 10 picks, first-rotation sides; custom sequences honoured verbatim; format → games/wins mapping.
- State machine: starts in `BAN_PHASE_1`; pick during ban phase rejected **without board mutation**; wrong order rejected; duplicate pick rejected; banned champion cannot be picked; sequence exhaustion rejects further actions and completion.
- Hard Fearless: picks of either team lock for both teams; propagation via `picksByTeam`.
- Soft Fearless: own picks locked, opponent picks open (per-side view); shared scope locks both; side-aware availability verified for both BLUE and RED perspectives.
- Undo/redo: rollback, exact re-application, illegal undo on empty board, redo without stack rejected, deterministic multi-cycle undo/redo, undone pick returns to the pool.
- Finalization: incomplete sequence rejected; missing roles rejected with slot list; completion state immutable; `assignRole` validates champion capability and consumes no draft turn.

### Unit — analytics & dataset (`tests/unit/analytics.test.ts`)
- Wilson interval: known 7/10 reference bounds, [0,1] clamping, empty-denominator null behaviour.
- Confidence labels from n and CI width (never from the value); recency half-life decay (1 → 0.5 → 0.25).
- Composition: known-dimension averaging, unknown dimension stays `null` and score still computes, role-fill fit bonus.
- Dataset integrity: deterministic counts, fixture labelling, BO5 presence, 10 picks + 10 bans per game with no duplicate champion, all five roles per team, Fearless respected across Masters Invitational games, reuse allowed in standard tournaments, engine has no hidden cross-game memory, sorted event timelines, deliberate coverage gaps present, champion catalogue depth ≥ 70.
- Scouting context: **denominator correctness** (only games the team played), explicit denominators on every rate, signature-pick detectability, side dependence, insight→evidence binding, observed/interpretation separation, macro metrics derived from events not match winners, filter compliance.
- Macro calculators: first-dragon/first-turret numerators cross-checked against raw events; herald/baron denominators restricted to games containing the event; interval bucket labels.
- Recommendations: full contract (id, score, breakdown, explanation, evidence, CI, factors, alternatives, provenance), weighted-component transparency, unavailable champions never recommended, ban candidates derive from opponent usage only, Fearless pool adaptation, exactly two alternative comps.

### Integration / contract (`tests/unit/api-and-provider.test.ts`)
- Envelope shape for success and validation failure (live against the running server).
- GRID adapter: host allowlist blocks non-allowlisted/non-HTTPS URLs; missing credentials fail fast; 401 never retried; 503 retried exactly 3 times; Retry-After honoured on 429 (≥1 s observed); circuit breaker opens after repeated failures.
- Mapper: role normalization, participant resolution, unknown roles/objectives degraded with warnings instead of invented values, empty-series rejection, error normalization into the catalogue.
- Evidence builder: deterministic ids, input sensitivity, limitation labelling, ledger dedupe.
- Counterfactual: divergent restriction sets, removal validation.

### Unit — production readiness (`tests/unit/production-readiness.test.ts`)
- Database health probe executes a real query and schema-sensitive lookup; fixture health reports dataset counts.
- `/api/health` returns `200 healthy` with check detail; dependency failure returns `503 SERVICE_UNAVAILABLE` through the uniform envelope.
- Shared-store rate limiter allows up to the configured limit, then throws `RATE_LIMITED` with `Retry-After` metadata.
- Forwarded client addresses are trusted only when `TRUST_AUTH_PROXY=true`.
- PostgreSQL baseline migration is present and includes the operational and draft tables.

### End-to-end (manual + browser-verified)
The Playwright journey set from PRD O3 is exercised in the delivery environment via the Agent Browser run recorded in the submission notes:

1. Open product → Command Center renders with computed metrics.
2. Scout → select opponent, apply filters, inspect a tendency, open its evidence drawer (full provenance visible).
3. Draft → create BO5 hard-Fearless session, complete all 20 actions through the UI, assign roles, finalize.
4. Fearless → start Game 2; verify exactly the 10 Game 1 picks show "Hard Fearless — locked from an earlier game"; Series Lab pool 80 → 70; counterfactual swap diffs restrictions.
5. Failure recovery → GRID import fails with typed error; fixture workspace unaffected.
6. Undo/concurrency → undo 20→19, redo restores, stale `expectedStateVersion` returns 409 without corruption (unit-tested at engine level, verified live via API).

## Quality gates (PRD O4)

| Gate | Status |
|---|---|
| Type checking (strict) | clean |
| Lint | clean |
| Unit + integration + contract tests | 176/176 passing |
| Dependency audit | 0 vulnerabilities across 696 resolved packages |
| Production build | `next build` + standalone assembly verified locally and in CI |
| Demo dataset accessible | fixture workspace fully functional without credentials |
| Browser journeys | all six verified (Agent Browser) |
| Accessibility | keyboard navigation, visible focus, aria labels on interactive elements, non-colour state indicators, reduced-motion support, responsive 390→1600 px |

## Known limitations

- Playwright specs are not bundled (the sandbox preview exposes a single route and the dev harness manages the server); journey 1–6 are verified with browser automation and documented above.
- The 3D Series Core ships as the PRD-specified CSS/SVG fallback path; no WebGL dependency.
- GRID paths require real credentials and therefore run in fixture mode in the public demo.
