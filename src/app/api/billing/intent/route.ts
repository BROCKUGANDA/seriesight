/**
 * Billing intent — POST /api/billing/intent
 * Opens a checkout intent with a locked quote (token amount, treasury address,
 * TTL). The intent row is the single source of truth for verification.
 */
import { NextRequest } from "next/server";
import { ok, handler, parseBody } from "@/lib/api/respond";
import { BillingSchemas, createIntent } from "@/lib/billing/ledger";
import { fetchSpotRates } from "@/lib/billing/rpc";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: NextRequest) => {
  const body = await parseBody(req, BillingSchemas.IntentSchema);
  const rates = await fetchSpotRates();
  const payment = await createIntent(body.token, body.planId, body.period, rates);
  return ok({ payment }, req);
});
