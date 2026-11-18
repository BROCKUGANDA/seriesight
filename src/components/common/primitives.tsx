"use client";

/**
 * Shared workspace primitives: cards, stat tiles, confidence/evidence badges,
 * fixture markers, empty/error states and skeletons. Accessibility: state is
 * always communicated by label + glyph, never colour alone (PRD N2).
 */
import type { ReactNode } from "react";
import type { EvidenceRecord, EvidenceStrength, MetricStat } from "@/domain/types";
import { EvidenceGlyph, ConfidenceGlyph, RiskGlyph, IntegrityGlyph } from "@/components/icons/seriesight-icons";
import { useWorkspaceStore } from "@/store/workspace";
import { formatPct } from "@/domain/analytics/stats";

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
  id,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-label={title}
      className={`rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/80 backdrop-blur-sm ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-[var(--border-subtle)] px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-[13px] font-semibold tracking-[0.08em] uppercase text-[var(--text-primary)]">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>}
          </div>
          {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const STRENGTH_STYLE: Record<EvidenceStrength, { label: string; cls: string; glyph: ReactNode }> = {
  high: { label: "High confidence", cls: "text-[var(--accent-green)] border-[var(--accent-green)]/40 bg-[var(--accent-green)]/10", glyph: <ConfidenceGlyph size={12} /> },
  moderate: { label: "Moderate confidence", cls: "text-[var(--accent-cyan)] border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10", glyph: <ConfidenceGlyph size={12} /> },
  low: { label: "Low confidence", cls: "text-[var(--accent-amber)] border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10", glyph: <RiskGlyph size={12} /> },
};

export function ConfidenceBadge({ strength, sampleSize }: { strength: EvidenceStrength; sampleSize?: number }) {
  const s = STRENGTH_STYLE[strength];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${s.cls}`}>
      {s.glyph}
      {s.label}
      {sampleSize !== undefined && <span className="tnum text-[var(--text-muted)]">· n={sampleSize}</span>}
    </span>
  );
}

export function EvidenceChip({ evidenceId, compact = false }: { evidenceId: string; compact?: boolean }) {
  const openEvidence = useWorkspaceStore((s) => s.openEvidence);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openEvidence(evidenceId);
      }}
      className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-[var(--border-active)] bg-[var(--surface-2)] px-3 py-1 font-mono text-[11px] text-[var(--accent-cyan)] transition-colors hover:border-[var(--accent-cyan)]"
      aria-label={`Open evidence record ${evidenceId}`}
      title="Open the evidence record behind this finding"
    >
      <EvidenceGlyph size={12} />
      {compact ? "Evidence" : evidenceId}
    </button>
  );
}

