"use client";

/**
 * Legal documents (hash routes #/terms and #/privacy).
 * UAE-aligned commercial copy: Dubai governing law, 5% VAT handling,
 * data-residency commitments and a plain-language rights section.
 */
import { SiteHeader, SiteFooter } from "./site-chrome";
import { COMPANY, CONTACT_EMAIL, TRIAL_DAYS } from "@/lib/commercial";

const LAST_UPDATED = "18 November 2026";

interface Doc {
  title: string;
  intro: string;
  sections: { heading: string; paragraphs: string[]; bullets?: string[] }[];
}

const TERMS: Doc = {
  title: "Terms of Service",
  intro: `These Terms govern your use of the Seriesight coaching intelligence platform operated by ${COMPANY.legalName} (${COMPANY.city}, ${COMPANY.country}). By opening a workspace, starting a trial or subscribing to a plan, you agree to them.`,
  sections: [
    {
      heading: "1. The service",
      paragraphs: [
        `Seriesight is a pre-match preparation tool for League of Legends coaching staff. It provides opponent scouting, macro analytics, draft simulation and evidence provenance through a browser workspace. It does not inject information into live games, lock picks or replace the game client.`,
        "The public demo runs on an independently authored fixture dataset. Figures shown in the demo are illustrative and are not official Riot Games, GRID or any team's performance data.",
      ],
    },
    {
      heading: "2. Trials and plans",
      paragraphs: [
        `Paid plans begin with a ${TRIAL_DAYS}-day free trial. No payment method is required to start a trial. When a trial ends, the workspace moves to read-only unless a subscription is active.`,
        "Plan features, seat counts and prices are published on the pricing page and are quoted in UAE dirham (AED), exclusive of 5% UAE VAT. Applicable VAT is added at checkout and shown separately on every invoice.",
      ],
    },
    {
      heading: "3. Billing, renewal and cancellation",
      paragraphs: [
        "Monthly subscriptions renew on the same calendar day each month; annual subscriptions renew yearly. You can cancel at any time from Workspace Settings or by contacting support; access continues to the end of the paid period and no further charges are made.",
        "Refunds for duplicate or erroneous charges are issued to the original payment method within five business days of confirmation.",
      ],
    },
    {
      heading: "4. Acceptable use and competitive integrity",
      bullets: [
        "Do not use Seriesight during live professional matches in ways your tournament's integrity rules prohibit.",
        "Do not attempt to extract, resell or republish licensed third-party data accessed through the GRID integration.",
        "Do not share seat access beyond the seats included in your plan; contact us for additional seats.",
        "Do not probe, scan or attack the service, or bypass rate limits and access controls.",
      ],
      paragraphs: [],
    },
    {
      heading: "5. Data sources and licensing",
      paragraphs: [
        "GRID Open Access is used, when configured by you, strictly within its non-commercial terms through a server-side adapter. No licensed raw data is stored beyond the imported working set required to operate your workspace, and no licensed raw data is included in the public demo.",
      ],
    },
    {
      heading: "6. Availability and support",
      paragraphs: [
        "We target continuous availability of the workspace during Gulf Standard Time business hours and publish incidents to affected workspaces in-app. Coach plans receive a one-business-day response commitment; Organisation plans receive a same-business-day response commitment.",
      ],
    },
    {
      heading: "7. Liability",
      paragraphs: [
        "The service is provided as-is during the demo and trial periods. To the maximum extent permitted by applicable law, our aggregate liability under a paid subscription is limited to the fees paid in the three months preceding the claim. Nothing in these Terms excludes liability that cannot be excluded under UAE law.",
      ],
    },
    {
      heading: "8. Governing law and disputes",
      paragraphs: [
        `These Terms are governed by the laws of the Emirate of Dubai and the applicable federal laws of the United Arab Emirates. Disputes will first be addressed in good faith through support within 30 days, and may thereafter be submitted to the competent courts of Dubai.`,
      ],
    },
    {
      heading: "9. Contact",
      paragraphs: [
        `Questions about these Terms: ${CONTACT_EMAIL}. Postal address: ${COMPANY.legalName}, ${COMPANY.addressLine}, ${COMPANY.city}, ${COMPANY.country}.`,
      ],
    },
  ],
};

