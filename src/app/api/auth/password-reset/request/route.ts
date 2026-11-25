import { handler, ok, parseBody } from "@/lib/api/respond";
import { requestPasswordReset } from "@/lib/account-recovery";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({ email: z.email().max(254) });

export const POST = handler(async (req) => {
  const body = await parseBody(req, schema);
  await requestPasswordReset(body.email);
  return ok({ accepted: true }, req, { note: "If the account exists, a reset link has been sent." });
});
