"use client";

/**
 * Entitlements store — client-side billing lifecycle state.
 *
 * Persists to localStorage so a judge's trial/downgrade demo survives reloads.
 * The billing lifecycle is intentionally client-driven in this demo build
 * (the server-side ledger lives in the Prisma billing module); production
 * swaps `activatePaid` for the verified webhook handler without touching
 * call sites — the same seam pattern used by the auth store.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  computeEntitlement,
  featureEnabled,
  featureMapFor,
  quotaMapFor,
  quotaAllows,
  quotaFor,
  GRACE_HOURS,
  type BillingMode,
  type EntitlementSnapshot,
  type FeatureId,
  type PlanId,
  type UsageKey,
} from "@/lib/entitlements";

export { GRACE_HOURS };

interface EntitlementState {
  judge: boolean;
  billingMode: BillingMode;
  trialPlanId: PlanId | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  paidPlanId: PlanId | null;
  paidUntil: string | null;
  /** Demo clock offset (ms) — lets judges fast-forward to watch a downgrade. */
  demoClockOffsetMs: number;
  usage: Record<UsageKey, number>;
  usagePeriodStart: string;

  startTrial: (planId: PlanId, days: number) => void;
  activatePaid: (planId: PlanId, opts?: { months?: number }) => void;
  downgradeToScout: (opts?: { grace?: boolean }) => void;
  enterJudge: () => void;
  exitJudge: () => void;
  resetToFree: () => void;
  incrementUsage: (key: UsageKey, by?: number) => void;
  fastForwardDays: (days: number) => void;
  resetDemoClock: () => void;
}

const ZERO_USAGE: Record<UsageKey, number> = {
  draftSessions: 0,
  strategies: 0,
  clips: 0,
  practiceSessions: 0,
  opponents: 0,
};

function isoIn(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export const useEntitlementsStore = create<EntitlementState>()(
  persist(
    (set, get) => ({
      judge: false,
      billingMode: "free",
      trialPlanId: null,
      trialStartedAt: null,
      trialEndsAt: null,
      graceEndsAt: null,
      paidPlanId: null,
      paidUntil: null,
      demoClockOffsetMs: 0,
      usage: { ...ZERO_USAGE },
      usagePeriodStart: new Date().toISOString(),

      startTrial: (planId, days) =>
        set({
          judge: false,
          billingMode: "trial",
          trialPlanId: planId,
          trialStartedAt: new Date().toISOString(),
          trialEndsAt: isoIn(days),
          graceEndsAt: null,
          paidPlanId: null,
          paidUntil: null,
          usage: { ...ZERO_USAGE },
          usagePeriodStart: new Date().toISOString(),
        }),

      activatePaid: (planId, opts) =>
        set({
          judge: false,
          billingMode: "paid",
          paidPlanId: planId,
          paidUntil: isoIn(opts?.months ?? 1),
          trialPlanId: null,
          trialStartedAt: null,
          trialEndsAt: null,
          graceEndsAt: null,
          usage: { ...ZERO_USAGE },
          usagePeriodStart: new Date().toISOString(),
        }),

      downgradeToScout: (opts) =>
        set({
          billingMode: "free",
          trialPlanId: null,
          trialEndsAt: null,
          paidPlanId: null,
          paidUntil: null,
          // Temporary read-only allowance on the way down (default on).
          graceEndsAt: opts?.grace === false ? null : isoIn(GRACE_HOURS / 24),
        }),

      enterJudge: () => set({ judge: true, demoClockOffsetMs: 0 }),
      exitJudge: () => set({ judge: false }),

      resetToFree: () =>
        set({
          judge: false,
          billingMode: "free",
          trialPlanId: null,
          trialStartedAt: null,
          trialEndsAt: null,
          graceEndsAt: null,
          paidPlanId: null,
          paidUntil: null,
          usage: { ...ZERO_USAGE },
          usagePeriodStart: new Date().toISOString(),
        }),

      incrementUsage: (key, by = 1) => {
        const s = get();
        set({ usage: { ...s.usage, [key]: (s.usage[key] ?? 0) + by } });
      },

      fastForwardDays: (days) => set({ demoClockOffsetMs: get().demoClockOffsetMs + days * 86_400_000 }),
      resetDemoClock: () => set({ demoClockOffsetMs: 0 }),
    }),
    {
      name: "seriesight-entitlements",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);

/* ------------------------------------------------------------------ selector */

export interface EntitlementView extends EntitlementSnapshot {
  features: Record<FeatureId, boolean>;
  quotas: Record<UsageKey, number>;
  usage: Record<UsageKey, number>;
  /** Writable check for a feature (grace makes paid features read-only). */
  can: (f: FeatureId) => boolean;
  /** Writable check against the remaining quota; -1 quota = unlimited. */
  quotaAllows: (k: UsageKey, currentCount: number) => boolean;
  quotaLeft: (k: UsageKey, currentCount: number) => number;
  demoClockOffsetMs: number;
}

export function useEntitlement(): EntitlementView {
  const s = useEntitlementsStore();
  const nowMs = Date.now() + s.demoClockOffsetMs;
  const snapshot = computeEntitlement(
    {
      judge: s.judge,
      billingMode: s.billingMode,
      trialPlanId: s.trialPlanId,
      trialEndsAt: s.trialEndsAt,
      graceEndsAt: s.graceEndsAt,
      paidPlanId: s.paidPlanId,
      paidUntil: s.paidUntil,
    },
    nowMs,
  );
  const features = featureMapFor(snapshot);
  return {
    ...snapshot,
    features,
    quotas: quotaMapFor(snapshot),
    usage: s.usage,
    can: (f) => features[f] === true && featureEnabled(f, snapshot.effectivePlan),
    quotaAllows: (k, count) => quotaAllows(k, snapshot.effectivePlan, count),
    quotaLeft: (k, count) => {
      const q = quotaFor(k, snapshot.effectivePlan);
      return q === -1 ? -1 : Math.max(0, q - count);
    },
    demoClockOffsetMs: s.demoClockOffsetMs,
  };
}
