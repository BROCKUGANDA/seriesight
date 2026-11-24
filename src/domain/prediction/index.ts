import { z } from "zod";

export type Side = "blue" | "red";
export interface LabelledMatch {
  matchId: string;
  seriesId: string;
  startedAt: string;
  blueChampions: string[];
  redChampions: string[];
  winner: Side;
  provenance: { kind: "real" | "synthetic"; source: string; sourceMatchId: string };
}
export interface DraftInput {
  blueChampions: string[];
  redChampions: string[];
  side: Side;
}
export interface Metrics { brier: number; logloss: number; ece: number }
export type Unavailable = { status: "unavailable"; reason: string };

const text = z.string().trim().min(1).max(200);
const champions = z.array(text).max(5);
const probability = z.number().min(0).max(1);
const metricsSchema = z.object({ brier: probability, logloss: z.number().nonnegative().finite(), ece: probability }).strict();
const provenanceSchema = z.object({ kind: z.literal("real"), source: text, sourceMatchId: text }).strict();
const matchSchema = z.object({
  matchId: text, seriesId: text, startedAt: z.string().datetime({ offset: true }),
  blueChampions: champions.length(5), redChampions: champions.length(5),
  winner: z.enum(["blue", "red"]), provenance: provenanceSchema,
}).strict();
const draftSchema = z.object({ blueChampions: champions, redChampions: champions, side: z.enum(["blue", "red"]) }).strict();
const partitionSchema = z.object({
  series: z.array(text), matches: z.number().int().positive(),
  blueWins: z.number().int().nonnegative(), first: z.number().finite(), last: z.number().finite(),
}).strict();
const evaluationSchema = z.object({ model: metricsSchema, baseline: metricsSchema, coinflip: metricsSchema }).strict();
const artifactSchema = z.object({
  version: z.literal(1), algorithm: z.literal("logistic-prefix-platt-v1"),
  provenance: z.literal("real-outcomes-attested"),
  sources: z.array(text).min(1),
  vocabulary: z.array(text).min(1).max(1000), weights: z.array(z.number().min(-100).max(100)),
  championCounts: z.array(z.number().int().nonnegative()),
  calibration: z.tuple([z.number().min(-100).max(100), z.number().min(0).max(100)]),
  baseline: probability,
  split: z.object({ train: partitionSchema, calibration: partitionSchema, test: partitionSchema }).strict(),
  stages: z.record(z.string(), z.object({ calibration: evaluationSchema, test: evaluationSchema }).strict()),
}).strict();
export type WinModelArtifact = z.infer<typeof artifactSchema>;
export type TrainingResult = { status: "ready"; artifact: WinModelArtifact } | Unavailable;
export type PredictionResult = {
  status: "ready"; probability: number; blueWinProbability: number;
  partial: boolean; stage: string; metrics: WinModelArtifact["stages"][string];
} | Unavailable;

export const DATA_REQUIREMENTS = {
  train: { matches: 300, series: 50 },
  calibration: { matches: 100, series: 20 },
  test: { matches: 100, series: 20 },
  minMinorityFraction: 0.2,
  maxEce: 0.1,
} as const;

function uniquePicks(blue: string[], red: string[]) {
  return new Set([...blue, ...red]).size === blue.length + red.length;
}
function sigmoid(x: number) { return 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, x)))); }
function dot(weights: number[], features: number[]) { return weights.reduce((sum, w, i) => sum + w * features[i], 0); }
function features(blue: string[], red: string[], vocabulary: string[]) {
  const b = new Set(blue), r = new Set(red);
  return [1, ...vocabulary.map(c => Number(b.has(c)) - Number(r.has(c)))];
}
function fit(rows: { x: number[]; y: number }[], dimensions: number, regularization: number) {
  const weights = Array<number>(dimensions).fill(0);
  for (let iteration = 0; iteration < 250; iteration++) {
    const gradient = Array<number>(dimensions).fill(0);
    for (const { x, y } of rows) {
      const error = sigmoid(dot(weights, x)) - y;
      for (let j = 0; j < dimensions; j++) gradient[j] += error * x[j];
    }
    for (let j = 0; j < dimensions; j++) weights[j] -= 0.2 * (gradient[j] / rows.length + (j ? regularization * weights[j] : 0));
  }
  return weights;
}

export function scoreProbabilities(probabilities: number[], outcomes: number[]): Metrics {
  if (!probabilities.length || probabilities.length !== outcomes.length ||
      probabilities.some(p => !Number.isFinite(p) || p < 0 || p > 1) || outcomes.some(y => y !== 0 && y !== 1)) {
    throw new Error("Expected equal nonempty probabilities and binary outcomes");
  }
  let brier = 0, logloss = 0, ece = 0;
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  probabilities.forEach((p, i) => {
    const y = outcomes[i], clipped = Math.max(1e-12, Math.min(1 - 1e-12, p));
    brier += (p - y) ** 2;
    logloss -= y * Math.log(clipped) + (1 - y) * Math.log(1 - clipped);
    const bin = bins[Math.min(9, Math.floor(p * 10))];
    bin.n++; bin.p += p; bin.y += y;
  });
  for (const bin of bins) if (bin.n) ece += Math.abs(bin.p - bin.y) / probabilities.length;
  return { brier: brier / probabilities.length, logloss: logloss / probabilities.length, ece };
}

