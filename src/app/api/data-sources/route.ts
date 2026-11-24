import { NextRequest } from "next/server";
import { ok, handler, parseBody } from "@/lib/api/respond";
import { z } from "zod";
import { dataSourcesOverview, runImport, verifyGridConnection } from "@/services/datasources";

export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  const overview = await dataSourcesOverview();
  return ok(overview, req);
});

const actionSchema = z.object({
  action: z.enum(["import", "verify"]),
  provider: z.enum(["fixture", "grid"]).default("fixture"),
  seriesId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
});

export const POST = handler(async (req: NextRequest) => {
  const body = await parseBody(req, actionSchema);
  if (body.action === "verify") {
    const result = await verifyGridConnection();
    return ok(result, req);
  }
  const job = await runImport(body.provider, body.seriesId);
  return ok(job, req);
});
