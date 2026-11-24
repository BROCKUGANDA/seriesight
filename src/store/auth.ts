"use client";

/**
 * UI identity cache; the server cookie is the only authentication authority.
 */
import { create } from "zustand";
import { useWorkspaceStore } from "@/store/workspace";
import { useCoachStore } from "@/store/coach";

export type AccountKind = "judge" | "coach";

export interface SessionUser {
  workspaceId?: string;
  name: string;
  email: string;
  role: string;
  kind: AccountKind;
  signedInAt: string;
}

type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function createSafeSessionStorage(getStorage: () => SessionStorage) {
  return {
    getItem(name: string): string | null {
      try {
        const value = getStorage().getItem(name);
        if (value === null) return null;
        const envelope = JSON.parse(value) as { state?: { user?: unknown } };
        if (!envelope || typeof envelope !== "object" || !envelope.state || typeof envelope.state !== "object" || Array.isArray(envelope.state)) return null;
        const user = envelope?.state?.user;
        if (user === null || user === undefined) return value;
        if (typeof user !== "object" || Array.isArray(user)) return null;
        const candidate = user as Record<string, unknown>;
        if (
          typeof candidate.name !== "string" ||
          typeof candidate.email !== "string" ||
          typeof candidate.role !== "string" ||
          typeof candidate.signedInAt !== "string" ||
          (candidate.kind !== "judge" && candidate.kind !== "coach")
        ) return null;
        return value;
      } catch {
        return null;
      }
    },
    setItem(name: string, value: string): void {
      try {
        getStorage().setItem(name, value);
      } catch {
        // Demo sessions remain usable when browser storage is blocked.
      }
    },
    removeItem(name: string): void {
      try {
        getStorage().removeItem(name);
      } catch {
        // Clearing an unavailable storage area is a no-op.
      }
    },
  };
}

interface AuthStore {
  user: SessionUser | null;
  hydrated: boolean;
  signInJudge: () => Promise<void>;
  signInCoach: (input: { action: "login" | "register"; email: string; password: string; name?: string; inviteCode?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  markHydrated: () => void;
}

async function sessionRequest(method: string, body?: unknown) {
  const response = await fetch("/api/auth/session", {
    method, headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Unable to update your session.");
  return result.data;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  hydrated: false,
  refresh: async () => {
    try {
      const user = await sessionRequest("GET");
      if (user?.workspaceId !== get().user?.workspaceId) {
        useWorkspaceStore.setState({ activeSession: null, evidenceDrawer: { open: false, evidenceId: null }, toast: null });
        useCoachStore.setState(useCoachStore.getInitialState());
      }
      set({ user, hydrated: true });
    }
    catch { set({ user: null, hydrated: true }); }
  },
  signInJudge: async () => { await sessionRequest("POST", { action: "demo" }); await get().refresh(); },
  signInCoach: async (input) => { await sessionRequest("POST", input); await get().refresh(); },
  signOut: async () => {
    await sessionRequest("POST", { action: "logout" });
    useWorkspaceStore.setState({ activeSession: null, evidenceDrawer: { open: false, evidenceId: null }, toast: null });
    useCoachStore.setState(useCoachStore.getInitialState());
    set({ user: null });
  },
  markHydrated: () => set({ hydrated: true }),
}));

/** True once hydration settled and a user is present. SSR-safe default: false. */
export function useIsSignedIn(): boolean {
  return useAuthStore((s) => s.hydrated && s.user !== null);
}
