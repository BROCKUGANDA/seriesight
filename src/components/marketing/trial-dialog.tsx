"use client";

/**
 * Trial & demo request dialog — the commercial conversion point.
 * Validates on the client for instant feedback, then persists via
 * POST /api/leads (Zod-validated, Prisma-backed). Every state is fully
 * worded: idle, submitting, success (with reference code) and failure.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PLANS, TRIAL_DAYS, CONTACT_EMAIL } from "@/lib/commercial";

const ROLES = [
  { value: "head-coach", label: "Head coach" },
  { value: "analyst", label: "Analyst" },
  { value: "player", label: "Player" },
  { value: "manager", label: "Team manager / owner" },
  { value: "other", label: "Other" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPlan?: "scout" | "coach" | "org";
}

type Status = "idle" | "submitting" | "success" | "error";

export function TrialDialog({ open, onOpenChange, initialPlan = "coach" }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [reference, setReference] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    organization: "",
    role: "head-coach",
    plan: initialPlan,
    message: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const update = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: "" }));
  };

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = "Please enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) errs.email = "Enter a valid email address, e.g. coach@team.ae.";
    if (form.organization.trim().length < 2) errs.organization = "Tell us the team or organisation you represent.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setStatus("submitting");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          organization: form.organization.trim(),
          role: form.role,
          plan: form.plan,
          message: form.message.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body?.success) {
        // Surface a human message, keeping any field-level detail from the API.
        const detail = body?.error?.details?.issues?.[0]?.message;
        setErrorMessage(
          detail ??
            body?.error?.message ??
            "We could not register your request. Please try again in a moment.",
        );
        setStatus("error");
        return;
      }
      setReference(body.data.reference as string);
      setStatus("success");
    } catch {
      setErrorMessage("Network issue — check your connection and submit again.");
      setStatus("error");
    }
  }

  function resetForNewEntry() {
    setStatus("idle");
    setReference(null);
    setErrorMessage(null);
  }

  const inputCls =
    "w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)] outline-none";

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setTimeout(resetForNewEntry, 300); }}>
      <DialogContent
        className="max-h-[92dvh] overflow-y-auto border-[var(--border-subtle)] bg-[var(--bg-primary)] sm:max-w-lg"
      >
        {status === "success" ? (
          <div className="py-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[var(--accent-green)]/50 bg-[var(--accent-green)]/10">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 13l4 4L19 7" stroke="#55DBAA" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <DialogHeader className="mt-4">
              <DialogTitle className="text-lg text-[var(--text-primary)]">Your trial request is in</DialogTitle>
              <DialogDescription className="text-sm text-[var(--text-secondary)]">
                We have logged your {PLANS.find((p) => p.id === form.plan)?.name} plan request for{" "}
                <span className="text-[var(--text-primary)]">{form.organization}</span>. A Seriesight specialist will
                email <span className="text-[var(--text-primary)]">{form.email}</span> within one business day with your{" "}
                {TRIAL_DAYS}-day trial activation and onboarding steps.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-4 py-3 text-left">
              <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Reference</p>
              <p className="mt-1 font-mono text-sm text-[var(--accent-cyan)]">{reference}</p>
            </div>
            <p className="mt-4 text-xs text-[var(--text-muted)]">
              Questions in the meantime? Write to <a className="text-[var(--accent-cyan)] underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="min-h-[44px] rounded-lg border border-[var(--border-active)] bg-[var(--surface-2)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-cyan)]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={resetForNewEntry}
                className="min-h-[44px] rounded-lg bg-[var(--accent-cyan)] px-5 py-2.5 text-sm font-medium text-[#06121c] transition-opacity hover:opacity-90"
              >
                Register another team
              </button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg text-[var(--text-primary)]">Start your {TRIAL_DAYS}-day trial</DialogTitle>
              <DialogDescription className="text-sm text-[var(--text-secondary)]">
                Tell us who you are and we will activate your workspace within one business day. No credit card is
                required, and the fixture dataset is available immediately.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={submit} className="mt-2 space-y-4" noValidate>
              <div>
                <label htmlFor="trial-name" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                  Full name
                </label>
                <input
                  id="trial-name"
                  type="text"
                  autoComplete="name"
                  required
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="e.g. Sara Al Mansoori"
                  className={inputCls}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? "trial-name-error" : undefined}
                />
                {fieldErrors.name && <p id="trial-name-error" className="mt-1 text-xs text-[var(--accent-coral)]">{fieldErrors.name}</p>}
              </div>

              <div>
                <label htmlFor="trial-email" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                  Work email
                </label>
                <input
                  id="trial-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="coach@yourteam.ae"
                  className={inputCls}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? "trial-email-error" : undefined}
                />
                {fieldErrors.email && <p id="trial-email-error" className="mt-1 text-xs text-[var(--accent-coral)]">{fieldErrors.email}</p>}
              </div>

              <div>
                <label htmlFor="trial-org" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                  Team or organisation
                </label>
                <input
                  id="trial-org"
                  type="text"
                  autoComplete="organization"
                  required
                  value={form.organization}
                  onChange={(e) => update("organization", e.target.value)}
                  placeholder="e.g. Dubai Nomads Esports"
                  className={inputCls}
                  aria-invalid={Boolean(fieldErrors.organization)}
                  aria-describedby={fieldErrors.organization ? "trial-org-error" : undefined}
                />
                {fieldErrors.organization && <p id="trial-org-error" className="mt-1 text-xs text-[var(--accent-coral)]">{fieldErrors.organization}</p>}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="trial-role" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                    Your role
                  </label>
                  <select id="trial-role" value={form.role} onChange={(e) => update("role", e.target.value)} className={inputCls}>
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="trial-plan" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                    Plan of interest
                  </label>
                  <select id="trial-plan" value={form.plan} onChange={(e) => update("plan", e.target.value)} className={inputCls}>
                    {PLANS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.monthlyAED > 0 ? ` — AED ${p.monthlyAED}/mo` : " — Free"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="trial-message" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                  Anything we should know? <span className="normal-case text-[var(--text-muted)]">(optional)</span>
                </label>
                <textarea
                  id="trial-message"
                  rows={3}
                  value={form.message}
                  onChange={(e) => update("message", e.target.value)}
                  placeholder="League, division, roster size, or the data sources you use today."
                  className={`${inputCls} resize-none`}
                />
              </div>

              {status === "error" && errorMessage && (
                <div role="alert" className="rounded-lg border border-[var(--accent-coral)]/50 bg-[var(--accent-coral)]/10 px-4 py-3 text-sm text-[var(--accent-coral)]">
                  {errorMessage}
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="min-h-[44px] rounded-lg border border-[var(--border-subtle)] bg-transparent px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className="signal-gradient min-h-[44px] rounded-lg px-5 py-2.5 text-sm font-semibold text-[#06121c] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === "submitting" ? "Submitting…" : `Request ${TRIAL_DAYS}-day trial`}
                </button>
              </div>

              <p className="text-center text-[11px] leading-relaxed text-[var(--text-muted)]">
                By submitting you agree to our <a href="#/terms" className="text-[var(--accent-cyan)] underline underline-offset-2">Terms of Service</a> and{" "}
                <a href="#/privacy" className="text-[var(--accent-cyan)] underline underline-offset-2">Privacy Policy</a>. We reply within one business day, Gulf Standard Time.
              </p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
