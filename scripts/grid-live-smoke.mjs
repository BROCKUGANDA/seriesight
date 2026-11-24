import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const endpoints = {
  central: "https://api-op.grid.gg/central-data/graphql",
  state: "https://api-op.grid.gg/live-data-feed/series-state/graphql",
};
const ref = "kind name ofType { kind name ofType { kind name ofType { kind name } } }";
const introspection = `query { __schema { queryType { name } types { kind name fields { name args { name defaultValue type { ${ref} } } type { ${ref} } } inputFields { name type { ${ref} } } enumValues { name } } } }`;
export const named = (type) => type.name || named(type.ofType);
export const typeText = (type) => type.kind === "NON_NULL" ? `${typeText(type.ofType)}!` : type.kind === "LIST" ? `[${typeText(type.ofType)}]` : type.name;

// Only schema diagnostics, counts and statuses may reach stdout. Never log
// provider response bodies, cookies, credentials, IDs or Prisma errors.
async function grid(endpoint, query, variables = {}) {
  const response = await fetch(endpoints[endpoint], {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": process.env.GRID_API_KEY },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30000),
  });
  console.log(JSON.stringify({ operation: endpoint, http: response.status }));
  assert.ok(response.ok, `GRID_HTTP_${response.status}`);
  const body = await response.json();
  if (body.errors?.length) {
    console.log(JSON.stringify({ graphqlErrorCount: body.errors.length,
      codes: body.errors.map((e) => /^[A-Z_]+$/.test(e.extensions?.code) ? e.extensions.code : "UNCLASSIFIED"),
      classifications: body.errors.map((e) => /must have a selection/.test(e.message) ? "SELECTION_REQUIRED" : /must not have a selection/.test(e.message) ? "SCALAR_SELECTION" : /Cannot query field/.test(e.message) ? "UNKNOWN_FIELD" : /syntax/i.test(e.message) ? "SYNTAX" : /access|permission|authoriz|forbidden/i.test(e.message) ? "ACCESS" : "OTHER"),
      paths: body.errors.map((e) => e.path?.map((p) => typeof p === "number" ? "[]" : /^[a-zA-Z]+$/.test(p) ? p : "REDACTED")) }));
    throw new Error("GRID_GRAPHQL_ERRORS");
  }
  assert.ok(body.data, "GRID_EMPTY_DATA");
  return body.data;
}

export function discoveryPlan(schema, titleId) {
  const types = new Map(schema.types.map((t) => [t.name, t]));
  const root = types.get(schema.queryType.name);
  const field = root.fields.find((f) => f.name === "allSeries");
  assert.ok(field, "SCHEMA_NO_ALL_SERIES");
  const args = [], variables = {}, definitions = [];
  const add = (arg, value) => {
    definitions.push(`$${arg.name}: ${typeText(arg.type)}`);
    args.push(`${arg.name}: $${arg.name}`); variables[arg.name] = value;
  };
  for (const arg of field.args) {
    if (arg.name === "first") add(arg, 50);
    else if (arg.name === "after") add(arg, null);
    else if (arg.name === "filter") {
      const input = types.get(named(arg.type));
      const title = input?.inputFields?.find((f) => f.name === "titleId");
      const filter = {};
      if (title) {
        const titleType = types.get(named(title.type));
        const inside = titleType?.inputFields?.find((f) => f.name === "in");
        if (inside) filter.titleId = { in: [titleId] };
        else if (["ID", "String"].includes(named(title.type))) filter.titleId = titleId;
      }
      if (Object.keys(filter).length) add(arg, filter);
      else assert.ok(arg.type.kind !== "NON_NULL", "SCHEMA_UNSUPPORTED_REQUIRED_FILTER");
    } else assert.ok(arg.type.kind !== "NON_NULL" || arg.defaultValue !== null, "SCHEMA_UNSUPPORTED_REQUIRED_ARGUMENT");
  }
  const connection = types.get(named(field.type));
  assert.ok(connection?.fields?.some((f) => f.name === "edges"), "SCHEMA_UNSUPPORTED_SERIES_CONNECTION");
  return { query: `query Discover${definitions.length ? `(${definitions.join(", ")})` : ""} { allSeries${args.length ? `(${args.join(", ")})` : ""} { edges { node { id title { id } } } pageInfo { hasNextPage endCursor } } }`, variables };
}

