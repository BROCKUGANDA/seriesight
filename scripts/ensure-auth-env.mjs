import { readFile, writeFile, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";

// Run in the private deployment directory. Never prints secret values.
const file = ".env";
let content = await readFile(file, "utf8");
if (!/^AUTH_INVITE_CODE=.+$/m.test(content)) {
  content = content.replace(/^AUTH_INVITE_CODE=.*\r?\n?/m, "");
  await writeFile(file, `${content.trimEnd()}\nAUTH_INVITE_CODE=${randomBytes(32).toString("hex")}\n`, { mode: 0o600 });
  console.log("Created private coach invitation in deployment .env. Retrieve through your secure administrative channel; never publish it.");
} else {
  console.log("Existing coach invitation preserved.");
}
await chmod(file, 0o600);
