"use client";

/**
 * Coach operations store — the coaching-suite data layer for Playbook,
 * Player Hub, VOD Review and the Practice Planner. Persists to localStorage
 * so every judge action survives a reload, and ships pre-seeded with a
 * realistic Signal Nine (SGT) preparation week against Nova Vanguard (NVX).
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/* ------------------------------------------------------------------ types */
export type StrategyStatus = "ready" | "draft" | "retired";
export type StrategyCategory = "early-spike" | "scaling" | "flex" | "counter" | "emergency";

export interface Strategy {
  id: string;
  name: string;
  category: StrategyCategory;
  comp: string;
  winCondition: string;
  keyTimings: string;
  steps: string[];
  tags: string[];
  status: StrategyStatus;
  updatedAt: string;
}

export type Availability = "available" | "questionable" | "unavailable";

export interface PlayerGoal {
  id: string;
  text: string;
  due: string;
  done: boolean;
}

export interface PlayerProfile {
  id: string;
  handle: string;
  role: "TOP" | "JUNGLE" | "MID" | "BOT" | "SUPPORT";
  form: number; // 0–100 rolling form index
  confidence: number; // 0–100 self-reported
  availability: Availability;
  champions: string[];
  goals: PlayerGoal[];
  notes: string;
}

export type ClipStatus = "to-review" | "reviewed" | "coached";

export interface VodClip {
  id: string;
  title: string;
  game: string;
  timestamp: string; // mm:ss
  side: "blue" | "red";
  tags: string[];
  status: ClipStatus;
  note: string;
  createdAt: string;
}

export type SessionKind = "scrim" | "drill" | "review" | "veto";
export type SessionStatus = "scheduled" | "done" | "cancelled";

export interface PracticeSession {
  id: string;
  kind: SessionKind;
  date: string; // ISO date
  time: string; // HH:mm Gulf Standard Time
  opponent: string;
  focus: string;
  status: SessionStatus;
  result?: "win" | "loss";
  notes: string;
}

export interface CoachNotification {
  id: string;
  title: string;
  body: string;
  at: string;
  tone: "info" | "alert" | "success";
  read: boolean;
}

/* ------------------------------------------------------------------ seed */
const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

const SEED_STRATEGIES: Strategy[] = [
  {
    id: "strat-hailshop",
    name: "Hailshop Dive",
    category: "early-spike",
    comp: "Wukong · Vi · Orianna · Jinx · Lulu",
    winCondition: "Level-6 spike snowball through mid-jungle synergy; first drake contest with summoner advantage.",
    keyTimings: "6:00 mid dive window · 8:30 herald trade · 14:00 soul point setup",
    steps: [
      "Ban priority: opponent's Kayn, Camille, Braum (see NVX tendency EV-0441).",
      "Orianna first rotation after Vi path shows top-to-bottom clear.",
      "Herald traded for 2 drakes if mid prio is lost — never force.",
      "At 14:00, group mid with Lulu ult online; Jinx ramps from there.",
    ],
    tags: ["dive-comp", "drake-prio", "BO1 opener"],
    status: "ready",
    updatedAt: "2026-11-16T18:40:00.000Z",
  },
  {
    id: "strat-tranquil-scale",
    name: "Tranquil Scale",
    category: "scaling",
    comp: "Ornn · Sejuani · Azir · Zeri · Milio",
    winCondition: "Give early objectives for Ornn upgrade timing; win the 3-item fight around second grubs respawn.",
    keyTimings: "9:00 Ornn first upgrade · 18:00 grubs bait · 24:00 Zeri 3-item spike",
    steps: [
      "Concede first drake unless free — protect lanes instead.",
      "Azir shurima shuffle reserved for dragon soul fight.",
      "Ornn call: only fight after upgrade lands on carry.",
    ],
    tags: ["late-game", "BO3 closer"],
    status: "ready",
    updatedAt: "2026-11-15T21:05:00.000Z",
  },
  {
    id: "strat-redside-flex",
    name: "Red-Side Flex Trap",
    category: "flex",
    comp: "Flex pool: Camille TOP/MID · Kalista BOT/SUPPORT",
    winCondition: "Force NVX to burn bans on flex picks, then take their weakened bot-lane answer.",
    keyTimings: "Ban phase 1-2 flex bait · pick phase 3 lock real lane",
    steps: [
      "Show Camille top in phase 1 hover.",
      "If NVX bans Kalista, Cassius takes Camille mid; Blight moves to Zeri.",
      "Chime practices Kalista support in Thursday drill block.",
    ],
    tags: ["draft-phase", "BO5", "fearless-aware"],
    status: "draft",
    updatedAt: "2026-11-17T09:15:00.000Z",
  },
];