function passes(evaluation: { model: Metrics; baseline: Metrics; coinflip: Metrics }) {
  return evaluation.model.ece <= DATA_REQUIREMENTS.maxEce &&
    evaluation.model.brier <= evaluation.baseline.brier + 1e-8 &&
    evaluation.model.logloss <= evaluation.baseline.logloss + 1e-8 &&
    evaluation.model.brier <= evaluation.coinflip.brier + 1e-8 &&
    evaluation.model.logloss <= evaluation.coinflip.logloss + 1e-8;
}

export function validateArtifact(input: unknown): { status: "ready"; artifact: WinModelArtifact } | Unavailable {
  const parsed = artifactSchema.safeParse(input);
  if (!parsed.success) return { status: "unavailable", reason: "invalid-artifact" };
  const a = parsed.data;
  const seen = new Set<string>();
  if (new Set(a.vocabulary).size !== a.vocabulary.length || a.weights.length !== a.vocabulary.length + 1 ||
      a.championCounts.length !== a.vocabulary.length || a.championCounts.some(n => n > a.split.train.matches) ||
      a.calibration[1] < 0 || a.baseline <= 0 || a.baseline >= 1) return { status: "unavailable", reason: "invalid-artifact" };
  for (const key of ["train", "calibration", "test"] as const) {
    const p = a.split[key], minimum = DATA_REQUIREMENTS[key];
    if (p.matches < minimum.matches || p.series.length < minimum.series || p.matches < p.series.length ||
        p.first > p.last || p.blueWins > p.matches ||
        Math.min(p.blueWins, p.matches - p.blueWins) / p.matches < DATA_REQUIREMENTS.minMinorityFraction) {
      return { status: "unavailable", reason: "insufficient-data" };
    }
    for (const id of p.series) {
      if (seen.has(id)) return { status: "unavailable", reason: "series-leakage" };
      seen.add(id);
    }
  }
  if (a.split.train.last >= a.split.calibration.first || a.split.calibration.last >= a.split.test.first ||
      a.baseline !== a.split.train.blueWins / a.split.train.matches) return { status: "unavailable", reason: "invalid-temporal-split" };
  if (Object.keys(a.stages).length !== 36) return { status: "unavailable", reason: "invalid-stages" };
  for (let b = 0; b <= 5; b++) for (let r = 0; r <= 5; r++) {
    if (!a.stages[`${b}:${r}`]) return { status: "unavailable", reason: "invalid-stages" };
  }
  return { status: "ready", artifact: a };
}

