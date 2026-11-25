import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AppError } from "@/domain/errors";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-seriesight" : "seriesight-session";
const SESSION_SECONDS = 60 * 60 * 12;
export interface Identity {
  userId: string | null;
  workspaceId: string;
  name: string;
  email: string;
  kind: "judge" | "coach";
  role: string;
  signedInAt: string;
  emailVerified?: boolean;
}
export const identityContext = new AsyncLocalStorage<Identity>();
export function authError(message = "Sign in to continue.", forbidden = false): AppError {
  return new AppError({ code: forbidden ? "ACCESS_DENIED" : "SESSION_EXPIRED", message, retryable: false, recovery: "Sign in again or open a new fixture demo." });
}
export function currentWorkspace(): string {
  const identity = identityContext.getStore();
  if (!identity) throw authError();
  return identity.workspaceId;
}
export function requireCoach(): Identity {
  const identity = identityContext.getStore();
  if (!identity || identity.kind !== "coach") throw authError("A coach account is required.", true);
  return identity;
}
export const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [salt, value] = encoded.split(":");
  if (!salt || !value || !/^[a-f0-9]{128}$/.test(value)) return false;
  const hash = await scrypt(password, salt, 64) as Buffer;
  return timingSafeEqual(hash, Buffer.from(value, "hex"));
}
export function assertSameOrigin(req: NextRequest): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const expected = process.env.APP_ORIGIN || req.nextUrl.origin;
  if (req.headers.get("origin") !== expected) throw authError("Cross-origin or missing-origin requests are not allowed.", true);
}
export async function throttleAuth(req: NextRequest, account = ""): Promise<void> {
  // Only trust the edge's address when explicitly configured by the operator.
  const ip = process.env.TRUST_AUTH_PROXY === "true" ? req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown" : "shared";
  const window = Math.floor(Date.now() / 900000);
  const buckets: [string, number][] = [[`ip:${ip}`, 100]];
  if (account) buckets.push([`account:${account}`, 15]);
  for (const [bucket, limit] of buckets) {
    const key = `${window}:${tokenDigest(bucket)}`;
    const row = await db.authThrottleRecord.upsert({ where: { key }, create: { key }, update: { attempts: { increment: 1 } } });
    if (row.attempts > limit) throw new AppError({ code: "RATE_LIMITED", message: "Too many sign-in attempts.", retryable: true, recovery: "Wait 15 minutes before trying again." });
  }
}
export async function resolveIdentity(req: NextRequest): Promise<Identity | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await db.authSessionRecord.findUnique({ where: { tokenHash: tokenDigest(token) } });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  const user = session.userId ? await db.authUserRecord.findUnique({ where: { id: session.userId } }) : null;
  if (session.userId && !user) return null;
  return {
    userId: user?.id ?? null, workspaceId: session.workspaceId,
    name: user?.name ?? "Fixture Demo Guest", email: user?.email ?? "demo@local.invalid",
    kind: user ? "coach" : "judge", role: user ? "Private coach workspace" : "Isolated fixture sandbox",
    signedInAt: session.createdAt.toISOString(),
    emailVerified: user ? user.emailVerifiedAt !== null : undefined,
  };
}
export async function issueSession(req: NextRequest, response: NextResponse, user?: { id: string; workspaceId: string }): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const previous = req.cookies.get(SESSION_COOKIE)?.value;
  await db.authSessionRecord.create({ data: {
    tokenHash: tokenDigest(token), userId: user?.id ?? null,
    workspaceId: user?.workspaceId ?? `demo-${randomUUID()}`,
    expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000),
  } });
  if (previous) await db.authSessionRecord.deleteMany({ where: { tokenHash: tokenDigest(previous) } });
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_SECONDS });
}
export async function revokeSession(req: NextRequest, response: NextResponse): Promise<void> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await db.authSessionRecord.deleteMany({ where: { tokenHash: tokenDigest(token) } });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}
