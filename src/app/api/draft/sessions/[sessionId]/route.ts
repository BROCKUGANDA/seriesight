import { NextRequest } from "next/server";
import { ok, handler } from "@/lib/api/respond";
import { getSession } from "@/services/draft";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) => {
  const { sessionId } = await params;
  const session = await getSession(sessionId);
  return ok(session, req);
});
