# GRID Integration

## Endpoints and entitlement

Seriesight integrates the authorized GRID APIs available to the hackathon participant:

- Central Data: `https://api-op.grid.gg/central-data/graphql`
- Series State: `https://api-op.grid.gg/live-data-feed/series-state/graphql`
- Authentication: `x-api-key` header, **server-side only**.

The active demo runs **without** GRID credentials on the labelled fixture dataset. When `GRID_API_KEY` is present in the server environment, `Verify connection` on the Data Sources page performs a real probe; imports then run through the same staged pipeline.

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
- The provider-specific retention policy: fixture data is independently authored; GRID-sourced data (when enabled) stays in server memory/cache only for the request lifecycle, with provenance limited to aggregate statistics and metadata in evidence records.
- Riot static data: champion names/roles follow Data Dragon conventions; the Data Dragon adapter performs live version discovery when reachable and falls back to a bundled snapshot offline, warning on patch mismatch. No Riot artwork is redistributed — champion tiles use original monogram glyphs.

## Status catalogue

The Data Sources page renders every PRD D8 state: `connected`, `not_configured`, `authenticating`, `importing`, `partial_success`, `rate_limited`, `temporarily_unavailable`, `access_denied`, `schema_mismatch` — driven by real probe results, never hardcoded.

## Failure recovery (demo script)

With no key configured, `POST /api/data-sources { action: "import", provider: "grid" }` fails at the `connecting` stage with `GRID_CREDENTIAL_MISSING` (retryable: false), increments `failedImportCount`, and the rest of the product — fixture workspace, drafts, analytics — remains fully functional. Nothing silently mixes real and synthetic records.
