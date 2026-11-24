const apiKey = process.env.GRID_API_KEY;
if (!apiKey) throw new Error("GRID_API_KEY is not configured.");

for (const [product, url, query] of [
  ["central", "https://api-op.grid.gg/central-data/graphql", "query { titles { id name } }"],
  ["central-schema", "https://api-op.grid.gg/central-data/graphql", "query { __schema { queryType { name } } }"],
  ["series-schema", "https://api-op.grid.gg/live-data-feed/series-state/graphql", "query { __schema { queryType { name } } }"],
]) {
  const response = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ query }), signal: AbortSignal.timeout(20000),
  });
  const body = await response.json().catch(() => null);
  console.log(JSON.stringify({ product, http: response.status, authorized: response.ok && !!body?.data && !body?.errors?.length,
    graphqlErrorCount: body?.errors?.length ?? 0, titleCount: Array.isArray(body?.data?.titles) ? body.data.titles.length : undefined }));
  if (product === "central" && Array.isArray(body?.data?.titles)) {
    console.log(JSON.stringify({ lolTitleIds: body.data.titles.filter((title) => /league of legends/i.test(title.name)).map((title) => title.id) }));
  }
}