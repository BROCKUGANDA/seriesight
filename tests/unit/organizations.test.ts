import { afterAll, describe, expect, it } from "vitest";
process.env.AUTH_INVITE_CODE = "test-invite-not-for-deployment";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE, tokenDigest } from "@/lib/auth";
import { GET as authGET, POST as authPOST } from "@/app/api/auth/session/route";
import { GET as orgGET, POST as orgPOST } from "@/app/api/organizations/route";
import { POST as invitePOST } from "@/app/api/organizations/[organizationId]/members/route";
import { POST as acceptPOST } from "@/app/api/organizations/invitations/route";
import { POST as switchPOST } from "@/app/api/workspaces/[workspaceId]/switch/route";
import { POST as sessionsPOST } from "@/app/api/draft/sessions/route";
import { GET as sessionGET } from "@/app/api/draft/sessions/[sessionId]/route";

const userIds: string[] = [];
const orgIds: string[] = [];
const tokens: string[] = [];
const workspaces: string[] = [];

const request = (path: string, method = "GET", body?: unknown, cookie?: string) => new NextRequest(`http://localhost:3000${path}`, {
  method,
  headers: { origin: "http://localhost:3000", "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

async function register(name: string) {
  const email = `${randomUUID()}@example.test`;
  const response = await authPOST(request("/api/auth/session", "POST", {
    action: "register", email, name, password: "phase-one-password", inviteCode: "test-invite-not-for-deployment",
  }));
  expect(response.status).toBe(200);
  const cookie = `${SESSION_COOKIE}=${response.cookies.get(SESSION_COOKIE)!.value}`;
  tokens.push(cookie);
  const me = await (await authGET(request("/api/auth/session", "GET", undefined, cookie))).json();
  const user = await db.authUserRecord.findUniqueOrThrow({ where: { email } });
  userIds.push(user.id);
  workspaces.push(me.data.workspaceId);
  return { cookie, email, user, workspaceId: me.data.workspaceId as string };
}

afterAll(async () => {
  await db.authSessionRecord.deleteMany({ where: { tokenHash: { in: tokens.map((cookie) => tokenDigest(cookie.split("=")[1])) } } });
  await db.draftSessionRecord.deleteMany({ where: { workspaceId: { in: workspaces } } });
  const owned = await db.organizationRecord.findMany({ where: { ownerUserId: { in: userIds } }, select: { id: true } });
  await db.organizationRecord.deleteMany({ where: { id: { in: [...orgIds, ...owned.map((o) => o.id)] } } });
  await db.authUserRecord.deleteMany({ where: { id: { in: userIds } } });
});

describe("multi-team tenant foundation", () => {
  it("gives each new coach a personal organization and workspace", async () => {
    const coach = await register("Tenant Owner");
    const organizations = await (await orgGET(request("/api/organizations", "GET", undefined, coach.cookie))).json();
    expect(organizations.success).toBe(true);
    expect(organizations.data.organizations).toHaveLength(1);
    expect(organizations.data.organizations[0]).toMatchObject({ role: "owner" });
    expect(organizations.data.organizations[0].workspaces[0].id).toBe(coach.workspaceId);
  });

  it("invites a coach, joins the team workspace, and isolates drafts", async () => {
    const owner = await register("Owner Two");
    const member = await register("Member Two");
    {
      const created = await (await orgPOST(request("/api/organizations", "POST", { name: "Rift Analytics" }, owner.cookie))).json();
      expect(created.success).toBe(true);
      const organizationId = created.data.organizationId as string;
      const workspaceId = created.data.workspaceId as string;
      orgIds.push(organizationId);
      workspaces.push(workspaceId);

      const invited = await (await invitePOST(
        request(`/api/organizations/${organizationId}/members`, "POST", { email: member.email, role: "coach" }, owner.cookie),
        { params: Promise.resolve({ organizationId }) },
      )).json();
      expect(invited.success).toBe(true);
      const token = invited.data.token as string;

      const accepted = await (await acceptPOST(request("/api/organizations/invitations", "POST", { token }, member.cookie))).json();
      expect(accepted.success).toBe(true);
      expect(accepted.data).toMatchObject({ organizationId, workspaceId });

      const before = await (await authGET(request("/api/auth/session", "GET", undefined, member.cookie))).json();
      expect(before.data.workspaceId).toBe(member.workspaceId);

      const switched = await switchPOST(
        request(`/api/workspaces/${workspaceId}/switch`, "POST", undefined, member.cookie),
        { params: Promise.resolve({ workspaceId }) },
      );
      expect(switched.status).toBe(200);
      const after = await (await authGET(request("/api/auth/session", "GET", undefined, member.cookie))).json();
      expect(after.data.workspaceId).toBe(workspaceId);

      const draft = await (await sessionsPOST(request("/api/draft/sessions", "POST", {
        opponentTeamId: "NVX", format: "BO5", rulesetId: "ff-hard-bo5",
      }, owner.cookie))).json();
      const denied = await sessionGET(
        request(`/api/draft/sessions/${draft.data.id}`, "GET", undefined, member.cookie),
        { params: Promise.resolve({ sessionId: draft.data.id }) },
      );
      expect(denied.status).toBe(404);
    }
  });
});
