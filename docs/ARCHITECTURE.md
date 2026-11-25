# Seriesight Architecture

## Overview

Seriesight is a modular monolith: one Next.js 16 application containing the presentation layer, application services, domain logic, analytics, persistence and the external provider adapter. The UI never performs direct provider requests.

## Layers

```
Presentation (React 19, client shell, hash-routed workspaces)
  ↓ fetch (relative URLs, uniform envelope)
API route handlers (Zod-validated, envelope + error middleware)
  ↓
Application services (draft sessions, scouting, macro, ingestion, evidence)
  ↓
Domain logic (pure TypeScript: draft engine, analytics, evidence builder)
  ↓
Persistence (Prisma/SQLite: sessions, audit trail, jobs, connections)
        + Provider layer (GRID adapter — server only; Data Dragon adapter)
```

### Key data flows

**Draft workflow (PRD G3)**

```
Coach input → Draft state machine (validate-then-apply) → Draft action event
→ Series restrictions (Fearless propagation) → Composition analysis
→ Recommendation refresh → Updated series board (persisted with stateVersion)
```

Every mutation: client sends `expectedStateVersion`; server compares with the stored version; mismatch → `409 DRAFT_STALE_VERSION`; success → action row written to the audit table, version incremented, fresh availability + recommendations returned.

**Analytics flow**

```
Fixture dataset (deterministic, seeded) → ScoutingContext (filters → eligible games)
→ usage/rate calculations → Wilson intervals → Insights + Evidence records
→ Recommendations (component-weighted 0–100 scores)
```

The fixture dataset is generated once at module load from a fixed seed; identical inputs always produce identical statistics and evidence ids. `inFilters` requires team participation, so every denominator counts only games the analysed team actually played.

**Provider flow**

```
GRID (only when GRID_API_KEY set) → grid-client (allowlist, timeout, retry, breaker)
→ grid-mapper (validated provider models → domain Games, degrading explicitly)
→ same analytics path as fixtures, but sourceProvider: "grid"
```

The circuit breaker (CLOSED/OPEN/HALF_OPEN, threshold 4, 30 s cooldown) lives on `globalThis` so it survives route-handler module reloads in dev.

## Folder map

```
src/
  app/                  # root layout, page (client shell), error boundaries, api/*
    api/                # 19 route handlers (health, scouting, macro, draft, series-lab, evidence…)
  components/
    shell/              # AppShell: 248px nav, 64px command bar, toast, global evidence drawer
    workspaces/         # the eight workspace views
    common/             # panels, stat tiles, badges, evidence drawer, empty/error states
    brand/ icons/ loading/   # identity, 25-glyph library, four loaders
  domain/
    draft/              # rulesets + deterministic state machine
    analytics/          # stats, composition, recommendations, macro, scouting context
    evidence/           # deterministic evidence builder
    types.ts errors.ts  # canonical domain model + error catalogue
  fixtures/             # champion catalogue (coach-curated traits), identity data, seeded dataset
  lib/
    providers/grid/     # grid-client / queries / mapper / types / errors / capabilities
    providers/data-dragon.ts
    api/                # envelope helpers, handler wrapper
    db.ts api-client.ts
  services/             # draft, scouting, macro, datasources, evidence
  store/ hooks/         # zustand workspace store, hash router (useSyncExternalStore)
prisma/schema.prisma    # sessions, actions, jobs, connections
tests/unit/             # 82 Vitest tests
docs/                   # this documentation set
```

## Persistence model

| Table | Purpose |
|---|---|
| `DraftSessionRecord` | session header + `gamesJson` board snapshots + `stateVersion` (optimistic concurrency) |
| `DraftActionRecord` | immutable audit trail: every applied action with `priorStateVersion` |
| `IngestionJobRecord` | import jobs with named stages |
| `DataSourceConnectionRecord` | provider status surfaces for the Data Sources page |
| `AuthUserRecord` / `AuthSessionRecord` / `AuthThrottleRecord` | invite-based identity, hashed sessions, sign-in throttling |
| `RequestRateLimitRecord` | shared fixed-window API throttling |
| `OrganizationRecord` / `OrganizationMemberRecord` | tenant ownership, memberships and role assignments |
| `OrganizationInvitationRecord` / `WorkspaceRecord` | time-limited invitations and switchable personal/team workspaces |

Analytics are computed from the fixture dataset module (not stored rows) — the database owns mutable workflow state only. This keeps statistics reproducible and the demo honest: no licensed data retention is required.

## Routing note

The hosting sandbox exposes a single external route (`/`). The PRD's eight destinations are preserved as hash routes (`#/dashboard`, `#/scouting`, …) inside a client shell using `useSyncExternalStore` over `hashchange` — deep-linkable, and the API layer retains real server routes.

## Design system

Tokens live in `src/app/globals.css` and mirror PRD Part E exactly (backgrounds `#080C14…#203247`, text `#F2F6FC…#4D6076`, accents `#42D9FF`, `#9B8CFF`, `#627DFF`, `#F3BD69`, `#55DBAA`, `#FF7488`). State is always communicated by label + glyph + colour. The Series Core hero is the SVG/CSS 2D fallback path of the PRD F7 3D system; the product remains fully functional with animation disabled (`prefers-reduced-motion` collapses all durations).
