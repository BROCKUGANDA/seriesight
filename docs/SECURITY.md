# Seriesight Security Notes

1. **Server-side credentials only.** `GRID_API_KEY` is read exclusively inside `src/lib/providers/grid/grid-client.ts` (server modules). It never reaches browser JavaScript, network responses, or logs.
2. **Environment secrets.** `.env` is git-ignored; `.env.example` documents the optional variable without values.
3. **SSRF prevention.** Provider requests pass `assertUrlAllowed`: HTTPS + explicit host allowlist (`api-op.grid.gg`). No user-supplied URL is ever fetched server-side.
4. **Input validation.** Every mutation validates with Zod before touching services; query parameters are validated with `parseQuery`.
5. **Output encoding.** React escapes by default; no `dangerouslySetInnerHTML` is used anywhere.
6. **SQL safety.** All persistence flows through Prisma parameterized queries; no string-built SQL.
7. **Rate limiting.** The GRID client enforces bounded retries + circuit breaker; the ingestion endpoints are stage-gated and idempotent per fixture import. Public demo mutation endpoints validate `expectedStateVersion` to prevent concurrent-write corruption.
8. **Error hygiene.** Unknown route errors are logged server-side and returned as generic `INTERNAL_ERROR` envelopes; no stack traces or internals are exposed. Every typed error carries a stable code, retryability and a recovery action.
9. **Authorization.** The demo workspace is single-workspace by design (`ws-demo`); draft session reads/mutations are workspace-scoped. Production multi-tenant use would add workspace membership checks before the service layer.
10. **Data governance.** No licensed GRID raw data, credentials, or private data in fixtures/screenshots; fixture data is independently authored and permanently labelled. Database schema is not treated as retention permission (see GRID_INTEGRATION.md).
11. **File uploads.** None exist in the MVP — no arbitrary file import surface is exposed.
12. **Dependency audit.** Dependencies are pinned by the lockfile; the stack uses stable releases only.
