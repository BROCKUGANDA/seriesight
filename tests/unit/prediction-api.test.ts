import { afterAll, describe, expect, it } from "vitest";
import { AuthenticatedRequest, testIdentity } from "../helpers/auth";
import { GET, POST } from "@/app/api/prediction/route";
import { createSession } from "@/services/draft";
import { db } from "@/lib/db";
import { identityContext } from "@/lib/auth";
import { trainWorkspaceModel, workspacePrediction } from "@/services/prediction";

const ids: string[] = [];
const modelKeys = [`win-model:${testIdentity.workspaceId}`, `win-model:${testIdentity.workspaceId}-other`];
afterAll(async () => {
  await db.draftSessionRecord.deleteMany({ where: { id: { in: ids } } });
  await db.dataSourceConnectionRecord.deleteMany({ where: { provider: { in: modelKeys } } });
});
describe("workspace prediction integration", () => {
  it("returns an honest unavailable state for a fixture draft", async () => {
    const session = await createSession({ opponentTeamId: "NVX", format: "BO5", rulesetId: "ff-hard-bo5" });
    ids.push(session.id);
    const response = await GET(new AuthenticatedRequest(`http://localhost:3000/api/prediction?sessionId=${session.id}`));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ status: "unavailable" });
  });
  it("prevents judge sessions from training models", async () => {
    const response = await POST(new AuthenticatedRequest("http://localhost:3000/api/prediction", { method: "POST", body: JSON.stringify({ action: "train" }) }));
    expect(response.status).toBe(403);
  });
  it("persists an insufficient-data result privately instead of fabricating a model", async () => {
    const coach = { ...testIdentity, kind: "coach" as const };
    const result = await identityContext.run(coach, () => trainWorkspaceModel([]));
    expect(result.status).toBe("unavailable");
    const record = await db.dataSourceConnectionRecord.findUniqueOrThrow({ where: { provider: modelKeys[0] } });
    expect(JSON.parse(record.metadataJson).result.status).toBe("unavailable");
    const elsewhere = await identityContext.run({ ...coach, workspaceId: `${testIdentity.workspaceId}-other` }, () => workspacePrediction([], { blueChampions: [], redChampions: [], side: "blue" }));
    expect(elsewhere).toMatchObject({ status: "unavailable" });
    if (elsewhere.status === "unavailable") expect(elsewhere.reason).toContain("Import authorized GRID");
  });
});
