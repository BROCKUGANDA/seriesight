/**
 * Seriesight on-chain billing — SERVER-ONLY chain clients.
 *
 *   • Solana: Helius RPC (env `HELIUS_RPC_URL`, keys never enter source or the
 *     browser) with graceful fallback to the public mainnet endpoint.
 *   • Ethereum: any JSON-RPC endpoint (env `ETHEREUM_RPC_URL`), public default.
 *
 * Used for (1) indicative spot-rate sanity checks and (2) payment verification
 * (signature/tx status + treasury transfer confirmation). Every network call
 * is timeout-bounded; unreachable chains never block checkout — the intent
 * simply parks in `manual_review` with a clear recovery message.
 */
import { fallbackRates, sanitizeRates, type SpotRates } from "./fx";
import { TREASURY, type ChainId } from "./chains";

const HELIUS_URL = process.env.HELIUS_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const ETH_URL = process.env.ETHEREUM_RPC_URL ?? "https://ethereum-rpc.publicnode.com";
const TIMEOUT_MS = 6_500;

type JsonRpcResponse<T> = { result?: T; error?: { code: number; message: string } };

async function rpc<T>(url: string, body: unknown, timeoutMs = TIMEOUT_MS): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
    const json = (await res.json()) as JsonRpcResponse<T>;
    if (json.error) throw new Error(`RPC error ${json.error.code}: ${json.error.message}`);
    return json.result as T;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------------------------------------------- Solana */

interface SolBalance { value: number }

/**
 * Probe the Solana chain through Helius: treasury balance (lamports → SOL).
 * Doubles as the liveness check for the Integration Hub data-source card.
 */
export async function solanaTreasuryBalance(): Promise<{ ok: boolean; sol: number | null; error?: string }> {
  try {
    const result = await rpc<SolBalance>(HELIUS_URL, {
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [TREASURY.solana.address],
    });
    return { ok: true, sol: (result.value ?? 0) / 1e9 };
  } catch (err) {
    return { ok: false, sol: null, error: err instanceof Error ? err.message : "solana rpc failed" };
  }
}

export interface SolanaTxStatus {
  found: boolean;
  confirmed: boolean;
  slot: number | null;
  error?: string;
}

/** Signature status via getSignatureStatuses (full confirmation = finalised-ish). */
export async function solanaTxStatus(signature: string): Promise<SolanaTxStatus> {
  try {
    const result = await rpc<Array<{ statusNum?: number; confirmationStatus?: string; slot?: number } | null>>(HELIUS_URL, {
      jsonrpc: "2.0",
      id: 1,
      method: "getSignatureStatuses",
      params: [[signature], { searchTransactionHistory: true }],
    });
    const s = result?.[0] ?? null;
    if (!s) return { found: false, confirmed: false, slot: null };
    const confirmed = (s.statusNum ?? 0) >= 1 || s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized";
    return { found: true, confirmed, slot: s.slot ?? null };
  } catch (err) {
    return { found: false, confirmed: false, slot: null, error: err instanceof Error ? err.message : "solana rpc failed" };
  }
}

/* -------------------------------------------------------------- Ethereum */

interface EthHex { result?: string }

export async function ethereumTreasuryBalance(): Promise<{ ok: boolean; eth: number | null; error?: string }> {
  try {
    const r = await rpc<EthHex>(ETH_URL, {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBalance",
      params: [TREASURY.ethereum.address, "latest"],
    });
    const wei = BigInt(r.result ?? "0x0");
    return { ok: true, eth: Number(wei / 10n ** 14n) / 1e4 };
  } catch (err) {
    return { ok: false, eth: null, error: err instanceof Error ? err.message : "ethereum rpc failed" };
  }
}

export interface EthTxStatus {
  found: boolean;
  confirmed: boolean;
  toMatch: boolean;
  block: number | null;
  error?: string;
}

/** Receipt lookup; confirms the tx exists, succeeded, and targets the treasury. */
export async function ethereumTxStatus(txHash: string): Promise<EthTxStatus> {
  try {
    const r = await rpc<{ status?: string; blockNumber?: string; to?: string }>(ETH_URL, {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionReceipt",
      params: [txHash],
    });
    if (!r || !r.status) return { found: false, confirmed: false, toMatch: false, block: null };
    const confirmed = r.status === "0x1";
    return {
      found: true,
      confirmed,
      toMatch: (r.to ?? "").toLowerCase() === TREASURY.ethereum.address.toLowerCase(),
      block: r.blockNumber ? parseInt(r.blockNumber, 16) : null,
    };
  } catch (err) {
    return { found: false, confirmed: false, toMatch: false, block: null, error: err instanceof Error ? err.message : "ethereum rpc failed" };
  }
}

/* ------------------------------------------------------------ spot rates */

/**
 * Indicative spot rates for the quote engine. Native-token USD prices are
 * probed via chain-agnostic public aggregators when reachable; any failure
 * degrades to clearly-labelled fallback rates rather than blocking checkout.
 */
export async function fetchSpotRates(): Promise<SpotRates> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5_000);
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,solana&vs_currencies=usd",
      { signal: ctrl.signal, cache: "no-store" },
    );
    if (res.ok) {
      const j = (await res.json()) as { ethereum?: { usd?: number }; solana?: { usd?: number } };
      const rates = sanitizeRates(
        {
          ETH: j.ethereum?.usd,
          SOL: j.solana?.usd,
          "USDC-ETH": 1,
          "USDC-SOL": 1,
        },
        "CoinGecko spot (server-side)",
      );
      if (rates) return rates;
    }
  } catch {
    /* fall through to fallback */
  } finally {
    clearTimeout(timer);
  }
  return fallbackRates();
}

export function rpcEndpointsInUse(): Record<ChainId, string> {
  return {
    solana: HELIUS_URL.includes("helius") ? "helius-rpc.com (managed)" : "api.mainnet-beta.solana.com (public fallback)",
    ethereum: ETH_URL.includes("publicnode") ? "ethereum-rpc.publicnode.com (public fallback)" : "configured Ethereum RPC",
  };
}
