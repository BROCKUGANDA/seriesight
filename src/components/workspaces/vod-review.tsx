"use client";

/**
 * VOD Review — clip tagging for film sessions. Coaches timestamp key moments,
 * tag them (vision, dive, lane, throw…), track review status and see the
 * clip distribution on a 0–35 minute match timeline. Built for the Friday
 * team review loop described in the Practice Planner.
 */
import { useMemo, useState } from "react";
import { Panel, EmptyState, FixtureBadge } from "@/components/common/primitives";
import { useCoachStore, type ClipStatus, type VodClip } from "@/store/coach";
import { useWorkspaceStore, haptic } from "@/store/workspace";
import { Reveal, StaggerContainer, RevealItem } from "@/components/fx/motion";
import { HistoryGlyph } from "@/components/icons/seriesight-icons";

const STATUS_STYLE: Record<ClipStatus, { label: string; cls: string }> = {
  "to-review": { label: "To review", cls: "text-[var(--accent-amber)] border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10" },
  reviewed: { label: "Reviewed", cls: "text-[var(--accent-cyan)] border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10" },
  coached: { label: "Coached", cls: "text-[var(--accent-green)] border-[var(--accent-green)]/40 bg-[var(--accent-green)]/10" },
};

const TAG_SUGGESTIONS = ["vision", "objective", "dive", "lane", "teamfight", "late-game", "throw", "summoners", "play-of-the-week"];

const TAG_COLORS: Record<string, string> = {
  vision: "var(--accent-indigo)",
  objective: "var(--accent-cyan)",
  dive: "var(--accent-violet)",
  lane: "var(--accent-green)",
  teamfight: "var(--accent-coral)",
  "late-game": "var(--accent-amber)",
  throw: "var(--accent-coral)",
  summoners: "var(--accent-amber)",
  "play-of-the-week": "var(--accent-cyan)",
};

function tsToMinutes(ts: string): number {
  const [m, s] = ts.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(m) || Number.isNaN(s)) return NaN;
  return m + s / 60;
}

