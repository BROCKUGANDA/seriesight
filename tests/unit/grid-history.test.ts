import { beforeEach, describe, expect, it, vi } from "vitest";
import { identityContext, type Identity } from "@/lib/auth";
import { normalizeGridHistory } from "@/lib/providers/grid/grid-history";
import { HISTORICAL_STATE_SELECTION, inspectGridSchema } from "@/lib/providers/grid/grid-schema";
import { getHistoricalSeries, gridHistoryToDataset, loadSelectedDataset, persistGridHistoricalSeries, selectedDataset, withSelectedDataset } from "@/services/dataset";

const records = vi.hoisted(() => new Map<string, { provider: string; metadataJson: string }>());
vi.mock("@/lib/db", () => ({ db: {
  dataSourceConnectionRecord: {
    upsert: vi.fn(async ({ create }: { create: { provider: string; metadataJson: string } }) => records.set(create.provider, create)),
    findMany: vi.fn(async ({ where }: { where: { provider: { startsWith: string } } }) => [...records.values()].filter((r) => r.provider.startsWith(where.provider.startsWith))),
  },
  organizationMemberRecord: {
    findFirst: vi.fn(async ({ where }: { where: { userId: string } }) => ({ role: "owner", organizationId: `org-${where.userId}` })),
  },
} }));

const identity = (workspaceId: string, kind: Identity["kind"] = "coach"): Identity => ({ workspaceId, kind, userId: kind === "coach" ? workspaceId : null, name: "Test", email: "test@example.invalid", role: "test", signedInAt: "2026-01-01T00:00:00Z" });
// Deliberately synthetic provider payload; never presented as actual GRID data.
function payload() {
  const teams = [{ id: "a", name: "Synthetic A" }, { id: "b", name: "Synthetic B" }];
  const central = { series: { id: "test", startTimeScheduled: "2026-01-01T00:00:00Z", title: { nameShortened: "lol" }, tournament: { id: "t", name: "Synthetic" }, teams: teams.map((baseInfo) => ({ baseInfo })) } };
  const game = { id: "g1", sequenceNumber: 1, finished: true, duration: 1800,
    teams: teams.map((t, i) => ({ ...t, side: i === 0 ? "blue" : "red", won: i === 0, players: [] })),
    draftActions: Array.from({ length: 10 }, (_, i) => ({ type: "pick", sequenceNumber: i + 1, drafter: { id: i < 5 ? "a" : "b", type: "team" }, draftable: { id: `c${i}`, name: `SyntheticChampion${i}`, type: "champion" } })),
  };
  const state = { seriesState: { id: "test", finished: true, updatedAt: "2026-01-01T01:00:00Z", format: "best-of-1", title: { nameShortened: "lol" }, teams: teams.map((t, i) => ({ ...t, won: i === 0 })), games: [game] } };
  return { central, state, game };
}
const history = () => { const p = payload(); return normalizeGridHistory(p.central, p.state, "test"); };

describe("GRID historical normalization", () => {
  it("accepts omitted nullable introspection metadata and avoids the broken duration resolver", async () => {
    const scalar = (name: string) => ({ kind: "SCALAR", name });
    const field = (name: string, type: object, args: object[] = []) => ({ name, type, args });
    const lookupArgs = [{ name: "id", type: { kind: "NON_NULL", ofType: scalar("ID") } }];
    const schema = { queryType: { name: "Query" }, types: [
      { kind: "OBJECT", name: "Query", fields: [field("seriesState", { kind: "OBJECT", name: "SeriesState" }, lookupArgs)] },
      { kind: "OBJECT", name: "SeriesState", fields: [field("id", scalar("ID")), field("games", { kind: "LIST", ofType: { kind: "OBJECT", name: "Game" } })] },
      { kind: "OBJECT", name: "Game", fields: [field("duration", scalar("Duration")), field("startedAt", scalar("DateTime")), field("clock", { kind: "OBJECT", name: "Clock" })] },
      { kind: "OBJECT", name: "Clock", fields: [field("currentSeconds", scalar("Int"))] },
      ...["ID", "Duration", "Int", "DateTime"].map((name) => ({ kind: "SCALAR", name })),
    ] };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { __schema: schema } })));
    try {
      const inspected = await inspectGridSchema("seriesState", { apiKey: "synthetic", timeoutMs: 1000, maxRetries: 0 });
      const query = inspected.query("seriesState", "id", HISTORICAL_STATE_SELECTION);
      expect(query).toContain("clock { currentSeconds }");
      expect(query).not.toContain("duration");
      expect(query).not.toContain("startedAt");
      lookupArgs.push({ name: "unsupported", type: { kind: "NON_NULL", ofType: scalar("ID") } });
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { __schema: schema } })));
      const requiredArgumentSchema = await inspectGridSchema("seriesState", { apiKey: "synthetic", timeoutMs: 1000, maxRetries: 0 });
      expect(() => requiredArgumentSchema.query("seriesState", "id", HISTORICAL_STATE_SELECTION)).toThrow("required series lookup");
    } finally { fetchMock.mockRestore(); }
  });
  it("retains real outcomes without inventing patch, roles, bans or events", () => {
    const h = history();
    expect(h.winnerTeamId).toBe("a");
    expect(h.patch).toBeNull();
    expect(h.games[0].picks).toHaveLength(10);
    expect(h.games[0].picks.every((p) => p.role === null && p.playerId === null)).toBe(true);
    expect(h.games[0].bans).toEqual([]);
    const dataset = gridHistoryToDataset([h]);
    expect(dataset.provider).toBe("grid");
    expect(dataset.games).toEqual([]);
    expect(dataset.historicalSeries).toHaveLength(1);
  });
  it("rejects unfinished games, mismatched identities and ambiguous winners", () => {
    const p = payload();
    expect(() => normalizeGridHistory(p.central, p.state, "other")).toThrow();
    p.game.finished = false;
    expect(() => normalizeGridHistory(p.central, p.state, "test")).toThrow();
    p.game.finished = true;
    p.game.teams[1].won = true;
    expect(() => normalizeGridHistory(p.central, p.state, "test")).toThrow();
  });
});

describe("GRID workspace dataset selection", () => {
  beforeEach(() => records.clear());
  it("persists idempotently and never loads another coach's history", async () => {
    await identityContext.run(identity("a"), async () => {
      await persistGridHistoricalSeries(history());
      await persistGridHistoricalSeries(history());
      expect(await getHistoricalSeries()).toHaveLength(1);
      await withSelectedDataset(async (dataset) => {
        expect(dataset.provider).toBe("grid");
        expect(selectedDataset()).toBe(dataset);
        await identityContext.run(identity("b"), async () => {
          expect(selectedDataset()).toBeUndefined();
          expect((await loadSelectedDataset()).provider).toBe("fixture");
        });
      });
      expect(selectedDataset()).toBeUndefined();
    });
    expect(records.size).toBe(1);
  });
  it("keeps demo fixture-only and rejects demo persistence", async () => {
    await identityContext.run(identity("a"), () => persistGridHistoricalSeries(history()));
    await identityContext.run(identity("a", "judge"), async () => {
      expect(await getHistoricalSeries()).toEqual([]);
      expect((await loadSelectedDataset()).provider).toBe("fixture");
      await expect(persistGridHistoricalSeries(history())).rejects.toThrow();
    });
  });
});