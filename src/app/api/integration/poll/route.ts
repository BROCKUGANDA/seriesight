/**
 * REST polling adapter trigger — POST /api/integration/poll
 * Probes the configured external provider (GRID) and publishes a
 * `data.provider.health` event when the provider carries traffic. Schedulers
 * or the Hub can call this on a cadence; the fixture workspace is unaffected.
 */
import { NextRequest } from "next/server";
import { ok, handler } from "@/lib/api/respond";
import { pollProviderHealth } from "@/lib/integration/adapters/rest-polling";
import { ensureBusBootstrapped } from "@/lib/integration/bootstrap";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: NextRequest) => {
  ensureBusBootstrapped();
  const result = await pollProviderHealth();
  return ok(result, req, { seam: "adapter:rest-polling" });
});

export const GET = POST;
