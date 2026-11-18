/**
 * Provider capability surface for the UI.
 * The adapter exposes what the current entitlement supports; anything not listed
 * renders as an explicit "unavailable" module, never as an estimate.
 */
import { GRID_ALLOWED_HOSTS, GRID_ENDPOINTS, capabilitiesForTitle, type GridCapabilities } from "./grid-types";
import type { DataSourceConnection } from "@/domain/types";

export interface ProviderStatusReport {
  grid: DataSourceConnection;
  fixture: DataSourceConnection;
  circuit: { state: string; failures: number; failureThreshold: number };
}

export function gridCapabilities(title: "league-of-legends"): GridCapabilities {
  return capabilitiesForTitle(title);
}

export const AUTHORIZED_ENDPOINTS = Object.values(GRID_ENDPOINTS);
export const ALLOWED_HOSTS = GRID_ALLOWED_HOSTS;
