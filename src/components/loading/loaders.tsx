/**
 * Seriesight loading states (PRD F5): four distinct, purposeful patterns.
 */
export function SignalSweep({ label = "Loading data", className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} role="status" aria-label={label}>
      <div className="signal-sweep h-1 rounded-full bg-[var(--surface-2)]" />
      <span className="text-[11px] tracking-wide text-[var(--text-muted)]">{label}</span>
    </div>
  );
}

export function ApertureLoader({ label = "Seriesight" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5" role="status" aria-label={`Starting ${label}`}>
      <svg width="84" height="84" viewBox="0 0 32 32" fill="none" className="aperture-loader">
        <circle cx="16" cy="16" r="14" className="aperture-ring-1" style={{ transformOrigin: "center" }} stroke="var(--border-active)" strokeWidth="1" strokeDasharray="4 6" />
        <circle cx="16" cy="16" r="10.5" className="aperture-ring-2" style={{ transformOrigin: "center" }} stroke="var(--accent-cyan)" strokeWidth="1" strokeDasharray="2 5" opacity="0.8" />
        {["var(--accent-cyan)", "var(--accent-green)", "var(--text-primary)", "var(--accent-indigo)", "var(--accent-violet)"].map((color, i) => (
          <rect key={color} x={7 + i * 4.2} y={i === 2 ? 8 : 10 - Math.abs(i - 2) * 1.5} width="2.4" height={i === 2 ? 16 : 12 + Math.abs(i - 2) * 3} rx="1.2" fill={color} />
        ))}
        <circle cx="16" cy="16" r="2.1" fill="var(--bg-void)" stroke="var(--accent-cyan)" strokeWidth="1.2" />
      </svg>
      <span className="text-xs tracking-[0.3em] text-[var(--text-muted)] uppercase">{label}</span>
    </div>
  );
}

export function SeriesAssembly({ label = "Assembling series" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-label={label}>
      <div className="series-assembly flex items-end gap-1.5 h-8">
        <span className="h-5 signal-gradient" />
        <span className="h-8 signal-gradient" />
        <span className="h-8 series-gradient" />
        <span className="h-6 series-gradient" />
        <span className="h-4 series-gradient" />
      </div>
      <span className="text-[11px] tracking-wide text-[var(--text-muted)]">{label}</span>
    </div>
  );
}

export function EvidenceReconstruction({ label = "Reconstructing evidence" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-label={label}>
      <svg width="120" height="56" viewBox="0 0 120 56" fill="none" aria-hidden="true">
        {[
          [12, 44], [34, 18], [58, 40], [82, 14], [106, 36],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill={i % 2 ? "var(--accent-indigo)" : "var(--accent-cyan)"} className="evidence-node" />
        ))}
        <path d="M12 44 34 18 58 40 82 14 106 36" stroke="var(--border-active)" strokeWidth="1" strokeDasharray="3 4" />
      </svg>
      <span className="text-[11px] tracking-wide text-[var(--text-muted)]">{label}</span>
    </div>
  );
}