async function apiSmoke(seriesId) {
  assert.ok(process.env.AUTH_INVITE_CODE, "INVITE_NOT_CONFIGURED");
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  const email = `grid-smoke-${randomUUID()}@local.invalid`;
  const base = "http://127.0.0.1:4180";
  let cookie = "";
  const request = async (path, body) => {
    const response = await fetch(`${base}${path}`, {
      headers: { "Content-Type": "application/json", Origin: process.env.APP_ORIGIN || base, Cookie: cookie },
      ...(body ? { method: "POST", body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(180000),
    });
    if (path === "/api/auth/session") cookie = response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const envelope = await response.json();
    console.log(JSON.stringify({ api: path.startsWith("/api/scouting/") ? "scouting" : path, http: response.status, success: envelope.success === true }));
    assert.ok(response.ok && envelope.success, "APP_API_FAILED");
    return envelope.data;
  };
  try {
    await request("/api/auth/session", { action: "register", email, password: randomBytes(32).toString("hex"), name: "Temporary GRID smoke", inviteCode: process.env.AUTH_INVITE_CODE });
    const result = await request("/api/ingestion/series", { provider: "grid", seriesId });
    console.log(JSON.stringify({ importStatus: result.job?.status, games: result.job?.gameCount,
      errorCode: result.job?.lastError?.match(/^GRID_[A-Z_]+/)?.[0] ?? null }));
    assert.equal(result.job?.status, "succeeded", "IMPORT_FAILED");
    const teams = await request("/api/teams");
    assert.ok(teams.length === 2 && teams.every((t) => t.id.startsWith("grid:")), "TEAMS_NOT_GRID_ONLY");
    const scouting = await request(`/api/scouting/opponents/${encodeURIComponent(teams[0].id)}`);
    assert.equal(scouting.provider, "grid", "SCOUTING_GRID_PROVENANCE_MISSING");
    const user = await db.authUserRecord.findUniqueOrThrow({ where: { email } });
    const persisted = await db.dataSourceConnectionRecord.findUnique({ where: {
      provider: `grid-history:${encodeURIComponent(user.workspaceId)}:${encodeURIComponent(seriesId)}`,
    } });
    assert.ok(persisted, "NORMALIZED_HISTORY_NOT_PERSISTED");
    const history = JSON.parse(persisted.metadataJson);
    assert.ok(history.provider === "grid" && history.games.length > 0 && history.games.every((g) => g.picks.length === 10), "PERSISTED_DRAFT_INCOMPLETE");
    console.log("PASS real import and GRID analytics");
  } finally {
    try {
      const user = await db.authUserRecord.findUnique({ where: { email } });
      if (user) {
        const workspace = encodeURIComponent(user.workspaceId);
        await db.$transaction([
          db.dataSourceConnectionRecord.deleteMany({ where: { OR: [
            { provider: `grid:${workspace}` },
            { provider: { startsWith: `grid-history:${workspace}:` } },
          ] } }),
          db.authSessionRecord.deleteMany({ where: { userId: user.id } }),
          db.authUserRecord.delete({ where: { id: user.id } }),
        ]);
        console.log("PASS temporary coach data cleanup");
      }
    } finally { await db.$disconnect(); }
  }
}

export async function main() {
  assert.ok(process.env.GRID_API_KEY, "GRID_KEY_NOT_CONFIGURED");
  const central = (await grid("central", introspection)).__schema;
  const state = (await grid("state", introspection)).__schema;
  if (process.argv.includes("--schema-summary")) {
    for (const [endpoint, schema] of [["central", central], ["state", state]]) {
      const names = new Set(["Duration", "ClockState", "GameTeamState", "GamePlayerState", "Title", "SeriesTeamState"]);
      for (const t of schema.types.filter((t) => names.has(t.name))) {
        const fields = t.fields;
        console.log(JSON.stringify({ endpoint, name: t.name, kind: t.kind, fields: fields?.map((f) => ({ name: f.name, type: typeText(f.type), args: f.args.map((a) => ({ name: a.name, type: typeText(a.type) })) })) }));
      }
    }
    return;
  }
  if (process.argv.includes("--schema-only")) {
    for (const [endpoint, schema] of [["central", central], ["state", state]]) {
      console.log(JSON.stringify({ endpoint, types: schema.types.filter((t) => !t.name.startsWith("__")).map((t) => ({
        name: t.name, fields: t.fields?.map((f) => ({ name: f.name, type: typeText(f.type), args: f.args.map((a) => ({ name: a.name, type: typeText(a.type) })) })),
        inputFields: t.inputFields?.map((f) => ({ name: f.name, type: typeText(f.type) })),
      })) }));
    }
    return;
  }
  const titles = (await grid("central", "query { titles { id name nameShortened } }")).titles;
  const lol = titles.find((t) => /^(lol|league-of-legends)$/i.test(t.nameShortened) || /^league of legends$/i.test(t.name));
  assert.ok(lol, "NO_LOL_TITLE");
  const plan = discoveryPlan(central, lol.id);
  let completed;
  let examined = 0;
  for (let page = 0; page < 5 && !completed; page++) {
    const connection = (await grid("central", plan.query, plan.variables)).allSeries;
    for (const { node } of connection.edges) {
      if (node.title?.id !== lol.id) continue;
      examined++;
      const snapshot = await grid("state", "query($id: ID!) { seriesState(id: $id) { id finished } }", { id: node.id });
      if (snapshot.seriesState?.finished) { completed = node.id; break; }
    }
    console.log(JSON.stringify({ page: page + 1, discovered: connection.edges.length, examined, completed: Boolean(completed) }));
    if (!connection.pageInfo.hasNextPage || !("after" in plan.variables)) break;
    plan.variables.after = connection.pageInfo.endCursor;
  }
  assert.ok(completed, "NO_ENTITLED_COMPLETED_LOL_WITHIN_SCAN_LIMIT");
  if (process.argv.includes("--adapter")) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const body = await response.clone().json();
      if (body.errors?.length) console.log(JSON.stringify({ diagnostic: "adapter-graphql", paths: body.errors.map((e) => e.path?.map((p) => typeof p === "number" ? "[]" : /^[a-zA-Z]+$/.test(p) ? p : "REDACTED")),
        validationError: body.errors.some((e) => /Cannot query field|must have a selection|syntax/i.test(e.message)) }));
      return response;
    };
    const adapter = await import("./grid-adapter-diagnostic.mjs");
    try {
      const history = await adapter.fetchGridHistoricalSeries(completed);
      console.log(JSON.stringify({ adapter: "passed", games: history.games.length, picks: history.games.reduce((n, g) => n + g.picks.length, 0), bans: history.games.reduce((n, g) => n + g.bans.length, 0) }));
    } catch (error) {
      console.log(JSON.stringify({ adapter: "failed", code: /^[A-Z_]+$/.test(error.code) ? error.code : "UNKNOWN",
        stage: /introspection/.test(error.message) ? "introspection" : /payload/.test(error.message) ? "normalization" : /lookup|fields/.test(error.message) ? "projection" : "request", validationIssues: error.validationIssues }));
      throw new Error("ADAPTER_FAILED");
    } finally { globalThis.fetch = originalFetch; }
    return;
  }
  if (process.argv.includes("--diagnose")) {
    const data = await grid("state", "query($id: ID!) { seriesState(id: $id) { finished format updatedAt games { sequenceNumber finished clock { currentSeconds } teams { side won players { character { id } } } draftActions { sequenceNumber type drafter { type } draftable { type } } } } }", { id: completed });
    const s = data.seriesState;
    console.log(JSON.stringify({ diagnostic: "contract", supportedFormat: ["best-of-1", "best-of-3", "best-of-5"].includes(s.format), validUpdatedAt: Number.isFinite(Date.parse(s.updatedAt)), games: s.games.map((g) => ({
      finished: g.finished, positiveSequence: Number.isInteger(g.sequenceNumber) && g.sequenceNumber > 0,
      clockAvailable: Number.isFinite(g.clock?.currentSeconds) && g.clock.currentSeconds > 0,
      supportedSides: g.teams.every((t) => ["blue", "red"].includes(t.side.toLowerCase())),
      players: g.teams.map((t) => t.players.length), actions: g.draftActions.length,
      zeroBasedActions: g.draftActions.some((a) => Number(a.sequenceNumber) === 0),
      supportedActionTypes: g.draftActions.every((a) => ["pick", "ban"].includes(a.type)),
      supportedDrafters: g.draftActions.every((a) => ["team", "player"].includes(a.drafter.type)),
      supportedDraftables: g.draftActions.every((a) => ["champion", "character"].includes(a.draftable.type)),
    })) }));
    return;
  }
  if (process.argv.includes("--api")) await apiSmoke(completed);
  else console.log("PASS completed LoL discovery; use --api to verify import with temporary coach cleanup");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(/^[A-Z_0-9]+$/.test(error.message) ? error.message : "LIVE_SMOKE_FAILED_NO_PAYLOAD_LOGGED");
    process.exitCode = 1;
  });
}