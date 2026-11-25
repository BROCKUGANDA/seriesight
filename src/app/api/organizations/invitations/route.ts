import { handler, ok, parseBody } from "@/lib/api/respond";
import { requireCoach } from "@/lib/auth";
import { acceptInvitation } from "@/services/organizations";
import { z } from "zod";

export const dynamic = "force-dynamic";

const acceptSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
});

export const POST = handler(async (req) => {
  const identity = requireCoach();
  const body = await parseBody(req, acceptSchema);
  const accepted = await acceptInvitation(identity.userId!, identity.email, body.token);
  return ok(accepted, req, { joined: true });
});
