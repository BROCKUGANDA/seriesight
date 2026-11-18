# Seriesight API Contracts

All handlers validate input with Zod and return the uniform envelope. Stack traces and provider secrets never leave the server.

## Envelope

```jsonc
// success
{ "success": true, "data": { }, "meta": { "requestId": "uuid", "generatedAt": "ISO-8601" }, "error": null }

// error
{ "success": false, "data": null, "meta": { "requestId": "uuid" },
  "error": { "code": "VALIDATION_ERROR", "message": "readable explanation",
             "retryable": false, "recovery": "what the user should do", "details": {} } }
```

Status mapping: `VALIDATION_ERROR`→400, `NOT_FOUND`→404, `DRAFT_*` conflicts→409, `GRID_UNAUTHORIZED`→401, `GRID_RATE_LIMITED`→429, `GRID_TIMEOUT`→504, `GRID_UNAVAILABLE`→503, `INTERNAL_ERROR`→500.

## Endpoints

### System
| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | service + dataset + database checks |
| GET | `/api/dashboard` | aggregate for Command Center (all values computed, nothing hardcoded) |

### Data sources & ingestion
| Method | Path | Notes |
|---|---|---|
| GET | `/api/data-sources` | connections, circuit breaker state, static-data adapter, recent jobs |
| POST | `/api/data-sources` | `{ action: "verify" \| "import", provider: "fixture" \| "grid", seriesId? }` |
| POST | `/api/ingestion/series` | `{ provider, seriesId? }` → runs the six named stages; fixture imports compute insight evidence |

### Catalogue & history
| Method | Path | Notes |
|---|---|---|
| GET | `/api/champions` | `?q=` search; returns metadata version + provenance warnings |
| GET | `/api/teams` | directory incl. `isOurTeam` |
| GET | `/api/tournaments` | with per-tournament series counts |
| GET | `/api/series` | `?teamId=&tournamentId=&status=` |

### Scouting & macro
| Method | Path | Notes |
|---|---|---|
| GET | `/api/scouting/opponents/:teamId` | profile, usage (rates with Wilson CI), insights (each with `evidenceId`), player pools. Query filters: `tournamentId, patch, side, fromDate, toDate, gameNumber` |
| GET | `/api/scouting/opponents/:teamId/trends` | insights + cross-game shift + repeated comps + macro summary |
| GET | `/api/macro/teams/:teamId` | objective modules (available/unavailable), intervals, timelines |

### Draft
| Method | Path | Notes |
|---|---|---|
| POST | `/api/draft/recommendations` | `{ sessionId }` for live boards, or `{ sessionSnapshot }` for what-if evaluation |
| POST | `/api/draft/sessions` | `{ opponentTeamId, format: BO1\|BO3\|BO5, rulesetId, modeOverride?, scopeOverride?, ourSide?, patch?, pool? }` |
| GET | `/api/draft/sessions` | recent sessions |
| GET | `/api/draft/sessions/:sessionId` | full board state |
| POST | `/api/draft/sessions/:sessionId/actions` | `{ type: "ban"\|"pick", championId, role?, playerId?, actor?, expectedStateVersion? }` — validated against the ruleset sequence, availability and Fearless state |
| POST | `/api/draft/sessions/:sessionId/undo` | `{ expectedStateVersion? }` — pops the last applied action into the redo stack |
| POST | `/api/draft/sessions/:sessionId/redo` | `{ expectedStateVersion? }` — re-applies it (rejects if it no longer matches the sequence) |
| POST | `/api/draft/sessions/:id/finalize` | requires the full sequence + role on every pick → `COMPLETED`; propagates Fearless to later games |
| POST | `/api/draft/sessions/:id/next-game` | opens the next game with sides swapped and restrictions inherited |
| POST | `/api/draft/sessions/:id/reset` | resets the current game board |
| POST | `/api/draft/sessions/:id/roles` | `{ side, pickIndex, role, playerId?, expectedStateVersion? }` — does not consume a draft turn |
| GET | `/api/draft/sessions/:id/restrictions` | per-game Fearless ledger for Series Lab |

### Series Lab
| Method | Path | Notes |
|---|---|---|
| POST | `/api/series-lab/counterfactual` | `{ sessionId, baseGameNumber, removeChampionId, addChampionId }` → base vs variant restriction diff |

### Evidence
| Method | Path | Notes |
|---|---|---|
| GET | `/api/evidence/all` | full ledger |
| GET | `/api/evidence/:evidenceId` | deterministic lookup (`EV-XXXXXXXX`); recomputes canonical contexts on a cache miss |

## Draft mutation semantics

- Every mutation accepts `expectedStateVersion`. If it does not match the stored version the handler returns **409 `DRAFT_STALE_VERSION`** and persists nothing.
- Validation errors carry stable codes: `DRAFT_RESTRICTED_CHAMPION` (with reason: ban / pick / Fearless via X), `DRAFT_DUPLICATE_PICK`, `DRAFT_WRONG_TEAM`, `DRAFT_WRONG_ORDER`, `DRAFT_INVALID_PHASE`, `DRAFT_SESSION_COMPLETED`, `DRAFT_ILLEGAL_UNDO`.
- Finalization requires all 20 actions locked **and** a role on every pick (`VALIDATION_ERROR` listing missing slots otherwise).

## Error catalogue (K2)

Full code list with retryability and recovery hints lives in `src/domain/errors.ts` (`ERRORS.*`) covering data-integration, analytics, draft-engine and interface classes. Client-side mapping mirrors it in `src/lib/api-client.ts` (`ApiClientError`).
