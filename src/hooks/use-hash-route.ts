"use client";

import { useCallback, useSyncExternalStore } from "react";

export type WorkspaceRoute =
  | "dashboard"
  | "scouting"
  | "macro"
  | "draft"
  | "series-lab"
  | "evidence"
  | "data-sources"
  | "settings";

export const ROUTES: WorkspaceRoute[] = [
  "dashboard",
  "scouting",
  "macro",
  "draft",
  "series-lab",
  "evidence",
  "data-sources",
  "settings",
];

function currentRoute(): WorkspaceRoute {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const base = hash.split("?")[0].split("/")[0];
  return (ROUTES.includes(base as WorkspaceRoute) ? base : "dashboard") as WorkspaceRoute;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/**
 * Hash-based routing via useSyncExternalStore: keeps deep-linkability while the
 * sandbox exposes only `/`, and never cascades renders from an effect.
 */
export function useHashRoute(): [WorkspaceRoute, (r: WorkspaceRoute) => void] {
  const route = useSyncExternalStore(
    subscribe,
    currentRoute,
    () => "dashboard" as WorkspaceRoute,
  );
  const navigate = useCallback((r: WorkspaceRoute) => {
    window.location.hash = `/${r}`;
  }, []);
  return [route, navigate];
}
