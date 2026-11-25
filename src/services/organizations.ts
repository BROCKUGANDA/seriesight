/**
 * Organization, membership and workspace switching service.
 *
 * A coach's original workspace id remains the id of their personal workspace,
 * so all existing draft sessions stay valid. Team workspaces are additional
 * tenant ids used by the same authorization and scoping paths.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { NextRequest as HttpRequest } from "next/server";
import { db } from "@/lib/db";
import { AppError } from "@/domain/errors";
import { currentWorkspace, requireCoach, SESSION_COOKIE, tokenDigest } from "@/lib/auth";

export const ORGANIZATION_ROLES = ["owner", "coach", "analyst", "viewer"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

const ROLE_RANK: Record<OrganizationRole, number> = { viewer: 0, analyst: 1, coach: 2, owner: 3 };

export function isOrganizationRole(value: string): value is OrganizationRole {
  return (ORGANIZATION_ROLES as readonly string[]).includes(value);
}

function denied(message = "You do not have permission to manage this organization."): AppError {
  return new AppError({ code: "ACCESS_DENIED", message, retryable: false, recovery: "Ask an organization owner for access." });
}

function slugify(value: string): string {
  const slug = value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${slug || "team"}-${randomBytes(4).toString("hex")}`;
}

export function invitationTokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function membershipFor(userId: string, organizationId: string, tx: Prisma.TransactionClient | typeof db = db) {
  return tx.organizationMemberRecord.findFirst({
    where: { userId, organizationId },
    select: { role: true, organizationId: true },
  });
}

export async function requireOrganizationRole(
  userId: string,
  organizationId: string,
  minimum: OrganizationRole,
): Promise<OrganizationRole> {
  const membership = await membershipFor(userId, organizationId);
  if (!membership || !isOrganizationRole(membership.role) || ROLE_RANK[membership.role] < ROLE_RANK[minimum]) throw denied();
  return membership.role;
}

/** Guard for services that act on the currently selected workspace. */
export async function requireWorkspaceRole(minimum: OrganizationRole): Promise<string> {
  const identity = requireCoach();
  if (!identity.userId) throw denied("A coach account is required.");
  const membership = await db.organizationMemberRecord.findFirst({
    where: { userId: identity.userId, organization: { workspaces: { some: { id: currentWorkspace() } } } },
    select: { role: true },
  });
  if (!membership || !isOrganizationRole(membership.role) || ROLE_RANK[membership.role] < ROLE_RANK[minimum]) throw denied();
  return identity.userId;
}

export async function createPersonalOrganization(
  user: { id: string; name: string; email: string; workspaceId: string },
  tx: Prisma.TransactionClient = db as Prisma.TransactionClient,
): Promise<void> {
  const name = `${user.name}'s organisation`;
  await tx.organizationRecord.create({
    data: {
      name,
      slug: slugify(user.name || user.email.split("@")[0]),
      ownerUserId: user.id,
      members: { create: { userId: user.id, role: "owner" } },
      workspaces: { create: { id: user.workspaceId, name: "Personal workspace", kind: "personal" } },
    },
  });
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  kind: string;
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
}

export async function listWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const memberships = await db.organizationMemberRecord.findMany({
    where: { userId },
    include: { organization: { include: { workspaces: true } } },
    orderBy: { joinedAt: "asc" },
  });
  const out: WorkspaceSummary[] = [];
  for (const membership of memberships) {
    if (!isOrganizationRole(membership.role)) continue;
    for (const workspace of membership.organization.workspaces) {
      out.push({
        id: workspace.id,
        name: workspace.name,
        kind: workspace.kind,
        organizationId: membership.organizationId,
        organizationName: membership.organization.name,
        role: membership.role,
      });
    }
  }
  return out;
}

export async function listOrganizations(userId: string) {
  const memberships = await db.organizationMemberRecord.findMany({
    where: { userId },
    include: { organization: { include: { workspaces: { select: { id: true, name: true, kind: true } } } } },
    orderBy: { joinedAt: "asc" },
  });
  return memberships
    .filter((m) => isOrganizationRole(m.role))
    .map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role as OrganizationRole,
      workspaces: m.organization.workspaces,
    }));
}

export async function createOrganization(userId: string, name: string): Promise<{ organizationId: string; workspaceId: string }> {
  const organizationId = randomUUID();
  const workspaceId = randomUUID();
  await db.organizationRecord.create({
    data: {
      id: organizationId,
      name,
      slug: slugify(name),
      ownerUserId: userId,
      members: { create: { userId, role: "owner" } },
      workspaces: { create: { id: workspaceId, name: `${name} workspace`, kind: "team" } },
    },
  });
  return { organizationId, workspaceId };
}

