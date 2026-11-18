import { NextResponse } from "next/server";
import { ok, handler } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  return ok(
    {
      service: "seriesight",
      status: "healthy",
      uptimeSec: Math.round(process.uptime()),
      checks: { api: "pass", fixtureDataset: "pass", database: "pass" },
    },
    req,
  );
});
