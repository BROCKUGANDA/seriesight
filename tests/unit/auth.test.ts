import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword, identityContext, SESSION_COOKIE, tokenDigest, type Identity } from "@/lib/auth";
import { GET as sessionsGET, POST as sessionsPOST } from "@/app/api/draft/sessions/route";
import { GET as sessionGET } from "@/app/api/draft/sessions/[sessionId]/route";
import { POST as authPOST, GET as authGET, DELETE as authDELETE } from "@/app/api/auth/session/route";
import { createSession, getSession } from "@/services/draft";
import { randomUUID } from "node:crypto";

const workspaces: string[] = [];
const cookies: string[] = [];
const users: string[] = [];
const request = (path: string, method = "GET", body?: unknown, cookie?: string, origin = "http://localhost:3000") => new NextRequest(`http://localhost:3000${path}`, {
  method, headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
afterAll(async () => {
  await db.draftSessionRecord.deleteMany({ where: { workspaceId: { in: workspaces } } });
  await db.authSessionRecord.deleteMany({ where: { tokenHash: { in: cookies.map((cookie) => tokenDigest(cookie.split("=")[1])) } } });
  await db.authSessionRecord.deleteMany({ where: { userId: { in: users } } });
  const organizations = await db.organizationRecord.findMany({ where: { ownerUserId: { in: users } }, select: { id: true } });
  await db.organizationRecord.deleteMany({ where: { id: { in: organizations.map((o) => o.id) } } });
  await db.authUserRecord.deleteMany({ where: { id: { in: users } } });
});
async function guest() {
  const response = await authPOST(request("/api/auth/session", "POST", { action: "demo" }));
  expect(response.status).toBe(200);
  const cookie = `${SESSION_COOKIE}=${response.cookies.get(SESSION_COOKIE)!.value}`;
  cookies.push(cookie);
  const me = await (await authGET(request("/api/auth/session", "GET", undefined, cookie))).json();
  workspaces.push(me.data.workspaceId);
  return { cookie, identity: me.data as Identity };
}
describe("server-side authentication", () => {
  it("requires an invitation, registers a coach, and authenticates a password", async () => {
    vi.stubEnv("AUTH_INVITE_CODE", "test-invite-not-for-deployment");
    try {
      const email = `${randomUUID()}@example.test`;
      const body = { action: "register", email, password: "test correct password", name: "Test coach", inviteCode: "wrong" };
      expect((await authPOST(request("/api/auth/session", "POST", body))).status).toBe(403);
      const registered = await authPOST(request("/api/auth/session", "POST", { ...body, inviteCode: "test-invite-not-for-deployment" }));
      expect(registered.status).toBe(200);
      const user = await db.authUserRecord.findUniqueOrThrow({ where: { email } });
      users.push(user.id);
      workspaces.push(user.workspaceId);
      expect(user.passwordHash).not.toContain(body.password);
      const login = await authPOST(request("/api/auth/session", "POST", { action: "login", email, password: body.password }));
      expect(login.status).toBe(200);
      const cookie = `${SESSION_COOKIE}=${login.cookies.get(SESSION_COOKIE)!.value}`;
      const me = await (await authGET(request("/api/auth/session", "GET", undefined, cookie))).json();
      expect(me.data).toMatchObject({ kind: "coach", workspaceId: user.workspaceId });
      expect(me.data.passwordHash).toBeUndefined();
      const denied = await authPOST(request("/api/auth/session", "POST", { action: "login", email, password: "incorrect" }));
      expect(denied.status).toBe(401);
    } finally { vi.unstubAllEnvs(); }
  });
  it("hashes passwords with unique salts and rejects incorrect passwords", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).not.toBe(b);
    expect(a).not.toContain("correct");
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("wrong", a)).toBe(false);
  });
  it("rejects unauthenticated API access and forged cookies", async () => {
    expect((await sessionsGET(request("/api/draft/sessions"))).status).toBe(401);
    expect((await sessionsGET(request("/api/draft/sessions", "GET", undefined, `${SESSION_COOKIE}=${"a".repeat(64)}`))).status).toBe(401);
  });
  it("isolates two demo workspaces for reads and mutations", async () => {
    const a = await guest();
    const b = await guest();
    expect(a.identity.workspaceId).not.toBe(b.identity.workspaceId);
    const created = await sessionsPOST(request("/api/draft/sessions", "POST", { opponentTeamId: "NVX", format: "BO5", rulesetId: "ff-hard-bo5" }, a.cookie));
    expect(created.status).toBe(200);
    const draft = (await created.json()).data;
    const listed = await sessionsGET(request("/api/draft/sessions", "GET", undefined, b.cookie));
    expect((await listed.json()).data).toEqual([]);
    const denied = await sessionGET(request(`/api/draft/sessions/${draft.id}`, "GET", undefined, b.cookie), { params: Promise.resolve({ sessionId: draft.id }) });
    expect(denied.status).toBe(404);
    const { POST: actionPOST } = await import("@/app/api/draft/sessions/[sessionId]/actions/route");
    const action = await actionPOST(request(`/api/draft/sessions/${draft.id}/actions`, "POST", { type: "ban", championId: "sejuani", expectedStateVersion: 1 }, b.cookie), { params: Promise.resolve({ sessionId: draft.id }) });
    expect(action.status).toBe(404);
  });
  it("rejects cross-origin mutations and revokes sessions on logout", async () => {
    const { cookie } = await guest();
    const denied = await authDELETE(request("/api/auth/session", "DELETE", undefined, cookie, "https://evil.example"));
    expect(denied.status).toBe(403);
    expect((await authDELETE(request("/api/auth/session", "DELETE", undefined, cookie))).status).toBe(200);
    expect((await sessionsGET(request("/api/draft/sessions", "GET", undefined, cookie))).status).toBe(401);
  });
  it("rejects expired sessions", async () => {
    const { cookie } = await guest();
    await db.authSessionRecord.update({ where: { tokenHash: tokenDigest(cookie.split("=")[1]) }, data: { expiresAt: new Date(0) } });
    expect((await sessionsGET(request("/api/draft/sessions", "GET", undefined, cookie))).status).toBe(401);
  });
  it("revokes sessions through the POST logout action supported by the public edge", async () => {
    const { cookie } = await guest();
    expect((await authPOST(request("/api/auth/session", "POST", { action: "logout" }, cookie))).status).toBe(200);
    expect((await sessionsGET(request("/api/draft/sessions", "GET", undefined, cookie))).status).toBe(401);
  });
  it("requires explicit server identity in direct draft services", async () => {
    await expect(createSession({ opponentTeamId: "NVX", format: "BO5", rulesetId: "ff-hard-bo5" })).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    const workspaceId = `test-${randomUUID()}`;
    workspaces.push(workspaceId);
    const identity: Identity = { userId: null, workspaceId, name: "test", email: "test@local.invalid", kind: "judge", role: "test", signedInAt: new Date().toISOString() };
    const created = await identityContext.run(identity, () => createSession({ opponentTeamId: "NVX", format: "BO5", rulesetId: "ff-hard-bo5" }));
    await expect(identityContext.run({ ...identity, workspaceId: "another" }, () => getSession(created.id))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
