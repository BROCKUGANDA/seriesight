import { NextRequest } from "next/server";
import { ok, handler } from "@/lib/api/respond";
import { searchChampions } from "@/fixtures/champions";
import { resolveStaticData } from "@/lib/providers/data-dragon";

export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const staticData = await resolveStaticData();
  return ok(
    {
      metadataVersion: staticData.version,
      metadataSource: staticData.source,
      warnings: staticData.warnings,
      champions: searchChampions(q),
    },
    req,
  );
});
