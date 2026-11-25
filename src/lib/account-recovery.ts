/**
 * Email verification and password recovery tokens.
 *
 * Tokens are 256-bit random values stored only as SHA-256 digests. All flows
 * return generic outcomes to avoid account enumeration.
 */
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { AppError } from "@/domain/errors";
import { hashPassword, tokenDigest } from "@/lib/auth";
import { deliverTransactionalEmail } from "@/lib/email";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

function invalidToken(): AppError {
  return new AppError({
    code: "VALIDATION_ERROR",
    message: "That link is invalid or has expired.",
    retryable: false,
    recovery: "Request a fresh link and try again.",
  });
}

function appOrigin(): string {
  return process.env.APP_ORIGIN ?? "http://localhost:3000";
}

async function issueToken(userId: string, email: string, purpose: "verify_email" | "reset_password"): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await db.authVerificationRecord.create({
    data: {
      userId,
      purpose,
      tokenHash: tokenDigest(token),
      expiresAt: new Date(Date.now() + (purpose === "verify_email" ? VERIFY_TTL_MS : RESET_TTL_MS)),
    },
  });
  const route = purpose === "verify_email" ? "verify-email" : "reset-password";
  const link = `${appOrigin()}/#/signin?${route}=${token}`;
  const subject = purpose === "verify_email" ? "Verify your Seriesight email" : "Reset your Seriesight password";
  const text = purpose === "verify_email"
    ? `Open this link to verify your email:\n${link}\n\nIf you did not create this account, ignore this message.`
    : `Open this link to choose a new password:\n${link}\n\nThe link expires in one hour. If you did not request a reset, ignore this message.`;
  await deliverTransactionalEmail({ to: email, subject, text, purpose, devToken: token });
}

export async function issueEmailVerification(userId: string, email: string): Promise<void> {
  await issueToken(userId, email, "verify_email");
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await db.authUserRecord.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true, email: true } });
  // Always deliver nothing for unknown accounts, but never reveal that fact.
  if (user) await issueToken(user.id, user.email, "reset_password");
}

export async function verifyEmail(token: string): Promise<{ verified: true }> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw invalidToken();
  const record = await db.authVerificationRecord.findUnique({ where: { tokenHash: tokenDigest(token) } });
  if (!record || record.purpose !== "verify_email" || record.consumedAt || record.expiresAt.getTime() <= Date.now()) throw invalidToken();
  await db.$transaction(async (tx) => {
    await tx.authUserRecord.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
    await tx.authVerificationRecord.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
  });
  return { verified: true };
}

export async function confirmPasswordReset(token: string, password: string): Promise<{ reset: true }> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw invalidToken();
  const record = await db.authVerificationRecord.findUnique({ where: { tokenHash: tokenDigest(token) } });
  if (!record || record.purpose !== "reset_password" || record.consumedAt || record.expiresAt.getTime() <= Date.now()) throw invalidToken();
  const passwordHash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    await tx.authUserRecord.update({ where: { id: record.userId }, data: { passwordHash } });
    await tx.authVerificationRecord.updateMany({
      where: { userId: record.userId, purpose: "reset_password", consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.authSessionRecord.deleteMany({ where: { userId: record.userId } });
  });
  return { reset: true };
}
