/**
 * Seriesight entitlements — the single source of truth that maps commercial
 * plans (see `@/lib/commercial`) to concrete product capabilities and usage
 * quotas, and computes the effective entitlement for any billing state.
 *
 * Model:
 *   • Judge demo sessions are evaluation overrides: everything unlocked,
 *     nothing persisted commercially, purpose-built for competition judges.
 *   • The 14-day trial is a TEMPORARY ALLOWANCE: it grants the full feature
 *     set of the selected paid plan for TRIAL_DAYS, no card required.
 *   • When a trial ends the account is DOWNGRADED to Scout (free). A short
 *     GRACE_DAYS window keeps paid features readable (read-only) so a coaching
 *     staff never loses their series prep mid-week — after that, paid
 *     capabilities lock and only Scout features remain writable.
 *   • Paid plans (monthly/annual, card or on-chain) map 1:1 to the plan matrix.
 *
 * This module is pure and import-safe from both client and server code.
 */

export type PlanId = "scout" | "coach" | "org";

export type BillingMode = "free" | "trial" | "paid";

export type EntitlementStatus =
  | "judge" // judge demo override — full access, ephemeral
  | "trial" // inside the 14-day temporary allowance
  | "grace" // trial ended, read-only temporary allowance before downgrade
  | "active" // paying customer (or post-downgrade on Scout: "free")
  | "free"; // Scout / expired / no billing

/* ------------------------------------------------------------------ features */

/** Feature identifiers gated by plan. Labels are user-facing copy. */
export const FEATURES = {
  "scouting.multi-opponent": {
    label: "Opponent Intelligence for every team in your league",
    plans: ["coach", "org"] as PlanId[],
    scope: "workspace",
  },
  "draft.format-bo3": {
    label: "Draft Room best-of-three format",
    plans: ["coach", "org"] as PlanId[],
    scope: "workspace",
  },
  "draft.format-bo5": {
    label: "Draft Room best-of-five format",
    plans: ["coach", "org"] as PlanId[],
    scope: "workspace",
  },
  "draft.fearless-ledger": {
    label: "Fearless restriction ledger across games",
    plans: ["coach", "org"] as PlanId[],
    scope: "workspace",
  },
  "series-lab.simulation": {
    label: "Series Lab five-game simulation and counterfactuals",
    plans: ["coach", "org"] as PlanId[],
    scope: "workspace",
  },
  "playbook.print-brief": {
    label: "Printable pre-match briefs from the Playbook",
    plans: ["coach", "org"] as PlanId[],
    scope: "workspace",
  },
  "player-hub.availability-protocol": {
    label: "Roster availability protocol and staff notifications",
    plans: ["coach", "org"] as PlanId[],
    scope: "workspace",
  },
  "org.grid-pipeline": {
    label: "GRID Open Access import pipeline (server-side adapter)",
    plans: ["org"] as PlanId[],
    scope: "workspace",
  },
  "org.retention-controls": {
    label: "Per-workspace data retention controls",
    plans: ["org"] as PlanId[],
    scope: "workspace",
  },
} as const;

export type FeatureId = keyof typeof FEATURES;

/** Scout features are always present; the matrix above adds paid features. */
export const SCOUT_FEATURES: FeatureId[] = [];

/* -------------------------------------------------------------------- quotas */

/** Usage keys counted per billing period (or lifetime for content items). */
export type UsageKey = "draftSessions" | "strategies" | "clips" | "practiceSessions" | "opponents";

export const USAGE_LABELS: Record<UsageKey, string> = {
  draftSessions: "Draft sessions",
  strategies: "Playbook strategies",
  clips: "VOD clips",
  practiceSessions: "Practice sessions",
  opponents: "Opponents tracked",
};

/** -1 means unlimited. Values mirror the commercial plan copy exactly. */
export const QUOTAS: Record<PlanId, Record<UsageKey, number>> = {
  scout: {
    draftSessions: 6,
    strategies: 5,
    clips: 10,
    practiceSessions: 8,
    opponents: 1,
  },
  coach: {
    draftSessions: -1,
    strategies: 50,
    clips: 200,
    practiceSessions: -1,
    opponents: -1,
  },
  org: {
    draftSessions: -1,
    strategies: -1,
    clips: -1,
    practiceSessions: -1,
    opponents: -1,
  },
};

/* ------------------------------------------------------------------ lifecycle */

export const GRACE_DAYS = 3;
export const GRACE_HOURS = GRACE_DAYS * 24;

export interface EntitlementInput {
  judge: boolean;
  billingMode: BillingMode;
  /** Plan the trial temporarily unlocks. */
  trialPlanId: PlanId | null;
  trialEndsAt: string | null;
  /** Read-only temporary allowance window after the trial ends. */
  graceEndsAt: string | null;
  paidPlanId: PlanId | null;
  paidUntil: string | null;
}

export interface EntitlementSnapshot {
  status: EntitlementStatus;
  /** The plan whose feature matrix + quotas currently apply. */
  effectivePlan: PlanId;
  /** True when paid capabilities render but must stay read-only. */
  readOnlyPaid: boolean;
  trialDaysLeft: number | null;
  graceHoursLeft: number | null;
  paidDaysLeft: number | null;
  /** Short user-facing status line for chips and settings. */
  statusLabel: string;
  /** True when paid features are fully unlocked and writable. */
  paidUnlocked: boolean;
}

