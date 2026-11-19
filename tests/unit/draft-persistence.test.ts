import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { AppError } from "@/domain/errors";
import { createSession, applyDraftAction, resetGame } from "@/services/draft";
import { POST as actionsPOST } from "@/app/api/draft/sessions/[sessionId]/actions/route";
import { POST as finalizePOST } from "@/app/api/draft/sessions/[sessionId]/finalize/route";
import { POST as nextGamePOST } from "@/app/api/draft/sessions/[sessionId]/next-game/route";
import { POST as redoPOST } from "@/app/api/draft/sessions/[sessionId]/redo/route";
import { POST as resetPOST } from "@/app/api/draft/sessions/[sessionId]/reset/route";
import { POST as rolesPOST } from "@/app/api/draft/sessions/[sessionId]/roles/route";
import { POST as undoPOST } from "@/app/api/draft/sessions/[sessionId]/undo/route";

const createdSessionIds: string[] = [];

afterAll(async () => {
  await db.draftSessionRecord.deleteMany({ where: { id: { in: createdSessionIds } } });
});

async function newSession(): Promise<string> {
  const session = await createSession({ opponentTeamId: "NVX", format: "BO5", rulesetId: "std-bo5" });
  createdSessionIds.push(session.id);
  return session.id;
}

describe("draft mutation API version validation", () => {
  const routes: { name: string; handler: typeof actionsPOST; body: Record<string, unknown> }[] = [
    { name: "actions", handler: actionsPOST, body: { type: "ban", championId: "kalista" } },
    { name: "finalize", handler: finalizePOST, body: {} },
    { name: "next-game", handler: nextGamePOST, body: {} },
    { name: "redo", handler: redoPOST, body: {} },
    { name: "reset", handler: resetPOST, body: {} },
    { name: "roles", handler: rolesPOST, body: { side: "BLUE", pickIndex: 0, role: "TOP" } },
    { name: "undo", handler: undoPOST, body: {} },
  ];

  it.each(routes)("rejects a missing expectedStateVersion on $name", async ({ handler, body }) => {
    const request = new NextRequest("http://localhost:3000/api/draft/sessions/missing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const response = await handler(request, { params: Promise.resolve({ sessionId: "missing" }) });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it.each(routes)("rejects an invalid expectedStateVersion on $name", async ({ handler, body }) => {
    const request = new NextRequest("http://localhost:3000/api/draft/sessions/missing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, expectedStateVersion: 0 }),
    });
    const response = await handler(request, { params: Promise.resolve({ sessionId: "missing" }) });

    expect(response.status).toBe(400);
  });

  it.each(routes)("rejects an empty request body on $name", async ({ handler }) => {
    const request = new NextRequest("http://localhost:3000/api/draft/sessions/missing", { method: "POST" });
    const response = await handler(request, { params: Promise.resolve({ sessionId: "missing" }) });

    expect(response.status).toBe(400);
  });
});

describe("draft persistence compare-and-swap", () => {
  it("rejects reset on a finalized game without changing session version", async () => {
    const session = await createSession({ opponentTeamId: "NVX", format: "BO5", rulesetId: "std-bo5" });
    createdSessionIds.push(session.id);
    const finalizedGames = session.games.map((game) => ({ ...game, status: "finalized" as const }));
    await db.draftSessionRecord.update({
      where: { id: session.id },
      data: { gamesJson: JSON.stringify(finalizedGames) },
    });

    await expect(resetGame(session.id, session.stateVersion)).rejects.toMatchObject({ code: "DRAFT_SESSION_COMPLETED" });
    const persisted = await db.draftSessionRecord.findUniqueOrThrow({ where: { id: session.id } });
    expect(persisted.stateVersion).toBe(session.stateVersion);
    expect(JSON.parse(persisted.gamesJson)[0].status).toBe("finalized");
  });

  it("allows only one write from a shared version and rolls back its losing audit row", async () => {
    const sessionId = await newSession();
    const originalFindUnique = db.draftSessionRecord.findUnique.bind(db.draftSessionRecord);
    let initialReads = 0;
    let releaseInitialReads!: () => void;
    const bothReadsComplete = new Promise<void>((resolve) => {
      releaseInitialReads = resolve;
    });
    const findUniqueSpy = vi.spyOn(db.draftSessionRecord, "findUnique").mockImplementation((args) => {
      const delayedRead = (async () => {
        const record = await originalFindUnique(args);
        if (args.where.id === sessionId && initialReads < 2) {
          initialReads++;
          if (initialReads === 2) releaseInitialReads();
          await bothReadsComplete;
        }
        return record;
      })();
      return delayedRead as unknown as ReturnType<typeof db.draftSessionRecord.findUnique>;
    });

    let outcomes: PromiseSettledResult<Awaited<ReturnType<typeof applyDraftAction>>>[];
    try {
      const mutation = () => applyDraftAction(sessionId, { type: "ban", championId: "kalista", expectedStateVersion: 1 });
      outcomes = await Promise.allSettled([mutation(), mutation()]);
    } finally {
      findUniqueSpy.mockRestore();
    }

    expect(initialReads).toBe(2);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toBeInstanceOf(AppError);
      expect(rejected.reason.code).toBe("DRAFT_STALE_VERSION");
    }

    const [persisted, auditCount] = await Promise.all([
      db.draftSessionRecord.findUniqueOrThrow({ where: { id: sessionId } }),
      db.draftActionRecord.count({ where: { sessionId } }),
    ]);
    expect(persisted.stateVersion).toBe(2);
    expect(auditCount).toBe(1);
  });

  it("rolls back an audit row when the session update fails", async () => {
    const sessionId = await newSession();
    const triggerName = `draft_fail_update_${sessionId.replaceAll("-", "")}`;
    await db.$executeRawUnsafe(
      `CREATE TRIGGER "${triggerName}" BEFORE UPDATE ON "DraftSessionRecord" WHEN OLD."id" = '${sessionId}' BEGIN SELECT RAISE(ABORT, 'forced draft update failure'); END;`,
    );

    try {
      await expect(
        applyDraftAction(sessionId, { type: "ban", championId: "kalista", expectedStateVersion: 1 }),
      ).rejects.toThrow();

      const [persisted, auditCount] = await Promise.all([
        db.draftSessionRecord.findUniqueOrThrow({ where: { id: sessionId } }),
        db.draftActionRecord.count({ where: { sessionId } }),
      ]);
      expect(persisted.stateVersion).toBe(1);
      expect(auditCount).toBe(0);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}";`);
    }
  });
});