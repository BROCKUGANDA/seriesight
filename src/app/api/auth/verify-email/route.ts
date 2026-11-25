import { handler, ok, parseBody } from "@/lib/api/respond";
import { verifyEmail } from "@/lib/account-recovery";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });

export const POST = handler(async (req) => {
  const body = await parseBody(req, schema);
  return ok(await verifyEmail(body.token), req);
});
