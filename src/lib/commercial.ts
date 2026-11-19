/**
 * Public FAQ/how-to copy plus configuration used by experimental billing
 * prototypes. Plan values are not a supported public offer.
 */

export const SITE_URL = "https://seriesight.ae";
export const CONTACT_EMAIL = "hello@seriesight.ae";

export interface Plan {
  id: "scout" | "coach" | "org";
  name: string;
  tagline: string;
  audience: string;
  monthlyAED: number;
  annualAED: number;
  seats: string;
  featured?: boolean;
  features: string[];
  exclusions: string[];
}

export const PLANS: Plan[] = [
  {
    id: "scout",
    name: "Scout",
    tagline: "Evaluate the full methodology on the open fixture dataset.",
    audience: "Solo analysts and coaches trying Seriesight",
    monthlyAED: 0,
    annualAED: 0,
    seats: "1 seat",
    features: [
      "Command Center preparation overview",
      "Opponent Intelligence for one team",
      "Macro Atlas — all six objective modules",
      "Draft Room in Best-of-1",
      "Playbook, Player Hub and Practice Planner",
      "VOD Review with clip tagging",
      "Evidence Ledger (read-only provenance)",
      "Illustrative fixture dataset",
    ],
    exclusions: ["BO3/BO5 draft formats", "Fearless restriction ledger", "Series Lab simulation"],
  },
  {
    id: "coach",
    name: "Coach",
    tagline: "Everything a coaching staff needs for weekly series preparation.",
    audience: "Academy and tier-2 coaching staff",
    monthlyAED: 149,
    annualAED: 1490,
    seats: "3 seats included",
    featured: true,
    features: [
      "Everything in Scout, for every opponent in your league",
      "Draft Room BO1 / BO3 / BO5 with Hard, Soft and Standard Fearless",
      "Series Lab five-game simulation with counterfactual pick-swap",
      "Printable pre-match briefs from the Playbook",
      "Roster availability protocol and staff notifications",
      "Saved draft sessions with full audit trail",
      "Role policies and haptics preferences",
      "Email support, one business day response",
    ],
    exclusions: [],
  },
  {
    id: "org",
    name: "Organisation",
    tagline: "Data pipeline access and rollout support for full rosters.",
    audience: "Academies and esports organisations",
    monthlyAED: 449,
    annualAED: 4490,
    seats: "Unlimited seats",
    features: [
      "Everything in Coach",
      "GRID Open Access import pipeline (server-side adapter)",
      "Six-stage ingestion with circuit-breaker protection",
      "Per-workspace data retention controls",
      "Priority support, same-business-day response",
      "Guided onboarding session for your coaching staff",
    ],
    exclusions: [],
  },
];

export const TRIAL_DAYS = 14;


export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQS: FaqItem[] = [
  {
    question: "What is Seriesight?",
    answer: "Seriesight is a League of Legends pre-match coaching demo with opponent scouting, a versioned draft workspace, multi-game Fearless restrictions and evidence records. The public demo uses labelled fixture data.",
  },
  {
    question: "Can I buy a Seriesight subscription?",
    answer: "There is no supported public payment flow or paid subscription. The repository contains experimental unauthenticated billing APIs; do not use them with real funds or expose them to untrusted users. Contact the licensor about separate production-use authorization under the Business Source License 1.1.",
  },
  {
    question: "What does the demo data represent?",
    answer: "The demo uses independently authored fixture records for evaluation. They are illustrative, are not official competition results, and are not a live feed.",
  },
  {
    question: "Is the demo ready for a public multi-tenant deployment?",
    answer: "No. It does not provide authentication, workspace ownership checks, or HTTP rate limiting. Public deployment also requires outbound destination controls, monitoring, and tested backup and restore procedures.",
  },
  {
    question: "How do I explore the demo?",
    answer: "Open the fixture demo from the landing page. It does not require an account or password; browser storage is used for session preferences when available.",
  },
  {
    question: "What does the source license allow?",
    answer: "The repository uses the Business Source License 1.1. Redistribution and non-production use are governed by its terms; production use requires separate authorization before the change date. Read LICENSE for the exact parameters and terms.",
  },
  {
    question: "Does the demo include live data?",
    answer: "No. Any GRID provider access depends on deployment configuration and applicable data terms; the demo itself is labelled fixture data.",
  },
];

export interface HowToStep {
  name: string;
  text: string;
}

export const HOWTO_STEPS: HowToStep[] = [
  {
    name: "Enter the fixture workspace",
    text: "Open the demo without an account or password and note that its match data is illustrative.",
  },
  {
    name: "Inspect the evidence",
    text: "In the Command Center or Opponent Intelligence, open an evidence record to see the fixture source and covered games.",
  },
  {
    name: "Start a draft session",
    text: "Choose an opponent and series rules, then follow the action sequence and assign a role to each pick.",
  },
  {
    name: "Review series restrictions",
    text: "Finalize a complete game to lock it, then inspect how finalized picks affect later games under the selected Fearless rules.",
  },
  {
    name: "Read the deployment boundary",
    text: "Review the security documentation and BSL 1.1 terms before exposing the service publicly or using it in production.",
  },
];

export function planById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

export function formatAED(amount: number): string {
  if (amount === 0) return "AED 0";
  return `AED ${amount.toLocaleString("en-AE")}`;
}