export function FixtureBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-amber)] ${className}`}
      title="Illustrative fixture data. Not actual Cloud9 performance and not an official GRID dataset."
    >
      <IntegrityGlyph size={11} />
      Fixture data
    </span>
  );
}

export function StatTile({
  label,
  value,
  detail,
  tone = "default",
  className = "",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "default" | "accent" | "violet" | "warn";
  className?: string;
}) {
  const toneCls =
    tone === "accent" ? "text-[var(--accent-cyan)]" : tone === "violet" ? "text-[var(--accent-violet)]" : tone === "warn" ? "text-[var(--accent-amber)]" : "text-[var(--text-primary)]";
  return (
    <div className={`rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/70 px-4 py-3 metric-in ${className}`}>
      <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className={`tnum mt-1 text-2xl font-semibold ${toneCls}`}>{value}</p>
      {detail && <p className="mt-1 text-xs text-[var(--text-secondary)]">{detail}</p>}
    </div>
  );
}

export function MetricRow({
  label,
  stat,
  suffix,
}: {
  label: string;
  stat: MetricStat;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div>
        <p className="text-sm text-[var(--text-secondary)]">{label}</p>
        <p className="text-[11px] font-mono text-[var(--text-muted)]">
          {stat.numerator}/{stat.denominator} {suffix} · Wilson {stat.confidence ? `${formatPct(stat.confidence.lower)}–${formatPct(stat.confidence.upper)}` : "n/a"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="tnum text-lg font-semibold text-[var(--text-primary)]">{formatPct(stat.value)}</span>
        <ConfidenceBadge strength={stat.strength} />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-1)]/50 px-8 py-12 text-center">
      <SeriesMark />
      <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
      <p className="max-w-sm text-xs leading-relaxed text-[var(--text-muted)]">{message}</p>
      {action}
    </div>
  );
}

function SeriesMark() {
  return (
    <svg width="36" height="36" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {["#42D9FF", "#627DFF", "#EDF4FF", "#627DFF", "#9B8CFF"].map((c, i) => (
        <rect key={i} x={7 + i * 4.2} y={i === 2 ? 8 : 10 - Math.abs(i - 2) * 1.5} width="2.4" height={i === 2 ? 16 : 12 + Math.abs(i - 2) * 3} rx="1.2" fill={c} opacity="0.5" />
      ))}
      <circle cx="16" cy="16" r="14" stroke="#25364A" />
    </svg>
  );
}

export function ErrorState({
  code,
  message,
  recovery,
  retryable,
  onRetry,
}: {
  code: string;
  message: string;
  recovery: string;
  retryable?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="rounded-xl border border-[var(--accent-coral)]/40 bg-[var(--accent-coral)]/5 px-5 py-4">
      <div className="flex items-center gap-2 text-[var(--accent-coral)]">
        <RiskGlyph size={16} />
        <span className="font-mono text-xs font-semibold uppercase tracking-wider">{code}</span>
      </div>
      <p className="mt-2 text-sm text-[var(--text-primary)]">{message}</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{recovery}</p>
      {retryable && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-[var(--border-active)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-cyan)]"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`skeleton-shimmer rounded-lg ${className}`} aria-hidden="true" />;
}

export function ChampionGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock key={i} className="h-16" />
      ))}
    </div>
  );
}

/** Evidence drawer — the trust surface of the product (PRD D7). */
export function EvidenceDrawerContent({ record }: { record: EvidenceRecord }) {
  const rows: [string, ReactNode][] = [
    ["Evidence ID", <span key="id" className="font-mono">{record.id}</span>],
    ["Source provider", record.provider === "fixture" ? "Seriesight demo fixture dataset" : `GRID (${record.sourceId})`],
    ["Dataset ID", <span key="ds" className="font-mono">{record.datasetId}</span>],
    ["Tournament", record.tournamentId ?? "all tournaments"],
    ["Patch context", record.patch ?? "all patches"],
    ["Metric definition", <span key="md" className="font-mono text-[11px]">{record.metricDefinition}</span>],
    ["Numerator / denominator", <span key="nd" className="tnum">{record.numerator} / {record.denominator}</span>],
    ["Computed value", record.computedValue !== null ? formatPct(record.computedValue) : "—"],
    ["Confidence interval", record.confidenceLower !== null ? `${formatPct(record.confidenceLower)} – ${formatPct(record.confidenceUpper)} (Wilson 95%)` : "not computed"],
    ["Sample count", <span key="sc" className="tnum">{record.sampleCount} games</span>],
    ["Analysis version", <span key="av" className="font-mono">{record.analysisVersion}</span>],
    ["Ingested at", <span key="ia" className="font-mono">{record.ingestedAt}</span>],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/5 px-3 py-2 text-[11px] text-[var(--accent-amber)]">
        Fixture provenance: observations are synthetic. Never cite fixture metrics as official GRID results.
      </div>
      <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{k}</dt>
            <dd className="mt-0.5 truncate text-xs text-[var(--text-secondary)]" title={typeof v === "string" ? v : undefined}>{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Supporting games ({record.gameIds.length})</p>
        <div className="mt-1.5 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
          {record.gameIds.map((g) => (
            <span key={g} className="rounded bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">{g}</span>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Limitations</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-[var(--text-secondary)]">
          {record.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