export async function createTeamWorkspace(userId: string, organizationId: string, name: string): Promise<{ id: string; name: string }> {
  await requireOrganizationRole(userId, organizationId, "owner");
  const workspace = await db.workspaceRecord.create({
    data: { id: randomUUID(), organizationId, name, kind: "team" },
    select: { id: true, name: true },
  });
  return workspace;
}

export async function listMembers(userId: string, organizationId: string) {
  await requireOrganizationRole(userId, organizationId, "analyst");
  const members = await db.organizationMemberRecord.findMany({
    where: { organizationId },
    include: { user: { select: { id: true, name: true, email: true, workspaceId: true } } },
    orderBy: { joinedAt: "asc" },
  });
  return members.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    personalWorkspaceId: m.user.workspaceId,
    role: isOrganizationRole(m.role) ? m.role : "viewer",
    joinedAt: m.joinedAt.toISOString(),
  }));
}

export async function inviteMember(
  userId: string,
  organizationId: string,
  email: string,
  role: OrganizationRole,
): Promise<{ invitationId: string; token: string; expiresAt: string }> {
  await requireOrganizationRole(userId, organizationId, "owner");
  if (role === "owner") throw denied("Owner access cannot be granted by invitation.");
  const token = randomBytes(32).toString("hex");
  const invitation = await db.organizationInvitationRecord.create({
    data: {
      organizationId,
      email: email.trim().toLowerCase(),
      role,
      tokenHash: invitationTokenDigest(token),
      invitedByUserId: userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  return { invitationId: invitation.id, token, expiresAt: invitation.expiresAt.toISOString() };
}

export async function acceptInvitation(userId: string, email: string, token: string): Promise<{ organizationId: string; workspaceId: string }> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw denied("That invitation link is invalid.");
  const invitation = await db.organizationInvitationRecord.findUnique({
    where: { tokenHash: invitationTokenDigest(token) },
  });
  if (!invitation || invitation.expiresAt.getTime() <= Date.now() || invitation.acceptedAt) {
    throw denied("That invitation has expired or was already used.");
  }
  if (invitation.email !== email.trim().toLowerCase()) throw denied("This invitation was issued for a different email address.");
  const organization = await db.organizationRecord.findUniqueOrThrow({
    where: { id: invitation.organizationId },
    select: { workspaces: { select: { id: true }, orderBy: { createdAt: "asc" } } },
  });
  const workspaceId = organization.workspaces[0]?.id;
  if (!workspaceId) throw denied("The organization has no active workspace.");

  await db.$transaction(async (tx) => {
    await tx.organizationMemberRecord.upsert({
      where: { organizationId_userId: { organizationId: invitation.organizationId, userId } },
      create: { organizationId: invitation.organizationId, userId, role: invitation.role },
      update: { role: invitation.role },
    });
    await tx.organizationInvitationRecord.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
  });
  return { organizationId: invitation.organizationId, workspaceId };
}

export async function removeMember(userId: string, organizationId: string, memberUserId: string): Promise<void> {
  await requireOrganizationRole(userId, organizationId, "owner");
  const organization = await db.organizationRecord.findUniqueOrThrow({ where: { id: organizationId }, select: { ownerUserId: true } });
  if (memberUserId === organization.ownerUserId) throw denied("The organization owner cannot be removed.");
  await db.organizationMemberRecord.deleteMany({ where: { organizationId, userId: memberUserId } });
}

export async function switchWorkspace(req: HttpRequest, workspaceId: string): Promise<{ workspaceId: string }> {
  const identity = requireCoach();
  if (!identity.userId) throw denied("A coach account is required.");
  const membership = await db.organizationMemberRecord.findFirst({
    where: { userId: identity.userId, organization: { workspaces: { some: { id: workspaceId } } } },
    select: { id: true },
  });
  if (!membership) throw denied("You are not a member of that workspace.");
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) throw denied();
  await db.authSessionRecord.updateMany({
    where: { tokenHash: tokenDigest(token) },
    data: { workspaceId },
  });
  return { workspaceId };
}

export async function assertWorkspaceAccess(userId: string, workspaceId: string): Promise<void> {
  const membership = await db.organizationMemberRecord.findFirst({
    where: { userId, organization: { workspaces: { some: { id: workspaceId } } } },
    select: { id: true },
  });
  if (!membership) throw denied();
}
