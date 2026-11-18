"use client";

/**
 * Global evidence drawer (PRD D7). Mounted once in the app shell so any
 * EvidenceChip anywhere in the product opens it. Displays provenance, sample,
 * computation and limitations for a single evidence record.
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { EvidenceDrawerContent } from "@/components/common/primitives";
import { EvidenceGlyph, IntegrityGlyph } from "@/components/icons/seriesight-icons";
import { useWorkspaceStore } from "@/store/workspace";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { EvidenceRecord } from "@/domain/types";

export function GlobalEvidenceDrawer() {
  const drawer = useWorkspaceStore((s) => s.evidenceDrawer);
  const closeEvidence = useWorkspaceStore((s) => s.closeEvidence);
  const [record, setRecord] = useState<EvidenceRecord | null>(null);

  useEffect(() => {
    if (!drawer.open || !drawer.evidenceId) {
      const clear = setTimeout(() => setRecord(null), 0);
      return () => clearTimeout(clear);
    }
    let cancelled = false;
    const t = setTimeout(() => {
      apiFetch<{ found: boolean; record?: EvidenceRecord }>(`/api/evidence/${drawer.evidenceId}`)
        .then((r) => {
          if (!cancelled) setRecord(r.record ?? null);
        })
        .catch(() => {
          if (!cancelled) setRecord(null);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [drawer.open, drawer.evidenceId]);

  return (
    <Drawer open={drawer.open} onOpenChange={(o) => (!o ? closeEvidence() : undefined)}>
      <DrawerContent className="max-h-[85vh] border-[var(--border-subtle)] bg-[var(--surface-2)]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2 text-base text-[var(--text-primary)]">
            <EvidenceGlyph size={16} /> Evidence record {record?.id ?? drawer.evidenceId}
          </DrawerTitle>
          <DrawerDescription className="text-xs text-[var(--text-muted)]">
            Full provenance chain — what produced this number, from which games, under which limitations.
          </DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-6">
          {record ? (
            <EvidenceDrawerContent record={record} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-8">
              <IntegrityGlyph size={22} />
              <p className="text-sm text-[var(--text-secondary)]">Resolving evidence record…</p>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
