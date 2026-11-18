/**
 * Inbound webhook receiver — POST /api/integration/ingest/[topic]
 *
 * The seam external systems push through (tournament platforms, scrim
 * schedulers, academy LMS). Verifies the HMAC-SHA256 signature over the RAW
 * request body (exact bytes — never re-serialize before verifying), then
 * validates, normalizes and publishes the event on the bus.
 *
 * Headers:
 *   x-seriesight-signature: sha256=<hex digest of the raw body with the shared secret>
 *
 * Supported topics: scrim.result.recorded · scrim.schedule.updated · commercial.lead.captured · integration.ping
 */
import { NextRequest } from "next/server";
import { ok, handler } from "@/lib/api/respond";
import { receiveInboundWebhook } from "@/lib/integration/adapters/inbound-webhook";
import { ensureBusBootstrapped } from "@/lib/integration/bootstrap";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: NextRequest, { params }: { params: Promise<{ topic: string }> }) => {
  ensureBusBootstrapped();
  const { topic } = await params;
  const rawBody = await req.text();
  const signature = req.headers.get("x-seriesight-signature");

  const receipt = await receiveInboundWebhook(topic, rawBody, signature);

  return ok(
    {
      accepted: true,
      topic,
      eventId: receipt.event.id,
      verified: receipt.verified,
      dispatch: receipt.outcome,
    },
    req,
    { seam: "adapter:inbound-webhook" },
  );
});
