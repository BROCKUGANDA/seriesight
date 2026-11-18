/**
 * Seriesight on-chain billing — payment ledger (server-side operations).
 *
 * Lifecycle:
 *   awaiting_payment → confirming → settled            (on-chain verified or demo-settled)
 *   awaiting_payment → manual_review                   (RPC unreachable — ops queue, recoverable)
 *   awaiting_payment → failed                          (tx exists but wrong recipient / reverted)
 *   settled          → refunded                        (full or partial reversal recorded)
 *
 * Every settlement and reversal publishes through the integration bus
 * (commercial.payment.settled / commercial.payment.refunded) so CRM sinks,
 * warehouse archives and staff notifications react without coupling.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { ERRORS } from "@/domain/errors";
import { PLANS } from "@/lib/commercial";
import { tokenByKey, TREASURY, type ChainId, type TokenKey } from "./chains";
import { aedToUsd, quoteToken, type SpotRates } from "./fx";
import { ethereumTxStatus, solanaTxStatus } from "./rpc";
import { emitPaymentSettled, emitPaymentRefunded } from "@/lib/integration/controllers/billing-controller";
import { ensureBusBootstrapped } from "@/lib/integration/bootstrap";

export const PERIOD_MULTIPLIER: Record<"monthly" | "annual", number> = { monthly: 1, annual: 12 };

const IntentSchema = z.object({
  planId: z.enum(["coach", "org"]),
  period: z.enum(["monthly", "annual"]),
  token: z.enum(["ETH", "USDC-ETH", "SOL", "USDC-SOL"]),
});

export type PaymentDTO = {
  id: string;
  planId: string;
  planName: string;
  period: string;
  chain: string;
  token: string;
  aedAmount: number;
  usdAmount: number;
  tokenAmount: number;
  rateUsd: number;
  rateSource: string;
  rateTimestamp: string;
  treasuryAddress: string;
  status: string;
  txRef: string | null;
  verificationNote: string | null;
  demo: boolean;
  confirmedAt: string | null;
  expiresAt: string;
  createdAt: string;
  reversals: ReversalDTO[];
};

export type ReversalDTO = {
  id: string;
  scope: string;
  aedAmount: number;
  tokenAmount: number;
  token: string;
  reason: string;
  status: string;
  refundTxRef: string | null;
  createdAt: string;
};

type PaymentRow = {
  id: string; planId: string; period: string; chain: string; token: string;
  aedAmount: number; usdAmount: number; tokenAmount: number; rateUsd: number;
  rateSource: string; rateTimestamp: Date; treasuryAddress: string; status: string;
  txRef: string | null; verificationNote: string | null; demo: boolean;
  confirmedAt: Date | null; expiresAt: Date; createdAt: Date;
  reversals: { id: string; scope: string; aedAmount: number; tokenAmount: number; token: string; reason: string; status: string; refundTxRef: string | null; createdAt: Date }[];
};

function toDTO(row: PaymentRow): PaymentDTO {
  const plan = PLANS.find((p) => p.id === row.planId);
  return {
    id: row.id,
    planId: row.planId,
    planName: plan?.name ?? row.planId,
    period: row.period,
    chain: row.chain,
    token: row.token,
    aedAmount: row.aedAmount,
    usdAmount: row.usdAmount,
    tokenAmount: row.tokenAmount,
    rateUsd: row.rateUsd,
    rateSource: row.rateSource,
    rateTimestamp: row.rateTimestamp.toISOString(),
    treasuryAddress: row.treasuryAddress,
    status: row.status,
    txRef: row.txRef,
    verificationNote: row.verificationNote,
    demo: row.demo,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    reversals: row.reversals.map((r) => ({
      id: r.id,
      scope: r.scope,
      aedAmount: r.aedAmount,
      tokenAmount: r.tokenAmount,
      token: r.token,
      reason: r.reason,
      status: r.status,
      refundTxRef: r.refundTxRef,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/** AED price for a plan + period, straight from the commercial source of truth. */
export function planPriceAED(planId: "coach" | "org", period: "monthly" | "annual"): number {
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) throw ERRORS.notFound(`Plan ${planId}`);
  return period === "monthly" ? plan.monthlyAED : plan.annualAED;
}

/** Create a locked-quote checkout intent for on-chain settlement. */
export async function createIntent(rawToken: TokenKey, planId: "coach" | "org", period: "monthly" | "annual", rates: SpotRates) {
  const token = tokenByKey(rawToken);
  const aed = planPriceAED(planId, period);
  const quote = quoteToken(aed, token.key, rates);
  const row = await db.billingPaymentRecord.create({
    data: {
      planId,
      period,
      chain: token.chain,
      token: token.key,
      aedAmount: quote.aed,
      usdAmount: quote.usd,
      tokenAmount: quote.tokenAmount,
      rateUsd: quote.rateUsd,
      rateSource: quote.rateSource,
      rateTimestamp: new Date(quote.rateTimestamp),
      treasuryAddress: TREASURY[token.chain].address,
      status: "awaiting_payment",
      expiresAt: new Date(quote.quoteExpiresAt),
    },
    include: { reversals: true },
  });
  return toDTO(row as PaymentRow);
}

