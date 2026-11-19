# Third-party notices

The root [LICENSE](LICENSE) applies to Seriesight's original source code; it is
Business Source License 1.1, not MIT. Third-party components keep their own
licenses and must not be relicensed under the root license. Examples include:

| Component | Where | License |
|---|---|---|
| shadcn/ui component sources | `src/components/ui/*` | MIT — © shadcn and contributors |
| Radix UI primitives (via shadcn/ui) | `node_modules` / `package.json` | MIT |
| Lucide icons | `node_modules` / `package.json` | ISC (lucide-react) |
| Next.js, React, Tailwind, Recharts, Zod, Zustand, TanStack Query, Framer Motion, Prisma and all other npm dependencies | `package.json` / `bun.lock` | Their respective permissive licenses (see each package) |

Fixture champion metadata is independently authored and illustrative — it is
not Riot Games' Data Dragon content. Data Dragon integration, when configured,
is used only under Riot's permitted static-data terms at runtime; no Data
Dragon assets are committed to this repository.

GRID esports data is never committed to this repository. The GRID provider
adapter activates only when a server-side `GRID_API_KEY` is configured and
respects GRID's Open Access (non-commercial) terms.
