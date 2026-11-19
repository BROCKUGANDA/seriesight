"use client";

/**
 * Local fixture-demo session state. This is not authentication or authorization;
 * the workspace must not be exposed to untrusted users.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type AccountKind = "judge" | "coach";

export interface SessionUser {
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
  signInJudge: () => void;
  signOut: () => void;
  markHydrated: () => void;
}

const JUDGE: Omit<SessionUser, "signedInAt"> = {
  name: "Fixture Demo Guest",
  email: "demo@local.invalid",
  role: "Local fixture demo; no authenticated access",
  kind: "judge",
};

function stamp(): string {
  return new Date().toISOString();
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      hydrated: false,
      signInJudge: () => set({ user: { ...JUDGE, signedInAt: stamp() } }),
      signOut: () => set({ user: null }),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "seriesight-session",
      storage: createJSONStorage(() => createSafeSessionStorage(() => localStorage)),
      partialize: (s) => ({ user: s.user }) as AuthStore,
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);

/** True once hydration settled and a user is present. SSR-safe default: false. */
export function useIsSignedIn(): boolean {
  return useAuthStore((s) => s.hydrated && s.user !== null);
}
