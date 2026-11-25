import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as healthGET } from "@/app/api/health/route";
import { databaseHealth, fixtureDatasetHealth } from "@/lib/health";
import { consumeRateLimit, trustedClientAddress } from "@/lib/rate-limit";

describe("production readiness", () => {
  it("reports real database and fixture health", async () => {
    expect(await databaseHealth()).toMatchObject({ status: "pass" });
    expect(fixtureDatasetHealth()).toMatchObject({ status: "pass" });

    const response = await healthGET(new NextRequest("http://localhost/api/health"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("healthy");
    expect(body.data.checks.database.status).toBe("pass");
  });

  it("throttles requests after the configured limit", async () => {
    const identity = `readiness-test-${randomUUID()}`;
    const args = { scope: "api" as const, identity, limit: 2 };
    expect((await consumeRateLimit(args)).remaining).toBe(1);
    expect((await consumeRateLimit(args)).remaining).toBe(0);
    await expect(consumeRateLimit(args)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryable: true,
      details: { scope: "api", retryAfterSec: expect.any(Number) },
    });
  });

  it("only trusts forwarded addresses when explicitly configured", () => {
    const request = new NextRequest("http://localhost/api/health", {
      headers: { "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.7" },
    });
    expect(trustedClientAddress(request)).toBe("untrusted");
    vi.stubEnv("TRUST_AUTH_PROXY", "true");
    try {
      expect(trustedClientAddress(request)).toBe("203.0.113.9");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("ships a PostgreSQL baseline migration with the new operational tables", () => {
    const migrationPath = resolve(process.cwd(), "prisma/migrations/20261125000000_init/migration.sql");
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain('CREATE TABLE "RequestRateLimitRecord"');
    expect(sql).toContain('CREATE TABLE "DraftSessionRecord"');
    expect(sql).toContain('ALTER TABLE "DraftActionRecord" ADD CONSTRAINT');
    const tenantMigrationPath = resolve(process.cwd(), "prisma/migrations/20261125010000_tenant_foundation/migration.sql");
    expect(existsSync(tenantMigrationPath)).toBe(true);
    expect(readFileSync(tenantMigrationPath, "utf8")).toContain('CREATE TABLE IF NOT EXISTS "OrganizationRecord"');
  });
});