const SEED_PLAYERS: PlayerProfile[] = [
  {
    id: "SGT-driftt",
    handle: "Driftt",
    role: "TOP",
    form: 78,
    confidence: 84,
    availability: "available",
    champions: ["Wukong", "Camille", "Ornn", "Gnar"],
    goals: [
      { id: "g-1", text: "Cut deaths before 14:00 to under 1.2 per game", due: "2026-11-21", done: false },
      { id: "g-2", text: "Add a second flex pick for BO5 game 3", due: "2026-11-19", done: true },
    ],
    notes: "Strong side-lane hold; watch TP timing when playing from behind (EV-0388 pattern).",
  },
  {
    id: "SGT-rowe",
    handle: "Rowe",
    role: "JUNGLE",
    form: 85,
    confidence: 80,
    availability: "available",
    champions: ["Vi", "Sejuani", "Wukong"],
    goals: [{ id: "g-3", text: "Track NVX Kestrel first-clear to 3:15 on new patch", due: "2026-11-18", done: false }],
    notes: "Best early-game read on the roster. Call objective trades, not contests, when behind.",
  },
  {
    id: "SGT-cassius",
    handle: "Cassius",
    role: "MID",
    form: 66,
    confidence: 71,
    availability: "questionable",
    champions: ["Orianna", "Azir", "Camille (flex)"],
    goals: [
      { id: "g-4", text: "Reach 8.5 CS/min on Azir in scrim block", due: "2026-11-20", done: false },
      { id: "g-5", text: "Voice comms drill: calm reset after dive deaths", due: "2026-11-18", done: false },
    ],
    notes: "Recovering from wrist strain — capped at 4 scrim games per session until Friday.",
  },
  {
    id: "SGT-blight",
    handle: "Blight",
    role: "BOT",
    form: 91,
    confidence: 88,
    availability: "available",
    champions: ["Jinx", "Zeri", "Kalista"],
    goals: [{ id: "g-6", text: "Maintain 60%+ kill participation across the series", due: "2026-11-22", done: false }],
    notes: "Carry form. Pair with Mercy's engage-heavy pool for the Hailshop opener.",
  },
  {
    id: "SGT-mercy",
    handle: "Mercy",
    role: "SUPPORT",
    form: 74,
    confidence: 90,
    availability: "available",
    champions: ["Lulu", "Milio", "Nautilus"],
    goals: [{ id: "g-7", text: "Ward-coverage map review with Rowe before each scrim", due: "2026-11-18", done: true }],
    notes: "Shot-caller for objective timings. Kalista support is the one unpolished flex line.",
  },
];

const SEED_CLIPS: VodClip[] = [
  {
    id: "clip-g2-throw",
    title: "Herald vision blackout before 14:00 fight",
    game: "SGT vs NVX · Game 2",
    timestamp: "13:42",
    side: "blue",
    tags: ["vision", "objective", "throw"],
    status: "to-review",
    note: "No sweep coverage top river — NVX pounced with 4. Check whose assignment slipped.",
    createdAt: "2026-11-17T07:20:00.000Z",
  },
  {
    id: "clip-g1-good",
    title: "Perfect drake stack into mid dive",
    game: "SGT vs NVX · Game 1",
    timestamp: "08:12",
    side: "blue",
    tags: ["objective", "dive", "play-of-the-week"],
    status: "coached",
    note: "Textbook Hailshop: Vi ult landed after Orianna ball pull. Clip used in Friday team review.",
    createdAt: "2026-11-16T19:00:00.000Z",
  },
  {
    id: "clip-g3-lane",
    title: "Bot 2v2 lost to summoner disadvantage",
    game: "SGT vs NVX · Game 3",
    timestamp: "05:58",
    side: "red",
    tags: ["lane", "summoners"],
    status: "reviewed",
    note: "Blight+Mercy took the 2v2 without Flash math. NVX support had Heal+Ignite — pattern noted for veto meeting.",
    createdAt: "2026-11-16T20:45:00.000Z",
  },
  {
    id: "clip-g4-late",
    title: "Soul point fight entry order",
    game: "SGT vs HLX · Game 4",
    timestamp: "27:30",
    side: "blue",
    tags: ["teamfight", "late-game"],
    status: "to-review",
    note: "Zeri entered before Ornn upgrade call. Entry-order rule needs a comms trigger word.",
    createdAt: "2026-11-15T22:10:00.000Z",
  },
];

