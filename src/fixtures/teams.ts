/**
 * Fixture identity data — fictional teams/players/tournaments.
 * ILLUSTRATIVE FIXTURE DATA. Not actual Cloud9 performance, not an official GRID dataset.
 */
import type { FearlessMode, Player, RestrictionScope, Role, Team, Tournament } from "@/domain/types";
import type { Champion } from "@/domain/types";

export const FIXTURE_DATASET_ID = "fx-demo-2026-w46";
export const FIXTURE_GENERATED_AT = "2026-11-17T09:00:00.000Z";
export const FIXTURE_LABEL =
  "Illustrative fixture data. Not actual Cloud9 performance and not an official GRID dataset.";
export const FIXTURE_SEED = 20261117;

const mkRoster = (teamId: string, handles: [string, Role, Role[]][]): Player[] =>
  handles.map(([handle, observedRole, observedFlex]) => ({
    id: `${teamId}-${handle.toLowerCase()}`,
    teamId,
    handle,
    observedRole,
    observedFlex: observedFlex,
  }));

export const TEAMS: Team[] = [
  {
    id: "SGT",
    name: "Signal Nine",
    shortName: "SGT",
    region: "NA",
    roster: mkRoster("SGT", [
      ["Driftt", "TOP", []],
      ["Rowe", "JUNGLE", []],
      ["Cassius", "MID", ["TOP"]],
      ["Blight", "BOT", []],
      ["Mercy", "SUPPORT", []],
    ]),
  },
  {
    id: "NVX",
    name: "Nova Vanguard",
    shortName: "NVX",
    region: "NA",
    roster: mkRoster("NVX", [
      ["Torvald", "TOP", []],
      ["Kestrel", "JUNGLE", []],
      ["Vantablack", "MID", []],
      ["Sable", "BOT", []],
      ["Chime", "SUPPORT", ["MID"]],
    ]),
  },
  {
    id: "EST",
    name: "Eastern Tide",
    shortName: "EST",
    region: "KR",
    roster: mkRoster("EST", [
      ["Hanbul", "TOP", []],
      ["Mireu", "JUNGLE", []],
      ["Seolhan", "MID", []],
      ["Pado", "BOT", []],
      ["Dara", "SUPPORT", []],
    ]),
  },
  {
    id: "HLX",
    name: "Helix Syndicate",
    shortName: "HLX",
    region: "EU",
    roster: mkRoster("HLX", [
      ["Wexler", "TOP", ["MID"]],
      ["Ferro", "JUNGLE", []],
      ["Ivo", "MID", []],
      ["Dane", "BOT", []],
      ["Petra", "SUPPORT", []],
    ]),
  },
];

export const TEAM_INDEX = new Map(TEAMS.map((t) => [t.id, t]));
export const OUR_TEAM_ID = "SGT";

export const TOURNAMENTS: Tournament[] = [
  {
    id: "t-reg-autumn",
    title: "Regional Circuit — Autumn Split",
    tier: "regional",
    region: "NA",
    startDate: "2026-09-02",
    endDate: "2026-10-18",
    draftPolicy: { fearless: "none" as FearlessMode, scope: "own" as RestrictionScope },
  },
  {
    id: "t-cc-2026",
    title: "Continental Cup 2026",
    tier: "international",
    region: "INT",
    startDate: "2026-10-24",
    endDate: "2026-11-14",
    draftPolicy: { fearless: "soft" as FearlessMode, scope: "own" as RestrictionScope },
  },
  {
    id: "t-mi-2026",
    title: "Masters Invitational 2026",
    tier: "invitational",
    region: "INT",
    startDate: "2026-11-20",
    endDate: "2026-12-06",
    draftPolicy: { fearless: "hard" as FearlessMode, scope: "both" as RestrictionScope },
  },
];

export const TOURNAMENT_INDEX = new Map(TOURNAMENTS.map((t) => [t.id, t]));

export const PATCHES = ["16.8", "16.9", "16.10"];
export const CURRENT_PATCH = "16.10";

/**
 * Per-team champion priority profiles (higher = picked earlier / more often).
 * These drive the deterministic fixture generator so that scouting tendencies
 * (signature picks, side skew, cross-game shifts) are genuinely discoverable
 * in the generated dataset rather than being asserted as claims.
 */
export const TEAM_AFFINITY: Record<string, Record<string, number>> = {
  SGT: {
    ashe: 6, vi: 6, orianna: 6, maokai: 5, jinx: 5, nautilus: 5, corki: 5,
    sejuani: 5, xayah: 5, ksante: 5, varus: 4, thresh: 4, azir: 4, renekton: 4,
  },
  NVX: {
    vi: 9, leesin: 8, jarvaniv: 7, kalista: 7, rakan: 7, nautilus: 6, leblanc: 6,
    lucian: 6, renekton: 5, camille: 5, varus: 5, renataglasc: 4, elise: 4, draven: 4,
  },
  EST: {
    azir: 8, jinx: 8, orianna: 7, ornn: 7, sejuani: 6, sion: 6, lulu: 6,
    aphelios: 6, gnar: 6, tahmkench: 5, xayah: 5, karma: 5, viktor: 4, braum: 4,
  },
  HLX: {
    syndra: 7, akali: 6, camille: 6, jax: 6, taliyah: 6, thresh: 6, nidalee: 6,
    pyke: 5, leblanc: 5, ezreal: 5, neeko: 5, kaisa: 5, sylas: 4, bard: 4,
  },
};

/** Global meta-pressure list used for ban sampling. */
export const META_BAN_PRESSURE: Record<string, number> = {
  kalista: 8, vi: 7, azir: 7, leblanc: 6, rakan: 6, kaisa: 6, jinx: 6,
  pyke: 5, akali: 5, camille: 5, maokai: 5, orianna: 5, syndra: 4, leesin: 4,
};

export function affinityFor(teamId: string, champion: Champion): number {
  return TEAM_AFFINITY[teamId]?.[champion.id] ?? 1;
}
