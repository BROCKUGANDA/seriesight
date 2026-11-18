/**
 * API contract tests (PRD O2): envelope shape, Zod validation, state-version
 * checks and provider adapter behaviour with mocked responses.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as healthGET } from "@/app/api/health/route";
import { POST as sessionsPOST } from "@/app/api/draft/sessions/route";
import { wilsonInterval } from "@/domain/analytics/stats";
import { GridError, GRID_ALLOWED_HOSTS } from "@/lib/providers/grid/grid-types";
import { gridRequest, circuitSnapshot, resetCircuitForTests, assertUrlAllowed, DEFAULT_GRID_CONFIG } from "@/lib/providers/grid/grid-client";
import { mapGridSeriesState } from "@/lib/providers/grid/grid-mapper";
import { toAppError } from "@/lib/providers/grid/grid-errors";
import { buildEvidence, EvidenceLedger } from "@/domain/evidence/builder";
import { counterfactual } from "@/services/draft";
import type { DraftSession } from "@/domain/types";

describe("API response envelope", () => {
  it("shapes success payloads exactly per contract", async () => {
    const req = new NextRequest("http://localhost:3000/api/health");
    const res = await healthGET(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ success: true, error: null });
    expect(json.meta.requestId).toMatch(/[0-9a-f-]{36}/);
    expect(json.meta.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(json.data.status).toBe("healthy");
  });

  it("shapes error payloads for validation failures", async () => {
    const req = new NextRequest("http://localhost:3000/api/draft/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ format: "BO9" }),
    });
    const res = await sessionsPOST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.data).toBeNull();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.retryable).toBe(false);
    expect(json.error.recovery).toBeTruthy();
    expect(json.meta.requestId).toBeTruthy();
  });
});

describe("GRID adapter security", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetCircuitForTests();
  });

  it("blocks non-allowlisted hosts (SSRF prevention)", () => {
    expect(() => assertUrlAllowed("https://evil.example.com/graphql")).toThrow(/allowlisted/i);
    expect(() => assertUrlAllowed("http://api-op.grid.gg/central-data/graphql")).toThrow(/allowlisted|https/i);
    expect(() => assertUrlAllowed("https://api-op.grid.gg/central-data/graphql")).not.toThrow();
    expect(GRID_ALLOWED_HOSTS).toEqual(["api-op.grid.gg"]);
  });

  it("fails fast when credentials are missing", async () => {
    await expect(gridRequest({ query: "query { x }" }, { ...DEFAULT_GRID_CONFIG, apiKey: null })).rejects.toThrow(/GRID_API_KEY/);
  });

  it("never retries unauthorized responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const err = await gridRequest({ query: "query { x }" }, { ...DEFAULT_GRID_CONFIG, apiKey: "k" }).catch((e) => e);
    expect(err).toBeInstanceOf(GridError);
    expect((err as GridError).code).toBe("UNAUTHORIZED");
    expect((err as GridError).retryable).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("retries transient 503s with bounded attempts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await gridRequest({ query: "q" }, { apiKey: "k", timeoutMs: 200, maxRetries: 3 }).catch(() => undefined);
    expect(fetchMock.mock.calls.length).toBe(4); // initial + 3 retries
    vi.unstubAllGlobals();
  });

  it("honours Retry-After on 429", async () => {
    const fetchMock = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(new Response("{}", { status: 429, headers: { "retry-after": "1" } })), 5)),
    );
    vi.stubGlobal("fetch", fetchMock);
    const started = Date.now();
    await gridRequest({ query: "q" }, { apiKey: "k", timeoutMs: 300, maxRetries: 1 }).catch(() => undefined);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
    vi.unstubAllGlobals();
  });

  it("opens the circuit breaker after repeated failures", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    await gridRequest({ query: "q" }, { apiKey: "k", timeoutMs: 100, maxRetries: 1 }).catch(() => undefined);
    await gridRequest({ query: "q" }, { apiKey: "k", timeoutMs: 100, maxRetries: 0 }).catch(() => undefined);
    await gridRequest({ query: "q" }, { apiKey: "k", timeoutMs: 100, maxRetries: 0 }).catch(() => undefined);
    await gridRequest({ query: "q" }, { apiKey: "k", timeoutMs: 100, maxRetries: 0 }).catch(() => undefined);
    const snap = circuitSnapshot();
    expect(snap.state).toBe("OPEN");
    expect(snap.failures).toBeGreaterThanOrEqual(snap.failureThreshold);
    vi.unstubAllGlobals();
  });
});

describe("GRID mapper", () => {
  const series = mapGridSeriesState(
    {
      seriesId: "grid-1",
      games: [
        {
          gameId: "g1",
          gameNumber: 1,
          durationSeconds: 1800,
          winnerSide: "BLUE",
          picks: [
            { side: "BLUE", championName: "Aatrox", participantName: "top-player", role: "TOP" },
            { side: "RED", championName: "Sejuani", participantName: null, role: "JUNGLE" },
            { side: "RED", championName: "Mystery", participantName: null, role: "unknown-role" },
          ],
          bans: [{ side: "BLUE", championName: "Kalista", order: 1 }],
          objectives: [
            { type: "dragon", timestampSeconds: 500, team: "BLUE" },
            { type: "alien-artifact", timestampSeconds: 700, team: "RED" },
          ],
        },
      ],
    },
    {
      seriesId: "grid-1",
      tournamentId: "t-x",
      patch: "16.10",
      startedAt: "2026-11-01T00:00:00Z",
      format: "BO3",
      blueTeamId: "A",
      redTeamId: "B",
      resolveTeamId: (p) => (p ? `id-${p}` : null),
      datasetId: "ds",
    },
  );

  it("maps picks with normalized roles and provenance", () => {
    expect(series.games[0].draft.picks[0]).toMatchObject({ championId: "aatrox", role: "TOP", playerId: "id-top-player" });
    expect(series.games[0].draft.picks[1].role).toBe("JUNGLE");
    expect(series.games[0].sourceProvider).toBe("grid");
  });

  it("degrades unknown roles/objects instead of inventing values", () => {
    expect(series.games[0].draft.picks[2].role).toBe("TOP"); // fallback default, warning recorded
    expect(series.warnings.some((w) => w.includes("Mystery"))).toBe(true);
    expect(series.games[0].events.some((e) => e.type === "dragon")).toBe(true);
    expect(series.games[0].events.some((e) => (e.type as string) === "alien-artifact")).toBe(false); // unknown type skipped
  });

  it("rejects empty series payloads loudly", () => {
    expect(() =>
      mapGridSeriesState(
        { seriesId: "e", games: [] },
        { seriesId: "e", tournamentId: "t", patch: "p", startedAt: "s", format: "BO1", blueTeamId: "a", redTeamId: "b", resolveTeamId: () => null, datasetId: "d" },
      ),
    ).toThrow(GridError);
  });

  it("normalizes provider errors into the AppError catalogue", () => {
    const app = toAppError(new GridError("RATE_LIMITED", "429", { retryable: true, retryAfterSec: 30 }));
    expect(app.code).toBe("GRID_RATE_LIMITED");
    expect(app.retryable).toBe(true);
    expect(app.recovery).toContain("30 seconds");
    const missing = toAppError(new GridError("CREDENTIAL_MISSING", "no key"));
    expect(missing.code).toBe("GRID_CREDENTIAL_MISSING");
    expect(missing.retryable).toBe(false);
  });
});

describe("evidence builder", () => {
  it("produces deterministic ids from identical inputs", () => {
    const stat = { definition: "first_dragon_rate (eligible games)", numerator: 7, denominator: 10, value: 0.7, confidence: wilsonInterval(7, 10), sampleSize: 10 };
    const a = buildEvidence({ provider: "fixture", sourceId: "fixture:NVX", gameIds: ["g1", "g2"], stat });
    const b = buildEvidence({ provider: "fixture", sourceId: "fixture:NVX", gameIds: ["g1", "g2"], stat });
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^EV-[0-9A-F]{8}$/);
    expect(a.limitations.some((l) => l.includes("synthetic"))).toBe(true);
    expect(a.confidenceLower).not.toBeNull();
  });

  it("changes the id when observations change", () => {
    const stat = { definition: "x", numerator: 1, denominator: 2, value: 0.5, confidence: null, sampleSize: 2 };
    const a = buildEvidence({ provider: "fixture", sourceId: "s", gameIds: ["g1"], stat });
    const b = buildEvidence({ provider: "fixture", sourceId: "s", gameIds: ["g2"], stat });
    expect(a.id).not.toBe(b.id);
  });

  it("dedupes inside the ledger", () => {
    const ledger = new EvidenceLedger();
    const stat = { definition: "x", numerator: 1, denominator: 2, value: 0.5, confidence: null, sampleSize: 2 };
    const a = ledger.addStat({ provider: "fixture", sourceId: "s", gameIds: ["g1"], stat });
    const b = ledger.addStat({ provider: "fixture", sourceId: "s", gameIds: ["g1"], stat });
    expect(a).toBe(b);
    expect(ledger.size()).toBe(1);
  });
});

describe("counterfactual simulation", () => {
  it("computes divergent restriction sets without touching persisted state", () => {
    const session = {
      rulesetId: "ff-hard-bo5",
      ourTeamId: "SGT",
      mode: "hard",
      restrictionsScope: "both",
      games: [
        {
          gameNumber: 1,
          status: "finalized",
          blueTeamId: "SGT",
          redTeamId: "NVX",
          blue: { teamId: "SGT", picks: [{ championId: "vi" }, { championId: "orianna" }] },
          red: { teamId: "NVX", picks: [{ championId: "azir" }] },
        },
      ],
    } as unknown as DraftSession;
    const cf = counterfactual(session, { baseGameNumber: 1, removeChampionId: "vi", addChampionId: "sejuani" });
    expect(cf.base.restrictedForNext).toContain("vi");
    expect(cf.variant.restrictedForNext).toContain("sejuani");
    expect(cf.variant.restrictedForNext).not.toContain("vi");
    expect(cf.delta.newlyAvailable).toContain("vi");
    expect(cf.delta.newlyRestricted).toContain("sejuani");
  });

  it("rejects removal of champions that were never picked", () => {
    const session = {
      rulesetId: "std-bo1",
      ourTeamId: "SGT",
      mode: "none",
      restrictionsScope: "own",
      games: [{ gameNumber: 1, status: "finalized", blueTeamId: "SGT", redTeamId: "NVX", blue: { teamId: "SGT", picks: [{ championId: "vi" }] }, red: { teamId: "NVX", picks: [] } }],
    } as unknown as DraftSession;
    expect(() => counterfactual(session, { baseGameNumber: 1, removeChampionId: "jinx", addChampionId: "ashe" })).toThrow(/not picked/i);
  });
});
