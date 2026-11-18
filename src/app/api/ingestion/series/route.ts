import { NextRequest } from "next/server";
import { ok, handler, parseBody } from "@/lib/api/respond";
import { z } from "zod";
import { runImport } from "@/services/datasources";
import { registerLedgerRecords } from "@/services/evidence";
import { ScoutingContext, buildInsights } from "@/domain/analytics/scouting-context";
import { TEAMS } from "@/fixtures/teams";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  provider: z.enum(["fixture", "grid"]).default("fixture"),
  seriesId: z.string().optional(),
});

/**
 * Import series. With provider=grid this exercises the real adapter (fails with
 * typed errors when no credentials). With provider=fixture it imports the labelled
 * demo dataset through the same staged pipeline, then computes insight evidence.
 */
export const POST = handler(async (req: NextRequest) => {
  const body = await parseBody(req, bodySchema);
  const job = await runImport(body.provider, body.seriesId);
  if (body.provider === "fixture" && job.status === "succeeded") {
    for (const team of TEAMS) {
      const ctx = new ScoutingContext(team.id);
      buildInsights(ctx);
      registerLedgerRecords(ctx.ledger);
    }
  }
  return ok(
    {
      job,
      ingested: job.status === "succeeded" ? { seriesCount: job.seriesCount, gameCount: job.gameCount } : null,
    },
    req,
  );
});