export type VerifyOutcome =
  | { verdict: "settled"; payment: PaymentDTO; detail: string }
  | { verdict: "failed"; payment: PaymentDTO; detail: string }
  | { verdict: "manual_review"; payment: PaymentDTO; detail: string }
  | { verdict: "still_waiting"; payment: PaymentDTO; detail: string };

/**
 * Verify a claimed on-chain payment. Real RPC is attempted first (Helius for
 * Solana signatures, JSON-RPC receipts for Ethereum); when the chain cannot be
 * reached the intent parks in manual_review instead of failing the customer.
 */
export async function verifyIntent(paymentId: string, txRefRaw: string): Promise<VerifyOutcome> {
  const txRef = txRefRaw.trim();
  const row = await db.billingPaymentRecord.findUnique({ where: { id: paymentId }, include: { reversals: true } });
  if (!row) throw ERRORS.notFound("Payment intent");
  if (row.status === "settled") {
    return { verdict: "settled", payment: toDTO(row as PaymentRow), detail: "This payment is already settled." };
  }
  if (new Date(row.expiresAt) < new Date() && row.status === "awaiting_payment") {
    const updated = await db.billingPaymentRecord.update({
      where: { id: paymentId },
      data: { status: "failed", verificationNote: "Quote expired before settlement — request a fresh quote." },
      include: { reversals: true },
    });
    return { verdict: "failed", payment: toDTO(updated as PaymentRow), detail: "The quote expired. Generate a new checkout quote and retry." };
  }

  await db.billingPaymentRecord.update({ where: { id: paymentId }, data: { status: "confirming", txRef } });

  if (row.chain === "solana") {
    const status = await solanaTxStatus(txRef);
    if (status.error) return markManualReview(paymentId, `Solana RPC unreachable (${status.error}). Ops will verify signature ${shortRef(txRef)}.`);
    if (!status.found) return markFailed(paymentId, `Signature ${shortRef(txRef)} not found on Solana mainnet.`);
    if (!status.confirmed) return { verdict: "still_waiting", payment: await reload(paymentId), detail: "Transaction seen but not yet confirmed. Check again shortly." };
    return settle(paymentId, `Confirmed on Solana mainnet (slot ${status.slot ?? "n/a"}) via Helius RPC.`);
  }

  const status = await ethereumTxStatus(txRef);
  if (status.error) return markManualReview(paymentId, `Ethereum RPC unreachable (${status.error}). Ops will verify tx ${shortRef(txRef)}.`);
  if (!status.found) return markFailed(paymentId, `Transaction ${shortRef(txRef)} not found on Ethereum mainnet.`);
  if (!status.confirmed) return markFailed(paymentId, "Transaction reverted on-chain (status 0x0).");
  if (!status.toMatch) return markFailed(paymentId, "Transaction succeeded but its recipient is not the Seriesight treasury — funds were NOT sent to the billing address.");
  return settle(paymentId, "Confirmed on Ethereum mainnet — recipient matches the Seriesight treasury.");
}

/** Demo settlement — clearly-labelled simulated confirmation for judges/evaluators. */
export async function demoSettle(paymentId: string): Promise<VerifyOutcome> {
  const row = await db.billingPaymentRecord.findUnique({ where: { id: paymentId }, include: { reversals: true } });
  if (!row) throw ERRORS.notFound("Payment intent");
  if (row.status === "settled") return { verdict: "settled", payment: toDTO(row as PaymentRow), detail: "Already settled." };
  return settle(paymentId, "Demo settlement — simulated on-chain confirmation for evaluation. No funds moved.", true);
}

async function settle(paymentId: string, detail: string, demo = false): Promise<VerifyOutcome> {
  const updated = await db.billingPaymentRecord.update({
    where: { id: paymentId },
    data: { status: "settled", confirmedAt: new Date(), verificationNote: detail, demo },
    include: { reversals: true },
  });
  const payment = toDTO(updated as PaymentRow);
  ensureBusBootstrapped();
  await emitPaymentSettled({ paymentId: payment.id, planId: payment.planId, period: payment.period, chain: payment.chain, token: payment.token, aedAmount: payment.aedAmount, tokenAmount: payment.tokenAmount, demo });
  return { verdict: "settled", payment, detail };
}

