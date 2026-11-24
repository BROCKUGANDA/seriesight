import assert from "node:assert/strict";

const base = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const mutate = process.argv.includes("--draft");
let cookie = "";

async function request(path, body) {
  const response = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", Origin: base, ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  const envelope = await response.json();
  assert.ok(response.ok && envelope.success, `${path}: HTTP ${response.status} ${JSON.stringify(envelope.error)}`);
  if (path === "/api/auth/session") cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  return envelope.data;
}

await request("/api/auth/session", { action: "demo" });
console.log("PASS isolated server-issued demo session");
for (const path of ["/api/health", "/api/teams", "/api/champions", "/api/data-sources", "/api/draft/sessions"]) {
  await request(path);
  console.log(`PASS ${path}`);
}

if (mutate) {
  const teams = await request("/api/teams");
  const opponent = teams.find((team) => !team.isOurTeam);
  assert.ok(opponent, "Fixture opponent is available");
  const session = await request("/api/draft/sessions", {
    opponentTeamId: opponent.id, format: "BO5", rulesetId: "ff-hard-bo5",
  });
  const path = `/api/draft/sessions/${session.id}`;
  const action = { type: "ban", championId: session.pool[0], expectedStateVersion: session.stateVersion };
  await request(`${path}/actions`, action);
  const replay = await fetch(`${base}${path}/actions`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: base, Cookie: cookie }, body: JSON.stringify(action),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(replay.status, 409, "Stale updates must be rejected");
  const stored = await request(path);
  assert.equal(stored.stateVersion, session.stateVersion + 1);
  console.log(`PASS BO5 draft persistence and stale-write rejection: ${session.id}`);
  console.log("Created one fixture draft in this sandbox. Its session is revoked at the end; use a signed-in coach account for manual checks across restarts.");
}

await request("/api/auth/session", { action: "logout" });
console.log("Smoke checks passed; demo session revoked. This does not validate live GRID data or browser rendering.");
