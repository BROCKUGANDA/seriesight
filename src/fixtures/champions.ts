/**
 * Champion catalogue.
 *
 * PROVENANCE NOTE (see DATA_DICTIONARY.md):
 * Champion names/roles follow Riot's public Data Dragon static-data conventions.
 * Composition trait vectors are a coach-curated approximation authored for the demo
 * workspace — they are NOT Riot-provided statistics and are labelled as such in the UI.
 * The Data Dragon adapter can override names/keys at runtime when reachable;
 * the fallback keeps safe labels if it is not.
 */
import type { Champion, DamageClass, Role } from "@/domain/types";

type TraitVec = [
  engage: number | null,
  disengage: number | null,
  frontline: number | null,
  cc: number | null,
  phys: number | null,
  magic: number | null,
  scaling: number | null,
  siege: number | null,
  pick: number | null,
  objective: number | null,
];

let keyCounter = 1000;
function champ(
  id: string,
  displayName: string,
  primaryRole: Role,
  flex: Role[],
  damageClass: DamageClass,
  t: TraitVec,
): Champion {
  const [engage, disengage, frontline, crowdControl, physicalDamage, magicDamage, scaling, siege, pickPotential, objectiveControl] = t;
  return {
    id,
    key: keyCounter++,
    canonicalName: id,
    displayName,
    primaryRole,
    flexRoles: flex,
    damageClass,
    traits: { engage, disengage, frontline, crowdControl, physicalDamage, magicDamage, scaling, siege, pickPotential, objectiveControl },
    metadataSource: "curated-fallback",
  };
}

