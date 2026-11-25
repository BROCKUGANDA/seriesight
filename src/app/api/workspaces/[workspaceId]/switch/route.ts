import { NextRequest } from "next/server";
import { handler, ok } from "@/lib/api/respond";
import { switchWorkspace } from "@/services/organizations";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ workspaceId: string }> };

export const POST = handler(async (req: NextRequest, { params }: Context) => {
  const { workspaceId } = await params;
  const result = await switchWorkspace(req, workspaceId);
  return ok(result, req, { switched: true });
});