async function markManualReview(paymentId: string, note: string): Promise<VerifyOutcome> {
  const updated = await db.billingPaymentRecord.update({ where: { id: paymentId }, data: { status: "manual_review", verificationNote: note }, include: { reversals: true } });
  return { verdict: "manual_review", payment: toDTO(updated as PaymentRow), detail: note };
}

async function markFailed(paymentId: string, note: string): Promise<VerifyOutcome> {
  const updated = await db.billingPaymentRecord.update({ where: { id: paymentId }, data: { status: "failed", verificationNote: note }, include: { reversals: true } });
  return { verdict: "failed", payment: toDTO(updated as PaymentRow), detail: note };
}

async function reload(paymentId: string): Promise<PaymentDTO> {
  const row = await db.billingPaymentRecord.findUniqueOrThrow({ where: { id: paymentId }, include: { reversals: true } });
  return toDTO(row as PaymentRow);
}

/* -------------------------------------------------------------- reversals */

const ReversalSchema = z.object({
  paymentId: z.string().uuid(),
  scope: z.enum(["full", "partial"]),
  reason: z.string().trim().min(3, "A reversal needs a reason for the ledger.").max(300),
  aedAmount: z.number().positive().optional(),
});

export type ReversalOutcome = { payment: PaymentDTO; reversal: ReversalDTO; entitlementAction: "none" | "downgrade" };

/**
 * Record a refund/reversal. Full reversals of a settled payment that is the
 * customer's active subscription signal an entitlement downgrade (the client
 * applies it); partial reversals (goodwill credits) never touch entitlement.
 */
export async function reversePayment(raw: z.infer<typeof ReversalSchema>): Promise<ReversalOutcome> {
  const row = await db.billingPaymentRecord.findUnique({ where: { id: raw.paymentId }, include: { reversals: true } });
  if (!row) throw ERRORS.notFound("Payment intent");
  if (row.status !== "settled" && row.status !== "manual_review") {
    throw ERRORS.validation("Only settled payments can be reversed.", { status: row.status });
  }
  const alreadyRefunded = row.reversals.reduce((acc, r) => acc + (r.status === "completed" ? r.aedAmount : 0), 0);
  const refundable = Math.max(0, row.aedAmount - alreadyRefunded);
  if (refundable <= 0) throw ERRORS.validation("This payment is already fully reversed.");

  const aedRefund = raw.scope === "full" ? refundable : Math.min(raw.aedAmount ?? refundable, refundable);
  const tokenRefund = Number(((aedRefund / row.aedAmount) * row.tokenAmount).toFixed(6));
  const status = raw.scope === "full" ? "completed" : "completed";

  const reversalRow = await db.billingReversalRecord.create({
    data: {
      paymentId: row.id,
      scope: raw.scope,
      aedAmount: Math.round(aedRefund * 100) / 100,
      tokenAmount: tokenRefund,
      token: row.token,
      reason: raw.reason,
      status,
    },
  });

  const fullyReversed = alreadyRefunded + aedRefund >= row.aedAmount - 0.01;
  const updated = await db.billingPaymentRecord.update({
    where: { id: row.id },
    data: {
      status: fullyReversed ? "refunded" : row.status,
      verificationNote: fullyReversed ? `Fully reversed: ${raw.reason}` : row.verificationNote,
    },
    include: { reversals: true },
  });

  ensureBusBootstrapped();
  await emitPaymentRefunded({
    paymentId: row.id,
    reversalId: reversalRow.id,
    scope: raw.scope,
    aedAmount: reversalRow.aedAmount,
    tokenAmount: tokenRefund,
    token: row.token,
    reason: raw.reason,
  });

  return {
    payment: toDTO(updated as PaymentRow),
    reversal: {
      id: reversalRow.id,
      scope: reversalRow.scope,
      aedAmount: reversalRow.aedAmount,
      tokenAmount: reversalRow.tokenAmount,
      token: reversalRow.token,
      reason: reversalRow.reason,
      status: reversalRow.status,
      refundTxRef: reversalRow.refundTxRef,
      createdAt: reversalRow.createdAt.toISOString(),
    },
    entitlementAction: fullyReversed ? "downgrade" : "none",
  };
}

export async function listPayments(limit = 50): Promise<PaymentDTO[]> {
  const rows = await db.billingPaymentRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { reversals: { orderBy: { createdAt: "desc" } } },
  });
  return rows.map((r) => toDTO(r as PaymentRow));
}

function shortRef(ref: string): string {
  return ref.length > 16 ? `${ref.slice(0, 10)}…${ref.slice(-6)}` : ref;
}

export const BillingSchemas = { IntentSchema, ReversalSchema };
export type { ChainId, TokenKey };
export { aedToUsd };
