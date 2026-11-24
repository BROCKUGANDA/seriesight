# GRID Integration

## Endpoints and entitlement

Seriesight integrates the authorized GRID APIs available to the hackathon participant:

- Central Data: `https://api-op.grid.gg/central-data/graphql`
- Series State: `https://api-op.grid.gg/live-data-feed/series-state/graphql`
- Authentication: `x-api-key` header, **server-side only**.

`GRID_API_KEY` is configured privately in the VPS application environment. A connection probe is not proof of completed LoL entitlement or successful import. Workspaces without imported history continue to use explicitly labelled fixtures.

> Verify the current schema and entitlements of the active GRID/Open Access account before enabling import paths against live data. The query documents in `src/lib/providers/grid/grid-queries.ts` follow the documented Central Data / Series State shapes but are marked for schema verification — the adapter validates every response and fails loudly on mismatch instead of guessing.

## Adapter architecture

```
UI  ──✗──  GRID (never; UI only talks to our API)
API route → services → GRID adapter:
  grid-client.ts    allowlist + timeout + bounded retry + jitter + Retry-After + circuit breaker
  grid-queries.ts   documented GraphQL documents (schema-verification flagged)
  grid-mapper.ts    provider payload → domain Games (explicit degradation, warnings recorded)
  grid-types.ts     contracts, supported titles, capability declaration
  grid-errors.ts    GridError → Seriesight AppError catalogue
  grid-capabilities.ts  capability surface for the UI
```

### Security properties

1. **Host allowlist** — requests only to `api-op.grid.gg` over HTTPS; anything else is rejected before fetch (`assertUrlAllowed`). Arbitrary user-supplied provider URLs are never fetched.
2. **Credentials** — read from `process.env.GRID_API_KEY` inside the client module only; never returned in payloads, logs, or browser code.
3. **Timeouts** — hard 12 s abort per attempt.
4. **Retries** — transient failures (5xx, timeout, network) retry up to 3 times with exponential backoff (≈500 ms → 1 s → 2 s) plus jitter. `Retry-After` is honoured on 429. 401/403 are **never** retried.
5. **Circuit breaker** — OPEN after 4 consecutive failed requests, HALF_OPEN after a 30 s cooldown, CLOSED after two consecutive successes. The UI surfaces the state.
6. **No sensitive logging** — payloads and keys are never logged; error messages carry stable codes only.

### Capability honesty

`capabilitiesForTitle("league-of-legends")` declares what the entitlement supports. Anything not confirmed renders as an explicit unavailable module — the economy module in the Macro Atlas demonstrates this pattern with real data (the fixture provider does not supply interval gold/damage aggregates).

## Licensing boundaries

- GRID Open Access is for **non-commercial learning and experimentation**; commercialization requires the appropriate GRID commercial licence.
- No unauthorized GRID raw data or derivative datasets are committed to this repository or rendered as fixture data.
- Only fields explicitly permitted by the applicable agreement may be persisted or displayed; the database schema is not permission to retain licensed data.
- Historical imports persist normalized picks, bans, outcomes and provenance in workspace-keyed `DataSourceConnectionRecord.metadataJson` rows. Enable imports only when the operator's agreement permits this retention. Raw provider responses are not persisted.
- Riot static data: champion names/roles follow Data Dragon conventions; the Data Dragon adapter performs live version discovery when reachable and falls back to a bundled snapshot offline, warning on patch mismatch. No Riot artwork is redistributed — champion tiles use original monogram glyphs.

## Status catalogue

The Data Sources page renders every PRD D8 state: `connected`, `not_configured`, `authenticating`, `importing`, `partial_success`, `rate_limited`, `temporarily_unavailable`, `access_denied`, `schema_mismatch` — driven by real probe results, never hardcoded.

## Failure recovery (demo script)

Coach imports require an explicit completed `seriesId`: `POST /api/data-sources { action: "import", provider: "grid", seriesId: "<official-id>" }` (or `POST /api/ingestion/series` without `action`). With no key, the job fails with `GRID_CREDENTIAL_MISSING` and increments the workspace connection's failure count. Missing IDs fail with `GRID_INVALID_QUERY`. No GRID failure becomes fixture import success.

## Historical retrieval and analytics handoff

