/**
 * Billing reversal — POST /api/billing/reversal
 * Records a full or partial refund against a settled payment, publishes
 * `commercial.payment.refunded` on the integration bus, and reports whether
 * the entitlement should downgrade (full reversal of the active subscription).
 */
import { NextRequest } from "next/server";
import { ok, handler, parseBody } from "@/lib/api/respond";
import { BillingSchemas, reversePayment } from "@/lib/billing/ledger";
import { requireWorkspaceRole } from "@/services/organizations";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: NextRequest) => {
  await requireWorkspaceRole("owner");
  const body = await parseBody(req, BillingSchemas.ReversalSchema);
  const outcome = await reversePayment(body);
  return ok(outcome, req);
});
