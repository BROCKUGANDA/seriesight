/**
 * Client-side billing API helpers. Uniform envelope unwrapping, typed.
 */
import type { PaymentDTO, ReversalDTO } from "@/lib/billing/ledger";

export type BillingPayment = PaymentDTO;
export type BillingReversal = ReversalDTO;

export interface QuoteResponse {
  planId: "coach" | "org";
  period: "monthly" | "annual";
  aed: number;
  usd: number;
  usdAedPeg: number;
  quotes: {
    aed: number;
    usd: number;
    tokenAmount: number;
    tokenKey: string;
    rateUsd: number;
    rateSource: string;
    rateTimestamp: string;
    quoteExpiresAt: string;
  }[];
  rates: { source: string; fetchedAt: string; fallback: boolean };
}

export type VerifyVerdict = "settled" | "failed" | "manual_review" | "still_waiting";

export interface VerifyResponse {
  verdict: VerifyVerdict;
  payment: BillingPayment;
  detail: string;
}

export interface ReversalResponse {
  payment: BillingPayment;
  reversal: BillingReversal;
  entitlementAction: "none" | "downgrade";
}

export interface BillingConfigResponse {
  treasury: Record<"ethereum" | "solana", { address: string; explorer: string }>;
  tokens: { key: string; label: string; chain: "ethereum" | "solana"; settlement: string; description: string }[];
  rates: { usdPer: Record<string, number>; fetchedAt: string; source: string; fallback: boolean };
  quoteTtlMinutes: number;
  usdAedPeg: number;
}

async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok || !body?.success) {
    const message = body?.error?.message ?? "The billing service returned an error.";
    const recovery = body?.error?.recovery ? ` ${body.error.recovery}` : "";
    throw new Error(`${message}${recovery}`);
  }
  return body.data as T;
}

async function post<T>(url: string, json: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
  });
  return unwrap<T>(res);
}

export const billingApi = {
  config: async (): Promise<BillingConfigResponse> => {
    const res = await fetch("/api/billing/config", { cache: "no-store" });
    return unwrap<BillingConfigResponse>(res);
  },
  quote: (planId: "coach" | "org", period: "monthly" | "annual"): Promise<QuoteResponse> =>
    post<QuoteResponse>("/api/billing/quote", { planId, period }),
  intent: (planId: "coach" | "org", period: "monthly" | "annual", token: string): Promise<{ payment: BillingPayment }> =>
    post<{ payment: BillingPayment }>("/api/billing/intent", { planId, period, token }),
  verify: (paymentId: string, txRef: string): Promise<VerifyResponse> =>
    post<VerifyResponse>("/api/billing/verify", { paymentId, txRef }),
  demoSettle: (paymentId: string): Promise<VerifyResponse> =>
    post<VerifyResponse>("/api/billing/demo-settle", { paymentId }),
  reversal: (paymentId: string, scope: "full" | "partial", reason: string, aedAmount?: number): Promise<ReversalResponse> =>
    post<ReversalResponse>("/api/billing/reversal", { paymentId, scope, reason, aedAmount }),
  payments: async (): Promise<{ payments: BillingPayment[] }> => {
    const res = await fetch("/api/billing/payments", { cache: "no-store" });
    return unwrap<{ payments: BillingPayment[] }>(res);
  },
};
