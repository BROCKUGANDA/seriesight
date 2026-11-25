import { handler, fail, ok } from "@/lib/api/respond";
import { databaseHealth, fixtureDatasetHealth } from "@/lib/health";
import { sendAlert } from "@/lib/alerting";

export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  const [database, fixtureDataset] = await Promise.all([databaseHealth(), Promise.resolve(fixtureDatasetHealth())]);
  const checks = {
    api: { status: "pass", latencyMs: 0, detail: "reachable" },
    database,
    fixtureDataset,
  };
  const status = database.status === "pass" && fixtureDataset.status === "pass" ? "healthy" : "degraded";

  if (status !== "healthy") {
    void sendAlert("health_degraded", "critical", {
      database: database.status,
      fixtureDataset: fixtureDataset.status,
    });
    return fail(
      {
        code: "SERVICE_UNAVAILABLE",
        message: "The service is not ready.",
        retryable: true,
        recovery: "Retry shortly. If this persists, check the database connection and application logs.",
        details: { checks },
      },
      req,
      503,
    );
  }

  return ok(
    {
      service: "seriesight",
      status,
      uptimeSec: Math.round(process.uptime()),
      checks,
    },
    req,
  );
});
