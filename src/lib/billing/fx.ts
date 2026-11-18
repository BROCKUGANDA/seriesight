/**
 * Seriesight on-chain billing — in-app currency conversion engine.
 *
 * Seriesight prices in AED (UAE dirham, VAT-exclusive). This engine converts
 * any plan price into USD (official peg) and into on-chain terms (ETH / SOL /
 * USDC) so users always see exactly what they are asked to send, at what rate,
 * and how long the quote stays locked.
 *
 * Crypto spot rates are INDICATIVE and fetched server-side when a checkout
 * intent is opened (see rpc.ts `fetchSpotRates` with graceful demo fallback);
 * the quote is then locked for QUOTE_TTL_MINUTES so the payer gets a
 * deterministic amount. Rate provenance + timestamp are shown at every
 * checkout surface — a compliance requirement, not decoration.
 */

export const USD_AED_PEG = 3.6725; // official USD/AED peg — dirham is pegged, not floated

export const QUOTE_TTL_MINUTES = 15;

export interface SpotRates {
  /** USD per 1 ETH / SOL / USDC. */
  ETH: number;
  SOL: number;
  "USDC-ETH": number;
  "USDC-SOL": number;
  fetchedAt: string;
  source: string;
  /** True when the engine is serving fallback rates (RPC unreachable). */
  fallback: boolean;
}

export interface PriceQuote {
  /** Plan price in AED (VAT-exclusive). */
  aed: number;
  /** Peg-derived USD amount. */
  usd: number;
  /** Crypto amount the payer sends, in whole tokens (not raw units). */
  tokenAmount: number;
  tokenKey: string;
  /** USD rate used for conversion. */
  rateUsd: number;
  /** Quote provenance + validity window. */
  rateSource: string;
  rateTimestamp: string;
  quoteExpiresAt: string;
}

/** Floor of reasonable sanity bounds for spot checks — guards against wild RPC answers. */
const SANITY: Record<string, [number, number]> = {
  ETH: [500, 20000],
  SOL: [20, 2000],
  "USDC-ETH": [0.9, 1.1],
  "USDC-SOL": [0.9, 1.1],
};

export function sanitizeRates(raw: { ETH?: unknown; SOL?: unknown; "USDC-ETH"?: unknown; "USDC-SOL"?: unknown }, source: string): SpotRates | null {
  const out: Partial<Record<string, number>> = {};
  for (const key of ["ETH", "SOL", "USDC-ETH", "USDC-SOL"] as const) {
    const v = Number(raw[key]);
    const [lo, hi] = SANITY[key];
    if (!Number.isFinite(v) || v < lo || v > hi) return null;
    out[key] = v;
  }
  return {
    ETH: out.ETH as number,
    SOL: out.SOL as number,
    "USDC-ETH": out["USDC-ETH"] as number,
    "USDC-SOL": out["USDC-SOL"] as number,
    fetchedAt: new Date().toISOString(),
    source,
    fallback: false,
  };
}

/**
 * Demo-grade fallback rates — used ONLY when the RPC rate fetch fails, always
 * labelled `fallback: true` + "indicative" in the UI so no one mistakes them
 * for a live market feed.
 */
export function fallbackRates(): SpotRates {
  return {
    ETH: 3150,
    SOL: 172,
    "USDC-ETH": 1,
    "USDC-SOL": 1,
    fetchedAt: new Date().toISOString(),
    source: "Seriesight indicative reference rates (RPC unavailable)",
    fallback: true,
  };
}

/** AED → USD through the peg. */
export function aedToUsd(aed: number): number {
  return round(aed / USD_AED_PEG, 2);
}

/** Quote one token amount for an AED price. */
export function quoteToken(aed: number, tokenKey: string, rates: SpotRates): PriceQuote {
  const usd = aedToUsd(aed);
  const rateUsd = rates[tokenKey as keyof SpotRates] as number;
  if (!Number.isFinite(rateUsd) || rateUsd <= 0) {
    throw new Error(`No usable rate for ${tokenKey}`);
  }
  const precision = tokenKey.startsWith("USDC") ? 2 : 6;
  const tokenAmount = round(usd / rateUsd, precision);
  const quoteExpiresAt = new Date(Date.now() + QUOTE_TTL_MINUTES * 60_000).toISOString();
  return {
    aed: round(aed, 2),
    usd,
    tokenAmount,
    tokenKey,
    rateUsd,
    rateSource: rates.source,
    rateTimestamp: rates.fetchedAt,
    quoteExpiresAt,
  };
}

/** Quote every supported token for an AED price (used by the checkout UI grid). */
export function quoteAll(aed: number, rates: SpotRates): PriceQuote[] {
  return (["ETH", "USDC-ETH", "SOL", "USDC-SOL"] as const).map((k) => quoteToken(aed, k, rates));
}

export function round(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/** Human on-chain terms line, e.g. "0.012842 ETH ≈ AED 149.00 (USD 40.58)". */
export function formatQuoteLine(q: PriceQuote): string {
  return `${q.tokenAmount} ${q.tokenKey} ≈ AED ${q.aed.toFixed(2)} (USD ${q.usd.toFixed(2)})`;
}
