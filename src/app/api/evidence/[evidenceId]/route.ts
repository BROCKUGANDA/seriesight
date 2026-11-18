import { NextRequest } from "next/server";
import { ok, handler } from "@/lib/api/respond";
import { getEvidence, listEvidence } from "@/services/evidence";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest, { params }: { params: Promise<{ evidenceId: string }> }) => {
  const { evidenceId } = await params;
  if (evidenceId === "all") {
    return ok(listEvidence(), req);
  }
  const record = getEvidence(evidenceId);
  if (!record) {
    return ok({ found: false, evidenceId }, req);
  }
  return ok({ found: true, record }, req);
});
