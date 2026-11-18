"use client";

/**
 * Playbook — the strategy library. Coaches store named game plans with their
 * composition, win condition, key timings and execution steps, then generate
 * a pre-match brief that fuses a strategy with the selected opponent. Data
 * persists locally (coach store) so the whole staff sees the same plans.
 */
import { useMemo, useState } from "react";
import { Panel, EmptyState, FixtureBadge } from "@/components/common/primitives";
import { useCoachStore, type Strategy, type StrategyCategory, type StrategyStatus } from "@/store/coach";
import { useWorkspaceStore, haptic } from "@/store/workspace";
import { useHashRoute } from "@/hooks/use-hash-route";
import { Tilt3D, Reveal, StaggerContainer, RevealItem } from "@/components/fx/motion";
import { PickGlyph, RiskGlyph } from "@/components/icons/seriesight-icons";

const CATEGORY_LABEL: Record<StrategyCategory, string> = {
  "early-spike": "Early spike",
  scaling: "Scaling",
  flex: "Flex / draft bait",
  counter: "Counter pick",
  emergency: "Emergency backup",
};

const STATUS_STYLE: Record<StrategyStatus, { label: string; cls: string }> = {
  ready: { label: "Match-ready", cls: "text-[var(--accent-green)] border-[var(--accent-green)]/40 bg-[var(--accent-green)]/10" },
  draft: { label: "In development", cls: "text-[var(--accent-amber)] border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10" },
  retired: { label: "Retired", cls: "text-[var(--text-muted)] border-[var(--border-subtle)] bg-[var(--surface-2)]" },
};

const emptyDraft = {
  name: "",
  category: "early-spike" as StrategyCategory,
  comp: "",
  winCondition: "",
  keyTimings: "",
  steps: "",
  tags: "",
};

