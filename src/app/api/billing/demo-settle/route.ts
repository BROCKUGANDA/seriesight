/**
 * Billing demo settle — POST /api/billing/demo-settle
 * Judge/evaluator path: simulates a confirmed on-chain settlement WITHOUT
 * moving funds. The resulting ledger row is permanently flagged `demo: true`
 * and every surface that renders it labels it as a demo settlement, so the
 * audit trail can never be mistaken for a real transfer.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, handler, parseBody } from "@/lib/api/respond";
import { demoSettle } from "@/lib/billing/ledger";

export const dynamic = "force-dynamic";

const DemoSchema = z.object({
  paymentId: z.string().uuid(),
});

export const POST = handler(async (req: NextRequest) => {
  const body = await parseBody(req, DemoSchema);
  const outcome = await demoSettle(body.paymentId);
  return ok(outcome, req);
});