export const CHAMPIONS: Champion[] = [
  // TOP
  champ("aatrox", "Aatrox", "TOP", [], "physical", [70, 20, 75, 55, 80, 0, 55, 45, 40, 50]),
  champ("gnar", "Gnar", "TOP", [], "physical", [75, 30, 65, 70, 65, 20, 60, 55, 35, 55]),
  champ("kennen", "Kennen", "TOP", [], "magic", [80, 10, 25, 75, 10, 85, 55, 60, 30, 45]),
  champ("renekton", "Renekton", "TOP", [], "physical", [70, 15, 70, 45, 85, 0, 40, 50, 55, 55]),
  champ("ornn", "Ornn", "TOP", [], "physical", [65, 20, 85, 65, 30, 55, 65, 70, 25, 60]),
  champ("sion", "Sion", "TOP", [], "mixed", [60, 15, 90, 55, 45, 40, 50, 75, 25, 65]),
  champ("jax", "Jax", "TOP", ["JUNGLE"], "mixed", [60, 25, 60, 40, 75, 15, 70, 45, 55, 55]),
  champ("camille", "Camille", "TOP", ["JUNGLE"], "physical", [75, 20, 50, 50, 85, 0, 65, 40, 70, 60]),
  champ("ksante", "K'Sante", "TOP", [], "physical", [70, 35, 85, 65, 45, 30, 60, 55, 40, 60]),
  champ("rumble", "Rumble", "TOP", [], "magic", [70, 25, 45, 60, 5, 90, 60, 60, 30, 55]),
  champ("shen", "Shen", "TOP", [], "physical", [55, 45, 80, 55, 40, 30, 45, 55, 35, 60]),
  champ("gwen", "Gwen", "TOP", [], "magic", [50, 30, 45, 40, 15, 85, 75, 45, 45, 55]),
  // JUNGLE
  champ("viego", "Viego", "JUNGLE", [], "physical", [70, 20, 40, 45, 85, 0, 60, 35, 75, 55]),
  champ("leesin", "Lee Sin", "JUNGLE", [], "physical", [80, 30, 40, 60, 85, 0, 35, 40, 75, 60]),
  champ("elise", "Elise", "JUNGLE", [], "magic", [60, 20, 25, 60, 10, 85, 40, 35, 75, 55]),
  champ("sejuani", "Sejuani", "JUNGLE", [], "magic", [85, 20, 75, 75, 10, 60, 45, 55, 30, 70]),
  champ("vi", "Vi", "JUNGLE", [], "physical", [85, 15, 50, 60, 85, 0, 50, 40, 70, 60]),
  champ("nidalee", "Nidalee", "JUNGLE", [], "magic", [30, 20, 20, 30, 10, 90, 60, 30, 60, 50]),
  champ("maokai", "Maokai", "JUNGLE", ["TOP"], "magic", [80, 40, 80, 75, 5, 70, 50, 60, 30, 70]),
  champ("xinzhao", "Xin Zhao", "JUNGLE", [], "physical", [75, 15, 55, 50, 85, 0, 45, 40, 65, 60]),
  champ("jarvaniv", "Jarvan IV", "JUNGLE", [], "physical", [85, 20, 60, 60, 80, 0, 45, 50, 60, 65]),
  champ("nocturne", "Nocturne", "JUNGLE", [], "physical", [75, 10, 40, 50, 90, 0, 60, 35, 70, 50]),
  champ("ivern", "Ivern", "JUNGLE", [], "magic", [60, 55, 30, 70, 0, 55, 50, 45, 25, 60]),
  champ("zyra", "Zyra", "JUNGLE", ["SUPPORT"], "magic", [40, 50, null, 75, 0, 90, 50, 55, 35, 60]),
  // MID
  champ("azir", "Azir", "MID", [], "magic", [55, 35, 30, 60, 5, 90, 80, 65, 35, 55]),
  champ("orianna", "Orianna", "MID", [], "magic", [65, 45, 30, 70, 5, 90, 65, 60, 40, 60]),
  champ("syndra", "Syndra", "MID", [], "magic", [35, 25, 25, 60, 5, 95, 70, 50, 55, 45]),
  champ("ahri", "Ahri", "MID", [], "magic", [50, 40, 25, 55, 5, 85, 65, 45, 65, 45]),
  champ("leblanc", "LeBlanc", "MID", [], "magic", [45, 30, 20, 45, 5, 90, 55, 35, 80, 40]),
  champ("corki", "Corki", "MID", ["BOT"], "mixed", [30, 30, 30, 40, 50, 45, 70, 70, 30, 55]),
  champ("taliyah", "Taliyah", "MID", ["JUNGLE"], "magic", [55, 45, 25, 65, 5, 90, 55, 55, 50, 55]),
  champ("akali", "Akali", "MID", ["TOP"], "magic", [60, 15, 25, 30, 10, 85, 65, 35, 80, 40]),
  champ("viktor", "Viktor", "MID", [], "magic", [30, 40, 25, 60, 5, 95, 80, 60, 35, 50]),
  champ("sylas", "Sylas", "MID", ["JUNGLE"], "magic", [65, 20, 40, 45, 30, 65, 65, 40, 70, 45]),
  champ("neeko", "Neeko", "MID", ["SUPPORT"], "magic", [60, 35, 30, 70, 10, 85, 60, 50, 45, 50]),
  champ("twistedfate", "Twisted Fate", "MID", [], "magic", [35, 25, 25, 50, 10, 85, 65, 55, 50, 50]),
  // BOT
  champ("jinx", "Jinx", "BOT", [], "physical", [20, 15, 15, 35, 95, 0, 85, 75, 20, 55]),
  champ("kaisa", "Kai'Sa", "BOT", [], "mixed", [40, 20, 20, 35, 70, 25, 80, 45, 50, 50]),
  champ("varus", "Varus", "BOT", [], "mixed", [30, 25, 20, 55, 60, 35, 70, 60, 25, 55]),
  champ("ashe", "Ashe", "BOT", [], "physical", [45, 40, 20, 65, 90, 0, 70, 65, 25, 60]),
  champ("ezreal", "Ezreal", "BOT", [], "mixed", [25, 30, 20, 40, 55, 40, 70, 55, 40, 50]),
  champ("xayah", "Xayah", "BOT", [], "physical", [40, 45, 20, 55, 90, 0, 70, 50, 30, 50]),
  champ("aphelios", "Aphelios", "BOT", [], "physical", [25, 25, 20, 45, 95, 0, 80, 60, 25, 50]),
  champ("caitlyn", "Caitlyn", "BOT", [], "physical", [20, 30, 15, 40, 95, 0, 70, 80, 25, 50]),
  champ("zeri", "Zeri", "BOT", [], "physical", [25, 35, 20, 35, 90, 0, 85, 55, 35, 50]),
  champ("lucian", "Lucian", "BOT", ["MID"], "physical", [35, 25, 20, 35, 90, 0, 50, 55, 50, 45]),
  champ("draven", "Draven", "BOT", [], "physical", [30, 15, 20, 30, 95, 0, 60, 50, 45, 45]),
  champ("kalista", "Kalista", "BOT", [], "physical", [55, 30, 20, 50, 90, 0, 60, 55, 40, 65]),
  // SUPPORT
  champ("nautilus", "Nautilus", "SUPPORT", ["TOP"], "magic", [85, 20, 75, 80, 10, 60, 40, 50, 70, 60]),
  champ("rakan", "Rakan", "SUPPORT", [], "magic", [85, 30, 40, 60, 5, 70, 50, 45, 65, 55]),
  champ("alistar", "Alistar", "SUPPORT", [], "magic", [85, 25, 85, 70, 5, 60, 40, 55, 55, 60]),
  champ("lulu", "Lulu", "SUPPORT", [], "magic", [25, 70, 25, 65, 5, 65, 60, 45, 20, 45]),
  champ("renataglasc", "Renata Glasc", "SUPPORT", [], "magic", [45, 65, 35, 70, 5, 65, 55, 40, 30, 50]),
  champ("braum", "Braum", "SUPPORT", [], "physical", [50, 65, 80, 70, 25, 25, 40, 50, 30, 60]),
  champ("milio", "Milio", "SUPPORT", [], "magic", [20, 75, 20, 55, 0, 60, 65, 45, 15, 40]),
  champ("thresh", "Thresh", "SUPPORT", [], "magic", [80, 55, 55, 75, 20, 55, 55, 45, 75, 55]),
  champ("pyke", "Pyke", "SUPPORT", [], "physical", [75, 25, 25, 55, 85, 0, 40, 35, 85, 45]),
  champ("bard", "Bard", "SUPPORT", [], "magic", [55, 60, 35, 65, 10, 60, 55, 40, 60, 55]),
  champ("karma", "Karma", "SUPPORT", ["MID"], "magic", [30, 70, 25, 60, 10, 80, 55, 55, 25, 45]),
  champ("tahmkench", "Tahm Kench", "SUPPORT", ["TOP"], "magic", [45, 55, 85, 55, 40, 45, 55, 50, 30, 55]),
  // Extended pool (deepens each role so multi-game Fearless series never starve a role)
  champ("kled", "Kled", "TOP", [], "physical", [85, 10, 50, 40, 90, 0, 45, 40, 60, 45]),
  champ("malphite", "Malphite", "TOP", [], "physical", [80, 20, 80, 70, 20, 60, 55, 65, 25, 55]),
  champ("fiora", "Fiora", "TOP", [], "physical", [45, 30, 40, 35, 95, 0, 75, 50, 55, 55]),
  champ("poppy", "Poppy", "TOP", ["JUNGLE"], "physical", [65, 55, 70, 65, 70, 0, 45, 50, 35, 60]),
  champ("graves", "Graves", "JUNGLE", [], "physical", [50, 25, 50, 30, 95, 0, 65, 45, 55, 55]),
  champ("volibear", "Volibear", "JUNGLE", ["TOP"], "physical", [80, 15, 70, 55, 75, 20, 50, 55, 45, 65]),
  champ("kindred", "Kindred", "JUNGLE", [], "physical", [35, 30, 25, 40, 90, 0, 70, 35, 55, 70]),
  champ("rell", "Rell", "JUNGLE", ["SUPPORT"], "physical", [85, 15, 80, 75, 40, 30, 40, 50, 55, 65]),
  champ("ziggs", "Ziggs", "MID", ["BOT"], "magic", [20, 40, 20, 40, 5, 95, 65, 85, 20, 55]),
  champ("anivia", "Anivia", "MID", [], "magic", [40, 65, 35, 75, 5, 95, 70, 60, 30, 55]),
  champ("aurelionsol", "Aurelion Sol", "MID", [], "magic", [30, 30, 30, 55, 5, 95, 85, 55, 25, 50]),
  champ("vex", "Vex", "MID", [], "magic", [45, 40, 25, 60, 5, 90, 65, 45, 55, 45]),
  champ("senna", "Senna", "BOT", ["SUPPORT"], "physical", [30, 45, 25, 60, 75, 20, 75, 55, 25, 50]),
  champ("samira", "Samira", "BOT", [], "physical", [65, 15, 20, 35, 95, 0, 70, 45, 55, 45]),
  champ("jhin", "Jhin", "BOT", [], "physical", [35, 30, 20, 55, 95, 0, 70, 65, 30, 50]),
  champ("nilah", "Nilah", "BOT", [], "physical", [70, 20, 35, 35, 90, 0, 75, 40, 45, 45]),
  champ("sona", "Sona", "SUPPORT", [], "magic", [25, 70, 20, 65, 5, 70, 70, 50, 15, 45]),
  champ("seraphine", "Seraphine", "SUPPORT", ["MID", "BOT"], "magic", [45, 65, 25, 75, 5, 85, 65, 55, 20, 45]),
  champ("taric", "Taric", "SUPPORT", [], "physical", [45, 60, 75, 60, 30, 35, 50, 45, 20, 55]),
  champ("zilean", "Zilean", "SUPPORT", ["MID"], "magic", [20, 75, 20, 55, 5, 70, 60, 45, 15, 40]),
];

export const CHAMPION_INDEX: Map<string, Champion> = new Map(CHAMPIONS.map((c) => [c.id, c]));

export function getChampion(id: string): Champion | undefined {
  return CHAMPION_INDEX.get(id);
}

export function searchChampions(query: string): Champion[] {
  const q = query.trim().toLowerCase();
  if (!q) return CHAMPIONS;
  return CHAMPIONS.filter(
    (c) => c.displayName.toLowerCase().includes(q) || c.canonicalName.includes(q),
  );
}

export const TRAIT_DIMENSIONS = [
  "engage",
  "disengage",
  "frontline",
  "crowdControl",
  "physicalDamage",
  "magicDamage",
  "scaling",
  "siege",
  "pickPotential",
  "objectiveControl",
] as const;

export type TraitDimension = (typeof TRAIT_DIMENSIONS)[number];
