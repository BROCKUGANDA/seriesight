"use client";

/**
 * Practice Planner — the coaching week at a glance: scrim blocks, drill
 * sessions, veto meetings and VOD reviews on Gulf Standard Time, with
 * result logging and a weekly load bar per day.
 */
import { useMemo, useState } from "react";
import { Panel, EmptyState, FixtureBadge } from "@/components/common/primitives";
import { useCoachStore, type PracticeSession, type SessionKind, type SessionStatus } from "@/store/coach";
import { useWorkspaceStore, haptic } from "@/store/workspace";
import { Reveal, StaggerContainer, RevealItem } from "@/components/fx/motion";

const KIND_STYLE: Record<SessionKind, { label: string; cls: string; dot: string }> = {
  scrim: { label: "Scrim", cls: "text-[var(--accent-cyan)] border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10", dot: "var(--accent-cyan)" },
  drill: { label: "Drill", cls: "text-[var(--accent-indigo)] border-[var(--accent-indigo)]/40 bg-[var(--accent-indigo)]/10", dot: "var(--accent-indigo)" },
  veto: { label: "Veto meeting", cls: "text-[var(--accent-violet)] border-[var(--accent-violet)]/40 bg-[var(--accent-violet)]/10", dot: "var(--accent-violet)" },
  review: { label: "VOD review", cls: "text-[var(--accent-amber)] border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10", dot: "var(--accent-amber)" },
};

const STATUS_LABEL: Record<SessionStatus, string> = {
  scheduled: "Scheduled",
  done: "Completed",
  cancelled: "Cancelled",
};

const KIND_LABEL: Record<SessionKind, string> = {
  scrim: "Scrim",
  drill: "Drill block",
  veto: "Veto meeting",
  review: "VOD review",
};

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

const emptySession = {
  kind: "scrim" as SessionKind,
  date: "",
  time: "",
  opponent: "",
  focus: "",
  notes: "",
};

