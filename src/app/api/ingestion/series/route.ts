import { NextRequest } from "next/server";
import { ok, handler, parseBody } from "@/lib/api/respond";
import { z } from "zod";
import { runImport } from "@/services/datasources";
import { emitSeriesImported } from "@/lib/integration/controllers/ingestion-controller";
import { ensureBusBootstrapped } from "@/lib/integration/bootstrap";
import { FIXTURE_INFO } from "@/fixtures/dataset";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  provider: z.enum(["fixture", "grid"]).default("fixture"),
  seriesId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
});

/**
 * Import series. With provider=grid this exercises the real adapter (fails with
 * typed errors when no credentials). With provider=fixture it imports the labelled
 * demo dataset through the same staged pipeline. On success the Ingestion
 * Controller publishes `data.series.imported` on the integration bus — the
 * evidence-refresh consumer recomputes the ledger and downstream sinks react.
 */
export const POST = handler(async (req: NextRequest) => {
  const body = await parseBody(req, bodySchema);
  ensureBusBootstrapped();
  const job = await runImport(body.provider, body.seriesId);
  let integration: { eventId: string; topic: string; status: string } | null = null;
  // The integration bus is not workspace-scoped yet. Never publish licensed
  // GRID imports to its global subscribers or fixture evidence refresh consumer.
  if (job.status === "succeeded" && body.provider === "fixture") {
    const { event } = await emitSeriesImported({
      provider: body.provider,
      seriesCount: job.seriesCount,
      gameCount: job.gameCount,
      jobId: job.id,
      datasetId: body.provider === "fixture" ? FIXTURE_INFO.datasetId : null,
    });
    integration = { eventId: event.id, topic: event.topic, status: event.status };
  }
  return ok(
    {
      job,
      ingested: job.status === "succeeded" ? { seriesCount: job.seriesCount, gameCount: job.gameCount } : null,
      integration,
    },
    req,
  );
});
