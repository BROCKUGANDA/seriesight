import { beforeAll, describe, expect, it } from "vitest";
import {
  trainWinModel, predictWinProbability, scoreProbabilities, validateArtifact,
  type LabelledMatch, type WinModelArtifact,
} from "../../src/domain/prediction";

// Algorithm-only test doubles for an attested ingestion boundary. These are NOT
// real observations, production training data, or evidence of predictive quality.
function ingestionDoubles(): LabelledMatch[] {
  return Array.from({ length: 500 }, (_, i) => {
    const favored = i % 2 === 0;
    const a = ["a", "b", "c", "d", "e"], b = ["f", "g", "h", "i", "j"];
    return {
      matchId: `m${i}`, seriesId: `s${Math.floor(i / 2)}`,
      startedAt: new Date(Date.UTC(2020, 0, 1) + i * 3600000).toISOString(),
      blueChampions: favored ? a : b, redChampions: favored ? b : a,
      winner: (Math.floor(i / 2) % 5 === 0 ? !favored : favored) ? "blue" : "red",
      provenance: { kind: "real", source: "TEST-DOUBLE-NOT-REAL", sourceMatchId: `m${i}` },
    };
  });
}

describe("outcome-based draft model", () => {
  let artifact: WinModelArtifact;
  beforeAll(() => {
    const result = trainWinModel(ingestionDoubles());
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error(result.reason);
    artifact = result.artifact;
  });

  it("reproduces exactly regardless of input order, without mutating input", () => {
    const matches = ingestionDoubles().reverse();
    const before = JSON.stringify(matches);
    expect(trainWinModel(matches)).toEqual({ status: "ready", artifact });
    expect(JSON.stringify(matches)).toBe(before);
    expect(validateArtifact(JSON.parse(JSON.stringify(artifact))).status).toBe("ready");
  });

  it("keeps series and chronological ranges disjoint and counts matches, not prefixes", () => {
    const { train, calibration, test } = artifact.split;
    expect([train.matches, calibration.matches, test.matches]).toEqual([300, 100, 100]);
    expect(train.last).toBeLessThan(calibration.first);
    expect(calibration.last).toBeLessThan(test.first);
    expect(new Set([...train.series, ...calibration.series, ...test.series]).size).toBe(250);
    expect(artifact.stages["5:5"].test.model.brier).toBeLessThan(artifact.stages["5:5"].test.baseline.brier);
    expect(artifact.stages["5:5"].test.model.logloss).toBeLessThan(Math.log(2));
  });

  it("supports partial/empty drafts with stage metrics and complementary side probabilities", () => {
    for (const [blueChampions, redChampions] of [[[], []], [["a"], ["f"]],
      [["a", "b", "c", "d", "e"], ["f", "g", "h", "i", "j"]]]) {
      const blue = predictWinProbability(artifact, { blueChampions, redChampions, side: "blue" });
      const red = predictWinProbability(artifact, { blueChampions, redChampions, side: "red" });
      expect(blue.status).toBe("ready"); expect(red.status).toBe("ready");
      if (blue.status === "ready" && red.status === "ready") {
        expect(blue.probability + red.probability).toBeCloseTo(1);
        expect(blue.partial).toBe(blueChampions.length < 5);
        expect(blue.metrics).toEqual(artifact.stages[`${blueChampions.length}:${redChampions.length}`]);
      }
    }
  });

  it("refuses synthetic, missing provenance, sparse and single-class observations", () => {
    const synthetic = ingestionDoubles().map(m => ({ ...m, provenance: { ...m.provenance, kind: "synthetic" as const } }));
    expect(trainWinModel(synthetic)).toEqual({ status: "unavailable", reason: "invalid-or-nonreal-matches" });
    expect(trainWinModel([{ ...ingestionDoubles()[0], provenance: undefined } as unknown as LabelledMatch]).status).toBe("unavailable");
    expect(trainWinModel(ingestionDoubles().slice(0, 100)).status).toBe("unavailable");
    expect(trainWinModel(ingestionDoubles().map(m => ({ ...m, winner: "blue" as const }))).status).toBe("unavailable");
  });

  it("refuses duplicate IDs, source aliases, invalid champions, and crossing series", () => {
    const matches = ingestionDoubles();
    expect(trainWinModel([...matches, matches[0]]).status).toBe("unavailable");
    const alias = structuredClone(matches);
    alias[1].provenance = alias[0].provenance;
    expect(trainWinModel(alias).status).toBe("unavailable");
    const crossing = structuredClone(matches);
    crossing[1].startedAt = crossing[499].startedAt;
    expect(trainWinModel(crossing)).toEqual({ status: "unavailable", reason: "overlapping-series-times" });
    const invalid = structuredClone(matches);
    invalid[0].blueChampions[0] = invalid[0].redChampions[0];
    expect(trainWinModel(invalid).status).toBe("unavailable");
    const unseen = structuredClone(matches);
    unseen[499].blueChampions[0] = "unseen";
    expect(trainWinModel(unseen)).toEqual({ status: "unavailable", reason: "unsupported-heldout-champion" });
  });

  it("rejects malformed, leaking, low-support and quality-failing artifacts/drafts", () => {
    const draft = { blueChampions: ["a"], redChampions: ["f"], side: "blue" as const };
    for (const value of [null, {}, { ...artifact, version: 2 }, { ...artifact, weights: [NaN] },
      { ...artifact, weights: [] }, { ...artifact, stages: {} }]) {
      expect(predictWinProbability(value, draft).status).toBe("unavailable");
    }
    const leaking = structuredClone(artifact);
    leaking.split.test.series[0] = leaking.split.train.series[0];
    expect(validateArtifact(leaking)).toEqual({ status: "unavailable", reason: "series-leakage" });
    expect(predictWinProbability(artifact, { ...draft, blueChampions: ["unknown"] }).status).toBe("unavailable");
    expect(predictWinProbability(artifact, { ...draft, blueChampions: ["a", "a"] }).status).toBe("unavailable");
    const bad = structuredClone(artifact);
    bad.stages["1:1"].test.model.brier = 1;
    expect(predictWinProbability(bad, draft)).toEqual({ status: "unavailable", reason: "quality-gate-failed" });
    const rare = structuredClone(artifact);
    rare.championCounts[rare.vocabulary.indexOf("a")] = 1;
    expect(predictWinProbability(rare, draft)).toEqual({ status: "unavailable", reason: "insufficient-champion-support" });
  });

  it("computes Brier, natural-log loss and 10-bin ECE with validated inputs", () => {
    expect(scoreProbabilities([0.5, 0.5], [0, 1])).toEqual({ brier: 0.25, logloss: Math.log(2), ece: 0 });
    expect(scoreProbabilities([0, 1], [0, 1]).brier).toBe(0);
    expect(() => scoreProbabilities([], [])).toThrow();
    expect(() => scoreProbabilities([NaN], [1])).toThrow();
    expect(() => scoreProbabilities([0.5], [2])).toThrow();
  });
});