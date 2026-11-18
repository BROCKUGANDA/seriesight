/**
 * Generates commercial/PWA image assets from the Seriesight brand SVG:
 *  - public/brand/icon-192.png / icon-512.png (app icons, maskable-safe)
 *  - public/brand/apple-touch-icon.png (180x180)
 *  - public/brand/og-image.png (1200x630 social/SEO card)
 */
import sharp from "sharp";
import { mkdirSync } from "fs";
import { join } from "path";

const PUB = "/home/z/my-project/public";
mkdirSync(join(PUB, "brand"), { recursive: true });

// Seriesight aperture icon on void tile.
function iconSvg({ size = 512, padding = 0.18 }) {
  const inner = size * (1 - padding * 2);
  const off = size * padding;
  const scale = inner / 32;
  const marks = [
    { x: 7, y: 10, h: 12, c: "#42D9FF" },
    { x: 11.2, y: 7, h: 18, c: "#627DFF" },
    { x: 15.4, y: 8, h: 16, c: "#EDF4FF" },
    { x: 19.6, y: 7, h: 18, c: "#627DFF" },
    { x: 23.8, y: 10, h: 12, c: "#9B8CFF" },
  ];
  const m = marks.map(
    (r) =>
      `<rect x="${(off + r.x * scale).toFixed(1)}" y="${(off + r.y * scale).toFixed(1)}" width="${(2.4 * scale).toFixed(1)}" height="${(r.h * scale).toFixed(1)}" rx="${(1.2 * scale).toFixed(1)}" fill="${r.c}"/>`
  ).join("");
  const cr = 2.1 * scale;
  const cx = off + 16 * scale;
  const cy = off + 16 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${(size * 0.22).toFixed(0)}" fill="#080C14"/>
  <circle cx="${cx}" cy="${cy}" r="${(14 * scale).toFixed(1)}" stroke="#25364A" stroke-width="${(1 * scale).toFixed(1)}" fill="none"/>
  ${m}
  <circle cx="${cx}" cy="${cy}" r="${cr.toFixed(1)}" fill="#080C14" stroke="#42D9FF" stroke-width="${(1.2 * scale).toFixed(1)}"/>
</svg>`;
}

// 1200x630 OG card: dark void, aperture mark, wordmark, tagline, UAE line.
function ogSvg() {
  const W = 1200, H = 630;
  const scale = 7.5; // 32 -> 240px icon
  const off = 90;
  const marks = [
    { x: 7, y: 10, h: 12, c: "#42D9FF" },
    { x: 11.2, y: 7, h: 18, c: "#627DFF" },
    { x: 15.4, y: 8, h: 16, c: "#EDF4FF" },
    { x: 19.6, y: 7, h: 18, c: "#627DFF" },
    { x: 23.8, y: 10, h: 12, c: "#9B8CFF" },
  ];
  const m = marks.map(
    (r) =>
      `<rect x="${off + r.x * scale}" y="${off + r.y * scale}" width="${2.4 * scale}" height="${r.h * scale}" rx="${1.2 * scale}" fill="${r.c}"/>`
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="g1" cx="18%" cy="0%" r="60%">
      <stop offset="0%" stop-color="#42D9FF" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#080C14" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="88%" cy="22%" r="55%">
      <stop offset="0%" stop-color="#9B8CFF" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#080C14" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sig" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#42D9FF"/><stop offset="55%" stop-color="#627DFF"/><stop offset="100%" stop-color="#9B8CFF"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#080C14"/>
  <rect width="${W}" height="${H}" fill="url(#g1)"/>
  <rect width="${W}" height="${H}" fill="url(#g2)"/>
  <circle cx="${off + 16 * scale}" cy="${off + 16 * scale}" r="${14 * scale}" stroke="#25364A" stroke-width="2" fill="none"/>
  ${m}
  <circle cx="${off + 16 * scale}" cy="${off + 16 * scale}" r="${2.1 * scale}" fill="#080C14" stroke="#42D9FF" stroke-width="2.4"/>
  <text x="420" y="300" font-family="DejaVu Sans, Arial, sans-serif" font-size="64" font-weight="700" letter-spacing="14" fill="#F2F6FC">SERIESIGHT</text>
  <rect x="424" y="330" width="300" height="6" rx="3" fill="url(#sig)"/>
  <text x="420" y="392" font-family="DejaVu Sans, Arial, sans-serif" font-size="33" fill="#AAB9CB">The series, in focus — LoL coaching &amp; Fearless Draft intelligence</text>
  <text x="420" y="446" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" fill="#728399">Opponent scouting · Macro analytics · Draft Room · Series Lab</text>
  <text x="420" y="516" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" fill="#42D9FF">Built in Dubai, United Arab Emirates</text>
  <text x="420" y="552" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" fill="#728399">seriesight.ae</text>
</svg>`;
}

async function main() {
  const icon = Buffer.from(iconSvg({ size: 512 }));
  await sharp(icon).resize(512, 512).png().toFile(join(PUB, "brand", "icon-512.png"));
  await sharp(icon).resize(192, 192).png().toFile(join(PUB, "brand", "icon-192.png"));
  await sharp(icon).resize(180, 180).png().toFile(join(PUB, "brand", "apple-touch-icon.png"));
  await sharp(icon).resize(32, 32).png().toFile(join(PUB, "brand", "favicon-32.png"));
  await sharp(icon).resize(16, 16).png().toFile(join(PUB, "brand", "favicon-16.png"));
  await sharp(Buffer.from(ogSvg())).png().toFile(join(PUB, "brand", "og-image.png"));
  console.log("assets written");
}

main().catch((e) => { console.error(e); process.exit(1); });
