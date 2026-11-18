/**
 * Billing payments — GET /api/billing/payments
 * Payment history with reversals for the demo workspace (billing settings UI).
 */
import { NextRequest } from "next/server";
import { ok, handler } from "@/lib/api/respond";
import { listPayments } from "@/lib/billing/ledger";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req: NextRequest) => {
  const payments = await listPayments();
  return ok({ payments }, _req);
});
