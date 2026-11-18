"use client";

/**
 * Sign-in gateway — the entry judges and coaches hit before the workspace.
 * One-click Judge Demo Access is the primary path (no form, no friction);
 * the email path exists so the flow reads as a real commercial product.
 */
import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { useAuthStore } from "@/store/auth";
import { useWorkspaceStore, haptic } from "@/store/workspace";
import { SeriesCore, SeriesightWordmark } from "@/components/brand/logo";
import { Tilt3D, Magnetic } from "@/components/fx/motion";
import { useHashRoute } from "@/hooks/use-hash-route";

const PROOF_POINTS = [
  "Full workspace, fixture dataset and Fearless engine unlocked",
  "No sign-up, no card, no data collected — session stays on this device",
  "Every statistic traceable to its evidence record",
];

export function SignInScreen() {
  const signInJudge = useAuthStore((s) => s.signInJudge);
  const signInCoach = useAuthStore((s) => s.signInCoach);
  const pushToast = useWorkspaceStore((s) => s.pushToast);
  const hapticsEnabled = useWorkspaceStore((s) => s.hapticsEnabled);
  const [, navigate] = useHashRoute();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enterWorkspace = (message: string) => {
    pushToast(message, "ok");
    navigate("dashboard");
  };

  const onJudge = () => {
    haptic("complete", hapticsEnabled);
    signInJudge();
    enterWorkspace("Judge demo access granted — welcome to the full arena.");
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address — for example coach@team.gg.");
      haptic("invalid", hapticsEnabled);
      return;
    }
    if (password.length < 4) {
      setError("Password needs at least 4 characters. Any passphrase works in the demo.");
      haptic("invalid", hapticsEnabled);
      return;
    }
    setError(null);
    setBusy(true);
    // Simulated handshake keeps the form honest (disabled state, spinner, delay).
    window.setTimeout(() => {
      haptic("complete", hapticsEnabled);
      signInCoach(trimmed);
      setBusy(false);
      enterWorkspace("Signed in — your coaching workspace is ready.");
    }, 620);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Arena backdrop: grid floor + floating 3D rings */}
      <div aria-hidden="true" className="grid-floor pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-25">
        <div className="float-y relative h-[420px] w-[420px]">
          <div className="aperture-ring-1 absolute inset-0 rounded-full border border-[var(--accent-cyan)]/30" />
          <div className="aperture-ring-2 absolute inset-8 rounded-full border border-[var(--accent-indigo)]/30" />
          <div className="aperture-ring-3 absolute inset-20 rounded-full border border-[var(--accent-violet)]/25" />
          <div className="absolute inset-32 rounded-full bg-[var(--accent-cyan)]/5 blur-2xl" />
        </div>
      </div>

      <div className="relative z-10 grid w-full max-w-[980px] gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        {/* Brand column */}
        <div className="flex flex-col justify-center">
          <button
            type="button"
            onClick={() => navigate("home")}
            className="self-start"
            aria-label="Seriesight — back to landing page"
          >
            <SeriesightWordmark />
          </button>
          <Tilt3D className="mt-8 w-fit" max={10}>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/70 p-6 backdrop-blur glow-plasma">
              <SeriesCore size={56} />
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                The series, <span className="volt-text">in focus.</span>
              </h1>
              <p className="mt-2 max-w-[38ch] text-sm leading-relaxed text-[var(--text-secondary)]">
                Sign in to run opponent scouting, the deterministic Fearless Draft engine, Series Lab
                simulations and the full coaching suite — on any device.
              </p>
            </div>
          </Tilt3D>
          <ul className="mt-6 space-y-2.5">
            {PROOF_POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-[13px] text-[var(--text-secondary)]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0 text-[var(--accent-cyan)]" aria-hidden="true">
                  <path d="M5 12.5 10 17.5 19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {p}
              </li>
            ))}
          </ul>
        </div>

        {/* Action column */}
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/85 p-6 backdrop-blur sm:p-8 scanlines"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--accent-cyan)]">Judge fast-track</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">Evaluate in one click</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            Competition judges get instant, full-platform demo access — no form to fill.
          </p>
          <Magnetic className="mt-4 w-full">
            <button
              type="button"
              onClick={onJudge}
              className="signal-gradient sheen press-fx flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-xl px-4 text-[15px] font-bold text-[#0e1405] shadow-lg transition-opacity hover:opacity-95"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13l0-8Z" fill="currentColor" />
              </svg>
              Enter Judge Demo
            </button>
          </Magnetic>
          <p className="mt-2 text-center font-mono text-[11px] text-[var(--text-muted)]">
            judge@seriesight.ae · session persists on this device
          </p>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--border-subtle)]" />
            <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">or sign in with email</span>
            <span className="h-px flex-1 bg-[var(--border-subtle)]" />
          </div>

          <form onSubmit={onSubmit} noValidate>
            <div className="space-y-3">
              <div>
                <label htmlFor="signin-email" className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">
                  Work email
                </label>
                <input
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="coach@yourteam.gg"
                  className="cfg-select h-11"
                  aria-invalid={error ? "true" : undefined}
                />
              </div>
              <div>
                <label htmlFor="signin-password" className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">
                  Password
                </label>
                <input
                  id="signin-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Any passphrase works in the demo"
                  className="cfg-select h-11"
                  aria-invalid={error ? "true" : undefined}
                />
              </div>
              {error && (
                <p role="alert" className="rounded-lg border border-[var(--accent-coral)]/40 bg-[var(--accent-coral)]/10 px-3 py-2 text-[12px] text-[var(--accent-coral)]">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="press-fx flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-active)] bg-[var(--surface-2)] px-4 text-[14px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent-cyan)] disabled:opacity-60"
              >
                {busy && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="aperture-ring-1" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" opacity="0.25" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                )}
                {busy ? "Preparing workspace…" : "Sign in to workspace"}
              </button>
            </div>
          </form>

          <p className="mt-4 text-center text-[12px] text-[var(--text-muted)]">
            Demo environment —{" "}
            <button type="button" onClick={() => navigate("pricing")} className="text-[var(--accent-cyan)] hover:underline">
              see plans and pricing
            </button>{" "}
            or{" "}
            <button type="button" onClick={() => navigate("home")} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              return to the landing page
            </button>
            .
          </p>
        </motion.div>
      </div>
    </div>
  );
}
