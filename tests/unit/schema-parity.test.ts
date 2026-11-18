// Schema parity guardrail: prisma/schema.prisma (SQLite dev/demo) and
// prisma/schema.production.prisma (PostgreSQL production) must define the
// exact same models. A drift here silently changes what production persists —
// this test fails the build before that can ship.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SCHEMA_DIR = path.resolve(__dirname, "../../prisma");
const readModels = (file: string): Map<string, string[]> => {
  const source = fs.readFileSync(path.join(SCHEMA_DIR, file), "utf8");
  const models = new Map<string, string[]>();
  const pattern = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const fields = match[2]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("//"))
      .map((line) => line.replace(/\s+/g, " "));
    models.set(match[1], fields);
  }
  return models;
};

describe("prisma schema parity", () => {
  const dev = readModels("schema.prisma");
  const prod = readModels("schema.production.prisma");

  it("defines the identical set of models", () => {
    expect([...prod.keys()].sort()).toEqual([...dev.keys()].sort());
  });

  it("defines identical fields on every model", () => {
    for (const [name, devFields] of dev) {
      const prodFields = prod.get(name);
      expect(prodFields, `model ${name} missing in production schema`).toBeDefined();
      expect(prodFields, `model ${name} drifted`).toEqual(devFields);
    }
  });

  it("production datasource uses PostgreSQL with an env URL", () => {
    const source = fs.readFileSync(path.join(SCHEMA_DIR, "schema.production.prisma"), "utf8");
    expect(source).toMatch(/provider\s*=\s*"postgresql"/);
    expect(source).toMatch(/url\s*=\s*env\("PROD_DATABASE_URL"\)/);
  });
});
