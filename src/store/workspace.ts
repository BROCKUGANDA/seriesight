"use client";

import { create } from "zustand";
import type { DraftSession } from "@/domain/types";
import type { WorkspaceRoute } from "@/hooks/use-hash-route";

export interface EvidenceDrawerState {
  open: boolean;
  evidenceId: string | null;
}

interface WorkspaceStore {
  /** Active workspace route. */
  route: WorkspaceRoute;
  setRoute: (r: WorkspaceRoute) => void;
  /** Globally selected opponent (team id). */
  selectedOpponent: string;
  setSelectedOpponent: (id: string) => void;
  /** Active draft session (draft room + series lab share it). */
  activeSession: DraftSession | null;
  setActiveSession: (s: DraftSession | null) => void;
  /** Evidence drawer. */
  evidenceDrawer: EvidenceDrawerState;
  openEvidence: (id: string) => void;
  closeEvidence: () => void;
  /** Haptics preference (progressive enhancement only). */
  hapticsEnabled: boolean;
  setHapticsEnabled: (v: boolean) => void;
  /** Toast channel for workspace feedback. */
  toast: { message: string; tone: "ok" | "warn" | "error" } | null;
  pushToast: (message: string, tone?: "ok" | "warn" | "error") => void;
  clearToast: () => void;
}

/** Progressive-enhancement haptics (PRD F8). Falls back silently everywhere. */
export function haptic(kind: "pick" | "invalid" | "complete", enabled: boolean): void {
  if (!enabled || typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate !== "function") return;
  try {
    if (kind === "pick") nav.vibrate(12);
    else if (kind === "invalid") nav.vibrate([8, 60, 8]);
    else nav.vibrate([18, 60, 18, 60, 30]);
  } catch {
    /* silent fallback to visual confirmation */
  }
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  route: "dashboard",
  setRoute: (route) => set({ route }),
  selectedOpponent: "NVX",
  setSelectedOpponent: (selectedOpponent) => set({ selectedOpponent }),
  activeSession: null,
  setActiveSession: (activeSession) => set({ activeSession }),
  evidenceDrawer: { open: false, evidenceId: null },
  openEvidence: (evidenceId) => set({ evidenceDrawer: { open: true, evidenceId } }),
  closeEvidence: () => set({ evidenceDrawer: { open: false, evidenceId: null } }),
  hapticsEnabled: false,
  setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
  toast: null,
  pushToast: (message, tone = "ok") => set({ toast: { message, tone } }),
  clearToast: () => set({ toast: null }),
}));