export function PracticePlanner() {
  const sessions = useCoachStore((s) => s.sessions);
  const addSession = useCoachStore((s) => s.addSession);
  const setSessionStatus = useCoachStore((s) => s.setSessionStatus);
  const removeSession = useCoachStore((s) => s.removeSession);
  const pushNotification = useCoachStore((s) => s.pushNotification);
  const pushToast = useWorkspaceStore((s) => s.pushToast);
  const hapticsEnabled = useWorkspaceStore((s) => s.hapticsEnabled);

  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState(emptySession);

  const grouped = useMemo(() => {
    const map = new Map<string, PracticeSession[]>();
    for (const s of [...sessions].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))) {
      const arr = map.get(s.date) ?? [];
      arr.push(s);
      map.set(s.date, arr);
    }
    return [...map.entries()];
  }, [sessions]);

  const wins = sessions.filter((s) => s.result === "win").length;
  const losses = sessions.filter((s) => s.result === "loss").length;
  const upcoming = sessions.filter((s) => s.status === "scheduled").length;

  const submit = () => {
    if (!draft.date || !/^\d{2}:\d{2}$/.test(draft.time) || !draft.opponent.trim() || !draft.focus.trim()) {
      pushToast("A session needs a date, a start time (HH:mm), an opponent and a focus statement.", "warn");
      haptic("invalid", hapticsEnabled);
      return;
    }
    addSession({
      ...draft,
      opponent: draft.opponent.trim(),
      focus: draft.focus.trim(),
      notes: draft.notes.trim(),
      status: "scheduled",
    });
    pushNotification({
      title: "Practice session added",
      body: `${KIND_LABEL[draft.kind]} vs ${draft.opponent.trim()} locked for ${dayLabel(draft.date)} at ${draft.time} GST.`,
      tone: "info",
    });
    setDraft(emptySession);
    setFormOpen(false);
    haptic("complete", hapticsEnabled);
    pushToast("Session scheduled — the staff will see it in their notifications.", "ok");
  };

  const recordResult = (s: PracticeSession, result: "win" | "loss") => {
    setSessionStatus(s.id, "done", result);
    haptic("complete", hapticsEnabled);
    pushNotification({
      title: `Scrim ${result === "win" ? "won" : "lost"} vs ${s.opponent}`,
      body: `Result recorded for the ${dayLabel(s.date)} block. VOD clips can now be tagged in VOD Review.`,
      tone: result === "win" ? "success" : "info",
    });
    pushToast(`Result logged: ${result === "win" ? "win" : "loss"} vs ${s.opponent}.`, result === "win" ? "ok" : "warn");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/60 px-6 py-6 scanlines">
        <div aria-hidden="true" className="grid-floor pointer-events-none absolute inset-0" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--accent-cyan)]">Practice Planner</p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
              Schedule the week. Log the outcomes.
            </h1>
            <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-[var(--text-secondary)]">
              Scrims, drills, veto meetings and VOD reviews — all on Gulf Standard Time. Log results after
              each block and the notifications keep the whole staff aligned.
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
              Schedule session
            </button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/70 px-4 py-3 metric-in">
          <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Scheduled blocks</p>
          <p className="tnum mt-1 text-2xl font-semibold text-[var(--accent-cyan)]">{upcoming}</p>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/70 px-4 py-3 metric-in">
          <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Scrim record</p>
          <p className="tnum mt-1 text-2xl font-semibold text-[var(--text-primary)]">
            {wins}–{losses}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/70 px-4 py-3 metric-in">
          <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Win rate</p>
          <p className="tnum mt-1 text-2xl font-semibold text-[var(--accent-green)]">
            {wins + losses > 0 ? `${Math.round((wins / (wins + losses)) * 100)}%` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/70 px-4 py-3 metric-in">
          <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Blocks logged</p>
          <p className="tnum mt-1 text-2xl font-semibold text-[var(--text-primary)]">{sessions.length}</p>
        </div>
      </div>

      {/* New session form */}
      {formOpen && (
        <Panel title="Schedule a session" subtitle="All times are Gulf Standard Time (UTC+4).">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">Session type</span>
              <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as SessionKind })} className="cfg-select-wrap cfg-select h-11">
                {(Object.keys(KIND_LABEL) as SessionKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">Date</span>
              <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="cfg-select-wrap cfg-select h-11" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">Start time (HH:mm)</span>
              <input value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} className="cfg-select h-11" placeholder="19:00" inputMode="numeric" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">Opponent / scope</span>
              <input value={draft.opponent} onChange={(e) => setDraft({ ...draft, opponent: e.target.value })} className="cfg-select h-11" placeholder="Nova Vanguard (NVX) or Internal" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">Focus</span>
              <input value={draft.focus} onChange={(e) => setDraft({ ...draft, focus: e.target.value })} className="cfg-select h-11" placeholder="Hailshop Dive BO1 rehearsal — full comms recording" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">Staff notes</span>
              <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2} className="cfg-select" placeholder="Player load caps, comms recording, room booking…" />
            </label>
          </div>
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={submit} className="signal-gradient press-fx min-h-[44px] rounded-lg px-5 text-[13px] font-bold text-[#0e1405]">
              Schedule session
            </button>
            <button type="button" onClick={() => setFormOpen(false)} className="press-fx min-h-[44px] rounded-lg border border-[var(--border-subtle)] px-4 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Cancel
            </button>
          </div>
        </Panel>
      )}

      {/* Weekly plan */}
      {grouped.length === 0 ? (
        <EmptyState
          title="The week is empty"
          message="Schedule your first scrim, drill or veto meeting — dates, focus and staff notes keep everyone aligned."
        />
      ) : (
        <StaggerContainer className="flex flex-col gap-5" gap={0.08}>
          {grouped.map(([date, list]) => {
            const load = Math.min(list.length * 34, 100);
            return (
              <RevealItem key={date}>
                <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/70 p-5 backdrop-blur-sm">
                  <header className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{dayLabel(date)}</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[var(--text-muted)]">Load</span>
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-[var(--surface-3)]">
                        <div className="h-full rounded-full signal-gradient transition-[width] duration-700" style={{ width: `${load}%` }} />
                      </div>
                      <span className="tnum text-[11px] text-[var(--text-secondary)]">{list.length} block{list.length > 1 ? "s" : ""}</span>
                    </div>
                  </header>
                  <ul className="mt-4 space-y-3">
                    {list.map((s) => {
                      const k = KIND_STYLE[s.kind];
                      return (
                        <li key={s.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/50 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex items-start gap-3">
                              <span className="tnum rounded-md border border-[var(--border-subtle)] bg-[var(--surface-3)] px-2.5 py-1.5 font-mono text-[12px] font-bold text-[var(--text-primary)]">
                                {s.time}
                                <span className="ml-1 text-[9px] font-normal text-[var(--text-muted)]">GST</span>
                              </span>
                              <div>
                                <p className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
                                  <span className={`inline-block h-2 w-2 rounded-full ${s.status === "cancelled" ? "opacity-40" : ""}`} style={{ background: k.dot }} aria-hidden="true" />
                                  {s.focus}
                                </p>
                                <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
                                  {s.opponent} · {KIND_LABEL[s.kind]}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${k.cls}`}>{k.label}</span>
                              <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                                s.status === "done"
                                  ? "text-[var(--accent-green)] border-[var(--accent-green)]/40 bg-[var(--accent-green)]/10"
                                  : s.status === "cancelled"
                                    ? "text-[var(--text-muted)] border-[var(--border-subtle)] bg-[var(--surface-2)]"
                                    : "text-[var(--accent-cyan)] border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10"
                              }`}>
                                {STATUS_LABEL[s.status]}{s.result ? ` · ${s.result.toUpperCase()}` : ""}
                              </span>
                            </div>
                          </div>

                          {s.notes && <p className="mt-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">{s.notes}</p>}

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {s.status === "scheduled" && s.kind === "scrim" && (
                              <>
                                <button type="button" onClick={() => recordResult(s, "win")} className="press-fx min-h-[36px] rounded-lg border border-[var(--accent-green)]/50 bg-[var(--accent-green)]/10 px-3 text-[12px] font-semibold text-[var(--accent-green)]">
                                  Log win
                                </button>
                                <button type="button" onClick={() => recordResult(s, "loss")} className="press-fx min-h-[36px] rounded-lg border border-[var(--accent-coral)]/50 bg-[var(--accent-coral)]/10 px-3 text-[12px] font-semibold text-[var(--accent-coral)]">
                                  Log loss
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSessionStatus(s.id, "cancelled");
                                    pushToast("Session cancelled — the staff has been notified.", "warn");
                                    haptic("invalid", hapticsEnabled);
                                  }}
                                  className="press-fx min-h-[36px] rounded-lg border border-[var(--border-subtle)] px-3 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                >
                                  Cancel session
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                removeSession(s.id);
                                pushToast("Session removed from the planner.", "warn");
                              }}
                              className="press-fx ml-auto min-h-[36px] rounded-lg px-3 text-[12px] text-[var(--text-muted)] hover:text-[var(--accent-coral)]"
                              aria-label={`Remove session ${s.focus}`}
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </RevealItem>
            );
          })}
        </StaggerContainer>
      )}

      <Reveal>
        <Panel title="Weekly rhythm" subtitle="The Signal Nine template week">
          <ul className="space-y-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            <li><strong className="text-[var(--text-primary)]">Monday</strong> — full BO1 scrim vs the upcoming opponent, comms recorded for VOD review.</li>
            <li><strong className="text-[var(--text-primary)]">Tuesday</strong> — targeted drill block for any unpolished flex line flagged in the Playbook.</li>
            <li><strong className="text-[var(--text-primary)]">Wednesday</strong> — staff-only veto meeting: ban matrix and strategy promotion to Match-ready.</li>
            <li><strong className="text-[var(--text-primary)]">Thursday</strong> — BO3 scrim blocks with side swaps against a sparring partner.</li>
            <li><strong className="text-[var(--text-primary)]">Friday</strong> — full-staff VOD review: clips from VOD Review plus the entry-order rule vote.</li>
          </ul>
        </Panel>
      </Reveal>
    </div>
  );
}
