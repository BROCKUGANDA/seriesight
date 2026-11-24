/**
 * Readiness checks used by /api/health and container orchestration.
 *
 * A healthy response means the process can serve requests against a reachable
 * database with the expected schema. It does not report provider credentials
 * or attempt outbound network calls.
 */
import { db } from "@/lib/db";
import { FIXTURE_GAMES, FIXTURE_SERIES } from "@/fixtures/dataset";

export interface HealthCheck {
  status: "pass" | "fail";
  latencyMs: number;
  detail: string;
}

export async function databaseHealth(): Promise<HealthCheck> {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    // Verifies the application tables exist, not just the database connection.
    await db.draftSessionRecord.findFirst({ select: { id: true } });
    return { status: "pass", latencyMs: Date.now() - started, detail: "reachable" };
  } catch {
    return { status: "fail", latencyMs: Date.now() - started, detail: "database_unreachable" };
  }
}

export function fixtureDatasetHealth(): HealthCheck {
  const started = Date.now();
  const ok = FIXTURE_GAMES.length > 0 && FIXTURE_SERIES.length > 0;
  return {
    status: ok ? "pass" : "fail",
    latencyMs: Date.now() - started,
    detail: ok ? `${FIXTURE_GAMES.length} games / ${FIXTURE_SERIES.length} series` : "fixture_dataset_empty",
  };
}
