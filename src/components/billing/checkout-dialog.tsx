"use client";

/**
 * On-chain checkout dialog — the conversion surface for crypto settlement.
 *
 * Flow: choose token → quote (AED → USD → token, locked for the TTL) → send
 * to the Seriesight treasury → submit the tx reference → on-chain verification
 * (Helius RPC for Solana, JSON-RPC for Ethereum) → entitlement activation.
 * A clearly-labelled demo-settlement path lets judges exercise the entire
 * lifecycle without moving funds; demo rows are flagged forever.
 */
import { useCallback, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PLANS, TRIAL_DAYS } from "@/lib/commercial";
import { billingApi, type BillingPayment, type QuoteResponse, type VerifyResponse } from "@/lib/billing/client";
import { CHAIN_LABELS, TOKENS, TREASURY, TXREF_SHAPE, explorerTxUrl, shortAddress, type TokenKey } from "@/lib/billing/chains";
import { useWorkspaceStore, haptic } from "@/store/workspace";
import { useEntitlementsStore } from "@/store/entitlements";

type Step = "quote" | "pay" | "verify" | "done";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: "coach" | "org";
}

const STEPS: { id: Step; label: string }[] = [
  { id: "quote", label: "Quote" },
  { id: "pay", label: "Send" },
  { id: "verify", label: "Verify" },
  { id: "done", label: "Done" },
];

