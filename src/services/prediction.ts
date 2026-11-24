import { db } from "@/lib/db";
import { currentWorkspace, requireCoach } from "@/lib/auth";
import { predictWinProbability, trainWinModel, validateArtifact, type DraftInput, type PredictionResult } from "@/domain/prediction";
import type { GridHistoricalSeries } from "@/lib/providers/grid/grid-history";
import { historicalPredictionMatches } from "@/services/prediction-matches";
import { createHash } from "node:crypto";

const provider = () => `win-model:${currentWorkspace()}`;
export const historyDigest = (history: readonly GridHistoricalSeries[]) => createHash("sha256").update(JSON.stringify(historicalPredictionMatches(history))).digest("hex");

export async function trainWorkspaceModel(history: readonly GridHistoricalSeries[]) {
  requireCoach();
  const result = trainWinModel(historicalPredictionMatches(history));
  const metadataJson = JSON.stringify({ result, historyDigest: historyDigest(history) });
  const data = {
    status: result.status === "ready" ? "connected" : "not_configured",
    label: "Draft win probability model", metadataJson,
    lastVerifiedAt: new Date(),
  };
  await db.dataSourceConnectionRecord.upsert({ where: { provider: provider() }, create: { provider: provider(), ...data }, update: data });
  return result.status === "ready" ? { status: result.status, metrics: result.artifact.stages, split: result.artifact.split } : result;
}

export async function workspacePrediction(history: readonly GridHistoricalSeries[], draft: DraftInput): Promise<PredictionResult> {
  const record = await db.dataSourceConnectionRecord.findUnique({ where: { provider: provider() } });
  if (!record) return { status: "unavailable", reason: "Import authorized GRID match history and train a model in Data Sources. Fixture records are never used as calibrated outcomes." };
  try {
    const stored = JSON.parse(record.metadataJson);
    if (stored.historyDigest !== historyDigest(history)) return { status: "unavailable", reason: "Imported history changed. Retrain the model in Data Sources." };
    if (stored.result?.status !== "ready") return { status: "unavailable", reason: stored.result?.reason || "No validated model is available." };
    const validated = validateArtifact(stored.result.artifact);
    if (validated.status !== "ready") return validated;
    return predictWinProbability(validated.artifact, draft);
  } catch {
    return { status: "unavailable", reason: "Stored model is invalid. Retrain from authorized GRID history." };
  }
}
