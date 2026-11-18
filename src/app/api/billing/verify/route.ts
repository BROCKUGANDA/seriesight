/**
 * Billing verify — POST /api/billing/verify
 * Verifies a claimed on-chain payment against chain RPC (Helius for Solana
 * signatures, JSON-RPC receipts for Ethereum). Verdicts: settled |
 * still_waiting | manual_review | failed — every outcome carries a human note.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, handler, parseBody } from "@/lib/api/respond";
import { verifyIntent } from "@/lib/billing/ledger";

export const dynamic = "force-dynamic";

const VerifySchema = z.object({
  paymentId: z.string().uuid(),
  txRef: z.string().trim().min(32).max(96),
});

export const POST = handler(async (req: NextRequest) => {
  const body = await parseBody(req, VerifySchema);
  const outcome = await verifyIntent(body.paymentId, body.txRef);
  return ok(outcome, req);
});
