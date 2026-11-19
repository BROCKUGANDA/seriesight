import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/toaster";
import {
  SITE_URL,
  FAQS,
  HOWTO_STEPS,
} from "@/lib/commercial";
import "./globals.css";

/* ------------------------------------------------------------------ Viewport */
export const viewport: Viewport = {
  themeColor: "#f1f0e9",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

/* -------------------------------------------------------------- SEO metadata */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Seriesight — Fearless Draft Planning Demo",
    template: "%s | Seriesight",
  },
  description:
    "Explore Seriesight, an interactive League of Legends pre-match coaching demo with fixture-based scouting, versioned draft actions, Fearless series restrictions and inspectable evidence records.",
  keywords: [
    "Seriesight",
    "League of Legends coaching software",
    "Fearless Draft tool",
    "LoL draft analytics",
    "opponent scouting esports",
    "draft room simulator",
    "Series Lab",
  ],
  authors: [{ name: "Seriesight" }],
  creator: "Seriesight",
  publisher: "Seriesight",
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
    title: "Seriesight — Fearless Draft Planning Demo",
    description:
      "An interactive League of Legends pre-match coaching demo using labelled fixture data, versioned draft actions and multi-game Fearless restrictions.",
    locale: "en_US",
    images: [
      {
        url: "/brand/og-image.png",
        width: 1200,
        height: 630,
        alt: "Seriesight — a League of Legends Fearless Draft planning demo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Seriesight — LoL Coaching & Fearless Draft Intelligence",
    description:
      "Explore fixture-based opponent scouting, versioned draft actions and multi-game Fearless restrictions.",
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
};

/* ----------------------------------------------------------------- JSON-LD */
function JsonLd() {
  const graph = [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Seriesight",
      inLanguage: "en",
    },
    {
      "@type": "WebPage",
      "@id": `${SITE_URL}/#webpage`,
      url: SITE_URL,
      name: "Seriesight — Fearless Draft Planning Demo",
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
        "Interactive League of Legends pre-match coaching demo with labelled fixture data, versioned draft actions, multi-game Fearless restrictions and inspectable evidence records.",
      featureList: ["Fixture-based opponent scouting", "Versioned pick-and-ban actions", "Multi-game Fearless restrictions", "Inspectable evidence records"],
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
      description: "A five-step walkthrough of the fixture workspace, evidence records, draft creation, Fearless restrictions and license boundary.",
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
    <html lang="en">
      <head>
        <JsonLd />
      </head>
      <body className="antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
