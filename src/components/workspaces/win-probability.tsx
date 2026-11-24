"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Panel } from "@/components/common/primitives";
import type { DraftSession } from "@/domain/types";
import type { PredictionResult } from "@/domain/prediction";

export function WinProbability({ session }: { session: DraftSession }) {
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    apiFetch<PredictionResult>(`/api/prediction?sessionId=${encodeURIComponent(session.id)}`)
      .then((value) => { if (active) { setResult(value); setLoading(false); } })
      .catch(() => { if (active) { setResult({ status: "unavailable", reason: "Prediction could not be loaded. Check your session and retry." }); setLoading(false); } });
    return () => { active = false; };
  }, [session.id, session.stateVersion]);
  return (
    <Panel title="Draft win probability" subtitle="Outcome-trained model · separate from recommendation scores">
      <div aria-live="polite" className="space-y-2 text-sm text-[var(--text-secondary)]">
        {loading || !result ? <p>Checking model availability…</p> : result.status === "unavailable" ? <p>{result.reason}</p> : <>
          <p className="tnum text-2xl font-semibold text-[var(--accent-cyan)]">{(result.probability * 100).toFixed(1)}% <span className="text-sm">estimated chance for our side</span></p>
          <p>{result.partial ? "Partial draft estimate" : "Completed composition estimate"} · stage {result.stage}. Observational prediction, not a causal effect of a pick or ban.</p>
          <details><summary className="cursor-pointer">Held-out model diagnostics</summary><pre className="mt-2 overflow-auto text-xs">{JSON.stringify(result.metrics, null, 2)}</pre></details>
        </>}
      </div>
    </Panel>
  );
}
