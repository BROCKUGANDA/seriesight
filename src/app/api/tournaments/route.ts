import { ok, handler } from "@/lib/api/respond";
import { TOURNAMENTS } from "@/fixtures/teams";
import { FIXTURE_SERIES } from "@/fixtures/dataset";

export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  const data = TOURNAMENTS.map((t) => ({
    ...t,
    completedSeries: FIXTURE_SERIES.filter((s) => s.tournamentId === t.id && s.status === "completed").length,
    upcomingSeries: FIXTURE_SERIES.filter((s) => s.tournamentId === t.id && s.status === "upcoming").length,
  }));
  return ok(data, req);
});
