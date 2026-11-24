"use client";

/**
 * Evidence Ledger (PRD D7) — the trust surface. Every statistic in the product
 * resolves to a record with provider, dataset, game ids, numerator/denominator,
 * CI and limitations.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { Panel, EmptyState, SkeletonBlock, ErrorState } from "@/components/common/primitives";
import { EvidenceGlyph, IntegrityGlyph } from "@/components/icons/seriesight-icons";
import { useWorkspaceStore } from "@/store/workspace";
import type { EvidenceRecord } from "@/domain/types";
import { formatPct } from "@/domain/analytics/stats";

export function EvidenceLedger() {
  const [records, setRecords] = useState<EvidenceRecord[] | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [filter, setFilter] = useState("");
  const openEvidence = useWorkspaceStore((s) => s.openEvidence);

  const load = useCallback(() => {
    setError(null);
    setRecords(null);
    apiFetch<EvidenceRecord[]>("/api/evidence/all")
      .then(setRecords)
      .catch((e: ApiClientError) => setError(e));
  }, []);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const filtered = useMemo(() => {
    if (!records) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => r.metricDefinition.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || (r.tournamentId ?? "").includes(q));
  }, [records, filter]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Evidence Ledger</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
            Every insight receives a unique evidence identifier. Open any record to inspect its provenance, sample size, computation and limitations.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by metric or id…"
            aria-label="Filter evidence"
            className="min-h-[44px] w-full min-w-[200px] rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2 text-sm sm:w-56"
          />
          <span className="tnum font-mono text-xs text-[var(--text-muted)]">{records ? `${records.length} records` : "…"}</span>
        </div>
      </header>

      {error ? (
        <ErrorState code={error.code} message={error.message} recovery={error.recovery} retryable={error.retryable} onRetry={load} />
      ) : !records ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-14" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No evidence matches"
          message="No evidence records match this filter. Evidence is generated as scouting and macro analyses run — visit Opponent Intelligence or Macro Atlas to produce more."
        />
      ) : (
        <Panel title="Evidence records" subtitle="Deterministic ids — identical inputs always resolve to the same record">
          <p className="mb-3 text-xs text-[var(--text-muted)] sm:hidden">Swipe the table sideways to see all columns.</p>
          <div className="scroll-x overflow-x-auto rounded-lg border border-[var(--border-subtle)]" role="region" aria-label="Evidence records, scrollable horizontally" tabIndex={0}>
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-[var(--surface-2)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Evidence ID</th>
                  <th className="px-3 py-2.5 font-medium">Metric</th>
                  <th className="px-3 py-2.5 text-right font-medium">n / d</th>
                  <th className="px-3 py-2.5 text-right font-medium">Value</th>
                  <th className="px-3 py-2.5 font-medium">Wilson 95%</th>
                  <th className="px-3 py-2.5 font-medium">Patch</th>
                  <th className="px-3 py-2.5 text-right font-medium">Games</th>
                  <th className="px-3 py-2.5 text-right font-medium"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-[var(--surface-2)]/50">
                    <td className="px-3 py-2.5 font-mono text-[var(--accent-cyan)]">{r.id}</td>
                    <td className="max-w-[240px] truncate px-3 py-2.5 font-mono text-[10px] text-[var(--text-secondary)]" title={r.metricDefinition}>{r.metricDefinition}</td>
                    <td className="tnum px-3 py-2.5 text-right text-[var(--text-secondary)]">{r.numerator}/{r.denominator}</td>
                    <td className="tnum px-3 py-2.5 text-right text-[var(--text-primary)]">{r.computedValue !== null ? formatPct(r.computedValue) : "—"}</td>
                    <td className="tnum px-3 py-2.5 text-[var(--text-muted)]">
                      {r.confidenceLower !== null ? `${formatPct(r.confidenceLower)}–${formatPct(r.confidenceUpper)}` : "not computed"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[10px] text-[var(--text-muted)]">{r.patch ?? "all"}</td>
                    <td className="tnum px-3 py-2.5 text-right text-[var(--text-muted)]">{r.gameIds.length}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button type="button" onClick={() => openEvidence(r.id)} className="inline-flex min-h-[36px] items-center rounded px-2 font-mono text-[11px] font-medium text-[var(--accent-cyan)] hover:underline" aria-label={`Open evidence record ${r.id}`}>
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

</div>
  );
}
