import { beforeEach, describe, expect, it, vi } from "vitest";
import { identityContext, SESSION_COOKIE, tokenDigest, type Identity } from "@/lib/auth";
import { NextRequest } from "next/server";
import { GET as teamsGET } from "@/app/api/teams/route";
import { GET as tournamentsGET } from "@/app/api/tournaments/route";
import { GET as seriesGET } from "@/app/api/series/route";
import { GET as dashboardGET } from "@/app/api/dashboard/route";
import { CHAMPIONS } from "@/fixtures/champions";
import { type GridHistoricalSeries } from "@/lib/providers/grid/grid-history";
import { persistGridHistoricalSeries, withSelectedDataset } from "@/services/dataset";
import { ScoutingContext, buildInsights, datasetTournaments } from "@/domain/analytics/scouting-context";
import { getOpponentProfile, getOpponentTrends, listTeams } from "@/services/scouting";
import { getEvidence, listEvidence } from "@/services/evidence";
import { gameDetail, getMacroAnalysis, seriesDetail } from "@/services/macro";

const records = vi.hoisted(() => new Map<string, { provider: string; metadataJson: string }>());
const sessions = vi.hoisted(() => new Map<string, { userId: string; workspaceId: string; expiresAt: Date; createdAt: Date }>());
const rateBuckets = vi.hoisted(() => new Map<string, number>());
vi.mock("@/lib/db", () => ({ db: {
  authSessionRecord: { findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => sessions.get(where.tokenHash) ?? null) },
  authUserRecord: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, workspaceId: where.id, name: "Test coach", email: "test@example.invalid" })) },
  draftSessionRecord: { findMany: vi.fn(async () => []) },
  dataSourceConnectionRecord: {
  upsert: vi.fn(async ({ create, update }: { create: { provider: string; metadataJson: string }; update: { metadataJson: string } }) => records.set(create.provider, { ...create, ...update })),
  findMany: vi.fn(async ({ where }: { where: { provider: { startsWith: string } } }) => [...records.values()].filter((r) => r.provider.startsWith(where.provider.startsWith))),
},
  requestRateLimitRecord: {
    upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { key: string; attempts: number; expiresAt: Date } }) => {
      const attempts = (rateBuckets.get(where.key) ?? 0) + 1;
      rateBuckets.set(where.key, attempts);
      return { ...create, attempts };
    }),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
} }));

const identity = (workspaceId: string, kind: Identity["kind"] = "coach"): Identity => ({
  workspaceId, kind, userId: kind === "coach" ? workspaceId : null,
  name: "Test", email: "test@example.invalid", role: "test", signedInAt: "2026-01-01T00:00:00Z",
});

// Synthetic test observations only; never claimed as credential-backed GRID results.
function history(id: string, unknownChampion = false): GridHistoricalSeries {
  return {
    provider: "grid", seriesId: id, datasetId: `grid:${id}`, fetchedAt: "2026-01-02T00:00:00Z",
    providerUpdatedAt: "2026-01-01T01:00:00Z", startedAt: "2026-01-01T00:00:00Z",
    tournament: { id: "event", name: "Synthetic event" }, teams: [{ id: "a", name: "Synthetic A" }, { id: "b", name: "Synthetic B" }],
    winnerTeamId: "a", format: "BO1", patch: null,
    games: [{ id: "g1", gameNumber: 1, blueTeamId: "a", redTeamId: "b", winnerTeamId: "a", durationSec: 1800,
      picks: CHAMPIONS.slice(0, 10).map((c, i) => ({ championName: unknownChampion && i === 0 ? "Unknown character" : c.displayName,
        providerChampionId: c.id, teamId: i < 5 ? "a" : "b", side: i < 5 ? "BLUE" : "RED", order: i + 1, playerId: null, role: null })),
      bans: [{ championName: CHAMPIONS[10].displayName, providerChampionId: CHAMPIONS[10].id, teamId: "a", side: "BLUE", order: 1 }],
    }], warnings: ["Synthetic test history. Roles, patch and objectives unavailable."],
  };
}

async function seed(workspace = "analytics-a", unknownChampion = false) {
  await identityContext.run(identity(workspace), async () => {
    for (let i = 0; i < 3; i++) await persistGridHistoricalSeries(history(`s${i}`, unknownChampion));
  });
}

