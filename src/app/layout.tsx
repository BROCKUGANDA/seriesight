import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seriesight — The series, in focus",
  description:
    "League of Legends esports coaching intelligence and Fearless Draft management platform. Scouting, macro analytics, deterministic draft engine and evidence-backed recommendations.",
  keywords: ["Seriesight", "esports coaching", "League of Legends", "Fearless Draft", "draft analytics", "scouting"],
  authors: [{ name: "Seriesight" }],
  icons: { icon: "/brand/favicon.svg" },
  openGraph: {
    title: "Seriesight — The series, in focus",
    description: "Pre-match coaching intelligence: opponent scouting, macro atlas, draft room and the Fearless Series Lab.",
    siteName: "Seriesight",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#080C14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
