/**
 * Endpoint detail — /api/integration/endpoints/[endpointId]
 *   PATCH  { label?, status?, topics? } — rename, pause/resume, re-subscribe
 *   DELETE — unregister the endpoint (delivery rows cascade)
 */
import { NextRequest } from "next/server";
import { ok, handler, parseBody } from "@/lib/api/respond";
import { z } from "zod";
import { updateEndpoint, deleteEndpoint } from "@/lib/integration/adapters/outbound-webhook";
import { ensureBusBootstrapped } from "@/lib/integration/bootstrap";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    label: z.string().trim().min(2).max(80).optional(),
    status: z.enum(["active", "paused"]).optional(),
    topics: z.array(z.string()).min(1).optional(),
  })
  .strict();

export const PATCH = handler(async (req: NextRequest, { params }: { params: Promise<{ endpointId: string }> }) => {
  ensureBusBootstrapped();
  const { endpointId } = await params;
  const body = await parseBody(req, patchSchema);
  const endpoint = await updateEndpoint(endpointId, body);
  return ok({ endpoint }, req);
});

export const DELETE = handler(async (req: NextRequest, { params }: { params: Promise<{ endpointId: string }> }) => {
  ensureBusBootstrapped();
  const { endpointId } = await params;
  await deleteEndpoint(endpointId);
  return ok({ deleted: true }, req);
});
