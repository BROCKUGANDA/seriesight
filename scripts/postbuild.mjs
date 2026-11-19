// Cross-platform post-build step: assemble the Next standalone bundle.
// Replaces the POSIX-only `cp -r` calls (which fail on Windows).
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const copies = [
  [path.join(ROOT, ".next", "static"), path.join(ROOT, ".next", "standalone", ".next", "static")],
  [path.join(ROOT, "public"), path.join(ROOT, ".next", "standalone", "public")],
];

for (const [src, dest] of copies) {
  if (!fs.existsSync(src)) {
    console.error(`postbuild: missing ${src} — did next build run?`);
    process.exit(1);
  }
  fs.cpSync(src, dest, { recursive: true });
  console.log(`postbuild: copied ${path.relative(ROOT, src)} -> ${path.relative(ROOT, dest)}`);
}
console.log("postbuild: standalone bundle assembled");
