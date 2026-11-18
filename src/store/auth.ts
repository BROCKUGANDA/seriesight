"use client";

/**
 * Demo-grade auth session — sufficient for the sandbox preview and judge
 * evaluation. The session persists in localStorage so a judge can reload the
 * page and stay in the workspace. Production deployments replace this module
 * with NextAuth (already wired in package.json) without touching call sites.
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

interface AuthStore {
  user: SessionUser | null;
  hydrated: boolean;
  signInJudge: () => void;
  signInCoach: (email: string, name?: string) => void;
  signOut: () => void;
  markHydrated: () => void;
}

const JUDGE: Omit<SessionUser, "signedInAt"> = {
  name: "Judge Demo",
  email: "judge@seriesight.ae",
  role: "Competition judge — full platform access",
  kind: "judge",
};

export const JUDGE_CREDENTIALS = { email: JUDGE.email, password: "arena-volt-2026" } as const;

function stamp(): string {
  return new Date().toISOString();
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      hydrated: false,
      signInJudge: () => set({ user: { ...JUDGE, signedInAt: stamp() } }),
      signInCoach: (email, name) =>
        set({
          user: {
            name: name?.trim() || email.split("@")[0] || "Head Coach",
            email,
            role: "Head Coach — Signal Nine (demo squad)",
            kind: "coach",
            signedInAt: stamp(),
          },
        }),
      signOut: () => set({ user: null }),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "seriesight-session",
      storage: createJSONStorage(() => localStorage),
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
