"use client";

/**
 * VOLT ARENA motion toolkit — micro + macro animation primitives.
 * Every primitive degrades gracefully: `prefers-reduced-motion` disables the
 * effect, touch devices skip hover-only physics, and nothing blocks input.
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";

/* ------------------------------------------------------------- Tilt3D ---- */
/** True 3D tilt: drives --tilt-x/--tilt-y custom props consumed by .tilt-3d. */
export function Tilt3D({
  children,
  className = "",
  max = 7,
  glare = true,
  style,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
  glare?: boolean;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const onMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    ref.current.style.setProperty("--tilt-y", `${px * max * 2}deg`);
    ref.current.style.setProperty("--tilt-x", `${-py * max * 2}deg`);
    if (glare) {
      ref.current.style.setProperty("--glare-x", `${(px + 0.5) * 100}%`);
      ref.current.style.setProperty("--glare-y", `${(py + 0.5) * 100}%`);
    }
  };

  const onLeave = () => {
    if (!ref.current) return;
    ref.current.style.setProperty("--tilt-x", "0deg");
    ref.current.style.setProperty("--tilt-y", "0deg");
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={`tilt-3d relative ${className}`}
      style={style}
    >
      {children}
      {glare && !reduced && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 hover:opacity-100"
          style={{
            background:
              "radial-gradient(320px circle at var(--glare-x, 50%) var(--glare-y, 50%), rgba(245,247,251,0.10), transparent 62%)",
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- CountUp ---- */
/** Counts from 0 to `value` when scrolled into view; tabular-safe. */
export function CountUp({
  value,
  duration = 1.1,
  suffix = "",
  prefix = "",
  decimals = 0,
  className = "",
}: {
  value: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-24px" });
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView || reduced) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration, reduced]);

  const shown = reduced || !inView ? value : display;

  return (
    <span ref={ref} className={`tnum ${className}`}>
      {prefix}
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/* -------------------------------------------------------------- Reveal ---- */
/** In-view rise-in with optional stagger delay (macro animation layer). */
export function Reveal({
  children,
  delay = 0,
  y = 16,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-32px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------- MagneticButton ---- */
/** Magnetic hover: the control leans toward the cursor (desktop only). */
export function Magnetic({
  children,
  className = "",
  strength = 10,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  const onMove = (e: ReactMouseEvent<HTMLSpanElement>) => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    ref.current.style.transform = `translate(${px * strength}px, ${py * strength * 0.6}px)`;
  };

  const onLeave = () => {
    if (!ref.current) return;
    ref.current.style.transform = "translate(0px, 0px)";
  };

  return (
    <span
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={`inline-block transition-transform duration-200 ease-out ${className}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------ PageTransition ---- */
/** Macro-level workspace transition: keyed slide + fade on route change. */
export function PageTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  if (reduced) return <div>{children}</div>;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={routeKey}
        initial={{ opacity: 0, y: 18, filter: "blur(2px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -10, filter: "blur(2px)" }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/* --------------------------------------------------------------- Beat ----- */
/** Attention pulse used sparingly on live/urgent indicators. */
export function Beat({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <span className={className}>{children}</span>;
  return (
    <motion.span
      animate={{ scale: [1, 1.14, 1] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      className={`inline-flex ${className}`}
    >
      {children}
    </motion.span>
  );
}

/* ----------------------------------------------------- StaggerContainer ---- */
/** Parent container that staggers `RevealItem` children on first view. */
export function StaggerContainer({
  children,
  className = "",
  gap = 0.06,
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-24px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 14, scale: 0.99 },
        show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
