import { afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE, tokenDigest } from "@/lib/auth";
import { POST as authPOST } from "@/app/api/auth/session/route";
import { POST as verifyPOST } from "@/app/api/auth/verify-email/route";
import { POST as resetRequestPOST } from "@/app/api/auth/password-reset/request/route";
import { POST as resetConfirmPOST } from "@/app/api/auth/password-reset/confirm/route";

const delivered = vi.hoisted(() => [] as { to: string; purpose: string; devToken?: string }[]);
vi.mock("@/lib/email", () => ({
  deliverTransactionalEmail: vi.fn(async (input: { to: string; purpose: string; devToken?: string }) => { delivered.push(input); }),
  signEmailPayload: vi.fn(() => "test"),
}));

process.env.AUTH_INVITE_CODE = "test-invite-not-for-deployment";

const request = (path: string, body: unknown, cookie?: string) => new NextRequest(`http://localhost:3000${path}`, {
  method: "POST",
  headers: { origin: "http://localhost:3000", "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
});

const userIds: string[] = [];
const orgIds: string[] = [];
const cookies: string[] = [];

afterAll(async () => {
  await db.authSessionRecord.deleteMany({ where: { tokenHash: { in: cookies.map((c) => tokenDigest(c.split("=")[1])) } } });
  await db.authVerificationRecord.deleteMany({ where: { userId: { in: userIds } } });
  const owned = await db.organizationRecord.findMany({ where: { ownerUserId: { in: userIds } }, select: { id: true } });
  await db.organizationRecord.deleteMany({ where: { id: { in: owned.map((o) => o.id) } } });
  await db.authUserRecord.deleteMany({ where: { id: { in: userIds } } });
});

describe("account recovery", () => {
  it("verifies email and replaces all sessions on password reset", async () => {
    const email = `${randomUUID()}@example.test`;
    const registered = await authPOST(request("/api/auth/session", {
      action: "register", email, name: "Recovery Coach", password: "original-password-long", inviteCode: "test-invite-not-for-deployment",
    }));
    expect(registered.status).toBe(200);
    const cookie = `${SESSION_COOKIE}=${registered.cookies.get(SESSION_COOKIE)!.value}`;
    cookies.push(cookie);
    const user = await db.authUserRecord.findUniqueOrThrow({ where: { email } });
    userIds.push(user.id);

    const verifyEmail = delivered.find((item) => item.to === email && item.purpose === "verify_email");
    expect(verifyEmail?.devToken).toMatch(/^[a-f0-9]{64}$/);
    expect((await verifyPOST(request("/api/auth/verify-email", { token: verifyEmail!.devToken }))).status).toBe(200);
    expect((await db.authUserRecord.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).not.toBeNull();

    expect((await resetRequestPOST(request("/api/auth/password-reset/request", { email }))).status).toBe(200);
    const resetEmail = delivered.find((item) => item.to === email && item.purpose === "reset_password");
    expect(resetEmail?.devToken).toMatch(/^[a-f0-9]{64}$/);
    expect((await resetConfirmPOST(request("/api/auth/password-reset/confirm", {
      token: resetEmail!.devToken, password: "replacement-password-long",
    }))).status).toBe(200);
    expect(await db.authSessionRecord.count({ where: { userId: user.id } })).toBe(0);

    const login = await authPOST(request("/api/auth/session", {
      action: "login", email, password: "replacement-password-long",
    }));
    expect(login.status).toBe(200);
    cookies.push(`${SESSION_COOKIE}=${login.cookies.get(SESSION_COOKIE)!.value}`);
  });
});