const PRIVACY: Doc = {
  title: "Privacy Policy",
  intro: `This Policy explains what personal data ${COMPANY.legalName} (${COMPANY.city}, ${COMPANY.country}) collects through the Seriesight platform and public site, why we collect it, and the rights you have over it.`,
  sections: [
    {
      heading: "1. What we collect",
      bullets: [
        "Trial and demo requests: full name, work email, team or organisation, role and any message you choose to include.",
        "Support correspondence: the content of emails you send us.",
        "Operational telemetry: anonymous request identifiers and error traces needed to run and secure the service.",
        "Workspace preferences (role policy, haptics, reduced motion) are stored in your browser, not on our servers.",
      ],
      paragraphs: [],
    },
    {
      heading: "2. What we do not do",
      bullets: [
        "We do not sell personal data, ever.",
        "We do not run advertising networks or third-party ad trackers on the platform.",
        "The analytics dataset in the demo is fictional and contains no personal data.",
        "We never ask for game account credentials — the workspace does not connect to your Riot account.",
      ],
      paragraphs: [],
    },
    {
      heading: "3. Why we process data",
      paragraphs: [
        "Legal bases are: performance of a contract (activating and operating your trial or subscription), legitimate interests (securing and improving the service), and consent (anything you submit voluntarily through forms). You can withdraw consent at any time.",
      ],
    },
    {
      heading: "4. Storage and residency",
      paragraphs: [
        "Lead and account records are stored on infrastructure operated under our control with access limited to staff who need it. When you connect GRID Open Access, requests are proxied server-side and credentials are kept in server environment configuration — never in the browser.",
      ],
    },
    {
      heading: "5. Retention",
      paragraphs: [
        "Trial requests are retained for 24 months from last contact, then deleted or anonymised. Billing records are retained for the period required by UAE tax law. You can request earlier deletion as described below.",
      ],
    },
    {
      heading: "6. Your rights",
      bullets: [
        "Request a copy of the personal data we hold about you.",
        "Ask us to correct or complete inaccurate data.",
        "Ask us to delete your data, subject to legal retention duties.",
        "Object to or restrict processing, and withdraw consent at any time.",
        `Exercise any right by emailing ${CONTACT_EMAIL}; we respond within one business day and complete requests within 14 days.`,
      ],
      paragraphs: [],
    },
    {
      heading: "7. International transfers",
      paragraphs: [
        "Where a supplier or data centre sits outside the UAE, we apply appropriate safeguards and only transfer the minimum data required to deliver the service.",
      ],
    },
    {
      heading: "8. Changes to this policy",
      paragraphs: [
        "Material changes are announced in-app at least 14 days before they take effect, and the date below is always current.",
      ],
    },
    {
      heading: "9. Contact",
      paragraphs: [
        `Privacy questions and data requests: ${CONTACT_EMAIL}. Postal address: ${COMPANY.legalName}, ${COMPANY.addressLine}, ${COMPANY.city}, ${COMPANY.country}.`,
      ],
    },
  ],
};

export function LegalPage({ document }: { document: "terms" | "privacy" }) {
  const doc = document === "terms" ? TERMS : PRIVACY;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-void)]">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-[860px] flex-1 px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--accent-cyan)]">Legal</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">{doc.title}</h1>
        <p className="mt-2 text-xs text-[var(--text-muted)]">Last updated {LAST_UPDATED}</p>
        <p className="mt-6 text-[15px] leading-relaxed text-[var(--text-secondary)]">{doc.intro}</p>

        <nav aria-label="On this page" className="mt-8 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/60 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">On this page</p>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {doc.sections.map((s) => (
              <li key={s.heading}>
                <a href={`#${s.heading.split(".")[0]}`} className="text-[13px] text-[var(--accent-cyan)] transition-colors hover:text-[var(--accent-white)]">
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-8">
          {doc.sections.map((s) => (
            <section key={s.heading} id={s.heading.split(".")[0]} aria-label={s.heading}>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">{s.heading}</h2>
              {s.paragraphs.map((p, i) => (
                <p key={i} className="mt-3 text-[14px] leading-relaxed text-[var(--text-secondary)]">{p}</p>
              ))}
              {s.bullets && (
                <ul className="mt-3 space-y-2">
                  {s.bullets.map((b, i) => (
                    <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-[var(--text-secondary)]">
                      <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-cyan)]" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