export function CheckoutDialog({ open, onOpenChange, planId }: Props) {
  const pushToast = useWorkspaceStore((s) => s.pushToast);
  const hapticsEnabled = useWorkspaceStore((s) => s.hapticsEnabled);
  const activatePaid = useEntitlementsStore((s) => s.activatePaid);

  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const [tokenKey, setTokenKey] = useState<TokenKey>("USDC-SOL");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [payment, setPayment] = useState<BillingPayment | null>(null);
  const [txRef, setTxRef] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("quote");
  const [copied, setCopied] = useState(false);

  const plan = PLANS.find((p) => p.id === planId);
  const activeQuote = useMemo(
    () => quote?.quotes.find((q) => q.tokenKey === tokenKey) ?? null,
    [quote, tokenKey],
  );
  const token = TOKENS.find((t) => t.key === tokenKey);
  const chain = token?.chain ?? "solana";

  const loadQuote = useCallback(async () => {
    setLoadingQuote(true);
    setError(null);
    try {
      const q = await billingApi.quote(planId, period);
      setQuote(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Quote engine unavailable.");
    } finally {
      setLoadingQuote(false);
    }
  }, [planId, period]);

  const handleOpenChange = useCallback((next: boolean) => {
    if (next) {
      setStep("quote");
      setPayment(null);
      setVerifyResult(null);
      setTxRef("");
      void loadQuote();
    }
    onOpenChange(next);
  }, [loadQuote, onOpenChange]);

  const openIntent = async () => {
    haptic("pick", hapticsEnabled);
    setError(null);
    try {
      const { payment: p } = await billingApi.intent(planId, period, tokenKey);
      setPayment(p);
      setStep("pay");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the checkout intent.");
    }
  };

  const submitVerify = async (demo: boolean) => {
    haptic(demo ? "complete" : "pick", hapticsEnabled);
    setError(null);
    if (!payment) return;
    if (!demo && !TXREF_SHAPE[chain].test(txRef.trim())) {
      setError(`That does not look like a ${CHAIN_LABELS[chain]} transaction reference. ${chain === "solana" ? "Solana signatures are 64+ base58 characters." : "Ethereum tx hashes are 0x + 64 hex characters."}`);
      haptic("invalid", hapticsEnabled);
      return;
    }
    setVerifying(true);
    try {
      const result = demo ? await billingApi.demoSettle(payment.id) : await billingApi.verify(payment.id, txRef.trim());
      setVerifyResult(result);
      setPayment(result.payment);
      if (result.verdict === "settled") {
        activatePaid(planId, { months: period === "annual" ? 12 : 1 });
        setStep("done");
        pushToast(`${plan?.name} plan active — paid on-chain in ${payment.token}.`, "ok");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setVerifying(false);
    }
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(TREASURY[chain].address);
      setCopied(true);
      haptic("pick", hapticsEnabled);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Clipboard blocked — select the address text manually.");
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto border-[var(--border-subtle)] bg-[var(--bg-primary)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg text-[var(--text-primary)]">
            Pay on-chain — {plan?.name} plan
          </DialogTitle>
          <DialogDescription className="text-sm text-[var(--text-secondary)]">
            Settle in ETH, SOL or USDC on Ethereum or Solana. The price is authored in AED and converted in-app at a
            locked quote — you always see the exact on-chain amount before sending.
          </DialogDescription>
        </DialogHeader>

        {/* Step rail */}
        <ol className="flex items-center gap-1.5 text-[11px]" aria-label="Checkout progress">
          {STEPS.map((s, i) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                  i < stepIndex
                    ? "border-[var(--accent-green)] bg-[var(--accent-green)]/15 text-[var(--accent-green)]"
                    : i === stepIndex
                      ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)]"
                      : "border-[var(--border-subtle)] text-[var(--text-muted)]"
                }`}
                aria-current={i === stepIndex ? "step" : undefined}
              >
                {i < stepIndex ? "✓" : i + 1}
              </span>
              <span className={i === stepIndex ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-muted)]"}>{s.label}</span>
              {i < STEPS.length - 1 && <span className="mx-0.5 h-px w-4 bg-[var(--border-subtle)]" aria-hidden="true" />}
            </li>
          ))}
        </ol>

        {error && (
          <div role="alert" className="rounded-lg border border-[var(--accent-coral)]/50 bg-[var(--accent-coral)]/10 px-3 py-2.5 text-[12px] text-[var(--accent-coral)]">
            {error}
          </div>
        )}

        {/* ------------------------------------------------ Step 1: quote */}
        {step === "quote" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Billing period">
              {(["monthly", "annual"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  aria-pressed={period === p}
                  className={`ctrl-btn ${period === p ? "border-[var(--accent-cyan)] text-[var(--accent-cyan)]" : ""}`}
                >
                  {p === "monthly" ? "Monthly" : "Annual — 2 months free"}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Settlement token">
              {TOKENS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTokenKey(t.key)}
                  aria-pressed={tokenKey === t.key}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    tokenKey === t.key
                      ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/5"
                      : "border-[var(--border-subtle)] bg-[var(--surface-2)] hover:border-[var(--border-active)]"
                  }`}
                >
                  <span className="block text-[13px] font-semibold text-[var(--text-primary)]">{t.label}</span>
                  <span className="block text-[10px] text-[var(--text-muted)]">{CHAIN_LABELS[t.chain]} · {t.settlement === "stable" ? "stable" : "native"}</span>
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/70 p-4">
              {loadingQuote ? (
                <p className="text-xs text-[var(--text-muted)]" role="status">Fetching indicative rates…</p>
              ) : activeQuote ? (
                <dl className="space-y-2 text-[13px]">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--text-secondary)]">Plan price (VAT-exclusive)</dt>
                    <dd className="tnum font-semibold text-[var(--text-primary)]">AED {activeQuote.aed.toFixed(2)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--text-secondary)]">USD equivalent (peg {quote?.usdAedPeg})</dt>
                    <dd className="tnum text-[var(--text-secondary)]">USD {activeQuote.usd.toFixed(2)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-2">
                    <dt className="font-medium text-[var(--text-primary)]">You send ({token?.label})</dt>
                    <dd className="tnum text-lg font-bold text-[var(--accent-cyan)]">{activeQuote.tokenAmount} {tokenKey}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[11px] text-[var(--text-muted)]">Rate used</dt>
                    <dd className="tnum text-[11px] text-[var(--text-muted)]">1 {tokenKey} = USD {activeQuote.rateUsd.toLocaleString("en-AE", { maximumFractionDigits: 4 })}</dd>
                  </div>
                  <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
                    {quote?.rates.fallback
                      ? "Indicative reference rates — the live rate feed is unavailable; the locked amount still governs this intent."
                      : `Rate source: ${activeQuote.rateSource}.`}{" "}
                    Quote locked when the intent opens, for 15 minutes. The locked on-chain amount always governs — visible before you send.
                  </p>
                </dl>
              ) : (
                <p className="text-xs text-[var(--accent-coral)]">{error ?? "No quote — check the billing service."}</p>
              )}
            </div>

            <button
              type="button"
              disabled={!activeQuote}
              onClick={openIntent}
              className="signal-gradient press-fx min-h-[48px] w-full rounded-xl text-[14px] font-bold text-[#0e1405] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Lock quote & open checkout intent
            </button>
          </div>
        )}

        {/* -------------------------------------------- Step 2: send + verify */}
        {(step === "pay" || step === "verify") && payment && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/5 p-4">
              <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Amount to send</p>
              <p className="tnum mt-1 text-2xl font-bold text-[var(--accent-cyan)]">{payment.tokenAmount} {payment.token}</p>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                ≈ AED {payment.aedAmount.toFixed(2)} · USD {payment.usdAmount.toFixed(2)} · {CHAIN_LABELS[payment.chain as "ethereum" | "solana"]} mainnet
              </p>
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                Locked rate: 1 {payment.token} = USD {payment.rateUsd.toLocaleString("en-AE", { maximumFractionDigits: 4 })} · quote valid until {new Date(payment.expiresAt).toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-[12px] font-medium text-[var(--text-secondary)]">Send to the Seriesight treasury ({CHAIN_LABELS[payment.chain as "ethereum" | "solana"]})</p>
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2.5">
                <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text-primary)]" title={payment.treasuryAddress}>
                  {payment.treasuryAddress}
                </code>
                <button
                  type="button"
                  onClick={copyAddress}
                  className="shrink-0 rounded-md border border-[var(--border-active)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent-cyan)]"
                  aria-label="Copy treasury address"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--text-muted)]">
                Double-check the network: {payment.chain === "solana" ? "Solana mainnet — tokens sent on other networks are not recoverable." : "Ethereum mainnet — transfers must target the treasury address exactly."}{" "}
                Verification matches the recipient against {shortAddress(payment.treasuryAddress)} before activation.
              </p>
            </div>

            <div>
              <label htmlFor="checkout-txref" className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">
                Transaction reference {chain === "solana" ? "(signature)" : "(tx hash)"}
              </label>
              <input
                id="checkout-txref"
                type="text"
                value={txRef}
                onChange={(e) => setTxRef(e.target.value)}
                placeholder={chain === "solana" ? "Paste your Solana signature" : "0x…"}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2.5 font-mono text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)] outline-none"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={verifying || txRef.trim().length < 32}
                onClick={() => submitVerify(false)}
                className="press-fx min-h-[48px] flex-1 rounded-xl border border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10 px-4 text-[13px] font-bold text-[var(--accent-cyan)] transition-opacity hover:opacity-85 disabled:opacity-50"
              >
                {verifying ? "Verifying on-chain…" : "Verify payment on-chain"}
              </button>
              <button
                type="button"
                disabled={verifying}
                onClick={() => submitVerify(true)}
                className="press-fx min-h-[48px] flex-1 rounded-xl border border-[var(--border-active)] bg-[var(--surface-2)] px-4 text-[13px] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-cyan)] disabled:opacity-50"
                title="Simulates a confirmed settlement without moving funds — for evaluation only"
              >
                Demo settle (no funds)
              </button>
            </div>

            {verifyResult && verifyResult.verdict !== "settled" && (
              <div className={`rounded-lg border px-3 py-2.5 text-[12px] ${verifyResult.verdict === "failed" ? "border-[var(--accent-coral)]/50 bg-[var(--accent-coral)]/10 text-[var(--accent-coral)]" : "border-[var(--accent-amber)]/50 bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]"}`}>
                <p className="font-semibold uppercase tracking-wide">{verifyResult.verdict.replace("_", " ")}</p>
                <p className="mt-0.5">{verifyResult.detail}</p>
                {verifyResult.payment.status === "manual_review" && (
                  <p className="mt-1 text-[11px] opacity-80">
                    Your intent is safe in the ops queue — billing support confirms transfers manually within one business day, or you can demo-settle to continue evaluating.
                  </p>
                )}
              </div>
            )}

            <p className="text-center text-[10px] leading-relaxed text-[var(--text-muted)]">
              Verification is real: Solana signatures are checked through the Helius RPC endpoint and Ethereum hashes
              through a JSON-RPC receipt lookup, including treasury-recipient matching. Need to evaluate without paying?
              Use demo settle — the ledger flags it as a demo row permanently.
            </p>
          </div>
        )}

        {/* ------------------------------------------------ Step 4: done */}
        {step === "done" && payment && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[var(--accent-green)]/50 bg-[var(--accent-green)]/10">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 13l4 4L19 7" stroke="#3FE8A4" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-semibold text-[var(--text-primary)]">Payment settled — {plan?.name} plan active</p>
              <p className="mx-auto mt-1 max-w-[44ch] text-[13px] leading-relaxed text-[var(--text-secondary)]">
                {payment.tokenAmount} {payment.token} ≈ AED {payment.aedAmount.toFixed(2)} settled on {CHAIN_LABELS[payment.chain as "ethereum" | "solana"]}.
                {payment.demo ? " This is a demo settlement row — flagged in the ledger permanently." : " Verified on-chain against the treasury address."}
              </p>
            </div>
            {payment.txRef && (
              <a
                href={explorerTxUrl(payment.chain as "ethereum" | "solana", payment.txRef)}
                target="_blank"
                rel="noreferrer"
                className="inline-block font-mono text-[11px] text-[var(--accent-cyan)] underline underline-offset-2"
              >
                View tx on {payment.chain === "solana" ? "Solscan" : "Etherscan"} ↗
              </a>
            )}
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-4 py-3 text-left">
              <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">What unlocked</p>
              <ul className="mt-1.5 space-y-1 text-[12px] text-[var(--text-secondary)]">
                <li>· Draft Room BO3 / BO5 and the Fearless restriction ledger</li>
                <li>· Series Lab five-game simulation and counterfactuals</li>
                <li>· Printable pre-match briefs and the availability protocol</li>
                <li>· {TRIAL_DAYS}-day refund window — full reversal returns you to Scout</li>
              </ul>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="signal-gradient min-h-[44px] w-full rounded-lg px-5 text-sm font-semibold text-[#0e1405] transition-opacity hover:opacity-90"
            >
              Back to the workspace
            </button>
          </div>
        )}

        <p className="text-center text-[10px] leading-relaxed text-[var(--text-muted)]">
          Reversals: full refunds within the {TRIAL_DAYS}-day window return the workspace to Scout. Partial goodwill
          credits are recorded on the same ledger. Questions: founder@aiazimara.com.
        </p>
      </DialogContent>
    </Dialog>
  );
}
