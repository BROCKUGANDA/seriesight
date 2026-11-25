import { handler, ok, parseBody } from "@/lib/api/respond";
import { requireCoach } from "@/lib/auth";
import { createTeamWorkspace, listWorkspaces } from "@/services/organizations";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
});

export const GET = handler(async (req) => {
  const identity = requireCoach();
  return ok({ workspaces: await listWorkspaces(identity.userId!) }, req);
});

export const POST = handler(async (req) => {
  const identity = requireCoach();
  const body = await parseBody(req, createSchema);
  const workspace = await createTeamWorkspace(identity.userId!, body.organizationId, body.name);
  return ok(workspace, req, { created: true });
});