export function PlaybookWorkspace() {
  const strategies = useCoachStore((s) => s.strategies);
  const addStrategy = useCoachStore((s) => s.addStrategy);
  const updateStrategy = useCoachStore((s) => s.updateStrategy);
  const removeStrategy = useCoachStore((s) => s.removeStrategy);
  const pushToast = useWorkspaceStore((s) => s.pushToast);
  const hapticsEnabled = useWorkspaceStore((s) => s.hapticsEnabled);
  const selectedOpponent = useWorkspaceStore((s) => s.selectedOpponent);
  const [, navigate] = useHashRoute();

  const [statusFilter, setStatusFilter] = useState<"all" | StrategyStatus>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [briefFor, setBriefFor] = useState<Strategy | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const visible = useMemo(
    () => (statusFilter === "all" ? strategies : strategies.filter((s) => s.status === statusFilter)),
    [strategies, statusFilter],
  );

  const readyCount = strategies.filter((s) => s.status === "ready").length;

  const submitStrategy = () => {
    if (!draft.name.trim() || !draft.comp.trim()) {
      pushToast("Name the strategy and list its five champion slots before saving.", "warn");
      haptic("invalid", hapticsEnabled);
      return;
    }
    addStrategy({
      ...draft,
      name: draft.name.trim(),
      comp: draft.comp.trim(),
      winCondition: draft.winCondition.trim() || "Define the win condition with the staff before match day.",
      keyTimings: draft.keyTimings.trim() || "Timings TBD in the veto meeting.",
      steps: draft.steps.split("\n").map((s) => s.trim()).filter(Boolean),
      tags: draft.tags.split(",").map((s) => s.trim()).filter(Boolean),
      status: "draft",
    });
    setDraft(emptyDraft);
    setFormOpen(false);
    haptic("complete", hapticsEnabled);
    pushToast("Strategy saved to the Playbook as “In development”.", "ok");
  };

  const cycleStatus = (s: Strategy) => {
    const next: StrategyStatus = s.status === "ready" ? "retired" : s.status === "draft" ? "ready" : "draft";
    updateStrategy(s.id, { status: next });
    haptic("pick", hapticsEnabled);
    pushToast(`“${s.name}” is now ${STATUS_STYLE[next].label.toLowerCase()}.`, "ok");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/60 px-6 py-6 scanlines">
        <div aria-hidden="true" className="grid-floor pointer-events-none absolute inset-0" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--accent-cyan)]">Playbook</p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
              Every game plan, one library.
            </h1>
            <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-[var(--text-secondary)]">
              Store comps, win conditions, key timings and execution steps. Promote a plan to
              Match-ready when the staff signs off, then generate the pre-match brief for ban phase.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FixtureBadge />
            <button
              type="button"
              onClick={() => {
                setFormOpen((v) => !v);
                haptic("pick", hapticsEnabled);
              }}
              className="signal-gradient sheen press-fx flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-[13px] font-bold text-[#0e1405]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
              New strategy
            </button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Strategies stored" value={strategies.length} />
        <Stat label="Match-ready" value={readyCount} accent />
        <Stat label="In development" value={strategies.filter((s) => s.status === "draft").length} />
        <Stat label="Retired" value={strategies.filter((s) => s.status === "retired").length} />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter strategies by status">
        {(["all", "ready", "draft", "retired"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setStatusFilter(f);
              haptic("pick", hapticsEnabled);
            }}
            aria-pressed={statusFilter === f}
            className={`min-h-[36px] rounded-full border px-4 text-[12px] font-medium transition-colors ${
              statusFilter === f
                ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]"
                : "border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {f === "all" ? "All plans" : STATUS_STYLE[f].label}
          </button>
        ))}
      </div>

      {/* New strategy form */}
      {formOpen && (
        <Panel title="New strategy" subtitle="Comp, win condition, timings and the execution checklist.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Strategy name">
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="cfg-select h-11" placeholder="e.g. Hailshop Dive" />
            </Field>
            <Field label="Category">
              <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as StrategyCategory })} className="cfg-select-wrap cfg-select h-11">
                {(Object.keys(CATEGORY_LABEL) as StrategyCategory[]).map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </select>
            </Field>
            <Field label="Composition (5 slots)">
              <input value={draft.comp} onChange={(e) => setDraft({ ...draft, comp: e.target.value })} className="cfg-select h-11" placeholder="Top · Jungle · Mid · Bot · Support" />
            </Field>
            <Field label="Key timings">
              <input value={draft.keyTimings} onChange={(e) => setDraft({ ...draft, keyTimings: e.target.value })} className="cfg-select h-11" placeholder="6:00 dive window · 14:00 group mid" />
            </Field>
            <Field label="Win condition" className="sm:col-span-2">
              <textarea value={draft.winCondition} onChange={(e) => setDraft({ ...draft, winCondition: e.target.value })} rows={2} className="cfg-select" placeholder="What has to be true at 25 minutes for this plan to be winning?" />
            </Field>
            <Field label="Execution steps (one per line)" className="sm:col-span-2">
              <textarea value={draft.steps} onChange={(e) => setDraft({ ...draft, steps: e.target.value })} rows={3} className="cfg-select" placeholder={"Ban priority…\nFirst rotation…\nObjective trade rule…"} />
            </Field>
            <Field label="Tags (comma separated)" className="sm:col-span-2">
              <input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} className="cfg-select h-11" placeholder="dive-comp, drake-prio, BO1 opener" />
            </Field>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <button type="button" onClick={submitStrategy} className="signal-gradient press-fx min-h-[44px] rounded-lg px-5 text-[13px] font-bold text-[#0e1405]">
              Save strategy
            </button>
            <button type="button" onClick={() => setFormOpen(false)} className="press-fx min-h-[44px] rounded-lg border border-[var(--border-subtle)] px-4 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Cancel
            </button>
          </div>
        </Panel>
      )}

      {/* Strategy cards */}
      {visible.length === 0 ? (
        <EmptyState
          title="No strategies in this view"
          message="Create your first game plan with the New strategy button — or switch the filter back to All plans."
          action={
            <button type="button" onClick={() => setFormOpen(true)} className="min-h-[40px] rounded-lg border border-[var(--border-active)] bg-[var(--surface-2)] px-4 text-[13px] font-medium text-[var(--text-primary)] hover:border-[var(--accent-cyan)]">
              New strategy
            </button>
          }
        />
      ) : (
        <StaggerContainer className="grid gap-4 lg:grid-cols-2" gap={0.08}>
          {visible.map((s) => {
            const st = STATUS_STYLE[s.status];
            const removing = confirmRemove === s.id;
            return (
              <RevealItem key={s.id}>
                <Tilt3D max={4} className="h-full">
                  <article className="flex h-full flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/85 p-5 backdrop-blur-sm transition-colors hover:border-[var(--border-active)]">
                    <header className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-semibold text-[var(--text-primary)]">{s.name}</h3>
                        <p className="mt-1 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{CATEGORY_LABEL[s.category]}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => cycleStatus(s)}
                        title="Advance status: draft → match-ready → retired"
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider press-fx ${st.cls}`}
                      >
                        {st.label}
                      </button>
                    </header>

                    <p className="mt-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 px-3 py-2 font-mono text-[12px] text-[var(--text-secondary)]">
                      {s.comp}
                    </p>
                    <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">{s.winCondition}</p>

                    <p className="mt-3 flex items-center gap-1.5 text-[12px] text-[var(--accent-cyan)]">
                      <PickGlyph size={13} />
                      {s.keyTimings}
                    </p>

                    <ol className="mt-3 space-y-1.5">
                      {s.steps.map((step, i) => (
                        <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                          <span className="tnum shrink-0 font-mono text-[var(--text-muted)]">{i + 1}.</span>
                          {step}
                        </li>
                      ))}
                    </ol>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {s.tags.map((t) => (
                        <span key={t} className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">#{t}</span>
                      ))}
                    </div>

                    <footer className="mt-auto flex items-center gap-2 pt-4">
                      <button
                        type="button"
                        onClick={() => {
                          setBriefFor(s);
                          haptic("pick", hapticsEnabled);
                        }}
                        className="press-fx min-h-[38px] flex-1 rounded-lg border border-[var(--accent-cyan)]/50 bg-[var(--accent-cyan)]/10 px-3 text-[12px] font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/15"
                      >
                        Build pre-match brief
                      </button>
                      {removing ? (
                        <span className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              removeStrategy(s.id);
                              setConfirmRemove(null);
                              haptic("invalid", hapticsEnabled);
                              pushToast(`“${s.name}” removed from the Playbook.`, "warn");
                            }}
                            className="press-fx min-h-[38px] rounded-lg border border-[var(--accent-coral)]/60 bg-[var(--accent-coral)]/10 px-3 text-[12px] font-semibold text-[var(--accent-coral)]"
                          >
                            Confirm delete
                          </button>
                          <button type="button" onClick={() => setConfirmRemove(null)} className="press-fx min-h-[38px] rounded-lg border border-[var(--border-subtle)] px-3 text-[12px] text-[var(--text-secondary)]">
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmRemove(s.id)}
                          className="press-fx min-h-[38px] rounded-lg border border-[var(--border-subtle)] px-3 text-[12px] text-[var(--text-muted)] hover:text-[var(--accent-coral)]"
                          aria-label={`Delete strategy ${s.name}`}
                        >
                          Delete
                        </button>
                      )}
                    </footer>
                  </article>
                </Tilt3D>
              </RevealItem>
            );
          })}
        </StaggerContainer>
      )}

      {/* Pre-match brief modal */}
      {briefFor && <BriefModal strategy={briefFor} opponent={selectedOpponent} onClose={() => setBriefFor(null)} onScout={() => navigate("scouting")} />}
    </div>
  );
}

