/**
 * Dispatch worker tick — POST /api/integration/dispatch
 * Drains due pending events (retryable consumers rescheduled with backoff,
 * exhausted ones dead-lettered). The Integration Hub "Run dispatch cycle"
 * button and external schedulers (cron, k8s CronJob) call this.
 */
import { NextRequest } from "next/server";
import { ok, handler, parseOptionalBody } from "@/lib/api/respond";
import { z } from "zod";
import { dispatchPending } from "@/lib/integration/bus";
import { ensureBusBootstrapped } from "@/lib/integration/bootstrap";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ limit: z.number().int().min(1).max(100).optional() }).strict();

export const POST = handler(async (req: NextRequest) => {
  ensureBusBootstrapped();
  const body = await parseOptionalBody(req, bodySchema);
  const tally = await dispatchPending(body?.limit ?? 25);
  return ok({ ranAt: new Date().toISOString(), ...tally }, req);
});

export const GET = POST;