function minutesToTs(min: number): string {
  const m = Math.floor(min);
  const s = Math.round((min - m) * 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const emptyClip = { title: "", game: "SGT vs NVX · Game 2", timestamp: "", side: "blue" as "blue" | "red", tags: "", note: "" };

export function VodReview() {
  const clips = useCoachStore((s) => s.clips);
  const addClip = useCoachStore((s) => s.addClip);
  const setClipStatus = useCoachStore((s) => s.setClipStatus);
  const removeClip = useCoachStore((s) => s.removeClip);
  const pushToast = useWorkspaceStore((s) => s.pushToast);
  const hapticsEnabled = useWorkspaceStore((s) => s.hapticsEnabled);

  const [filter, setFilter] = useState<"all" | ClipStatus>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState(emptyClip);

  const visible = useMemo(() => (filter === "all" ? clips : clips.filter((c) => c.status === filter)), [clips, filter]);

  const submitClip = () => {
    const ts = draft.timestamp.trim();
    if (!draft.title.trim() || !/^\d{1,2}:\d{2}$/.test(ts)) {
      pushToast("Give the clip a title and a timestamp in mm:ss format — for example 13:42.", "warn");
      haptic("invalid", hapticsEnabled);
      return;
    }
    const minutes = tsToMinutes(ts);
    if (minutes > 60) {
      pushToast("Timestamps above 60 minutes are not supported — check the minute value.", "warn");
      haptic("invalid", hapticsEnabled);
      return;
    }
    addClip({
      ...draft,
      title: draft.title.trim(),
      timestamp: ts,
      tags: draft.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      status: "to-review",
      note: draft.note.trim(),
    });
    setDraft(emptyClip);
    setFormOpen(false);
    haptic("complete", hapticsEnabled);
    pushToast("Clip tagged “To review” — it will surface in the Friday team review.", "ok");
  };

  const advance = (c: VodClip) => {
    const next: ClipStatus = c.status === "to-review" ? "reviewed" : c.status === "reviewed" ? "coached" : "to-review";
    setClipStatus(c.id, next);
    haptic("pick", hapticsEnabled);
    pushToast(`“${c.title}” moved to ${STATUS_STYLE[next].label.toLowerCase()}.`, "ok");
  };

  const counts = {
    total: clips.length,
    toReview: clips.filter((c) => c.status === "to-review").length,
    reviewed: clips.filter((c) => c.status === "reviewed").length,
    coached: clips.filter((c) => c.status === "coached").length,
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/60 px-6 py-6 scanlines">
        <div aria-hidden="true" className="grid-floor pointer-events-none absolute inset-0" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--accent-cyan)]">VOD Review</p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
              Timestamp the truth. Coach the moment.
            </h1>
            <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-[var(--text-secondary)]">
              Tag key moments with timestamps and themes, move them through review status, and walk the
              staff through the timeline on review day. Every clip links the lesson to the evidence.
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
              Tag a clip
            </button>
          </div>
        </div>
      </section>

      {/* Stats + timeline */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/70 px-4 py-3 metric-in">
          <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Clips tagged</p>
          <p className="tnum mt-1 text-2xl font-semibold text-[var(--text-primary)]">{counts.total}</p>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/70 px-4 py-3 metric-in">
          <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">To review</p>
          <p className="tnum mt-1 text-2xl font-semibold text-[var(--accent-amber)]">{counts.toReview}</p>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/70 px-4 py-3 metric-in">
          <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Reviewed</p>
          <p className="tnum mt-1 text-2xl font-semibold text-[var(--accent-cyan)]">{counts.reviewed}</p>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/70 px-4 py-3 metric-in">
          <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Coached to team</p>
          <p className="tnum mt-1 text-2xl font-semibold text-[var(--accent-green)]">{counts.coached}</p>
        </div>
      </div>

      {clips.length > 0 && (
        <Panel
          title="Moment timeline"
          subtitle="0–35 minute match window · hover a marker for its timestamp"
        >
          <div className="relative h-16 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/40 px-1">
            <div className="absolute inset-x-2 top-1/2 h-px bg-[var(--border-active)]" aria-hidden="true" />
            {[0, 5, 10, 15, 20, 25, 30, 35].map((min) => (
              <span key={min} className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-[var(--border-active)]" style={{ left: `${(min / 35) * 98 + 1}%` }} aria-hidden="true" />
            ))}
            {clips.map((c) => {
              const min = tsToMinutes(c.timestamp);
              if (Number.isNaN(min) || min > 35) return null;
              const color = TAG_COLORS[c.tags[0]] ?? "var(--accent-cyan)";
              const statusTone = c.status === "coached" ? "var(--accent-green)" : c.status === "reviewed" ? "var(--accent-cyan)" : "var(--accent-amber)";
              return (
                <span
                  key={c.id}
                  title={`${c.timestamp} — ${c.title}`}
                  className="group absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${Math.min((min / 35) * 98 + 1, 99)}%` }}
                >
                  <span
                    className="block h-3.5 w-3.5 rounded-full border-2 transition-transform group-hover:scale-125"
                    style={{ borderColor: statusTone, background: `${color}55` }}
                  />
                </span>
              );
            })}
            <span className="absolute bottom-0 left-1 font-mono text-[9px] text-[var(--text-muted)]">00:00</span>
            <span className="absolute bottom-0 right-1 font-mono text-[9px] text-[var(--text-muted)]">35:00</span>
          </div>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">
            Marker colour = first tag theme · ring colour = review status. Clips beyond 35 minutes appear in the list below.
          </p>
        </Panel>
      )}

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter clips by status">
        {(["all", "to-review", "reviewed", "coached"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setFilter(f);
              haptic("pick", hapticsEnabled);
            }}
            aria-pressed={filter === f}
            className={`min-h-[36px] rounded-full border px-4 text-[12px] font-medium transition-colors ${
              filter === f
                ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]"
                : "border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {f === "all" ? `All clips (${counts.total})` : `${STATUS_STYLE[f].label} (${counts[f === "to-review" ? "toReview" : f === "reviewed" ? "reviewed" : "coached"]})`}
          </button>
        ))}
      </div>

      {/* New clip form */}
      {formOpen && (
        <Panel title="Tag a new clip" subtitle="Timestamp, context and the coaching takeaway.">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">Clip title</span>
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="cfg-select h-11" placeholder="e.g. Herald vision blackout before the 14:00 fight" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">Game</span>
              <select value={draft.game} onChange={(e) => setDraft({ ...draft, game: e.target.value })} className="cfg-select-wrap cfg-select h-11">
                <option>SGT vs NVX · Game 1</option>
                <option>SGT vs NVX · Game 2</option>
                <option>SGT vs NVX · Game 3</option>
                <option>SGT vs HLX · Game 4</option>
                <option>Scrim block — Monday</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">Timestamp (mm:ss)</span>
              <input value={draft.timestamp} onChange={(e) => setDraft({ ...draft, timestamp: e.target.value })} className="cfg-select h-11" placeholder="13:42" inputMode="numeric" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">Side</span>
              <select value={draft.side} onChange={(e) => setDraft({ ...draft, side: e.target.value as "blue" | "red" })} className="cfg-select-wrap cfg-select h-11">
                <option value="blue">Blue side</option>
                <option value="red">Red side</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">Tags (comma separated)</span>
              <input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} className="cfg-select h-11" placeholder="vision, objective, throw" list="tag-suggestions" />
              <datalist id="tag-suggestions">
                {TAG_SUGGESTIONS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">Coaching note</span>
              <textarea value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} rows={2} className="cfg-select" placeholder="What should the team learn from this moment?" />
            </label>
          </div>
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={submitClip} className="signal-gradient press-fx min-h-[44px] rounded-lg px-5 text-[13px] font-bold text-[#0e1405]">
              Save clip
            </button>
            <button type="button" onClick={() => setFormOpen(false)} className="press-fx min-h-[44px] rounded-lg border border-[var(--border-subtle)] px-4 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Cancel
            </button>
          </div>
        </Panel>
      )}

      {/* Clip list */}
      {visible.length === 0 ? (
        <EmptyState
          title="No clips in this view"
          message="Tag your first key moment with the Tag a clip button — timestamps, tags and the takeaway your team should learn."
        />
      ) : (
        <StaggerContainer className="flex flex-col gap-3" gap={0.07}>
          {visible.map((c) => {
            const st = STATUS_STYLE[c.status];
            return (
              <RevealItem key={c.id}>
                <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/85 p-4 backdrop-blur-sm transition-colors hover:border-[var(--border-active)] sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] font-mono text-[12px] font-bold text-[var(--accent-cyan)]">
                        {c.timestamp}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-[14px] font-semibold leading-snug text-[var(--text-primary)]">{c.title}</h3>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--text-muted)]">
                          <span className="inline-flex items-center gap-1">
                            <HistoryGlyph size={11} />
                            {c.game}
                          </span>
                          <span>· {c.side} side</span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => advance(c)}
                      className={`press-fx shrink-0 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${st.cls}`}
                      title="Advance review status"
                    >
                      {st.label}
                    </button>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {c.tags.map((t) => (
                      <span key={t} className="rounded px-2 py-0.5 text-[10px] font-medium" style={{ color: TAG_COLORS[t] ?? "var(--text-secondary)", background: "var(--surface-2)" }}>
                        #{t}
                      </span>
                    ))}
                  </div>

                  {c.note && <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">{c.note}</p>}

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setClipStatus(c.id, "coached");
                        pushToast("Marked as coached — this lesson has been delivered to the team.", "ok");
                        haptic("complete", hapticsEnabled);
                      }}
                      disabled={c.status === "coached"}
                      className="press-fx min-h-[36px] rounded-lg border border-[var(--accent-green)]/50 bg-[var(--accent-green)]/10 px-3 text-[12px] font-semibold text-[var(--accent-green)] disabled:opacity-40"
                    >
                      Mark coached
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        removeClip(c.id);
                        pushToast("Clip removed from the review queue.", "warn");
                        haptic("invalid", hapticsEnabled);
                      }}
                      className="press-fx min-h-[36px] rounded-lg border border-[var(--border-subtle)] px-3 text-[12px] text-[var(--text-muted)] hover:text-[var(--accent-coral)]"
                    >
                      Delete
                    </button>
                    <span className="ml-auto font-mono text-[10px] text-[var(--text-muted)]">{minutesToTs(tsToMinutes(c.timestamp))}</span>
                  </div>
                </article>
              </RevealItem>
            );
          })}
        </StaggerContainer>
      )}
    </div>
  );
}
