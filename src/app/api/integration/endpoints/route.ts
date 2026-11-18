/**
 * Outbound subscriber endpoints — /api/integration/endpoints
 *   GET   — list (secrets masked)
 *   POST  — register { label, url, topics, secret? }; the generated secret is
 *           returned exactly once for the receiver to store.
 */
import { NextRequest } from "next/server";
import { ok, handler, parseBody } from "@/lib/api/respond";
import { z } from "zod";
import { createEndpoint, listEndpoints } from "@/lib/integration/adapters/outbound-webhook";
import { ensureBusBootstrapped } from "@/lib/integration/bootstrap";

export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    label: z.string().trim().min(2, "Give the endpoint a recognisable label.").max(80),
    url: z.string().trim().url("Enter a valid endpoint URL."),
    topics: z.array(z.string()).min(1),
    secret: z.string().trim().min(16).max(200).optional(),
  })
  .strict();

export const GET = handler(async (req: NextRequest) => {
  ensureBusBootstrapped();
  return ok({ endpoints: await listEndpoints() }, req);
});

export const POST = handler(async (req: NextRequest) => {
  ensureBusBootstrapped();
  const body = await parseBody(req, createSchema);
  const endpoint = await createEndpoint(body);
  return ok({ endpoint }, req, { note: "Store the signing secret now — it is shown only once." });
});
