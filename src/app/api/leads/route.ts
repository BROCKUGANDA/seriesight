/**
 * Commercial lead capture — POST /api/leads
 * Stores trial/demo requests from the public site (landing + pricing pages).
 * Follows the uniform envelope and Zod validation conventions of every route.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, handler, parseBody, fail } from "@/lib/api/respond";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const LeadSchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  organization: z.string().trim().min(2, "Tell us your team or organisation.").max(120),
  role: z.enum(["head-coach", "analyst", "player", "manager", "other"]),
  plan: z.enum(["scout", "coach", "org"]),
  message: z.string().trim().max(600).optional(),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const POST = handler(async (req: NextRequest) => {
  const body = await parseBody(req, LeadSchema);

  // Belt-and-braces RFC-lite check for safety across environments.
  if (!EMAIL_RE.test(body.email)) {
    return fail(
      {
        code: "VALIDATION_ERROR",
        message: "The email address looks incomplete.",
        retryable: false,
        recovery: "Check the email field and submit again.",
        details: { issues: [{ path: "email", message: "Invalid email address." }] },
      },
      req,
      400,
    );
  }

  const lead = await db.leadRecord.create({
    data: {
      name: body.name,
      email: body.email,
      organization: body.organization,
      role: body.role,
      plan: body.plan,
      message: body.message ?? null,
      source: "website-trial",
    },
  });

  return ok(
    {
      leadId: lead.id,
      reference: `L-${lead.id.slice(0, 8).toUpperCase()}`,
      receivedAt: lead.createdAt.toISOString(),
    },
    req,
    { leadSource: "website-trial" },
  );
});

export const GET = handler(async (req: NextRequest) => {
  // Administrative summary only — no personal fields leave the server.
  const [total, last7d] = await Promise.all([
    db.leadRecord.count(),
    db.leadRecord.count({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
  ]);
  return ok({ total, last7d }, req);
});
