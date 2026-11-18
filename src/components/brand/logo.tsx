/**
 * Seriesight brand identity — original vector assets (PRD E2).
 * Five vertical signal marks passing through a central aperture.
 * VOLT ARENA palette: volt lime, mint, white, plasma purple, magenta flare.
 * No third-party logos (Cloud9 / Riot / JetBrains) are used anywhere here.
 */
export function SeriesightSymbol({ size = 28, mono = false }: { size?: number; mono?: boolean }) {
  const marks = ["#C6FF3E", "#46E8B0", "#F5F7FB", "#9D7BFF", "#FF5CA8"];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Seriesight symbol"
    >
      {/* outer aperture ring */}
      <circle cx="16" cy="16" r="14" stroke={mono ? "currentColor" : "#464C5E"} strokeWidth="1.5" />
      <circle cx="16" cy="16" r="10.5" stroke={mono ? "currentColor" : "#2A2D38"} strokeWidth="1" strokeDasharray="2.5 3.5" />
      {/* five signal marks, center opening forms the aperture */}
      {marks.map((color, i) => (
        <rect
          key={i}
          x={7 + i * 4.2}
          y={i === 2 ? 8 : 10 - Math.abs(i - 2) * 1.5}
          width="2.4"
          height={i === 2 ? 16 : 12 + Math.abs(i - 2) * 3}
          rx="1.2"
          fill={mono ? "currentColor" : color}
          opacity={mono ? undefined : 0.95}
        />
      ))}
      {/* central opening */}
      <circle cx="16" cy="16" r="2.1" fill={mono ? "var(--bg-void)" : "#0A0A0E"} stroke={mono ? "currentColor" : "#C6FF3E"} strokeWidth="1.2" />
    </svg>
  );
}

export function SeriesightWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <SeriesightSymbol size={26} />
      <span className="flex flex-col leading-none">
        <span className="font-semibold tracking-[0.18em] text-[15px] text-[var(--text-primary)]">
          SERIESIGHT
        </span>
        {!compact && (
          <span className="mt-1 text-[10px] tracking-[0.32em] text-[var(--text-muted)] uppercase">
            The series, in focus
          </span>
        )}
      </span>
    </span>
  );
}

/** Animated Series Core — the SVG/CSS fallback visual (PRD F7), used as hero. */
export function SeriesCore({ size = 320 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 320 320" fill="none">
        <defs>
          <linearGradient id="core-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#C6FF3E" />
            <stop offset="55%" stopColor="#46E8B0" />
            <stop offset="100%" stopColor="#9D7BFF" />
          </linearGradient>
          <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#C6FF3E" stopOpacity="0.30" />
            <stop offset="70%" stopColor="#9D7BFF" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#0A0A0E" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="160" cy="160" r="150" fill="url(#core-glow)" />
        <g className="aperture-ring-1">
          <circle cx="160" cy="160" r="140" stroke="url(#core-ring)" strokeWidth="1" strokeOpacity="0.7" strokeDasharray="8 10" />
        </g>
        <g className="aperture-ring-2">
          <circle cx="160" cy="160" r="118" stroke="url(#core-ring)" strokeWidth="1.4" strokeOpacity="0.55" strokeDasharray="1 7" strokeLinecap="round" />
        </g>
        <g className="aperture-ring-3">
          <circle cx="160" cy="160" r="94" stroke="url(#core-ring)" strokeWidth="1" strokeOpacity="0.45" strokeDasharray="14 18" />
        </g>
        <circle cx="160" cy="160" r="72" stroke="#464C5E" strokeWidth="1" />
        {/* five orbital nodes = five games of a series */}
        {[0, 1, 2, 3, 4].map((i) => {
          const angle = (i * 72 - 90) * (Math.PI / 180);
          const cx = 160 + 94 * Math.cos(angle);
          const cy = 160 + 94 * Math.sin(angle);
          return <circle key={i} cx={cx} cy={cy} r="5" fill={["#C6FF3E", "#46E8B0", "#F5F7FB", "#9D7BFF", "#FF5CA8"][i]} opacity="0.95" />;
        })}
        {/* crystalline aperture */}
        <g className="aperture-loader">
          {[0, 1, 2, 3, 4].map((i) => {
            const angle = (i * 72 - 90) * (Math.PI / 180);
            const x1 = 160 + 14 * Math.cos(angle);
            const y1 = 160 + 14 * Math.sin(angle);
            const x2 = 160 + 52 * Math.cos(angle);
            const y2 = 160 + 52 * Math.sin(angle);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="url(#core-ring)" strokeWidth="5" strokeLinecap="round" opacity="0.9" />;
          })}
          <circle cx="160" cy="160" r="10" fill="#0A0A0E" stroke="#C6FF3E" strokeWidth="1.6" />
        </g>
        {/* fine particle paths */}
        {[0, 1, 2, 3].map((i) => (
          <line key={`p${i}`} x1={160 + 96 * Math.cos(i * 1.7)} y1={160 + 96 * Math.sin(i * 1.7)} x2={160 + 138 * Math.cos(i * 1.7)} y2={160 + 138 * Math.sin(i * 1.7)} stroke="#464C5E" strokeWidth="0.6" opacity="0.5" />
        ))}
      </svg>
    </div>
  );
}
