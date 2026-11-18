/**
 * Billing production controller — emits settlement and reversal events on the
 * integration bus. Revenue-ops webhooks, the warehouse sink and staff
 * notifications subscribe without any coupling to the billing module itself.
 */
import { publishAndDispatch, newCorrelationId } from "../bus";
import type { IntegrationEvent, DispatchOutcome } from "../types";

export async function emitPaymentSettled(input: {
  paymentId: string;
  planId: string;
  period: string;
  chain: string;
  token: string;
  aedAmount: number;
  tokenAmount: number;
  demo: boolean;
}): Promise<{ event: IntegrationEvent; outcome: DispatchOutcome }> {
  return publishAndDispatch({
    topic: "commercial.payment.settled",
    source: "controller:billing",
    correlationId: newCorrelationId(),
    payload: {
      paymentId: input.paymentId,
      planId: input.planId,
      period: input.period,
      chain: input.chain,
      token: input.token,
      aedAmount: input.aedAmount,
      tokenAmount: input.tokenAmount,
      demo: input.demo,
      settledAt: new Date().toISOString(),
    },
  });
}

export async function emitPaymentRefunded(input: {
  paymentId: string;
  reversalId: string;
  scope: string;
  aedAmount: number;
  tokenAmount: number;
  token: string;
  reason: string;
}): Promise<{ event: IntegrationEvent; outcome: DispatchOutcome }> {
  return publishAndDispatch({
    topic: "commercial.payment.refunded",
    source: "controller:billing",
    correlationId: newCorrelationId(),
    payload: {
      paymentId: input.paymentId,
      reversalId: input.reversalId,
      scope: input.scope,
      aedAmount: input.aedAmount,
      tokenAmount: input.tokenAmount,
      token: input.token,
      reason: input.reason,
      refundedAt: new Date().toISOString(),
    },
  });
}
