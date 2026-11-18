/**
 * Seriesight on-chain billing — chain & treasury configuration.
 *
 * Client-safe module (no secrets). Treasury wallets are public receiving
 * addresses. RPC endpoints that carry API keys live in server-only modules
 * (`rpc.ts`) and are injected via environment variables.
 *
 * Supported settlement:
 *   • Ethereum mainnet — native ETH and USD Coin (ERC-20, 6 decimals)
 *   • Solana mainnet   — native SOL and USD Coin (SPL, 6 decimals), via Helius RPC
 *
 * All fiat amounts are quoted in AED (UAE dirham); USD is derived through the
 * official USD/AED peg and crypto units through the in-app quote engine (fx.ts).
 */

export type ChainId = "ethereum" | "solana";

export type TokenKey = "ETH" | "SOL" | "USDC-ETH" | "USDC-SOL";

export interface TokenInfo {
  key: TokenKey;
  label: string;
  chain: ChainId;
  decimals: number;
  settlement: "native" | "stable";
  description: string;
}

export const TREASURY: Record<ChainId, { address: string; label: string; scanLabel: string }> = {
  ethereum: {
    address: "0x9cb57c0dAF38462447509998647eD06488CBeBf8",
    label: "Seriesight treasury (Ethereum mainnet)",
    scanLabel: "etherscan.io",
  },
  solana: {
    address: "FzTU9xbifKJUKfigi7LvAsmm3vCtxSLcw9SuPrAoY6Uq",
    label: "Seriesight treasury (Solana mainnet)",
    scanLabel: "solscan.io",
  },
};

export const TOKENS: TokenInfo[] = [
  {
    key: "ETH",
    label: "ETH",
    chain: "ethereum",
    decimals: 18,
    settlement: "native",
    description: "Ethereum native coin — settlement gas paid by the sender.",
  },
  {
    key: "USDC-ETH",
    label: "USDC (ERC-20)",
    chain: "ethereum",
    decimals: 6,
    settlement: "stable",
    description: "USD Coin on Ethereum — stable settlement, 1 USDC ≈ USD 1.",
  },
  {
    key: "SOL",
    label: "SOL",
    chain: "solana",
    decimals: 9,
    settlement: "native",
    description: "Solana native coin — sub-cent network fees, Helius RPC settlement.",
  },
  {
    key: "USDC-SOL",
    label: "USDC (SPL)",
    chain: "solana",
    decimals: 6,
    settlement: "stable",
    description: "USD Coin on Solana — stable settlement, 1 USDC ≈ USD 1.",
  },
];

export const CHAIN_LABELS: Record<ChainId, string> = {
  ethereum: "Ethereum",
  solana: "Solana",
};

export function tokenByKey(key: TokenKey): TokenInfo {
  const t = TOKENS.find((t) => t.key === key);
  if (!t) throw new Error(`Unknown token: ${key}`);
  return t;
}

export function explorerAddressUrl(chain: ChainId): string {
  return chain === "ethereum"
    ? `https://etherscan.io/address/${TREASURY.ethereum.address}`
    : `https://solscan.io/account/${TREASURY.solana.address}`;
}

export function explorerTxUrl(chain: ChainId, txRef: string): string {
  return chain === "ethereum"
    ? `https://etherscan.io/tx/${txRef}`
    : `https://solscan.io/tx/${txRef}`;
}

/** Regexp shapes for client-side sanity checks before a server verification call. */
export const TXREF_SHAPE: Record<ChainId, RegExp> = {
  ethereum: /^0x[0-9a-fA-F]{64}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,96}$/,
};

/** Segmented display helper — long addresses stay readable + copyable. */
export function shortAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}
