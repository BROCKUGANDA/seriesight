import { handler, ok, parseBody } from "@/lib/api/respond";
import { authError, hashPassword, issueSession, resolveIdentity, revokeSession, throttleAuth, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { createPersonalOrganization } from "@/services/organizations";
import { issueEmailVerification } from "@/lib/account-recovery";

export const dynamic = "force-dynamic";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("demo") }),
  z.object({ action: z.literal("logout") }),
  z.object({ action: z.literal("login"), email: z.email().max(254), password: z.string().min(1).max(128) }),
  z.object({ action: z.literal("register"), email: z.email().max(254), password: z.string().min(12).max(128), name: z.string().trim().min(1).max(80), inviteCode: z.string().max(256) }),
]);
export const GET = handler(async (req) => ok(await resolveIdentity(req), req));
export const DELETE = handler(async (req) => {
  const response = ok(null, req);
  await revokeSession(req, response);
  return response;
});
export const POST = handler(async (req) => {
  const body = await parseBody(req, schema);
  if (body.action === "logout") {
    const response = ok(null, req);
    await revokeSession(req, response);
    return response;
  }
  await throttleAuth(req, "email" in body ? body.email.toLowerCase() : "");
  const response = ok({ created: true }, req);
  if (body.action === "demo") {
    await issueSession(req, response);
    return response;
  }
  const email = body.email.trim().toLowerCase();
  if (body.action === "register") {
    const invite = process.env.AUTH_INVITE_CODE;
    const digest = (s: string) => createHash("sha256").update(s).digest();
    if (!invite || !timingSafeEqual(digest(invite), digest(body.inviteCode))) throw authError("Registration requires a valid coach invitation.", true);
    const existing = await db.authUserRecord.findUnique({ where: { email } });
    if (existing) throw authError("Unable to register. Try signing in instead.", true);
    const passwordHash = await hashPassword(body.password);
    const user = await db.$transaction(async (tx) => {
      const created = await tx.authUserRecord.create({
        data: { email, name: body.name, passwordHash, workspaceId: randomUUID() },
      });
      await createPersonalOrganization(created, tx);
      return created;
    });
    await issueEmailVerification(user.id, user.email);
    await issueSession(req, response, user);
    return response;
  }
  const user = await db.authUserRecord.findUnique({ where: { email } });
  // Perform the same password KDF even for unknown accounts.
  const valid = await verifyPassword(body.password, user?.passwordHash ?? `${"0".repeat(32)}:${"0".repeat(128)}`);
  if (!user || !valid) throw authError("Email or password is incorrect.");
  await issueSession(req, response, user);
  return response;
});
