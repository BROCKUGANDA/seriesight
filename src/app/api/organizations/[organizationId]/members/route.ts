import { NextRequest } from "next/server";
import { handler, ok } from "@/lib/api/respond";
import { requireCoach } from "@/lib/auth";
import { inviteMember, listMembers, removeMember } from "@/services/organizations";
import { z } from "zod";

export const dynamic = "force-dynamic";

const inviteSchema = z.object({
  action: z.literal("invite").default("invite"),
  email: z.email().max(254),
  role: z.enum(["coach", "analyst", "viewer"]),
});

const removeSchema = z.object({
  action: z.literal("remove"),
  userId: z.string().uuid(),
});

type Context = { params: Promise<{ organizationId: string }> };

export const GET = handler(async (req: NextRequest, { params }: Context) => {
  const identity = requireCoach();
  const { organizationId } = await params;
  return ok({ members: await listMembers(identity.userId!, organizationId) }, req);
});

export const POST = handler(async (req: NextRequest, { params }: Context) => {
  const identity = requireCoach();
  const { organizationId } = await params;
  const raw = await req.json().catch(() => ({}));
  const body = raw && typeof raw === "object" && "action" in raw && raw.action === "remove"
    ? removeSchema.parse(raw)
    : inviteSchema.parse(raw);
  if (body.action === "remove") {
    await removeMember(identity.userId!, organizationId, body.userId);
    return ok({ removed: true }, req);
  }
  const result = await inviteMember(identity.userId!, organizationId, body.email, body.role);
  return ok(result, req, { note: "The invitation token is shown once. Deliver it securely to the invitee." });
});
