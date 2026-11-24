import { ok, handler } from "@/lib/api/respond";
import { analyticsDataset, datasetTournaments } from "@/domain/analytics/scouting-context";

export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  const dataset = analyticsDataset();
  const data = datasetTournaments(dataset).map((t) => ({
    ...t,
    provider: dataset.provider, label: dataset.label, warnings: dataset.warnings,
    completedSeries: dataset.series.filter((s) => s.tournamentId === t.id && s.status === "completed").length,
    upcomingSeries: dataset.series.filter((s) => s.tournamentId === t.id && s.status === "upcoming").length,
  }));
  return ok(data, req);
});
