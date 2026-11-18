/**
 * Seriesight commercial data layer — single source of truth for pricing,
 * FAQs, company details and plan metadata. Imported by the marketing UI,
 * the trial dialog and the server-rendered JSON-LD (SEO/AEO) in layout.tsx,
 * so the visible copy and the machine-readable answers can never drift.
 *
 * All prices are in AED (United Arab Emirates dirham). 5% UAE VAT is quoted
 * separately. Gulf Standard Time (UTC+4) is the operating timezone.
 */

export const SITE_URL = "https://seriesight.ae";
export const CONTACT_EMAIL = "hello@seriesight.ae";
export const SALES_EMAIL = "sales@seriesight.ae";

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
      "17-series / 47-game fixture dataset",
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

export const PRICING_NOTES = [
  "All prices in UAE dirham (AED), exclusive of 5% UAE VAT.",
  `Every paid plan starts with a ${TRIAL_DAYS}-day free trial — no credit card required.`,
  "Cancel or switch plans any time from Workspace Settings.",
];

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQS: FaqItem[] = [
  {
    question: "What is Seriesight?",
    answer:
      "Seriesight is a League of Legends esports coaching platform that turns tournament history into pre-match preparation. It combines opponent scouting with evidence-backed tendencies, macro objective analytics, a deterministic Fearless Draft engine and a five-game Series Lab. It runs entirely in the browser on desktop, tablet and mobile.",
  },
  {
    question: "How much does Seriesight cost in the United Arab Emirates?",
    answer:
      "Plans start at AED 0 with the Scout tier. Coach costs AED 149 per month (or AED 1,490 per year) and Organisation costs AED 449 per month (or AED 4,490 per year), exclusive of 5% UAE VAT. Every paid plan starts with a 14-day free trial and no credit card is required.",
  },
  {
    question: "Is Seriesight available in the United Arab Emirates and MENA?",
    answer:
      "Yes. Seriesight is built and operated from Dubai, serves teams across the UAE and the wider MENA region, and prices in AED. The workspace runs in any modern browser, keeps Gulf Standard Time scheduling, and support is staffed on a one-business-day response commitment.",
  },
  {
    question: "Does Seriesight work on mobile and tablets?",
    answer:
      "Yes. Every workspace is designed mobile-first and is fully usable from 390-pixel phones through tablets to 1600-pixel desktops. Interactive elements meet a 44-pixel touch-target minimum, and Seriesight can be installed to a phone or tablet home screen as a Progressive Web App.",
  },
  {
    question: "How do I try the Seriesight demo as a judge?",
    answer:
      "Open the app and choose Judge demo access — one click signs you into a fully populated demo workspace with all twelve coaching workspaces unlocked. No form, no credit card, and the session stays on your device until you sign out.",
  },
  {
    question: "What is included in the coaching suite beyond analytics?",
    answer:
      "Beyond the analytics workspaces, Seriesight includes a strategy Playbook with printable pre-match briefs, a Player Hub for roster form and development goals, VOD Review for timestamped clip tagging, and a Practice Planner that schedules scrims, drills, veto meetings and film sessions on Gulf Standard Time.",
  },
  {
    question: "What is Fearless Draft and how does Seriesight support it?",
    answer:
      "Fearless Draft prevents champions picked in earlier games of a series from being picked again in later games. Seriesight supports Standard, Soft and Hard Fearless rulesets across BO1, BO3 and BO5 formats, tracks every restriction in a ledger, and simulates in the Series Lab how one game's picks reshape the options available in the next.",
  },
  {
    question: "Where does Seriesight's data come from?",
    answer:
      "The public demo runs on an independently authored fixture dataset of 17 series and 47 games, so the full product can be evaluated without a data licence. For production, Seriesight connects to GRID Open Access through a server-side provider adapter — credentials never reach the browser, and every statistic carries provenance in the Evidence Ledger.",
  },
  {
    question: "Does Seriesight work during live games?",
    answer:
      "No — by design. Seriesight is strictly a pre-match tool. It does not inject information into live games, lock picks, or replace the game client, which keeps coaching preparation compliant with competitive integrity rules.",
  },
];

export interface HowToStep {
  name: string;
  text: string;
}

export const HOWTO_STEPS: HowToStep[] = [
  {
    name: "Review the preparation brief",
    text: "Open the Command Center to see verified dataset metrics and the top-3 priority intelligence items for your next opponent.",
  },
  {
    name: "Scout the opponent",
    text: "In Opponent Intelligence, filter to the tournament, patch and side that matter, then read pick/ban frequencies with Wilson 95% confidence intervals and engine-detected tendencies.",
  },
  {
    name: "Simulate the draft",
    text: "Create a draft session in the Draft Room, play the pick/ban sequence for BO1, BO3 or BO5 under your Fearless ruleset, and assign roles to players.",
  },
  {
    name: "Pressure-test the series",
    text: "In the Series Lab, walk the five-game board, check the Fearless restriction ledger, and run the counterfactual simulator to see how swapping a pick reshapes game two.",
  },
  {
    name: "Finalize and share",
    text: "Finalize each game to lock the plan, export the evidence-backed brief, and walk the coaching staff through the priorities before ban phase.",
  },
];

export const COMPANY = {
  name: "Seriesight FZ-LLC",
  legalName: "Seriesight FZ-LLC",
  city: "Dubai",
  region: "Dubai",
  country: "United Arab Emirates",
  countryCode: "AE",
  addressLine: "Dubai Silicon Oasis, DDP, Building A2",
  postalCode: "00000",
  timezone: "Gulf Standard Time (UTC+4)",
  founded: "2026",
} as const;

export function planById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

export function formatAED(amount: number): string {
  if (amount === 0) return "AED 0";
  return `AED ${amount.toLocaleString("en-AE")}`;
}
