"use client";

/**
 * Player Hub — roster development for the coaching staff: rolling form,
 * self-reported confidence, availability protocol, development goals and
 * per-player coaching notes. Default roster is the Signal Nine (SGT) squad.
 */
import { useState } from "react";
import { Panel, FixtureBadge } from "@/components/common/primitives";
import { useCoachStore, type Availability, type PlayerProfile } from "@/store/coach";
import { useWorkspaceStore, haptic } from "@/store/workspace";
import { ROLE_GLYPHS } from "@/components/icons/seriesight-icons";
import { StaggerContainer, RevealItem, Reveal } from "@/components/fx/motion";

const AVAILABILITY_STYLE: Record<Availability, { label: string; cls: string }> = {
  available: { label: "Available", cls: "text-[var(--accent-green)] border-[var(--accent-green)]/40 bg-[var(--accent-green)]/10" },
  questionable: { label: "Questionable", cls: "text-[var(--accent-amber)] border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10" },
  unavailable: { label: "Unavailable", cls: "text-[var(--accent-coral)] border-[var(--accent-coral)]/40 bg-[var(--accent-coral)]/10" },
};

const ROLE_LABEL: Record<PlayerProfile["role"], string> = {
  TOP: "Top lane",
  JUNGLE: "Jungle",
  MID: "Mid lane",
  BOT: "Bot lane",
  SUPPORT: "Support",
};