describe("workspace-selected GRID analytics", () => {
  beforeEach(() => { records.clear(); sessions.clear(); rateBuckets.clear(); });

  it("preserves no-auth fixture unit use", () => {
    expect(listTeams().some((t) => t.id === "NVX")).toBe(true);
    const ctx = new ScoutingContext("NVX");
    expect(ctx.summary.gamesAnalyzed).toBeGreaterThan(0);
    expect(buildInsights(ctx).every((i) => i.dataProvenance === "fixture")).toBe(true);
  });

  it("uses imported team/series identities and trends without inferring roles", async () => {
    await seed();
    await identityContext.run(identity("analytics-a"), () => withSelectedDataset(async () => {
      expect(listTeams().map((t) => t.id)).toEqual(["grid:a", "grid:b"]);
      expect(datasetTournaments()[0]).toMatchObject({ id: "grid:event", draftPolicy: null });
      const ctx = new ScoutingContext("grid:a", { tournamentId: "grid:event" });
      expect(ctx.games).toEqual([]); // Legacy Game requires known roles; draft-only projection does not.
      expect(ctx.summary).toMatchObject({ gamesAnalyzed: 3, seriesAnalyzed: 3, coverage: { draft: 3, players: 0, objectives: 0 } });
      expect(ctx.draftGames.every((g) => g.draft.picks.every((p) => p.role === null))).toBe(true);
      expect(ctx.usageFor(CHAMPIONS[0].id)?.picks).toBe(3);
      expect(ctx.usageFor(CHAMPIONS[10].id)?.bans).toBe(3);
      expect(new ScoutingContext("grid:a", { tournamentId: "not-imported" }).summary.gamesAnalyzed).toBe(0);
      expect(new ScoutingContext("grid:a", { role: "TOP" }).usageList().every((u) => u.picks === 0)).toBe(true);
      const profile = await getOpponentProfile("grid:a", {});
      expect(profile.provider).toBe("grid");
      expect(profile.insights.length).toBeGreaterThan(0);
      expect(profile.players).toEqual([]);
      const trends = await getOpponentTrends("grid:a", {});
      expect(trends.repeatedCompositions[0].occurrences).toBe(3);
      expect(trends.insights.find((i) => i.insightType === "composition-repeat")?.metric.denominator).toBe(3);
      expect(trends.crossGame[0].games).toBe(3);
      await expect(getOpponentProfile("NVX", {})).rejects.toThrow();
      expect(seriesDetail("grid:s0")?.teamAId).toBe("grid:a");
      expect(gameDetail("non-imported-fixture-id")).toBeNull();
      const macro = await getMacroAnalysis("grid:a", {});
      expect(macro.provider).toBe("grid");
      expect(macro.gamesAnalyzed).toBe(3);
      expect(macro.excludedGames).toHaveLength(3);
      expect(macro.modules.find((m) => m.id === "duration")?.stat?.value).toBe(1800);
      expect(macro.modules.filter((m) => m.id !== "duration").every((m) => m.status === "unavailable")).toBe(true);
    }));
  });

  it("isolates evidence between coaches, demo identities and dataset revisions", async () => {
    await seed();
    let evidenceId = "";
    await identityContext.run(identity("analytics-a"), () => withSelectedDataset(async () => {
      const profile = await getOpponentProfile("grid:a", {});
      evidenceId = profile.insights[0].evidenceId;
      const evidence = getEvidence(evidenceId)!;
      expect(evidence.provider).toBe("grid");
      expect(evidence.ingestedAt).toBe("2026-01-02T00:00:00Z");
      expect(evidence.limitations.join(" ")).not.toMatch(/Fixture dataset:|Do not cite fixture/);
      expect(evidence.gameIds.every((id) => id.startsWith("grid:"))).toBe(true);
      expect(profile.insights.every((i) => i.workspaceId === "analytics-a")).toBe(true);
      await identityContext.run(identity("analytics-b"), () => withSelectedDataset(() => {
        expect(getEvidence(evidenceId)).toBeNull();
        expect(listEvidence().every((e) => e.provider === "fixture")).toBe(true);
      }));
    }));
    // Separate hydrated request can resolve the same workspace's evidence.
    await identityContext.run(identity("analytics-a"), () => withSelectedDataset(() => expect(getEvidence(evidenceId)).not.toBeNull()));
    await identityContext.run(identity("analytics-a", "judge"), () => withSelectedDataset(() => expect(getEvidence(evidenceId)).toBeNull()));
    await seed("analytics-b");
    await identityContext.run(identity("analytics-b"), () => withSelectedDataset(async () => {
      expect(getEvidence(evidenceId)).toBeNull();
      expect((await getOpponentProfile("grid:a", {})).insights[0].evidenceId).not.toBe(evidenceId);
    }));
    await seed("analytics-a", true);
    await identityContext.run(identity("analytics-a"), () => withSelectedDataset(() => {
      expect(getEvidence(evidenceId)).toBeNull();
      expect(new ScoutingContext("grid:a").usageList()).toEqual([]);
    }));
  });

  it("serves selected teams, tournaments, series and dashboard through authenticated hydration", async () => {
    await seed();
    const token = "a".repeat(64);
    sessions.set(tokenDigest(token), { userId: "analytics-a", workspaceId: "analytics-a", expiresAt: new Date(Date.now() + 60000), createdAt: new Date() });
    const req = (path: string) => new NextRequest(`http://localhost/api/${path}`, { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
    const teams = await (await teamsGET(req("teams"))).json();
    expect(teams.success).toBe(true);
    expect(teams.data.map((t: { id: string }) => t.id)).toEqual(["grid:a", "grid:b"]);
    expect(teams.data[0].provider).toBe("grid");
    const tournaments = await (await tournamentsGET(req("tournaments"))).json();
    expect(tournaments.data[0]).toMatchObject({ id: "grid:event", completedSeries: 3, draftPolicy: null });
    const series = await (await seriesGET(req("series?teamId=grid%3Aa"))).json();
    expect(series.data).toHaveLength(3);
    expect(series.data[0]).toMatchObject({ teamA: "Synthetic A", tournament: "Synthetic event", fearless: null, provider: "grid" });
    const dashboard = await (await dashboardGET(req("dashboard"))).json();
    expect(dashboard.success).toBe(true);
    expect(dashboard.data.dataset).toMatchObject({ provider: "grid", seriesCount: 3, gameCount: 3, opponents: 2 });
    expect(dashboard.data.priorityInsights.every((i: { dataProvenance: string }) => i.dataProvenance === "grid")).toBe(true);
    await identityContext.run(identity("analytics-a"), () => withSelectedDataset(() => {
      expect(getEvidence(dashboard.data.dataset.evidenceIds.gameCount)?.provider).toBe("grid");
    }));
  });
});