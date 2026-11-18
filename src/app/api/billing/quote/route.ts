/**
 * Billing quote — POST /api/billing/quote
 * Converts a plan price (AED, VAT-exclusive) into on-chain terms for every
 * supported token, with rate provenance and quote TTL. Read-only: nothing
 * is persisted until an intent is opened.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, handler, parseBody } from "@/lib/api/respond";
import { fetchSpotRates } from "@/lib/billing/rpc";
import { planPriceAED } from "@/lib/billing/ledger";
import { quoteAll, aedToUsd, USD_AED_PEG } from "@/lib/billing/fx";

export const dynamic = "force-dynamic";

const QuoteSchema = z.object({
  planId: z.enum(["coach", "org"]),
  period: z.enum(["monthly", "annual"]),
});

export const POST = handler(async (req: NextRequest) => {
  const body = await parseBody(req, QuoteSchema);
  const aed = planPriceAED(body.planId, body.period);
  const rates = await fetchSpotRates();
  const quotes = quoteAll(aed, rates);
  return ok({
    planId: body.planId,
    period: body.period,
    aed,
    usd: aedToUsd(aed),
    usdAedPeg: USD_AED_PEG,
    quotes,
    rates: { source: rates.source, fetchedAt: rates.fetchedAt, fallback: rates.fallback },
  }, req);
});
