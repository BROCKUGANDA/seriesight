import { handler, ok, parseBody } from "@/lib/api/respond";
import { confirmPasswordReset } from "@/lib/account-recovery";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(12).max(128),
});

export const POST = handler(async (req) => {
  const body = await parseBody(req, schema);
  return ok(await confirmPasswordReset(body.token, body.password), req, { note: "Sign in with your new password. Existing sessions were revoked." });
});
