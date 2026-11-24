import { ok, handler } from "@/lib/api/respond";
import { listTeams } from "@/services/scouting";
import { analyticsDataset } from "@/domain/analytics/scouting-context";

export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  const { provider, label, warnings } = analyticsDataset();
  return ok(listTeams().map((t) => ({ ...t, provider, label, warnings })), req);
});