const SEED_SESSIONS: PracticeSession[] = [
  {
    id: "sess-mon-scrim",
    kind: "scrim",
    date: "2026-11-17",
    time: "19:00",
    opponent: "Nova Vanguard (NVX)",
    focus: "Hailshop Dive BO1 rehearsal — full comms recording",
    status: "done",
    result: "win",
    notes: "Dive window hit 3/4 times. Herald trade rule held. Clip clip-g2-throw came from here.",
  },
  {
    id: "sess-tue-drill",
    kind: "drill",
    date: "2026-11-18",
    time: "18:00",
    opponent: "Internal — Chime flex lab",
    focus: "Kalista support setups with Blight · 10 targeted reps",
    status: "scheduled",
    notes: "Cap at 60 minutes to protect Cassius wrist protocol.",
  },
  {
    id: "sess-wed-veto",
    kind: "veto",
    date: "2026-11-19",
    time: "17:30",
    opponent: "Staff only",
    focus: "Red-Side Flex Trap final approval + ban matrix for NVX",
    status: "scheduled",
    notes: "Bring Evidence Ledger export for EV-0441 and the summoner-disadvantage clip.",
  },
  {
    id: "sess-thu-scrim",
    kind: "scrim",
    date: "2026-11-20",
    time: "19:00",
    opponent: "Helix Syndicate (HLX)",
    focus: "Tranquil Scale late-game template against dive comp",
    status: "scheduled",
    notes: "Two BO3 blocks, side swap between them.",
  },
  {
    id: "sess-fri-review",
    kind: "review",
    date: "2026-11-21",
    time: "16:00",
    opponent: "Internal — full staff",
    focus: "Weekly VOD review: four tagged clips + entry-order rule vote",
    status: "scheduled",
    notes: "Cassius wrist check before finalizing Saturday start time.",
  },
];

const SEED_NOTIFICATIONS: CoachNotification[] = [
  {
    id: "n-1",
    title: "NVX tendency updated",
    body: "Draft engine found a new Kestrel path pattern — tendency EV-0441 confidence rose to Moderate.",
    at: "2026-11-17T08:05:00.000Z",
    tone: "info",
    read: false,
  },
  {
    id: "n-2",
    title: "Cassius availability flagged",
    body: "Questionable for Thursday's scrim block — wrist protocol caps scrim games at 4.",
    at: "2026-11-17T06:30:00.000Z",
    tone: "alert",
    read: false,
  },
  {
    id: "n-3",
    title: "Monday scrim won",
    body: "SGT 1 — 0 NVX in the Hailshop rehearsal. Result logged to the Practice Planner.",
    at: "2026-11-17T21:10:00.000Z",
    tone: "success",
    read: true,
  },
  {
    id: "n-4",
    title: "2 clips await review",
    body: "Herald vision blackout and the soul point fight entry order are still tagged To review.",
    at: "2026-11-17T07:30:00.000Z",
    tone: "info",
    read: false,
  },
];

/* ------------------------------------------------------------------ store */
interface CoachStore {
  strategies: Strategy[];
  players: PlayerProfile[];
  clips: VodClip[];
  sessions: PracticeSession[];
  notifications: CoachNotification[];

