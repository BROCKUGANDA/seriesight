import { ok, handler } from "@/lib/api/respond";
import { listTeams } from "@/services/scouting";

export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  return ok(listTeams(), req);
});
