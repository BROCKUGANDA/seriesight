import { handler, ok } from "@/lib/api/respond";
import { loadSelectedDataset } from "@/services/dataset";

export const dynamic = "force-dynamic";
export const GET = handler(async (req) => {
  const dataset = await loadSelectedDataset();
  return ok({ provider: dataset.provider, label: dataset.label, warnings: dataset.warnings }, req);
});