function FormBar({ value, label }: { value: number; label: string }) {
  const tone = value >= 80 ? "var(--accent-green)" : value >= 60 ? "var(--accent-cyan)" : "var(--accent-amber)";
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="tnum font-semibold text-[var(--text-secondary)]">{value}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--surface-3)]" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={`${label}: ${value} out of 100`}>
        <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${value}%`, background: `linear-gradient(90deg, ${tone}66, ${tone})` }} />
      </div>
    </div>
  );
}

export function PlayerHub() {
  const players = useCoachStore((s) => s.players);
  const addGoal = useCoachStore((s) => s.addGoal);
  const toggleGoal = useCoachStore((s) => s.toggleGoal);
  const removeGoal = useCoachStore((s) => s.removeGoal);
  const setAvailability = useCoachStore((s) => s.setAvailability);
  const setPlayerNotes = useCoachStore((s) => s.setPlayerNotes);
  const pushNotification = useCoachStore((s) => s.pushNotification);
  const pushToast = useWorkspaceStore((s) => s.pushToast);
  const hapticsEnabled = useWorkspaceStore((s) => s.hapticsEnabled);

  const [goalDraft, setGoalDraft] = useState<Record<string, { text: string; due: string }>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const avgForm = Math.round(players.reduce((a, p) => a + p.form, 0) / Math.max(players.length, 1));
  const available = players.filter((p) => p.availability === "available").length;
  const openGoals = players.flatMap((p) => p.goals).filter((g) => !g.done).length;

  const submitGoal = (p: PlayerProfile) => {
    const d = goalDraft[p.id];
    if (!d?.text.trim()) {
      pushToast("Write the development goal before adding it.", "warn");
      haptic("invalid", hapticsEnabled);
      return;
    }
    addGoal(p.id, d.text.trim(), d.due || new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10));
    setGoalDraft({ ...goalDraft, [p.id]: { text: "", due: "" } });
    haptic("complete", hapticsEnabled);
    pushToast(`Goal added for ${p.handle}.`, "ok");
  };

  const changeAvailability = (p: PlayerProfile, a: Availability) => {
    setAvailability(p.id, a);
    haptic("pick", hapticsEnabled);
    if (a !== "available") {
      pushNotification({
        title: `${p.handle} flagged ${AVAILABILITY_STYLE[a].label.toLowerCase()}`,
        body: `Roster availability changed by the coaching staff. Practice plan may need adjusting.`,
        tone: "alert",
      });
    }
    pushToast(`${p.handle} marked ${AVAILABILITY_STYLE[a].label.toLowerCase()} for this week.`, a === "available" ? "ok" : "warn");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/60 px-6 py-6 scanlines">
        <div aria-hidden="true" className="grid-floor pointer-events-none absolute inset-0" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--accent-cyan)]">Player Hub</p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
              Develop the roster, not just the draft.
            </h1>
            <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-[var(--text-secondary)]">
              Rolling form, confidence, availability protocol and development goals for every starter —
              the single source of truth for who plays, who rests and what they are working on.
            </p>
          </div>
          <FixtureBadge />
        </div>
      </section>

      {/* Squad summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/70 px-4 py-3 metric-in">
          <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Squad form index</p>
          <p className="tnum mt-1 text-2xl font-semibold text-[var(--accent-cyan)]">{avgForm}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Rolling average across starters</p>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/70 px-4 py-3 metric-in">
          <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Fully available</p>
          <p className="tnum mt-1 text-2xl font-semibold text-[var(--accent-green)]">
            {available}/{players.length}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Cleared for the full scrim block</p>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/70 px-4 py-3 metric-in">
          <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Open goals</p>
          <p className="tnum mt-1 text-2xl font-semibold text-[var(--text-primary)]">{openGoals}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Active development targets</p>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/70 px-4 py-3 metric-in">
          <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Wrist protocol</p>
          <p className="tnum mt-1 text-2xl font-semibold text-[var(--accent-amber)]">1</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Cassius — scrim cap until Friday</p>
        </div>
      </div>

      {/* Roster */}
      <StaggerContainer className="grid gap-4 lg:grid-cols-2" gap={0.08}>
        {players.map((p) => {
          const Glyph = ROLE_GLYPHS[p.role];
          const av = AVAILABILITY_STYLE[p.availability];
          return (
            <RevealItem key={p.id}>
              <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/85 p-5 backdrop-blur-sm transition-colors hover:border-[var(--border-active)]">
                <header className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--accent-cyan)]">
                      <Glyph size={20} />
                    </span>
                    <div>
                      <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{p.handle}</h3>
                      <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{ROLE_LABEL[p.role]}</p>
                    </div>
                  </div>
                  <label className="sr-only" htmlFor={`av-${p.id}`}>
                    Availability for {p.handle}
                  </label>
                  <select
                    id={`av-${p.id}`}
                    value={p.availability}
                    onChange={(e) => changeAvailability(p, e.target.value as Availability)}
                    className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${av.cls} bg-transparent`}
                  >
                    {(Object.keys(AVAILABILITY_STYLE) as Availability[]).map((a) => (
                      <option key={a} value={a} className="bg-[var(--surface-2)] text-[var(--text-primary)]">
                        {AVAILABILITY_STYLE[a].label}
                      </option>
                    ))}
                  </select>
                </header>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <FormBar value={p.form} label="Rolling form" />
                  <FormBar value={p.confidence} label="Self-reported confidence" />
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.champions.map((c) => (
                    <span key={c} className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">{c}</span>
                  ))}
                </div>

                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Development goals ({p.goals.filter((g) => !g.done).length} open)
                  </p>
                  <ul className="mt-2 space-y-2">
                    {p.goals.map((g) => (
                      <li key={g.id} className="flex items-start gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/40 px-3 py-2">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={g.done}
                          aria-label={`Mark goal “${g.text}” as ${g.done ? "open" : "done"}`}
                          onClick={() => {
                            toggleGoal(p.id, g.id);
                            haptic("pick", hapticsEnabled);
                            if (!g.done) pushToast(`Goal completed for ${p.handle}. Nice.`, "ok");
                          }}
                          className={`press-fx mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                            g.done ? "border-[var(--accent-green)] bg-[var(--accent-green)]/20 text-[var(--accent-green)]" : "border-[var(--border-active)] text-transparent"
                          }`}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M5 12.5 10 17.5 19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={`text-[13px] leading-snug ${g.done ? "text-[var(--text-muted)] line-through" : "text-[var(--text-secondary)]"}`}>{g.text}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">Due {g.due}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            removeGoal(p.id, g.id);
                            pushToast("Goal removed.", "warn");
                          }}
                          className="press-fx text-[11px] text-[var(--text-muted)] hover:text-[var(--accent-coral)]"
                          aria-label={`Remove goal “${g.text}”`}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={goalDraft[p.id]?.text ?? ""}
                      onChange={(e) => setGoalDraft({ ...goalDraft, [p.id]: { text: e.target.value, due: goalDraft[p.id]?.due ?? "" } })}
                      placeholder={`New development goal for ${p.handle}…`}
                      className="cfg-select h-10 flex-1"
                      aria-label={`New goal for ${p.handle}`}
                    />
                    <input
                      type="date"
                      value={goalDraft[p.id]?.due ?? ""}
                      onChange={(e) => setGoalDraft({ ...goalDraft, [p.id]: { text: goalDraft[p.id]?.text ?? "", due: e.target.value } })}
                      className="cfg-select-wrap cfg-select h-10 w-[140px]"
                      aria-label="Goal due date"
                    />
                    <button type="button" onClick={() => submitGoal(p)} className="press-fx min-h-[40px] rounded-lg border border-[var(--accent-cyan)]/50 bg-[var(--accent-cyan)]/10 px-3 text-[12px] font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20">
                      Add
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <label htmlFor={`notes-${p.id}`} className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Coaching notes
                  </label>
                  <textarea
                    id={`notes-${p.id}`}
                    rows={2}
                    value={notesDraft[p.id] ?? p.notes}
                    onChange={(e) => setNotesDraft({ ...notesDraft, [p.id]: e.target.value })}
                    className="cfg-select mt-1.5"
                  />
                  {notesDraft[p.id] !== undefined && notesDraft[p.id] !== p.notes && (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPlayerNotes(p.id, notesDraft[p.id]);
                          pushToast(`Notes saved for ${p.handle}.`, "ok");
                          haptic("complete", hapticsEnabled);
                        }}
                        className="press-fx min-h-[36px] rounded-lg border border-[var(--accent-cyan)]/50 bg-[var(--accent-cyan)]/10 px-3 text-[12px] font-semibold text-[var(--accent-cyan)]"
                      >
                        Save notes
                      </button>
                      <button type="button" onClick={() => setNotesDraft({ ...notesDraft, [p.id]: p.notes })} className="press-fx min-h-[36px] rounded-lg border border-[var(--border-subtle)] px-3 text-[12px] text-[var(--text-secondary)]">
                        Discard
                      </button>
                    </div>
                  )}
                </div>
              </article>
            </RevealItem>
          );
        })}
      </StaggerContainer>

      <Reveal>
        <Panel title="Availability protocol" subtitle="How the staff uses these statuses">
          <ul className="space-y-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            <li><strong className="text-[var(--text-primary)]">Available</strong> — cleared for scrims and official matches without restriction.</li>
            <li><strong className="text-[var(--text-primary)]">Questionable</strong> — cleared with a load cap; the Practice Planner shows the adjusted block.</li>
            <li><strong className="text-[var(--text-primary)]">Unavailable</strong> — no scrim or match participation; the draft engine still tracks their champion pool for Fearless planning.</li>
          </ul>
        </Panel>
      </Reveal>
    </div>
  );
}
