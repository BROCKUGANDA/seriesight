/**
 * First-party Seriesight glyph library (PRD E7).
 * All glyphs: 24×24 viewBox, 1.7 stroke, rounded joins, aria-labels required
 * at usage sites. Monochrome base; colour via `currentColor`.
 */
import type { SVGProps } from "react";

type GlyphProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 20, children, ...rest }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* 1. Aperture (identity glyph) */
export const ApertureGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18M8.2 4.4 15.8 19.6M4.4 8.2 19.6 15.8" opacity="0.45" />
    <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
  </Base>
);

/* 2. Opponent radar */
export const RadarGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" opacity="0.55" />
    <path d="M12 12 L19 7" />
    <circle cx="15.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
  </Base>
);

/* 3. Champion selection */
export const PickGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
    <path d="M8 14.5l2.6 2.5L16 11.5" />
  </Base>
);

/* 4. Champion ban */
export const BanGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M6.2 6.2 17.8 17.8" />
  </Base>
);

/* 5. Hard Fearless */
export const HardFearlessGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <path d="M7 4h10v7a5 5 0 0 1-10 0V4Z" />
    <path d="M12 16v4M9 20h6" />
    <path d="M7 8H4.5M19.5 8H17" opacity="0.6" />
  </Base>
);

/* 6. Soft Fearless */
export const SoftFearlessGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <path d="M7 4h10v7a5 5 0 0 1-10 0V4Z" />
    <path d="M12 16v4M9 20h6" />
    <path d="M7 8h-2M19 8h-2" strokeDasharray="1.6 1.8" />
  </Base>
);

/* 7-11. Role glyphs */
export const TopLaneGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <path d="M4 20 20 4M4 4h5M20 20h-5M4 9V4M20 15v5" />
  </Base>
);
export const JungleGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <path d="M12 20v-6M12 14 7 8M12 14l5-7" />
    <path d="M7 8c-2 0-3.4-1.6-3.4-3.4C5.4 3.8 7 4.6 7 8ZM17 7c2 0 3.4-1.6 3.4-3.4C18.6 2.8 17 3.6 17 7Z" opacity="0.7" />
    <path d="M4 20h16" opacity="0.5" />
  </Base>
);
export const MidLaneGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <path d="M4 4l16 16M4 20 20 4" opacity="0.35" />
    <path d="M12 6v12M9.5 8.5 12 6l2.5 2.5M9.5 15.5 12 18l2.5-2.5" />
  </Base>
);
export const BotLaneGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <path d="M4 4v5M20 20v-5M4 4h5M20 15h-5" opacity="0.35" />
    <path d="M5 20 19 6" />
    <path d="M14.5 6H19v4.5" />
  </Base>
);
export const SupportGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <path d="M12 5.5a5.5 5.5 0 0 1 5.5 5.5c0 4.5-5.5 8.5-5.5 8.5S6.5 15.5 6.5 11A5.5 5.5 0 0 1 12 5.5Z" />
    <path d="M12 10.5v3M10.5 12h3" />
  </Base>
);

/* 12. Objective control */
export const ObjectiveGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
    <path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3" />
  </Base>
);

/* 13-15. Neutral objectives */
export const DragonGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <path d="M4.5 13.5c0-4 3.2-7.5 7.5-7.5 3.8 0 7 2.6 7 6 0 2-1.2 3.5-3 3.5-1 0-1.7-.6-2-1.5-.4 1.8-1.6 3-3.4 3-2.3 0-3.9-1.6-4.4-3.7" />
    <path d="M10 9.5c.6-.6 1.6-.6 2.2 0" />
    <circle cx="15.5" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
  </Base>
);
export const HeraldGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <path d="M6 13c0-3.6 2.7-6.5 6-6.5s6 2.9 6 6.5-2.7 6.5-6 6.5" />
    <path d="M6 13v7M18 13l3.5-2.5M18 13h3.5" opacity="0.6" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </Base>
);
export const BaronGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <path d="M5 19c0-6 2-14 7-14s7 8 7 14" />
    <path d="M8.5 13.5c1-2 2.2-3 3.5-3s2.5 1 3.5 3" opacity="0.8" />
    <path d="M5 19h14" />
  </Base>
);

/* 16. Macro timeline */
export const TimelineGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <path d="M3 12h18" />
    <circle cx="7" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="17" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <path d="M7 12V8M12 12v-4M17 12v-4" opacity="0.5" />
  </Base>
);

/* 17. Evidence source */
export const EvidenceGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M9 12h6M9 15.5h4" />
    <path d="M9 8h3" opacity="0.55" />
  </Base>
);

/* 18. Confidence indicator */
export const ConfidenceGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <path d="M4 19v-5M9.3 19v-9M14.6 19V7M20 19V4" />
  </Base>
);

/* 19. Match history */
export const HistoryGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Base>
);

/* 20. Counterfactual simulation */
export const CounterfactualGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <path d="M7 7h9l3.5 3.5v10.5H7z" />
    <path d="M4 17V4h9" strokeDasharray="2.5 2.5" opacity="0.6" />
    <path d="M10.5 14.5 13 12l2.5 2.5M13 12v5" />
  </Base>
);

/* 21. Data import */
export const ImportGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <path d="M12 3.5v10M8.5 10 12 13.5 15.5 10" />
    <path d="M4.5 14.5v4a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4" />
  </Base>
);

/* 22. Data integrity */
export const IntegrityGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <path d="M12 3 5 6v5.5c0 4.6 3 7.9 7 9.5 4-1.6 7-4.9 7-9.5V6l-7-3Z" />
    <path d="M9.3 11.8 11.4 14l3.4-3.8" />
  </Base>
);

/* 23. Series progression */
export const SeriesGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <rect x="3.5" y="7" width="3.6" height="10" rx="1" />
    <rect x="8.5" y="5" width="3.6" height="14" rx="1" opacity="0.75" />
    <rect x="13.5" y="3.5" width="3.6" height="17" rx="1" opacity="0.9" />
    <rect x="18.5" y="9" width="2.5" height="6" rx="1" opacity="0.6" />
  </Base>
);

/* 24. Team composition */
export const CompositionGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <circle cx="8" cy="7.5" r="2.6" />
    <circle cx="16.5" cy="9" r="2.2" opacity="0.75" />
    <path d="M3.5 19c0-2.8 2-5 4.5-5s4.5 2.2 4.5 5" />
    <path d="M13.5 19c.2-2.3 1.6-4 3.4-4s3.2 1.7 3.4 4" opacity="0.75" />
  </Base>
);

/* 25. Risk warning */
export const RiskGlyph = (p: GlyphProps) => (
  <Base {...p}>
    <path d="M12 3.5 21 19.5H3L12 3.5Z" />
    <path d="M12 9.5v4.5" />
    <circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none" />
  </Base>
);

/** Role glyph lookup used across draft/scouting UIs. */
export const ROLE_GLYPHS = {
  TOP: TopLaneGlyph,
  JUNGLE: JungleGlyph,
  MID: MidLaneGlyph,
  BOT: BotLaneGlyph,
  SUPPORT: SupportGlyph,
} as const;
