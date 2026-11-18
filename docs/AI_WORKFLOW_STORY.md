# Seriesight AI Workflow Story

This document records the actual tooling used to build Seriesight and what each tool contributed. It describes real engineering activity from this build — no invented productivity statistics.

## Tooling actually used

### Z.ai GLM agent (implementation agent)

Seriesight was implemented end-to-end by the Z.ai coding agent working directly in the repository. The workflow pattern that produced the best results was the one the PRD itself prescribes: **bounded tasks with acceptance criteria**, never "build the app". Concretely:

1. **Contracts before code.** The domain types (`src/domain/types.ts`), error catalogue and API envelope were written first and everything else was implemented against them.
2. **Pure core, verified early.** The fixture generator was smoke-tested with a scratch script (`/tmp/check-fx.ts`) the moment it compiled, which caught a role-starvation defect in Game 5 of hard-Fearless BO5s (a 60-champion pool can exhaust a role) before any UI existed. The fix — a deeper 80-champion catalogue plus a recorded degenerate-pool fallback — became a permanent fixture validator.
3. **Engine and analytics as pure functions.** Both were written to be testable without a server, which made the 82-test suite possible and made defects reproduce deterministically.

### Real bugs the verification loop caught

- **Denominator corruption (critical).** The scouting context initially included every game in the dataset in a team's denominators — games the team did not play. All pick rates were understated and a "composition repeated 23 times" insight was pure artifact (23 empty pick-sets). Caught by a targeted debug script, fixed by requiring team participation in `inFilters`, then locked in by an explicit denominator-correctness unit test.
- **Availability was not side-aware.** Under Soft Fearless (own scope), the engine marked the opponent's picks unavailable for everyone — wrong per tournament semantics. Refactored `availability()` to return a per-side view (`bySide.BLUE` / `bySide.RED`) with turn-aware aggregates, locked by tests from both teams' perspectives.
- **Nested interactive elements.** The evidence chip sat inside a tendency card `<button>` — invalid HTML that produced a hydration error and swallowed clicks. Restructured to `role="button"` + keyboard handlers, with `stopPropagation` on the chip.
- **Global evidence drawer.** Originally mounted only inside the Evidence Ledger page, so evidence chips on other pages silently did nothing. Moved to the app shell as a single global drawer.
- **React 19 effect discipline.** The linter flagged synchronous `setState` inside effects across five workspace files and the hash router. The router moved to `useSyncExternalStore`; data loading moved to deferred (`setTimeout(…, 0)`) fetch patterns — removing cascading renders rather than suppressing the rule.

### Agentic verification as the quality gate

Every phase ended with executed checks rather than assumptions: `tsc --noEmit`, ESLint, the Vitest suite, live `curl` probes against the API envelope, and finally an Agent Browser walkthrough that played a full 20-action BO5 draft through the real DOM (including undo/redo, role assignment, finalization, and Game 2 Fearless verification — exactly 10 restricted champions with provenance tooltips). The browser run surfaced the nested-button and drawer-mounting defects that static checks could not see.

### What JetBrains tooling contributes to this repo (handoff note)

The repository is prepared for the JetBrains workflow described in the PRD:

- **WebStorm**: `.idea`-ready standard Next.js/TypeScript project; strict tsconfig; ESLint integration; the domain (`src/domain`), services (`src/services`) and UI (`src/components`) layering maps directly to WebStorm file-scoping features.
- **Junie**: `.junie/guidelines.md` (below) gives the agent the exact bounded-task protocol and module map used during this build, so future Junie tasks (e.g. "add a Soft-Fearless scope test matrix", "extend macro calculators with mid-game gold when the provider ships interval aggregates") inherit the same constraints.
- **DataGrip**: the SQLite database (`db/seriesight.db`, Prisma-managed) can be attached directly for schema inspection of `DraftSessionRecord` / `DraftActionRecord` / `IngestionJobRecord` / `DataSourceConnectionRecord` and the `stateVersion` concurrency columns.

### `.junie/guidelines.md` (committed to the repository)

```markdown
# Junie guidelines for Seriesight
- Respect the layering: UI → API routes → services → domain. Domain and fixtures stay pure/deterministic.
- Never hardcode metric values; compute from the dataset and attach evidence ids.
- All mutations: Zod validation + expectedStateVersion check; errors via the catalogue in src/domain/errors.ts.
- Fixture data must always carry the fixture label; never mix it into official-data views.
- After any change: bun run lint && bun run typecheck && bun run test.
```

### Human-review boundaries

All AI-generated code was verified by executed tests and browser automation before acceptance; where the agent's output failed verification (denominators, side-awareness, hydration), the root cause was fixed rather than patched over, and regression tests were added for each defect.
