/**
 * Statistical foundations — deterministic, explainable, sample-size honest.
 * Every rate carries an explicit denominator definition and a Wilson interval.
 */
import type { ConfidenceInterval, EvidenceStrength, MetricStat } from "@/domain/types";

/** Two-sided z for 95% confidence. */
export const Z_95 = 1.959963985;

export function wilsonInterval(
  successes: number,
  n: number,
  z: number = Z_95,
): ConfidenceInterval | null {
  if (n <= 0) return null;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return {
    lower: Math.max(0, (centre - spread) / denom),
    upper: Math.min(1, (centre + spread) / denom),
    level: 0.95,
    method: "wilson",
  };
}

/**
 * Configurable recency weighting: weight = exp(-ln2 * ageDays / halfLifeDays).
 * Documented default half-life: 60 days (approx. two competitive patches).
 */
export const RECENCY_HALF_LIFE_DAYS = 60;

export function recencyWeight(
  observationISO: string,
  referenceISO: string,
  halfLifeDays: number = RECENCY_HALF_LIFE_DAYS,
): number {
  const ageMs = new Date(referenceISO).getTime() - new Date(observationISO).getTime();
  if (Number.isNaN(ageMs)) return 0;
  const ageDays = Math.max(0, ageMs / 86_400_000);
  return Math.exp((-Math.LN2 * ageDays) / halfLifeDays);
}

/**
 * Confidence labels are derived from sample size AND interval width — never from
 * how impressive a value looks. Thresholds are configurable via config.
 */
export const CONFIDENCE_THRESHOLDS = {
  high: { minSample: 20, maxCiWidth: 0.28 },
  moderate: { minSample: 8, maxCiWidth: 0.5 },
};

export function evidenceStrength(sampleSize: number, ci: ConfidenceInterval | null): EvidenceStrength {
  if (sampleSize < CONFIDENCE_THRESHOLDS.moderate.minSample) return "low";
  if (!ci) return "low";
  const width = ci.upper - ci.lower;
  if (sampleSize >= CONFIDENCE_THRESHOLDS.high.minSample && width <= CONFIDENCE_THRESHOLDS.high.maxCiWidth)
    return "high";
  if (sampleSize >= CONFIDENCE_THRESHOLDS.moderate.minSample && width <= CONFIDENCE_THRESHOLDS.moderate.maxCiWidth)
    return "moderate";
  return "low";
}

export interface RateStatInput {
  definition: string;
  numerator: number;
  denominator: number;
  unit?: MetricStat["unit"];
  excludedObservations?: number;
}

export function rateStat(input: RateStatInput): MetricStat {
  const { definition, numerator, denominator } = input;
  const value = denominator > 0 ? numerator / denominator : null;
  const ci = denominator > 0 ? wilsonInterval(numerator, denominator) : null;
  return {
    definition,
    numerator,
    denominator,
    value,
    unit: input.unit ?? "rate",
    sampleSize: denominator,
    confidence: ci,
    strength: evidenceStrength(denominator, ci),
    excludedObservations: input.excludedObservations ?? 0,
  };
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function formatPct(value: number | null, digits = 0): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

/** Clamps to 0..100 and rounds. */
export function pct100(v: number): number {
  return Math.round(Math.min(100, Math.max(0, v)) * 100) / 100;
}
