/**
 * Evidence service — process-wide registry of evidence records.
 * Records are deterministic (same inputs → same id), so lookups recompute the
 * canonical contexts on a cache miss instead of failing.
 */
import type { EvidenceRecord } from "@/domain/types";
import { EvidenceLedger } from "@/domain/evidence/builder";
import { ScoutingContext, buildInsights } from "@/domain/analytics/scouting-context";
import { TEAMS } from "@/fixtures/teams";

const global_ = globalThis as unknown as { __seriesightEvidence?: Map<string, EvidenceRecord> };

function registry(): Map<string, EvidenceRecord> {
  global_.__seriesightEvidence ??= new Map<string, EvidenceRecord>();
  return global_.__seriesightEvidence;
}

function harvest(): void {
  for (const team of TEAMS) {
    const ctx = new ScoutingContext(team.id);
    const insights = buildInsights(ctx);
    for (const insight of insights) {
      const rec = ctx.ledger.get(insight.evidenceId);
      if (rec) rec.insightId = insight.id;
    }
    for (const rec of ctx.ledger.all()) {
      if (!registry().has(rec.id)) registry().set(rec.id, rec);
    }
  }
}

export function registerLedgerRecords(ledger: EvidenceLedger): void {
  for (const rec of ledger.all()) {
    if (!registry().has(rec.id)) registry().set(rec.id, rec);
  }
}

export function getEvidence(evidenceId: string): EvidenceRecord | null {
  const found = registry().get(evidenceId);
  if (found) return found;
  harvest();
  return registry().get(evidenceId) ?? null;
}

export function listEvidence(): EvidenceRecord[] {
  if (registry().size < 10) harvest();
  return [...registry().values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** The number of distinct evidence records currently resolvable. */
export function evidenceCount(): number {
  if (registry().size < 10) harvest();
  return registry().size;
}
