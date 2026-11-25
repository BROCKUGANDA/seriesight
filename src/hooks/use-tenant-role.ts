"use client";

import { useEffect, useState } from "react";

/**
 * Active workspace role for client-side gating. Server-side services remain
 * authoritative; this hook only avoids showing actions that will be denied.
 */
export function useTenantRole(workspaceId?: string): string | null {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    queueMicrotask(() => {
      void fetch("/api/workspaces", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Unavailable")))
        .then((result) => {
          if (!active) return;
          const match = (result.data?.workspaces as { id: string; role: string }[] | undefined)?.find((w) => w.id === workspaceId);
          setRole(match?.role ?? null);
        })
        .catch(() => { if (active) setRole(null); });
    });
    return () => { active = false; };
  }, [workspaceId]);
  return role;
}

export function canMutateTenant(role: string | null): boolean {
  return role === "owner" || role === "coach";
}

export function isTenantOwner(role: string | null): boolean {
  return role === "owner";
}
