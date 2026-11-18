"use client";

import { useCallback, useSyncExternalStore } from "react";

export type WorkspaceRoute =
  | "home"
  | "dashboard"
  | "scouting"
  | "macro"
  | "draft"
  | "series-lab"
  | "evidence"
  | "data-sources"
  | "integration"
  | "playbook"
  | "players"
  | "vod"
  | "practice"
  | "settings"
  | "signin"
  | "pricing"
  | "terms"
  | "privacy";

export const ROUTES: WorkspaceRoute[] = [
  "home",
  "dashboard",
  "scouting",
  "macro",
  "draft",
  "series-lab",
  "evidence",
  "data-sources",
  "integration",
  "playbook",
  "players",
  "vod",
  "practice",
  "settings",
  "signin",
  "pricing",
  "terms",
  "privacy",
];

/** Commercial (marketing/legal) destinations rendered outside the app shell. */
export const MARKETING_ROUTES: WorkspaceRoute[] = ["home", "pricing", "terms", "privacy"];

/** The sign-in gateway is public but rendered outside the marketing chrome. */
export const PUBLIC_ROUTES: WorkspaceRoute[] = [...MARKETING_ROUTES, "signin"];

export function isMarketingRoute(route: WorkspaceRoute): boolean {
  return MARKETING_ROUTES.includes(route);
}

function currentRoute(): WorkspaceRoute {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const base = hash.split("?")[0].split("/")[0];
  return (ROUTES.includes(base as WorkspaceRoute) ? base : "home") as WorkspaceRoute;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/**
 * Hash-based routing via useSyncExternalStore: keeps deep-linkability while the
 * sandbox exposes only `/`, and never cascades renders from an effect.
 * Unrecognised hashes resolve to the commercial landing page (`home`).
 */
export function useHashRoute(): [WorkspaceRoute, (r: WorkspaceRoute) => void] {
  const route = useSyncExternalStore(
    subscribe,
    currentRoute,
    () => "home" as WorkspaceRoute,
  );
  const navigate = useCallback((r: WorkspaceRoute) => {
    window.location.hash = `/${r}`;
  }, []);
  return [route, navigate];
}