function BriefModal({
  strategy,
  opponent,
  onClose,
  onScout,
}: {
  strategy: Strategy;
  opponent: string;
  onClose: () => void;
  onScout: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label={`Pre-match brief — ${strategy.name}`}>
      <Reveal className="m-3 w-full max-w-[680px]">
        <div className="max-h-[86vh] overflow-y-auto rounded-2xl border border-[var(--border-active)] bg-[var(--surface-1)] p-6 shadow-2xl sm:p-8 glow-volt">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--accent-cyan)]">Pre-match brief</p>
              <h2 className="mt-1.5 text-xl font-semibold text-[var(--text-primary)]">{strategy.name}</h2>
              <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                Prepared for <span className="font-semibold text-[var(--text-primary)]">{opponent}</span> · fixture dataset · Gulf Standard Time
              </p>
            </div>
            <button type="button" onClick={onClose} className="press-fx flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]" aria-label="Close brief">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-3">
              <dt className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Composition</dt>
              <dd className="mt-1 font-mono text-[12px] text-[var(--text-primary)]">{strategy.comp}</dd>
            </div>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-3">
              <dt className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Key timings</dt>
              <dd className="mt-1 text-[12px] text-[var(--accent-cyan)]">{strategy.keyTimings}</dd>
            </div>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-3 sm:col-span-2">
              <dt className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Win condition</dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">{strategy.winCondition}</dd>
            </div>
          </dl>

          <h3 className="mt-5 text-[12px] font-semibold uppercase tracking-wider text-[var(--text-primary)]">Execution checklist</h3>
          <ol className="mt-2 space-y-2">
            {strategy.steps.map((step, i) => (
              <li key={i} className="flex gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/40 px-3 py-2 text-[13px] text-[var(--text-secondary)]">
                <span className="tnum font-mono text-[var(--accent-cyan)]">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>

          <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10 px-3 py-2.5 text-[12px] text-[var(--accent-amber)]">
            <RiskGlyph size={14} />
            Verify the opponent tendencies in Opponent Intelligence before lock-in — fixture metrics are illustrative.
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => window.print()} className="signal-gradient press-fx min-h-[44px] rounded-lg px-5 text-[13px] font-bold text-[#0e1405]">
              Print brief
            </button>
            <button type="button" onClick={onScout} className="press-fx min-h-[44px] rounded-lg border border-[var(--border-active)] bg-[var(--surface-2)] px-4 text-[13px] font-medium text-[var(--text-primary)] hover:border-[var(--accent-cyan)]">
              Check opponent intel
            </button>
            <button type="button" onClick={onClose} className="press-fx min-h-[44px] rounded-lg px-4 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Back to Playbook
            </button>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/70 px-4 py-3 metric-in">
      <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className={`tnum mt-1 text-2xl font-semibold ${accent ? "text-[var(--accent-cyan)]" : "text-[var(--text-primary)]"}`}>{value}</p>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}
