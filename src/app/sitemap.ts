import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/commercial";

/**
 * Sitemap for crawlers. The sandbox preview exposes a single origin route,
 * so the commercial destinations are declared as canonical anchors of the
 * production domain (seriesight.ae), which serves the same SPA shell.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/#/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/#/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/#/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