export function trainWinModel(input: readonly LabelledMatch[]): TrainingResult {
  const parsed = z.array(matchSchema).safeParse(input);
  if (!parsed.success) return { status: "unavailable", reason: "invalid-or-nonreal-matches" };
  const matches = parsed.data.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.matchId.localeCompare(b.matchId, "en"));
  const ids = new Set<string>(), sourceIds = new Set<string>();
  const groups = new Map<string, typeof matches>();
  for (const m of matches) {
    const sourceId = JSON.stringify([m.provenance.source, m.provenance.sourceMatchId]);
    if (ids.has(m.matchId) || sourceIds.has(sourceId) || !uniquePicks(m.blueChampions, m.redChampions)) {
      return { status: "unavailable", reason: "duplicate-or-invalid-match" };
    }
    ids.add(m.matchId); sourceIds.add(sourceId);
    const group = groups.get(m.seriesId) ?? [];
    group.push(m); groups.set(m.seriesId, group);
  }
  const series = [...groups.values()];
  const t = Math.floor(series.length * 0.6), c = Math.floor(series.length * 0.8);
  const partitions = { train: series.slice(0, t).flat(), calibration: series.slice(t, c).flat(), test: series.slice(c).flat() };
  const summarize = (rows: typeof matches) => ({
    series: [...new Set(rows.map(m => m.seriesId))], matches: rows.length,
    blueWins: rows.filter(m => m.winner === "blue").length,
    first: Math.min(...rows.map(m => Date.parse(m.startedAt))), last: Math.max(...rows.map(m => Date.parse(m.startedAt))),
  });
  const split = { train: summarize(partitions.train), calibration: summarize(partitions.calibration), test: summarize(partitions.test) };
  for (const key of ["train", "calibration", "test"] as const) {
    const p = split[key];
    if (p.matches < DATA_REQUIREMENTS[key].matches || p.series.length < DATA_REQUIREMENTS[key].series ||
        Math.min(p.blueWins, p.matches - p.blueWins) / p.matches < DATA_REQUIREMENTS.minMinorityFraction) {
      return { status: "unavailable", reason: "insufficient-data" };
    }
  }
  if (split.train.last >= split.calibration.first || split.calibration.last >= split.test.first) {
    return { status: "unavailable", reason: "overlapping-series-times" };
  }
  const vocabulary = [...new Set(partitions.train.flatMap(m => [...m.blueChampions, ...m.redChampions]))].sort();
  if (vocabulary.length > 1000) return { status: "unavailable", reason: "invalid-vocabulary" };
  if ([...partitions.calibration, ...partitions.test].some(m =>
    [...m.blueChampions, ...m.redChampions].some(c => !vocabulary.includes(c)))) {
    return { status: "unavailable", reason: "unsupported-heldout-champion" };
  }
  const championCounts = vocabulary.map(c => partitions.train.filter(m =>
    m.blueChampions.includes(c) || m.redChampions.includes(c)).length);
  // All prefixes, equally weighted per match; no random masking or seed is needed.
  const rows = partitions.train.flatMap(m => {
    const result: { x: number[]; y: number }[] = [];
    for (let b = 0; b <= 5; b++) for (let r = 0; r <= 5; r++) {
      result.push({ x: features(m.blueChampions.slice(0, b), m.redChampions.slice(0, r), vocabulary), y: Number(m.winner === "blue") });
    }
    return result;
  });
  const weights = fit(rows, vocabulary.length + 1, 0.01);
  const calibrationRows = partitions.calibration.flatMap(m => {
    const result: { x: number[]; y: number }[] = [];
    for (let b = 0; b <= 5; b++) for (let r = 0; r <= 5; r++) {
      result.push({ x: [1, dot(weights, features(m.blueChampions.slice(0, b), m.redChampions.slice(0, r), vocabulary))], y: Number(m.winner === "blue") });
    }
    return result;
  });
  const fitted = fit(calibrationRows, 2, 0.001);
  const calibration: [number, number] = [fitted[0], Math.max(0, fitted[1])];
  const baseline = split.train.blueWins / split.train.matches;
  const stages: WinModelArtifact["stages"] = {};
  for (let b = 0; b <= 5; b++) for (let r = 0; r <= 5; r++) {
    const evaluate = (data: typeof matches) => {
      const outcomes = data.map(m => Number(m.winner === "blue"));
      const probabilities = data.map(m => sigmoid(calibration[0] + calibration[1] * dot(weights,
        features(m.blueChampions.slice(0, b), m.redChampions.slice(0, r), vocabulary))));
      return { model: scoreProbabilities(probabilities, outcomes), baseline: scoreProbabilities(data.map(() => baseline), outcomes),
        coinflip: scoreProbabilities(data.map(() => 0.5), outcomes) };
    };
    stages[`${b}:${r}`] = { calibration: evaluate(partitions.calibration), test: evaluate(partitions.test) };
  }
  const artifact: WinModelArtifact = {
    version: 1, algorithm: "logistic-prefix-platt-v1", provenance: "real-outcomes-attested",
    sources: [...new Set(matches.map(m => m.provenance.source))].sort(),
    vocabulary, championCounts, weights, calibration, baseline, split, stages,
  };
  return validateArtifact(artifact);
}

export function predictWinProbability(artifact: unknown, input: DraftInput): PredictionResult {
  const validated = validateArtifact(artifact);
  if (validated.status !== "ready") return validated;
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success || !uniquePicks(parsed.data.blueChampions, parsed.data.redChampions)) {
    return { status: "unavailable", reason: "invalid-draft" };
  }
  const a = validated.artifact, d = parsed.data;
  if ([...d.blueChampions, ...d.redChampions].some(c => !a.vocabulary.includes(c))) {
    return { status: "unavailable", reason: "unknown-champion" };
  }
  if ([...d.blueChampions, ...d.redChampions].some(c => a.championCounts[a.vocabulary.indexOf(c)] < 20)) {
    return { status: "unavailable", reason: "insufficient-champion-support" };
  }
  const stage = `${d.blueChampions.length}:${d.redChampions.length}`, metrics = a.stages[stage];
  if (!passes(metrics.calibration) || !passes(metrics.test)) return { status: "unavailable", reason: "quality-gate-failed" };
  const blueWinProbability = sigmoid(a.calibration[0] + a.calibration[1] * dot(a.weights, features(d.blueChampions, d.redChampions, a.vocabulary)));
  return { status: "ready", probability: d.side === "blue" ? blueWinProbability : 1 - blueWinProbability,
    blueWinProbability, partial: d.blueChampions.length < 5 || d.redChampions.length < 5, stage, metrics };
}