/**
 * Evidence builder — every statistic Seriesight displays resolves to a stable
 * evidence record with provenance, numerator/denominator and limitations.
 */
import type { EvidenceRecord, MetricStat } from "@/domain/types";
import { FIXTURE_DATASET_ID, FIXTURE_GENERATED_AT, FIXTURE_LABEL } from "@/fixtures/teams";

export const ANALYSIS_VERSION = "analytics-1.0.0";

function fnv1a(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x9dc5;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c + i, 2654435761) >>> 0;
  }
  return (
    h1.toString(16).padStart(8, "0").slice(0, 4) + h2.toString(16).padStart(8, "0").slice(0, 4)
  ).toUpperCase();
}

export interface EvidenceInput {
  insightId?: string | null;
  provider: "fixture" | "grid";
  sourceId: string;
  gameIds: string[];
  tournamentId?: string | null;
  patch?: string | null;
  stat: Pick<MetricStat, "definition" | "numerator" | "denominator" | "value" | "confidence" | "sampleSize">;
  extraLimitations?: string[];
}

export const FIXTURE_LIMITATIONS = [
  "Fixture dataset: observations are synthetic and illustrative.",
  FIXTURE_LABEL,
  "Do not cite fixture metrics as official GRID results.",
];

export function buildEvidence(input: EvidenceInput): EvidenceRecord {
  const basis = [
    input.provider,
    input.sourceId,
    input.stat.definition,
    input.stat.numerator,
    input.stat.denominator,
    input.gameIds.join(","),
    input.patch ?? "",
    ANALYSIS_VERSION,
  ].join("|");
  const id = `EV-${fnv1a(basis)}`;
  return {
    id,
    insightId: input.insightId ?? null,
    provider: input.provider,
    sourceId: input.sourceId,
    datasetId: input.provider === "fixture" ? FIXTURE_DATASET_ID : input.sourceId,
    gameIds: input.gameIds,
    ingestedAt: FIXTURE_GENERATED_AT,
    tournamentId: input.tournamentId ?? null,
    patch: input.patch ?? null,
    sampleCount: input.stat.sampleSize,
    metricDefinition: input.stat.definition,
    numerator: input.stat.numerator,
    denominator: input.stat.denominator,
    computedValue: input.stat.value,
    confidenceLower: input.stat.confidence?.lower ?? null,
    confidenceUpper: input.stat.confidence?.upper ?? null,
    analysisVersion: ANALYSIS_VERSION,
    limitations: [...(input.extraLimitations ?? []), ...FIXTURE_LIMITATIONS].slice(0, 6),
  };
}

/** In-memory evidence registry shared per request; dedupes by evidence id. */
export class EvidenceLedger {
  private records = new Map<string, EvidenceRecord>();

  add(record: EvidenceRecord): EvidenceRecord {
    if (!this.records.has(record.id)) this.records.set(record.id, record);
    return this.records.get(record.id)!;
  }

  addStat(input: EvidenceInput): EvidenceRecord {
    return this.add(buildEvidence(input));
  }

  get(id: string): EvidenceRecord | undefined {
    return this.records.get(id);
  }

  all(): EvidenceRecord[] {
    return [...this.records.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  size(): number {
    return this.records.size;
  }
}
