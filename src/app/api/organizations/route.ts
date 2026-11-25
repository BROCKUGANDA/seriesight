import { handler, ok, parseBody } from "@/lib/api/respond";
import { requireCoach } from "@/lib/auth";
import { createOrganization, listOrganizations } from "@/services/organizations";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const GET = handler(async (req) => {
  const identity = requireCoach();
  return ok({ organizations: await listOrganizations(identity.userId!) }, req);
});

export const POST = handler(async (req) => {
  const identity = requireCoach();
  const body = await parseBody(req, createSchema);
  const created = await createOrganization(identity.userId!, body.name);
  return ok(created, req, { created: true });
});
