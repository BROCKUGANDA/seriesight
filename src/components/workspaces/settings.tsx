"use client";

/**
 * Workspace Settings: workspace identity, draft role configuration, haptics,
 * reduced-motion behaviour and the provider data-retention policy.
 */
import { useSyncExternalStore } from "react";
import { Panel, FixtureBadge } from "@/components/common/primitives";
import { ALL_ROLES } from "@/domain/types";
import { ROLE_GLYPHS } from "@/components/icons/seriesight-icons";
import { useWorkspaceStore } from "@/store/workspace";

export function Settings() {
  const hapticsEnabled = useWorkspaceStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useWorkspaceStore((s) => s.setHapticsEnabled);
  const pushToast = useWorkspaceStore((s) => s.pushToast);
  const reduceMotion = useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Workspace Settings</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Workspace identity, role configuration, feedback preferences and data-governance boundaries.</p>
      </header>

      <Panel title="Workspace identity">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs md:grid-cols-4">
          <Field k="Workspace" v="Seriesight Demo Workspace" />
          <Field k="Workspace ID" v="ws-demo" />
          <Field k="Our squad" v="Signal Nine (SGT) — fictional" />
          <Field k="Dataset" v="fx-demo-2026-w46 (fixture)" />
        </dl>
        <div className="mt-3"><FixtureBadge /></div>
      </Panel>

      <Panel title="Draft role configuration" subtitle="Players map to roles from observed data; champion flex options stay selectable">
        <div className="grid gap-2 md:grid-cols-5">
          {ALL_ROLES.map((r) => {
            const Glyph = ROLE_GLYPHS[r];
            return (
              <div key={r} className="flex items-center gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 px-3 py-2.5">
                <span className="text-[var(--accent-cyan)]"><Glyph size={16} /></span>
                <div>
                  <p className="text-xs font-medium text-[var(--text-primary)]">{r}</p>
                  <p className="font-mono text-[10px] text-[var(--text-muted)]">required to finalize</p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
          The draft engine rejects completion while any pick lacks a role assignment. Never infer a player&apos;s role solely from a static champion-role mapping — the scouting workspace uses observed-role data where available.
        </p>
      </Panel>

      <Panel title="Feedback preferences">
        <div className="flex flex-col gap-3">
          <label className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 px-4 py-3">
            <span>
              <span className="block text-sm text-[var(--text-primary)]">Haptic feedback</span>
              <span className="block text-[11px] text-[var(--text-muted)]">Brief pulses on pick confirm / invalid action / session complete. Supported mobile devices only; desktop always gets visual confirmation. Never fires on page load.</span>
            </span>
            <input
              type="checkbox"
              checked={hapticsEnabled}
              onChange={(e) => {
                setHapticsEnabled(e.target.checked);
                pushToast(e.target.checked ? "Haptics enabled where supported." : "Haptics disabled.");
              }}
              className="h-5 w-9 shrink-0"
              aria-label="Enable haptic feedback"
            />
          </label>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 px-4 py-3">
            <span>
              <span className="block text-sm text-[var(--text-primary)]">Reduced motion</span>
              <span className="block text-[11px] text-[var(--text-muted)]">
                {reduceMotion
                  ? "Active — your OS requests reduced motion. All animations collapse to instant transitions."
                  : "Not requested. Seriesight honours prefers-reduced-motion globally; no perpetual ambient animation is used."}
              </span>
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${reduceMotion ? "border-[var(--accent-green)]/50 text-[var(--accent-green)]" : "border-[var(--border-active)] text-[var(--text-muted)]"}`}>
              {reduceMotion ? "Honoured" : "Standby"}
            </span>
          </div>
        </div>
      </Panel>

      <Panel title="Data retention & licensing boundaries" subtitle="Provider-specific policy — schema is not permission to retain licensed data">
        <ul className="list-disc space-y-2 pl-5 text-xs leading-relaxed text-[var(--text-secondary)]">
          <li>GRID Open Access is limited to non-commercial learning and experimentation; commercialization requires the appropriate GRID commercial licence.</li>
          <li>Never publish unauthorized GRID raw data or derivative datasets to the public repository. Only fields explicitly permitted by the applicable agreement may be stored or displayed.</li>
          <li>Where licensing does not permit retaining underlying data, the Evidence Ledger exposes only aggregate statistics plus provenance metadata.</li>
          <li>Fixture data is independently authored and always carries its fixture marker — synthetic records never appear inside an official-data view.</li>
          <li>No secrets, provider credentials or licensed raw datasets are committed to fixtures, screenshots or logs.</li>
        </ul>
      </Panel>

      <Panel title="Danger zone">
        <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
          Draft sessions persist in the local database. Clearing them cannot be undone.
        </p>
        <button
          type="button"
          onClick={() => pushToast("Session cleanup is available through the database; the demo keeps sessions for reproducibility.", "warn")}
          className="ctrl-btn mt-3"
        >
          Request session cleanup
        </button>
      </Panel>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{k}</dt>
      <dd className="mt-0.5 font-mono text-[11px] text-[var(--text-secondary)]">{v}</dd>
    </div>
  );
}
