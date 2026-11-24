import type { NextConfig } from "next";

/* ────────────────────────────────────────────────────────────────────────────
   Security headers. Applied in every environment; the CSP relaxes to include
   the inline bootstrap Next.js needs at runtime. Dev also gets 'unsafe-eval'
   because React refresh requires it — production never does.
   ──────────────────────────────────────────────────────────────────────────── */

const isDev = process.env.NODE_ENV !== "production";

const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // TypeScript correctness is enforced by `bun run typecheck` in CI and
  // locally; the build must not silently ship type errors.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  // Modern formats with an automatic JPEG fallback for browsers that lack them.
  // Device sizes cover phones, tablets and high-DPI desktops.
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 430, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [16, 32, 48, 96, 192, 384],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
