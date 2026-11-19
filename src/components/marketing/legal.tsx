"use client";

/**
 * Demo-use and data-handling notes for hash routes #/terms and #/privacy.
 * These summaries are not formal legal terms or a production privacy notice.
 */
import { SiteHeader, SiteFooter } from "./site-chrome";
import { CONTACT_EMAIL } from "@/lib/commercial";

const LAST_UPDATED = "19 November 2026";

interface Doc {
  title: string;
  intro: string;
  sections: { heading: string; paragraphs: string[]; bullets?: string[] }[];
}

const TERMS: Doc = {
  title: "Demo use notes",
  intro: "Seriesight is an interactive fixture-data demo, not a hosted commercial service. These notes describe current boundaries; they are not a negotiated contract or legal advice.",
  sections: [
    {
      heading: "1. Demo scope",
      paragraphs: [
        "The public workspace provides an interactive pre-match draft and scouting demonstration using independently authored fixture data. The data is illustrative—not a live feed or official competition result.",
        "The demo does not provide a paid subscription, trial provisioning, service-level agreement, or production-ready authentication and workspace authorization.",
      ],
    },
    {
      heading: "2. Source license",
      paragraphs: [
        "The source repository is licensed under the Business Source License 1.1. Redistribution and non-production use are governed by its terms; production use requires separate authorization before the change date.",
        "This is a summary only. The LICENSE file controls; third-party components may be governed by separate licenses.",
      ],
    },
    {
      heading: "3. Payments and service commitments",
      paragraphs: [
        "There is no supported public payment flow or paid subscription. Experimental billing APIs exist in the repository but are unauthenticated and must not be used with real funds or exposed to untrusted users.",
      ],
    },
    {
      heading: "4. Safe use",
      bullets: [
        "Do not submit personal, confidential, or licensed third-party data to this unauthenticated demo.",
        "Do not use fixture records as official match results or as a basis for live competitive decisions.",
        "Do not expose an unmodified deployment to untrusted users; it lacks authentication, ownership checks and HTTP rate limiting.",
      ],
      paragraphs: [],
    },
    {
      heading: "5. Data sources",
      paragraphs: [
        "The GRID adapter is optional and requires server-side configuration. Any use of GRID data is subject to applicable GRID terms; this demo does not grant rights to third-party data.",
      ],
    },
    {
      heading: "6. Availability",
      paragraphs: [
        "The demo is provided without an availability target, incident-notification commitment, or support-response time.",
      ],
    },
    {
      heading: "7. Deployment boundary",
      paragraphs: [
        "Do not use this page as a production contract. A public deployment needs reviewed legal terms and privacy disclosures that match its operator, jurisdiction, hosting, data flows and service commitments.",
      ],
    },
    {
      heading: "8. Contact",
      paragraphs: [
        `Questions about the demo notes: ${CONTACT_EMAIL}.`,
      ],
    },
  ],
};

const PRIVACY: Doc = {
  title: "Privacy & data notes",
  intro: "These notes describe the current demo implementation, not a complete privacy policy for a public production service. Data handling depends on the hosting and database configuration used by each deployment.",
  sections: [
    {
      heading: "1. Demo profile and browser storage",
      paragraphs: [
        "Entering the fixture workspace creates a local demo profile without requesting a real account or password. The profile and workspace preferences may be stored in this browser when storage is available.",
        "Browser storage is not authentication. It does not prevent other people from accessing API routes or draft sessions.",
      ],
    },
    {
      heading: "2. Draft requests and persistence",
      paragraphs: [
        "Creating or changing a draft sends the requested state to the application's API. Draft sessions and action audit records are persisted using the database configured by the operator.",
        "The operator is responsible for documenting the hosting provider, database location, access policy, backups, logs, retention and deletion process for a deployed instance.",
      ],
    },
    {
      heading: "3. Fixture content",
      paragraphs: [
        "The public demo's match and champion records are independently authored fixtures. They are illustrative and should not contain personal player data or be treated as official match records.",
      ],
    },
    {
      heading: "4. Optional integrations",
      paragraphs: [
        "When GRID access is configured, credentials are read server-side and requests are made through the provider adapter. GRID data remains subject to its own terms. Integration webhooks may transmit event payloads to configured endpoints; operators must verify destination, payload and retention controls.",
      ],
    },
    {
      heading: "5. Avoid sensitive information",
      paragraphs: [
        "This demo has no authentication or workspace ownership checks. Do not enter sensitive personal, team, credential or licensed data. Review database, hosting and logging behavior before operating a public instance.",
      ],
    },
    {
      heading: "6. Contact",
      paragraphs: [
        `Questions about these demo notes: ${CONTACT_EMAIL}.`,
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
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--accent-cyan)]">Demo notes</p>
        <h1 className="editorial-title mt-3 text-4xl tracking-tight text-[var(--text-primary)] sm:text-5xl">{doc.title}</h1>
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
