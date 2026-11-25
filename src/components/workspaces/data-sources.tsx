"use client";

/**
 * Data Sources workspace (PRD D8): GRID connection panel with the full status
 * catalogue, circuit-breaker visibility, static-data adapter status, staged
 * import pipeline and the always-available labelled fixture dataset.
 */
import { useCallback, useEffect, useState } from "react";
import { ApiClientError, apiFetch, apiPost } from "@/lib/api-client";
import { Panel, EmptyState, SkeletonBlock, ErrorState, FixtureBadge } from "@/components/common/primitives";
import { ImportGlyph, IntegrityGlyph, RiskGlyph, HardFearlessGlyph } from "@/components/icons/seriesight-icons";
import { useWorkspaceStore } from "@/store/workspace";
import type { DataSourceConnection, IngestionJob } from "@/domain/types";
import { useAuthStore } from "@/store/auth";
import { canMutateTenant, useTenantRole } from "@/hooks/use-tenant-role";

interface Overview {
  connections: DataSourceConnection[];
  circuit: { state: string; failures: number; failureThreshold: number };
  staticData: { version: string; source: string; warnings: string[]; fetchedAt: string };
  jobs: IngestionJob[];
}

const STATUS_TONE: Record<string, { label: string; cls: string }> = {
  connected: { label: "Connected", cls: "border-[var(--accent-green)]/50 bg-[var(--accent-green)]/10 text-[var(--accent-green)]" },
  not_configured: { label: "Not configured", cls: "border-[var(--border-active)] bg-[var(--surface-2)] text-[var(--text-secondary)]" },
  importing: { label: "Importing", cls: "border-[var(--accent-cyan)]/50 bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]" },
  partial_success: { label: "Partial success", cls: "border-[var(--accent-amber)]/50 bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]" },
  rate_limited: { label: "Rate limited", cls: "border-[var(--accent-amber)]/50 bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]" },
  temporarily_unavailable: { label: "Temporarily unavailable", cls: "border-[var(--accent-coral)]/50 bg-[var(--accent-coral)]/10 text-[var(--accent-coral)]" },
  access_denied: { label: "Access denied", cls: "border-[var(--accent-coral)]/50 bg-[var(--accent-coral)]/10 text-[var(--accent-coral)]" },
  authenticating: { label: "Authenticating", cls: "border-[var(--accent-indigo)]/50 bg-[var(--accent-indigo)]/10 text-[var(--accent-violet)]" },
  schema_mismatch: { label: "Schema mismatch", cls: "border-[var(--accent-coral)]/50 bg-[var(--accent-coral)]/10 text-[var(--accent-coral)]" },
};

const STAGES = ["connecting", "retrieving_metadata", "validating_payloads", "normalizing", "computing_insights", "verifying_results"];

