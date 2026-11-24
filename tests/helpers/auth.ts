import { beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { identityContext, SESSION_COOKIE, tokenDigest, type Identity } from "@/lib/auth";

const token = randomBytes(32).toString("hex");
export const testIdentity: Identity = {
  userId: null, workspaceId: `test-${randomUUID()}`, name: "Test demo", email: "test@local.invalid",
  kind: "judge", role: "Test sandbox", signedInAt: new Date().toISOString(),
};
beforeAll(async () => {
  await db.authSessionRecord.create({ data: { tokenHash: tokenDigest(token), workspaceId: testIdentity.workspaceId, expiresAt: new Date(Date.now() + 3600000) } });
});
beforeEach(() => { identityContext.enterWith(testIdentity); });
afterAll(async () => {
  await db.authSessionRecord.deleteMany({ where: { tokenHash: tokenDigest(token) } });
});
export class AuthenticatedRequest extends NextRequest {
  constructor(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
    const headers = new Headers(init?.headers);
    headers.set("cookie", `${SESSION_COOKIE}=${token}`);
    headers.set("origin", new URL(url).origin);
    super(url, { ...init, headers });
  }
}