- `fetchGridHistoricalSeries(seriesId, config?)` from `src/lib/providers/grid/grid-history.ts`: retrieves Central Data metadata and completed Series State, validates identities, outcomes and draft attribution, returns `Promise<GridHistoricalSeries>`; no persistence. Schema introspection is mandatory before building selections; unsupported/missing required fields fail closed. No automatic discovery is implemented.
- `runImport("grid", seriesId)` from `src/services/datasources.ts`: coach-only retrieval, normalization, durable workspace-scoped upsert and job result. Reimport replaces the same series row.
- `getHistoricalSeries(): Promise<GridHistoricalSeries[]>` from `src/services/dataset.ts`: identity-selected persisted complete drafts for probability integration, including games excluded from legacy analytics. Judge sessions return `[]`; no identity is an error. Picks expose champion name/provider ID, side, order, team, nullable role/player; games expose winner and nullable duration. Series retain provider timestamps, dataset ID and warnings; patch is unknown.
- `loadSelectedDataset(): Promise<SelectedDataset>` returns private GRID history when available, otherwise explicitly labelled fixtures. Never combines them. `games` contains only legacy-compatible games with known duration, explicit roles and recognized champion names. Unsupported games remain in `historicalSeries`, with exclusion warnings; never silently replace them with fixtures.
- `withSelectedDataset(callback)` hydrates each authenticated request **inside** `identityContext.run(identity, ...)`. `selectedDataset()` supplies the synchronous snapshot to analytics and draft services, and returns `undefined` outside hydration or across workspace identities.
- Analytics use snapshot-backed games/series indexes and propagate `provider`, `datasetId`, label and warnings into evidence/results. Draft policy is `null`, not presumed standard. Team/tournament metadata comes from `historicalSeries`; GRID IDs never join fixture teams. The probability service consumes `await getHistoricalSeries()` under the same identity context.
- GRID ingestion intentionally does **not** publish to the existing global integration bus: its subscribers/evidence refresh are not workspace-safe. Parent must use workspace-scoped analytics/evidence consumers before enabling those events.

### Official references and verification limits

- [Historical data access](https://grid.helpjuice.com/client-help/what-historical-data-does-grid-offer-and-how-far-back-does-it-go): completed snapshots via Series State, `x-api-key`, drafts and games in aggregated state; JSONL event downloads are a separate product and are not implemented here.
- [Hackathon Central Data guide](https://grid.helpjuice.com/en_US/cloud9-x-jetbrains-hackathon/how-do-i-use-the-central-data-api) and [Series State guide](https://grid.helpjuice.com/en_US/cloud9-x-jetbrains-hackathon/how-do-i-use-the-series-state-api).

Public documentation is not proof of this account's LoL field names or entitlement. Runtime schema inspection avoids emitting unsupported fields, then strict payload validation rejects insufficient projections. On 2026-11-19, the deployed API passed authenticated import, persistence and GRID-only scouting checks for one completed LoL game with ten picks and ten bans; temporary account data was cleaned up. Missing roles are not inferred from champion defaults. No objective events, match patch, region or draft policy are fabricated. This single-game verification is not sufficient history for a calibrated probability model.

### Private live smoke test

Live verification confirmed authorized Central/Series State introspection and discovered a completed LoL series on the first page after six state checks. An initial deployed import failed with `GRID_INVALID_SCHEMA`. After the adapter fixes were rebuilt and released, `--api` passed authenticated import, persisted draft validation, GRID-only team listing and scouting provenance checks; scoped temporary-account cleanup passed.

Demonstrated adapter fixes: nullable introspection metadata may be omitted rather than explicitly null; missing argument defaults still mean required arguments have no default. Game `duration` (a custom scalar, not an object) and `startedAt` resolvers failed for this historical series despite appearing in the schema. The historical projection no longer requests either; duration uses only an available positive `clock.currentSeconds`, otherwise remains unknown. Required draft/outcome validation is unchanged.

`scripts/grid-live-smoke.mjs` is an operator-only helper, not a discovery API: it reads credentials from `process.env` only, derives discovery argument types and title filters from introspection, scans at most five pages of 50 series, and checks completed state without logging IDs or licensed payloads. An empty bounded scan does **not** prove missing account-wide entitlement.

Copy the script into the existing application container (next to its `node_modules`, so Prisma resolves) without rebuilding or deploying. Run there:

```sh
node scripts/grid-live-smoke.mjs --schema-only
node scripts/grid-live-smoke.mjs --schema-summary
node scripts/grid-live-smoke.mjs
node scripts/grid-live-smoke.mjs --diagnose
node scripts/grid-live-smoke.mjs --api
```

`--schema-only` prints schema structure, not data. Discovery fails closed on unsupported required arguments or provider errors. `--api` additionally uses the private environment invitation to register a unique temporary coach, imports one discovered completed series, checks GRID-only teams, scouting provenance and persisted ten-pick drafts, and removes only that account's sessions and workspace GRID records in `finally`. It never prints invitation, password, cookie, key, IDs or provider payloads. Normal authentication throttles and in-process analytics/job caches are not reset. No schema mismatch should be fixed by weakening draft validation or inventing roles; inspect the authorized schema first. Keep the script out of browser bundles and invoke `--api` only when licensed retention is permitted.

`--diagnose` prints contract checks and counts only. To verify a local adapter without replacing the application, create a temporary diagnostic bundle with `bun build src/lib/providers/grid/grid-history.ts --target=node --format=esm --outfile=scripts/grid-adapter-diagnostic.mjs`, copy it alongside the smoke script in the container, then run `node /app/grid-live-smoke.mjs --adapter`. This mode does not persist data or exercise deployed routes; it logs normalized counts or sanitized schema issue paths. Remove only the generated diagnostic bundle afterward. Rerun `--api` against the deployed release after adapter changes before claiming end-to-end success.
