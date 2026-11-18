# Seriesight Integration Seams

How Seriesight connects to internal and external systems. The fabric has four
kinds of seams — **production controllers**, **adapters**, **consumers** and
**sinks** — wired together by one durable event bus. Every arrow is signed,
validated, retried and journaled.

```
 EXTERNAL SYSTEMS                    SERIESIGHT INTEGRATION FABRIC                DESTINATIONS
┌──────────────────┐   HTTPS +    ┌─────────────────┐   ┌──────────────────┐   ┌─────────────────────┐
│ Tournament CRM   │──HMAC-SHA256▶│ Inbound Webhook │──▶│                  │──▶│ Webhook Fan-out Sink│──▶ External
│ Scrim schedulers │   POST       │ Adapter         │   │                  │   │ (signed POST, ledger)   subscribers
│ Academy LMS      │              └─────────────────┘   │                  │   └─────────────────────┘
└──────────────────┘                                    │                  │
┌──────────────────┐   HTTPS GraphQL ┌──────────────┐    │    Durable       │   ┌─────────────────────┐
│ GRID Central     │◀─────────────── │ REST Polling │───▶│    Outbox Bus    │──▶│ Warehouse JSONL Sink│──▶ BI tools
│ Data (optional)  │                 │ Adapter      │    │  (SQLite table)  │   └─────────────────────┘
└──────────────────┘                 └──────────────┘    │                  │
┌──────────────────┐                                     │  publish() →     │   ┌─────────────────────┐
│ Internal file    │── JSON/CSV ──▶ File Drop Adapter ──▶│  dispatchEvent() │──▶│ Audit JSONL Sink    │──▶ Compliance
│ hand-offs        │                                     │  retries + DLQ   │   └─────────────────────┘
└──────────────────┘                                     │                  │
┌──────────────────┐   in-process     ┌──────────────┐    │                  │   ┌─────────────────────┐
│ Domain events:   │────────────────▶│ Production    │──▶│                  │──▶│ Notification Feed   │──▶ Coach in-app
│ imports, drafts, │                 │ Controllers   │   └──────────────────┘   └─────────────────────┘
│ leads            │                 └──────────────┘
└──────────────────┘                     Consumers run inline on dispatch:
                                         audit · warehouse · metrics · notifications · evidence refresh
```

## The four seam kinds

| Kind | Responsibility | Implemented by |
|---|---|---|
| **Production controller** | Owns the business rule "when X happens, an event must exist"; the only code allowed to publish domain events. | `controller:ingestion`, `controller:draft`, `controller:commercial` |
| **Adapter** | Translates between wire protocols and the bus. Inbound: webhook receiver, file drop. Outbound: REST polling, webhook executor. | `adapter:inbound-webhook`, `adapter:rest-polling`, `adapter:file-drop`, `adapter:outbound-webhook` |
| **Consumer** | Internal processor subscribed to topics; idempotent where practical; returns typed retryability. | audit, warehouse, metrics, notifications, evidence refresh |
| **Sink** | Terminal destination for event data. | webhook fan-out (HTTPS + HMAC), warehouse JSONL, audit JSONL, notification feed (DB rows) |

Code map (all under `src/lib/integration/`):

```
bus.ts                 outbox publish/dispatch, retries, DLQ, replay
bootstrap.ts           registers consumers exactly once per process
hmac.ts                signing, timing-safe verification, secret helpers
registry.ts            machine-readable seam catalogue (drives the Hub UI)
types.ts               topic catalogue, envelope, backoff
controllers/           ingestion · draft · commercial
adapters/              inbound-webhook · rest-polling · file-drop · outbound-webhook
consumers/index.ts     audit · warehouse · metrics · notifications · evidence
sinks/                 webhook-sink · warehouse-sink · notification-sink
```

## Topic catalogue

| Topic | Producers | Consumers / sinks |
|---|---|---|
| `data.series.imported` | ingestion controller | warehouse, evidence refresh, notifications, webhook fan-out |
| `data.provider.health` | REST polling adapter | warehouse, notifications, webhook fan-out |
| `data.file.imported` | file-drop adapter | warehouse, evidence refresh, webhook fan-out |
| `draft.session.finalized` | draft controller | notifications, webhook fan-out |
| `scrim.result.recorded` | inbound webhook adapter | notifications, webhook fan-out |
| `scrim.schedule.updated` | inbound webhook adapter | notifications, webhook fan-out |
| `commercial.lead.captured` | commercial controller | notifications, webhook fan-out |
| `integration.ping` | endpoint test, manual publish | webhook fan-out |

