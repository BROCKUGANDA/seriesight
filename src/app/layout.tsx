import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/toaster";
import {
  SITE_URL,
  CONTACT_EMAIL,
  PLANS,
  FAQS,
  HOWTO_STEPS,
  COMPANY,
  TRIAL_DAYS,
} from "@/lib/commercial";
import "./globals.css";

/* ------------------------------------------------------------------ Viewport */
export const viewport: Viewport = {
  themeColor: "#0a0a0e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

/* -------------------------------------------------------------- SEO metadata */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Seriesight — LoL Coaching & Fearless Draft Intelligence | Dubai, UAE",
    template: "%s | Seriesight",
  },
  description:
    "Seriesight is League of Legends coaching intelligence built in Dubai: opponent scouting with evidence-backed tendencies, macro analytics, a deterministic Fearless Draft engine and a five-game Series Lab. Plans from AED 0, 14-day trial, mobile-first PWA for phone, tablet and desktop.",
  keywords: [
    "Seriesight",
    "League of Legends coaching software",
    "esports analytics platform UAE",
    "Fearless Draft tool",
    "LoL draft analytics",
    "opponent scouting esports",
    "draft room simulator",
    "esports coaching Dubai",
    "esports platform MENA",
    "Wilson confidence interval analytics",
    "Series Lab",
    "GRID esports data",
  ],
  authors: [{ name: "Seriesight FZ-LLC" }],
  creator: "Seriesight FZ-LLC",
  publisher: "Seriesight FZ-LLC",
  applicationName: "Seriesight",
  category: "sports",
  manifest: "/manifest.webmanifest",
  formatDetection: { telephone: false, address: false, email: false },
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Seriesight",
    title: "Seriesight — The series, in focus. LoL coaching intelligence from Dubai",
    description:
      "Turn tournament history into pre-match preparation: opponent scouting with Wilson 95% intervals, macro objective analytics, a deterministic Fearless Draft engine and the five-game Series Lab. Built in Dubai, priced in AED, works on phone, tablet and desktop.",
    locale: "en_US",
    images: [
      {
        url: "/brand/og-image.png",
        width: 1200,
        height: 630,
        alt: "Seriesight — League of Legends coaching intelligence and Fearless Draft management, built in Dubai, UAE",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Seriesight — LoL Coaching & Fearless Draft Intelligence",
    description:
      "Opponent scouting, macro analytics, deterministic Fearless Draft engine and a five-game Series Lab. Built in Dubai, plans from AED 0.",
    images: ["/brand/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // GEO (geographic targeting for search engines) — Dubai, United Arab Emirates.
  other: {
    "geo.region": "AE-DU",
    "geo.placename": "Dubai, United Arab Emirates",
    "geo.position": "25.325;55.475",
    ICBM: "25.325, 55.475",
  },
};

/* ----------------------------------------------------------------- JSON-LD */
function JsonLd() {
  const graph = [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: COMPANY.legalName,
      alternateName: "Seriesight",
      url: SITE_URL,
      email: CONTACT_EMAIL,
      logo: `${SITE_URL}/brand/icon-512.png`,
      foundingDate: COMPANY.founded,
      address: {
        "@type": "PostalAddress",
        streetAddress: COMPANY.addressLine,
        addressLocality: COMPANY.city,
        addressRegion: COMPANY.region,
        postalCode: COMPANY.postalCode,
        addressCountry: "AE",
      },
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "sales",
        email: CONTACT_EMAIL,
        areaServed: ["AE", "SA", "QA", "KW", "BH", "OM", "EG", "JO"],
        availableLanguage: ["English", "Arabic"],
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Seriesight",
      inLanguage: "en",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "WebPage",
      "@id": `${SITE_URL}/#webpage`,
      url: SITE_URL,
      name: "Seriesight — LoL Coaching & Fearless Draft Intelligence",
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#software` },
      speakable: {
        "@type": "SpeakableSpecification",
        cssSelector: ["#hero-title", "[data-speakable]"],
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: "Seriesight",
      applicationCategory: "SportsApplication",
      applicationSubCategory: "Esports coaching intelligence",
      operatingSystem: "Web browser (iOS, Android, iPadOS, Windows, macOS)",
      description:
        "League of Legends coaching intelligence and Fearless Draft management platform: opponent scouting, macro objective analytics, deterministic draft engine, five-game Series Lab and a full evidence ledger.",
      offers: PLANS.map((p) => ({
        "@type": "Offer",
        name: `${p.name} plan`,
        price: p.monthlyAED,
        priceCurrency: "AED",
        description: p.tagline,
        availability: "https://schema.org/InStock",
      })),
      featureList: PLANS.flatMap((p) => p.features).slice(0, 12),
      aggregateRating: undefined,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    },
    {
      "@type": "HowTo",
      "@id": `${SITE_URL}/#howto`,
      name: "How to prepare a Fearless Draft series with Seriesight",
      description:
        "The five-step Seriesight preparation loop: review the brief, scout the opponent, simulate the draft, pressure-test the series and finalize the plan.",
      totalTime: "PT25M",
      step: HOWTO_STEPS.map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: s.name,
        text: s.text,
      })),
    },
  ];

  return (
    <script
      type="application/ld+json"
      // Structured data for search + answer engines (SEO/AEO).
      dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }) }}
    />
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Trial availability is the commercial hook most answer engines quote. */}
        <meta name="trial-availability" content={`${TRIAL_DAYS}-day free trial, no credit card`} />
        <meta name="supported-regions" content="United Arab Emirates, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman, Egypt, Jordan" />
        <JsonLd />
      </head>
      <body className="antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
