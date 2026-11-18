"use client";

/**
 * Global evidence drawer (PRD D7). Mounted once in the app shell so any
 * EvidenceChip anywhere in the product opens it. Displays provenance, sample,
 * computation and limitations for a single evidence record. Every state is
 * worded: loading, not found, network error (with retry) and ready.
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { EvidenceDrawerContent } from "@/components/common/primitives";
import { EvidenceGlyph, IntegrityGlyph, RiskGlyph } from "@/components/icons/seriesight-icons";
import { useWorkspaceStore } from "@/store/workspace";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { EvidenceRecord } from "@/domain/types";

type DrawerStatus = "loading" | "ready" | "not-found" | "error";

export function GlobalEvidenceDrawer() {
  const drawer = useWorkspaceStore((s) => s.evidenceDrawer);
  const closeEvidence = useWorkspaceStore((s) => s.closeEvidence);
  const [record, setRecord] = useState<EvidenceRecord | null>(null);
  const [status, setStatus] = useState<DrawerStatus>("loading");
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!drawer.open || !drawer.evidenceId) {
      const clear = setTimeout(() => {
        setRecord(null);
        setStatus("loading");
      }, 0);
      return () => clearTimeout(clear);
    }
    let cancelled = false;
    // All state updates happen inside the async callback, never in the effect body.
    const t = setTimeout(() => {
      setStatus("loading");
      apiFetch<{ found: boolean; record?: EvidenceRecord }>(`/api/evidence/${drawer.evidenceId}`)
        .then((r) => {
          if (cancelled) return;
          if (r.found && r.record) {
            setRecord(r.record);
            setStatus("ready");
          } else {
            setRecord(null);
            setStatus("not-found");
          }
        })
        .catch(() => {
          if (cancelled) return;
          setRecord(null);
          setStatus("error");
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [drawer.open, drawer.evidenceId, retryTick]);

  return (
    <Drawer open={drawer.open} onOpenChange={(o) => (!o ? closeEvidence() : undefined)}>
      <DrawerContent className="max-h-[85vh] border-[var(--border-subtle)] bg-[var(--surface-2)] pb-[env(safe-area-inset-bottom)]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2 text-base text-[var(--text-primary)]">
            <EvidenceGlyph size={16} /> Evidence record {record?.id ?? drawer.evidenceId}
          </DrawerTitle>
          <DrawerDescription className="text-xs text-[var(--text-muted)]">
            Full provenance chain — what produced this number, from which games, under which limitations.
          </DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-6">
          {status === "ready" && record ? (
            <EvidenceDrawerContent record={record} />
          ) : status === "loading" ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <IntegrityGlyph size={22} />
              <p className="text-sm text-[var(--text-secondary)]" role="status">Resolving evidence record…</p>
              <p className="max-w-xs text-center text-xs text-[var(--text-muted)]">
                Fetching the deterministic record for {drawer.evidenceId} from the Evidence Ledger.
              </p>
            </div>
          ) : status === "not-found" ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <RiskGlyph size={22} />
              <p className="text-sm font-medium text-[var(--text-primary)]" role="alert">No record exists for {drawer.evidenceId}</p>
              <p className="max-w-xs text-center text-xs leading-relaxed text-[var(--text-muted)]">
                Evidence ids are deterministic: this one was not produced by the current dataset. The link may be stale,
                or the record belongs to an earlier analysis run. Close the drawer and reopen the finding to regenerate it.
              </p>
              <button
                type="button"
                onClick={closeEvidence}
                className="mt-2 min-h-[44px] rounded-lg border border-[var(--border-active)] bg-[var(--surface-3)] px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-cyan)]"
              >
                Close drawer
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8">
              <RiskGlyph size={22} />
              <p className="text-sm font-medium text-[var(--text-primary)]" role="alert">Could not load the evidence record</p>
              <p className="max-w-xs text-center text-xs leading-relaxed text-[var(--text-muted)]">
                A network or server error interrupted the lookup. Your workspace is unaffected — retry the request below.
              </p>
              <button
                type="button"
                onClick={() => setRetryTick((t) => t + 1)}
                className="mt-2 min-h-[44px] rounded-lg border border-[var(--accent-cyan)]/60 bg-[var(--accent-cyan)]/10 px-4 text-sm font-medium text-[var(--accent-cyan)] transition-colors hover:bg-[var(--accent-cyan)]/20"
              >
                Retry lookup
              </button>
              <button
                type="button"
                onClick={closeEvidence}
                className="min-h-[44px] rounded-lg px-4 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              >
                Close drawer
              </button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