export function computeEntitlement(input: EntitlementInput, nowMs: number): EntitlementSnapshot {
  const trialEnds = input.trialEndsAt ? Date.parse(input.trialEndsAt) : null;
  const graceEnds = input.graceEndsAt ? Date.parse(input.graceEndsAt) : null;
  const paidUntil = input.paidUntil ? Date.parse(input.paidUntil) : null;

  // 1. Judge demo — evaluation override, full access, never persisted.
  if (input.judge) {
    return {
      status: "judge",
      effectivePlan: "org",
      readOnlyPaid: false,
      trialDaysLeft: null,
      graceHoursLeft: null,
      paidDaysLeft: null,
      statusLabel: "Judge demo — full platform access",
      paidUnlocked: true,
    };
  }

  // 2. Paid plan.
  if (input.billingMode === "paid" && input.paidPlanId) {
    if (paidUntil === null || paidUntil > nowMs) {
      const paidDaysLeft = paidUntil === null ? null : Math.max(0, Math.ceil((paidUntil - nowMs) / 86_400_000));
      return {
        status: "active",
        effectivePlan: input.paidPlanId,
        readOnlyPaid: false,
        trialDaysLeft: null,
        graceHoursLeft: null,
        paidDaysLeft,
        statusLabel: `${planName(input.paidPlanId)} plan — active`,
        paidUnlocked: true,
      };
    }
    // A paid period that lapsed behaves like an expired trial: downgrade with grace.
    return computeDowngraded(nowMs, graceEnds, "Your billing period ended — downgraded to Scout.");
  }

  // 3. Trial — temporary allowance of the selected plan's full feature set.
  if (input.billingMode === "trial" && trialEnds !== null) {
    if (trialEnds > nowMs) {
      const daysLeft = Math.max(0, Math.ceil((trialEnds - nowMs) / 86_400_000));
      return {
        status: "trial",
        effectivePlan: input.trialPlanId ?? "coach",
        readOnlyPaid: false,
        trialDaysLeft: daysLeft,
        graceHoursLeft: null,
        paidDaysLeft: null,
        statusLabel: `${planName(input.trialPlanId ?? "coach")} trial — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
        paidUnlocked: true,
      };
    }
    return computeDowngraded(nowMs, graceEnds, "Trial ended — downgraded to Scout.");
  }

  // 4. Everything else: Scout (free) or a stale grace window.
  return computeDowngraded(nowMs, graceEnds, null);
}

function computeDowngraded(nowMs: number, graceEnds: number | null, note: string | null): EntitlementSnapshot {
  if (graceEnds !== null && graceEnds > nowMs) {
    const hoursLeft = Math.max(1, Math.ceil((graceEnds - nowMs) / 3_600_000));
    return {
      status: "grace",
      effectivePlan: "coach", // paid features visible read-only during the allowance
      readOnlyPaid: true,
      trialDaysLeft: null,
      graceHoursLeft: hoursLeft,
      paidDaysLeft: null,
      statusLabel: `${note ? `${note} ` : ""}Read-only allowance: ${hoursLeft} h left`,
      paidUnlocked: false,
    };
  }
  return {
    status: "free",
    effectivePlan: "scout",
    readOnlyPaid: false,
    trialDaysLeft: null,
    graceHoursLeft: null,
    paidDaysLeft: null,
    statusLabel: "Scout plan — free forever",
    paidUnlocked: false,
  };
}

export function planName(id: PlanId): string {
  return id === "scout" ? "Scout" : id === "coach" ? "Coach" : "Organisation";
}

/* ------------------------------------------------------------------ helpers */

/** Feature availability for a plan, ignoring trial/grace state. */
export function featureEnabled(feature: FeatureId, plan: PlanId): boolean {
  return (FEATURES[feature].plans as readonly PlanId[]).includes(plan);
}

/** Quota for a usage key; -1 = unlimited. */
export function quotaFor(key: UsageKey, plan: PlanId): number {
  return QUOTAS[plan][key];
}

export function quotaAllows(key: UsageKey, plan: PlanId, currentCount: number): boolean {
  const q = quotaFor(key, plan);
  return q === -1 || currentCount < q;
}

export function formatQuota(key: UsageKey, plan: PlanId): string {
  const q = quotaFor(key, plan);
  return q === -1 ? "Unlimited" : `${q}`;
}

/** Full effective feature map for a snapshot (used by gates and settings). */
export function featureMapFor(snapshot: EntitlementSnapshot): Record<FeatureId, boolean> {
  const map = {} as Record<FeatureId, boolean>;
  for (const id of Object.keys(FEATURES) as FeatureId[]) {
    map[id] = snapshot.paidUnlocked && featureEnabled(id, snapshot.effectivePlan);
  }
  return map;
}

export function quotaMapFor(snapshot: EntitlementSnapshot): Record<UsageKey, number> {
  const map = {} as Record<UsageKey, number>;
  for (const key of Object.keys(QUOTAS[snapshot.effectivePlan]) as UsageKey[]) {
    map[key] = quotaFor(key, snapshot.effectivePlan);
  }
  return map;
}
