"use client";

/**
 * Coach sign-in and isolated, server-issued fixture demo sessions.
 */
import { motion } from "framer-motion";
import { useState, type FormEvent } from "react";
import { useAuthStore } from "@/store/auth";
import { useWorkspaceStore, haptic } from "@/store/workspace";
import { SeriesCore, SeriesightWordmark } from "@/components/brand/logo";
import { Tilt3D, Magnetic } from "@/components/fx/motion";
import { useHashRoute } from "@/hooks/use-hash-route";

const PROOF_POINTS = [
  "Explore the fixture workspaces and Fearless draft engine",
  "Private coach accounts or an isolated, no-registration demo",
  "Dashboard metrics link to their fixture evidence records",
];

export function SignInScreen() {
  const signInJudge = useAuthStore((s) => s.signInJudge);
  const pushToast = useWorkspaceStore((s) => s.pushToast);
  const hapticsEnabled = useWorkspaceStore((s) => s.hapticsEnabled);
  const [, navigate] = useHashRoute();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [register, setRegister] = useState(false);
  const signInCoach = useAuthStore((s) => s.signInCoach);

  const enterWorkspace = (message: string) => {
    pushToast(message, "ok");
    navigate("dashboard");
  };

  const onJudge = async () => {
    setBusy(true);
    setError("");
    haptic("complete", hapticsEnabled);
    try {
      await signInJudge();
      enterWorkspace("Isolated fixture demo opened. Sample records are illustrative, not official results.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to open demo."); }
    finally { setBusy(false); }
  };

  const onCoach = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await signInCoach({ action: register ? "register" : "login", email: String(form.get("email")), password: String(form.get("password")), name: String(form.get("name") || ""), inviteCode: String(form.get("inviteCode") || "") });
      enterWorkspace("Signed into your private coach workspace.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to sign in."); }
    finally { setBusy(false); }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Editorial backdrop and restrained brand mark */}
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
              <h1 className="editorial-title mt-4 text-3xl tracking-tight text-[var(--text-primary)] sm:text-4xl">
                The series, <span className="volt-text">in focus.</span>
              </h1>
              <p className="mt-2 max-w-[38ch] text-sm leading-relaxed text-[var(--text-secondary)]">
                Prepare with evidence-linked scouting and Fearless Draft planning. Sign in for a private workspace or try the isolated fixture demo.
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
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--accent-cyan)]">Coach workspace</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{register ? "Create an invited coach account" : "Sign in to Seriesight"}</h2>
          <form onSubmit={onCoach} className="mt-4 space-y-3">
            {register && <label className="block text-sm">Name<input name="name" required maxLength={80} autoComplete="name" className="mt-1 w-full rounded border p-2" /></label>}
            <label className="block text-sm">Email<input name="email" type="email" required maxLength={254} autoComplete="username" className="mt-1 w-full rounded border p-2" /></label>
            <label className="block text-sm">Password<input name="password" type="password" required minLength={register ? 12 : 1} maxLength={128} autoComplete={register ? "new-password" : "current-password"} className="mt-1 w-full rounded border p-2" /></label>
            {register && <label className="block text-sm">Coach invitation code<input name="inviteCode" type="password" required maxLength={256} autoComplete="off" className="mt-1 w-full rounded border p-2" /></label>}
            <button type="submit" disabled={busy} className="signal-gradient min-h-11 w-full rounded-xl px-4 font-bold text-[#0e1405] disabled:opacity-50">{busy ? "Please wait…" : register ? "Create private workspace" : "Sign in"}</button>
          </form>
          <button type="button" disabled={busy} onClick={() => setRegister(!register)} className="my-3 text-sm text-[var(--accent-cyan)] hover:underline">{register ? "Already have an account? Sign in" : "Have an invitation? Create account"}</button>
          {error && <p role="alert" className="my-3 text-sm text-red-400">{error}</p>}
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            Or explore independently authored sample data without registering. Each demo gets a separate sandbox, not access to coach workspaces.
          </p>
          <Magnetic className="mt-4 w-full">
            <button
              type="button"
              onClick={onJudge}
              disabled={busy}
              className="signal-gradient sheen press-fx flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-xl px-4 text-[15px] font-bold text-[#0e1405] shadow-lg transition-opacity hover:opacity-95"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13l0-8Z" fill="currentColor" />
              </svg>
              Enter fixture demo
            </button>
          </Magnetic>
          <p className="mt-2 text-center font-mono text-[11px] text-[var(--text-muted)]">
            Sessions use a secure, HTTP-only cookie and expire after 12 hours.
          </p>

          <p className="mt-4 text-center text-[12px] text-[var(--text-muted)]">
            Demo environment —{" "}
            <button type="button" onClick={() => navigate("pricing")} className="text-[var(--accent-cyan)] hover:underline">
              review license terms
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