## Guarantees

1. **Durable outbox.** Every event is a row in `IntegrationEventRecord` before
   any consumer runs. A crash mid-dispatch leaves the row `pending`; the next
   dispatch cycle resumes it.
2. **Bounded retries + dead-letter.** Retryable failures reschedule with
   exponential backoff + jitter (1.5 s → 60 s cap, 5 attempts), then dead-letter.
   Non-retryable failures dead-letter immediately. Dead events are replayable
   from the Hub with one click.
3. **Signed on both sides.** Outbound deliveries carry
   `x-seriesight-signature: sha256=<hmac>` computed with each endpoint's
   secret; inbound webhooks must present the same header over the raw body
   (verified timing-safely before any parsing).
4. **SSRF-safe endpoints.** Outbound receivers must be `https://` (plain http
   only for loopback testing); GRID requests go through the existing host
   allowlist client.
5. **Journaled deliveries.** Every attempt per event × endpoint lands in
   `IntegrationDeliveryRecord` with status, HTTP code and error — the Hub
   renders this ledger for troubleshooting.
6. **Echo-loop safe.** Webhook fan-out never runs inside the publishing
   request stack (background task), and every delivery injects `__hopCount`
   into the payload. The inbound adapter unwraps Seriesight's own delivery
   envelopes and republishes with hop+1; the bus stops fanning out at 2 hops,
   so an endpoint pointed back at Seriesight terminates after bounded hops
   instead of looping forever.

## HTTP surface

| Route | Purpose |
|---|---|
| `GET /api/integration/overview` | seam map, bus stats, event stream, endpoints, deliveries, notifications, inbound guide |
| `POST /api/integration/dispatch` | worker tick — drain due events (schedulers call this) |
| `GET/POST /api/integration/events` | filterable event log / manual publish (catalogue topics only) |
| `POST /api/integration/events/[id]/replay` | replay a dead or pending event |
| `GET/POST /api/integration/endpoints` | list (secrets masked) / register subscriber |
| `PATCH/DELETE /api/integration/endpoints/[id]` | pause-resume / unregister |
| `POST /api/integration/endpoints/[id]/test` | send signed `integration.ping`, report delivery |
| `POST /api/integration/ingest/[topic]` | **inbound webhook receiver** (HMAC-verified) |
| `POST /api/integration/poll` | probe provider, publish health event |
| `GET/PATCH /api/integration/notifications` | feed + mark-read |

## Wiring an external system in

**Push (they call us)** — send a signed webhook:

```bash
body='{"opponentTeamId":"NVX","result":"win","gameNumber":2}'
sig="sha256=$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$SERIESIGHT_INBOUND_SECRET" -hex | cut -d' ' -f2)"
curl -X POST https://<host>/api/integration/ingest/scrim.result.recorded \
  -H "content-type: application/json" \
  -H "x-seriesight-signature: $sig" \
  -d "$body"
```

**Pull (we call them)** — register their receiver under Integration Hub →
Outbound subscribers. Store the one-time signing secret, verify signatures on
the receiver side, and use *Send test ping* to prove the loop.

**Batch** — drop a JSON/CSV export through the file-drop adapter endpoint
(see `src/app/api/integration` for the current surface) or trigger an import;
the ingestion controller publishes the result.

## Operational notes

- Rotation: override `SERIESIGHT_INBOUND_SECRET` in the server environment.
  The Hub hides the secret entirely once a custom value is set.
- Scheduling: call `POST /api/integration/dispatch` from cron/Kubernetes
  CronJob for background-style delivery; inline dispatch already covers the
  interactive paths.
- BI loads: `prisma/db/export/integration-warehouse.jsonl` (one JSON object
  per line) loads directly into DuckDB/BigQuery/Snowflake staging tables.
- The fixture dataset remains the only source of analytics until a real
  provider key is configured; inbound scrim events annotate (never replace)
  the deterministic dataset.