  addStrategy: (s: Omit<Strategy, "id" | "updatedAt">) => string;
  updateStrategy: (id: string, patch: Partial<Strategy>) => void;
  removeStrategy: (id: string) => void;

  addGoal: (playerId: string, text: string, due: string) => void;
  toggleGoal: (playerId: string, goalId: string) => void;
  removeGoal: (playerId: string, goalId: string) => void;
  setAvailability: (playerId: string, availability: Availability) => void;
  setPlayerNotes: (playerId: string, notes: string) => void;

  addClip: (c: Omit<VodClip, "id" | "createdAt">) => string;
  setClipStatus: (id: string, status: ClipStatus) => void;
  removeClip: (id: string) => void;

  addSession: (s: Omit<PracticeSession, "id">) => string;
  setSessionStatus: (id: string, status: SessionStatus, result?: "win" | "loss") => void;
  removeSession: (id: string) => void;

  markAllRead: () => void;
  markRead: (id: string) => void;
  pushNotification: (n: Omit<CoachNotification, "id" | "at" | "read">) => void;
}

export const useCoachStore = create<CoachStore>()(
  persist(
    (set, get) => ({
      strategies: SEED_STRATEGIES,
      players: SEED_PLAYERS,
      clips: SEED_CLIPS,
      sessions: SEED_SESSIONS,
      notifications: SEED_NOTIFICATIONS,

      addStrategy: (s) => {
        const id = uid("strat");
        set({ strategies: [{ ...s, id, updatedAt: now() }, ...get().strategies] });
        return id;
      },
      updateStrategy: (id, patch) =>
        set({
          strategies: get().strategies.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: now() } : s)),
        }),
      removeStrategy: (id) => set({ strategies: get().strategies.filter((s) => s.id !== id) }),

      addGoal: (playerId, text, due) =>
        set({
          players: get().players.map((p) =>
            p.id === playerId
              ? { ...p, goals: [...p.goals, { id: uid("g"), text, due, done: false }] }
              : p,
          ),
        }),
      toggleGoal: (playerId, goalId) =>
        set({
          players: get().players.map((p) =>
            p.id === playerId
              ? { ...p, goals: p.goals.map((g) => (g.id === goalId ? { ...g, done: !g.done } : g)) }
              : p,
          ),
        }),
      removeGoal: (playerId, goalId) =>
        set({
          players: get().players.map((p) =>
            p.id === playerId ? { ...p, goals: p.goals.filter((g) => g.id !== goalId) } : p,
          ),
        }),
      setAvailability: (playerId, availability) =>
        set({ players: get().players.map((p) => (p.id === playerId ? { ...p, availability } : p)) }),
      setPlayerNotes: (playerId, notes) =>
        set({ players: get().players.map((p) => (p.id === playerId ? { ...p, notes } : p)) }),

      addClip: (c) => {
        const id = uid("clip");
        set({ clips: [{ ...c, id, createdAt: now() }, ...get().clips] });
        return id;
      },
      setClipStatus: (id, status) =>
        set({ clips: get().clips.map((c) => (c.id === id ? { ...c, status } : c)) }),
      removeClip: (id) => set({ clips: get().clips.filter((c) => c.id !== id) }),

      addSession: (s) => {
        const id = uid("sess");
        set({ sessions: [...get().sessions, { ...s, id }].sort((a, b) => a.date.localeCompare(b.date)) });
        return id;
      },
      setSessionStatus: (id, status, result) =>
        set({
          sessions: get().sessions.map((s) =>
            s.id === id ? { ...s, status, result: status === "done" ? result ?? s.result : s.result } : s,
          ),
        }),
      removeSession: (id) => set({ sessions: get().sessions.filter((s) => s.id !== id) }),

      markAllRead: () => set({ notifications: get().notifications.map((n) => ({ ...n, read: true })) }),
      markRead: (id) =>
        set({ notifications: get().notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }),
      pushNotification: (n) =>
        set({
          notifications: [{ ...n, id: uid("n"), at: now(), read: false }, ...get().notifications].slice(0, 30),
        }),
    }),
    {
      name: "seriesight-coach-suite",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
