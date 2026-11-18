# Junie guidelines for Seriesight
- Respect the layering: UI → API routes → services → domain. Domain and fixtures stay pure/deterministic.
- Never hardcode metric values; compute from the dataset and attach evidence ids.
- All mutations: Zod validation + expectedStateVersion check; errors via the catalogue in src/domain/errors.ts.
- Fixture data must always carry the fixture label; never mix it into official-data views.
- After any change: bun run lint && bun run typecheck && bun run test.
