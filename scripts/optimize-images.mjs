#!/usr/bin/env node
/**
 * Losslessly re-encode the brand raster assets.
 *
 * Flat icons are stored as paletted PNGs; the social preview keeps truecolour.
 * The script verifies that decoded pixels are byte-identical before writing,
 * so repeated runs are safe and no visual detail is lost.
 *
 *   node scripts/optimize-images.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BRAND_DIR = path.join(ROOT, "public", "brand");
const DRY = process.argv.includes("--dry-run");

const files = fs.readdirSync(BRAND_DIR).filter((f) => f.endsWith(".png")).sort();
let totalBefore = 0;
let totalAfter = 0;

for (const file of files) {
  const input = path.join(BRAND_DIR, file);
  const original = fs.readFileSync(input);
  const raw = await sharp(input).raw().toBuffer({ resolveWithObject: true });

  const paletted = file !== "og-image.png";
  const options = { compressionLevel: 9, palette: paletted };
  if (paletted) {
    options.quality = 100;
    options.effort = 10;
  }

  let optimized = await sharp(raw.data, { raw: raw.info }).png(options).toBuffer();
  const pixelsMatch = Buffer.compare(raw.data, await sharp(optimized).raw().toBuffer()) === 0;
  if (!pixelsMatch) {
    // A palette quantisation changed pixels — fall back to lossless truecolour.
    optimized = await sharp(raw.data, { raw: raw.info }).png({ compressionLevel: 9, palette: false }).toBuffer();
  }

  totalBefore += original.length;
  totalAfter += optimized.length;
  const saved = original.length - optimized.length;
  const action = DRY ? "would write" : saved > 0 ? "optimized" : "unchanged";
  console.log(`${file}: ${original.length} → ${optimized.length} B (${action}${saved > 0 ? `, -${saved} B` : ""})`);

  if (!DRY && saved > 0) fs.writeFileSync(input, optimized);
}

console.log(`total: ${totalBefore} → ${totalAfter} B (${totalBefore - totalAfter} B saved)`);
