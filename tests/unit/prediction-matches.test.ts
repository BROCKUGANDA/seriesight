import { describe, expect, it } from "vitest";
import { predictionMatches } from "@/services/prediction-matches";
import type { Game } from "@/domain/types";

describe("GRID-to-model boundary", () => {
  const game = {
    id: "real-game", seriesId: "series", startedAt: "2026-01-01T00:00:00Z", sourceProvider: "grid",
    blueTeamId: "a", redTeamId: "b", winnerTeamId: "b", coverage: { draft: true },
    draft: { picks: [{ side: "BLUE", order: 4, championId: "ahri" }, { side: "BLUE", order: 1, championId: "vi" }, { side: "RED", order: 2, championId: "azir" }] },
  } as Game;
  it("rejects fixture games and unknown outcomes", () => {
    expect(predictionMatches([{ ...game, sourceProvider: "fixture" }, { ...game, winnerTeamId: null }])).toEqual([]);
  });
  it("preserves actual per-side pick order, outcomes, and source identifiers", () => {
    expect(predictionMatches([game])[0]).toMatchObject({ blueChampions: ["vi", "ahri"], redChampions: ["azir"], winner: "red", provenance: { kind: "real", sourceMatchId: "real-game" } });
  });
});
