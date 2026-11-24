import { readFile, writeFile, chmod } from "node:fs/promises";

// Accept the secret through stdin, not an argv value or source file.
let input = "";
for await (const chunk of process.stdin) input += chunk;
const key = input.trim();
if (!/^[A-Za-z0-9_-]{20,256}$/.test(key)) throw new Error("Invalid GRID key format; configuration was not changed.");
let content = await readFile(".env", "utf8");
content = content.replace(/^GRID_API_KEY=.*\r?\n?/gm, "");
await writeFile(".env", `${content.trimEnd()}\nGRID_API_KEY=${key}\n`, { mode: 0o600 });
await chmod(".env", 0o600);
console.log("GRID credential configured privately. No key value logged.");