export function DataSources() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pushToast = useWorkspaceStore((s) => s.pushToast);
  const isCoach = useAuthStore((s) => s.user?.kind === "coach");
  const workspaceId = useAuthStore((s) => s.user?.workspaceId);
  const tenantRole = useTenantRole(workspaceId);
  const canImport = isCoach && canMutateTenant(tenantRole);
  const [seriesId, setSeriesId] = useState("");
  const [training, setTraining] = useState<{ status: string; reason?: string; metrics?: unknown } | null>(null);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    apiFetch<Overview>("/api/data-sources")
      .then(setData)
      .catch((e: ApiClientError) => setError(e));
  }, []);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (action: "verify" | "import", provider: "fixture" | "grid") => {
    setBusy(`${action}:${provider}`);
    try {
      if (action === "verify") {
        const r = await apiPost<{ status: string; detail: string }>("/api/data-sources", { action, provider: "grid" });
        pushToast(`GRID probe: ${r.status} — ${r.detail}`, r.status === "connected" ? "ok" : "warn");
      } else {
        const job = await apiPost<IngestionJob>("/api/data-sources", { action, provider, ...(provider === "grid" ? { seriesId: seriesId.trim() } : {}) });
        pushToast(
          job.status === "succeeded"
            ? `Import succeeded: ${job.seriesCount} series, ${job.gameCount} games through all 6 stages.`
            : job.status === "failed"
              ? `Import failed at ${job.stage}: ${job.lastError}`
              : `Import finished with status ${job.status}.`,
          job.status === "succeeded" ? "ok" : "error",
        );
      }
      load();
    } catch (e) {
      pushToast(
        e instanceof ApiClientError
          ? `The action could not complete — ${e.message} (${e.code}). ${e.recovery ?? "Check the provider status above and try again."}`
          : "The action could not complete. Check your connection and try again.",
        "error",
      );
    } finally {
      setBusy(null);
    }
  };

  const train = async () => {
    setBusy("train");
    try { setTraining(await apiPost("/api/prediction", { action: "train" })); }
    catch (e) { pushToast(e instanceof Error ? e.message : "Training failed.", "error"); }
    finally { setBusy(null); }
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Data Sources</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
          GRID is reached only through the server-side provider adapter with host allowlisting, timeouts and a circuit breaker. The demo workspace never requires GRID credentials.
        </p>
      </header>

      <Panel title="Real match history and win model" subtitle="Coach-only · licensed data stays in your workspace">
        <p className="text-sm text-[var(--text-secondary)]">Import completed LoL series by official GRID series ID, then train from the accumulated history. The model requires at least 500 games split chronologically across training, calibration and test sets, with sufficient series and outcome diversity. It withholds probabilities when stage-specific validation fails.</p>
        {isCoach ? <div className="mt-3 space-y-3">
          <label className="block text-sm">GRID series ID<input value={seriesId} onChange={(e) => setSeriesId(e.target.value)} maxLength={128} placeholder="Official completed series ID" className="ml-2 min-h-11 rounded border px-3" /></label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ctrl-btn" disabled={busy !== null || !/^[A-Za-z0-9_-]{1,128}$/.test(seriesId.trim())} onClick={() => act("import", "grid")}>Import GRID series</button>
            <button type="button" className="ctrl-btn" disabled={busy !== null} onClick={train}>{busy === "train" ? "Training…" : "Train and validate win model"}</button>
          </div>
          {training && <div role="status" className="text-sm">{training.status === "ready" ? "Model fitted. Draft Room displays probabilities only for stages passing quality gates." : training.reason}
            {training.metrics !== undefined && <details><summary>Calibration and held-out diagnostics</summary><pre className="overflow-auto text-xs">{JSON.stringify(training.metrics, null, 2)}</pre></details>}
          </div>}
        </div> : <p className="mt-3 text-sm text-[var(--accent-amber)]">You are in an isolated fixture sandbox. Sign in with an invited coach account to import GRID data or train a model.</p>}
      </Panel>

      {error ? (
        <ErrorState code={error.code} message={error.message} recovery={error.recovery} retryable={error.retryable} onRetry={load} />
      ) : !data ? (
        <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-48" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* GRID panel */}
            {data.connections.filter((c) => c.provider === "grid").map((conn) => {
              const tone = STATUS_TONE[conn.status] ?? STATUS_TONE.not_configured;
              return (
                <Panel key={conn.provider} title="GRID Central Data" subtitle="Provider adapter — server-side only" actions={
                  <div className="flex gap-2">
                    <button type="button" onClick={() => act("verify", "grid")} disabled={busy !== null || !canImport} className="ctrl-btn">Verify connection</button>
                    <button type="button" onClick={() => act("import", "grid")} disabled={busy !== null || !canImport || !seriesId.trim()} className="ctrl-btn">Run import</button>
                  </div>
                }>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone.cls}`}>
                      <HardFearlessGlyph size={12} /> {tone.label}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--text-muted)]">circuit: {data.circuit.state} ({data.circuit.failures}/{data.circuit.failureThreshold} failures)</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                    <Row k="Credential configuration" v="GRID_API_KEY read from server environment only" />
                    <Row k="Last successful request" v={conn.lastSuccessfulRequestAt ?? "never"} />
                    <Row k="Last import attempt" v={conn.lastImportAttemptAt ?? "never"} />
                    <Row k="Authorized endpoints" v={`${conn.authorizedEndpoints.length} allowlisted`} />
                    <Row k="Rate-limit status" v={conn.rateLimitRemaining !== null ? `${conn.rateLimitRemaining} remaining` : "not observable"} />
                    <Row k="Parsed series" v={`${conn.parsedSeriesCount}`} />
                    <Row k="Failed imports" v={`${conn.failedImportCount}`} />
                    <Row k="Commercial restriction" v="Open Access is non-commercial only" />
                  </dl>
                  {conn.metadata.note ? (
                    <div className="mt-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-3">
                      <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">{String(conn.metadata.note)}</p>
                      <ul className="mt-2 list-disc space-y-0.5 pl-4 font-mono text-[10px] text-[var(--text-muted)]">
                        {conn.authorizedEndpoints.map((e) => <li key={e}>{e}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </Panel>
              );
            })}

            {/* Fixture panel */}
            {data.connections.filter((c) => c.provider === "fixture").map((conn) => (
              <Panel
                key={conn.provider}
                title="Local demo dataset"
                subtitle="Always available without external API keys"
                actions={<FixtureBadge />}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-green)]/50 bg-[var(--accent-green)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-green)]">
                    <IntegrityGlyph size={12} /> Connected
                  </span>
                  <span className="font-mono text-[11px] text-[var(--text-muted)]">{conn.metadata.datasetId}</span>
                </div>
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                  <Row k="Series" v={String(conn.parsedSeriesCount)} />
                  <Row k="Games" v={String(conn.metadata.games ?? "not recorded")} />
                  <Row k="Deterministic seed" v={String(conn.metadata.deterministicSeed ?? "not recorded")} />
                  <Row k="Last import" v={conn.lastImportAttemptAt ?? "not run"} />
                </dl>
                {conn.metadata.note ? (
                  <p className="mt-3 rounded-lg border border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/5 px-3 py-2 text-[11px] leading-relaxed text-[var(--accent-amber)]">
                    {String(conn.metadata.note)}
                  </p>
                ) : null}
                <button type="button" onClick={() => act("import", "fixture")} disabled={busy !== null} className="ctrl-btn mt-3 inline-flex items-center gap-1.5">
                  <ImportGlyph size={13} /> {busy === "import:fixture" ? "Importing…" : "Run staged import"}
                </button>
              </Panel>
            ))}
          </div>

          {/* Static data adapter */}
          <Panel title="Static data adapter" subtitle="Data Dragon with bundled fallback — never hardcoded to one patch">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <Row k="Metadata version" v={data.staticData.version} />
              <Row k="Source" v={data.staticData.source} />
              <Row k="Fetched at" v={data.staticData.fetchedAt.slice(0, 19).replace("T", " ")} />
              <Row k="Warnings" v={String(data.staticData.warnings.length)} />
            </dl>
            {data.staticData.warnings.map((w) => (
              <p key={w} className="mt-2 flex items-start gap-2 rounded border border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/5 px-3 py-2 text-[11px] text-[var(--accent-amber)]">
                <RiskGlyph size={12} /> {w}
              </p>
            ))}
          </Panel>

          {/* Import jobs */}
          <Panel title="Ingestion jobs" subtitle="Named stages only — no fabricated percentage progress">
            {data.jobs.length === 0 ? (
              <EmptyState
                title="No imports yet"
                message="Run a staged import above. The pipeline executes all six named stages and validates payload integrity before computing insights."
                action={<button type="button" onClick={() => act("import", "fixture")} className="ctrl-btn">Import fixture dataset</button>}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {data.jobs.map((job) => (
                  <li key={job.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${job.status === "succeeded" ? "bg-[var(--accent-green)]/10 text-[var(--accent-green)]" : job.status === "failed" ? "bg-[var(--accent-coral)]/10 text-[var(--accent-coral)]" : "bg-[var(--surface-3)] text-[var(--text-secondary)]"}`}>
                          {job.status}
                        </span>
                        <span className="font-mono text-[11px] text-[var(--text-secondary)]">{job.id}</span>
                        <span className="font-mono text-[10px] text-[var(--text-muted)]">{job.provider} · {job.jobType}</span>
                      </div>
                      <span className="tnum font-mono text-[10px] text-[var(--text-muted)]">
                        {job.seriesCount} series · {job.gameCount} games · attempts {job.attempts}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5" aria-hidden="true">
                      {STAGES.map((s, i) => {
                        const reached = STAGES.indexOf(job.stage) >= i && (job.status === "succeeded" || job.status === "running" || job.status === "partial");
                        return (
                          <span key={s} className={`rounded px-1.5 py-0.5 font-mono text-[9px] ${reached ? "bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]" : "bg-[var(--surface-1)] text-[var(--text-disabled)]"}`}>
                            {i + 1}. {s.replace(/_/g, " ")}
                          </span>
                        );
                      })}
                    </div>
                    <p className="sr-only">Import stage reached: {job.stage.replace(/_/g, " ")}.</p>
                    {job.lastError && <p className="mt-2 rounded border border-[var(--accent-coral)]/30 bg-[var(--accent-coral)]/5 px-2.5 py-1.5 text-[11px] text-[var(--accent-coral)]">{job.lastError}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Failure-state demonstration */}
          <Panel title="Failure-state simulator" subtitle="Disable provider access and watch the workspace degrade honestly">
            <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
              Journey 5 (failure recovery): with no GRID key configured, provider imports fail with a typed
              <span className="mx-1 rounded bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[10px]">GRID_CREDENTIAL_MISSING</span>
              error and the circuit breaker reports its state — while the fixture workspace above stays fully functional. Nothing silently mixes real and synthetic records.
            </p>
            <button type="button" onClick={() => act("import", "grid")} disabled={busy !== null || !canImport || !seriesId.trim()} className="ctrl-btn mt-3">
              Trigger GRID import (expected failure in demo mode)
            </button>
          </Panel>
        </>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{k}</dt>
      <dd className="mt-0.5 break-words font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">{v}</dd>
    </div>
  );
}
