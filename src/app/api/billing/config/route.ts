/**
 * Billing config — GET /api/billing/config
 * Treasury addresses, supported tokens and live indicative spot rates.
 * Public (no secrets): addresses are receiving endpoints; RPC keys stay server-side.
 */
import { NextRequest } from "next/server";
import { ok, handler } from "@/lib/api/respond";
import { CHAIN_LABELS, TOKENS, TREASURY, explorerAddressUrl, type ChainId, type TokenKey } from "@/lib/billing/chains";
import { fetchSpotRates } from "@/lib/billing/rpc";
import { QUOTE_TTL_MINUTES, USD_AED_PEG } from "@/lib/billing/fx";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req: NextRequest) => {
  const rates = await fetchSpotRates();
  return ok({
    treasury: {
      ethereum: { address: TREASURY.ethereum.address, explorer: explorerAddressUrl("ethereum") },
      solana: { address: TREASURY.solana.address, explorer: explorerAddressUrl("solana") },
    },
    tokens: TOKENS.map((t) => ({ key: t.key, label: t.label, chain: t.chain, settlement: t.settlement, description: t.description })),
    chainLabels: CHAIN_LABELS as Record<ChainId, string>,
    rates: { usdPer: { ETH: rates.ETH, SOL: rates.SOL, "USDC-ETH": rates["USDC-ETH"], "USDC-SOL": rates["USDC-SOL"] }, fetchedAt: rates.fetchedAt, source: rates.source, fallback: rates.fallback },
    quoteTtlMinutes: QUOTE_TTL_MINUTES,
    usdAedPeg: USD_AED_PEG,
  }, _req);
});

export type BillingConfig = {
  treasury: Record<"ethereum" | "solana", { address: string; explorer: string }>;
  tokens: { key: TokenKey; label: string; chain: ChainId; settlement: string; description: string }[];
  rates: { usdPer: Record<string, number>; fetchedAt: string; source: string; fallback: boolean };
  quoteTtlMinutes: number;
  usdAedPeg: number;
};
