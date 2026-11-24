"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

export function DataSourceNotice() {
  const [data, setData] = useState<{ provider: string; label: string; warnings: string[] } | null>(null);
  useEffect(() => {
    let active = true;
    apiFetch<NonNullable<typeof data>>("/api/workspace").then((value) => { if (active) setData(value); }).catch(() => {});
    return () => { active = false; };
  }, []);
  if (!data) return null;
  return <aside aria-label="Active data source" className="mb-4 rounded-lg border border-[var(--border-active)] bg-[var(--surface-2)] p-3 text-xs text-[var(--text-secondary)]">
    <p className="font-semibold">{data.label}</p>
    {data.provider === "grid" && <p className="mt-1">Historical GRID snapshot, not an in-game live feed. Unknown patch, draft policy, roles, or macro events are not inferred.</p>}
    {data.warnings.length > 0 && <details className="mt-1"><summary className="cursor-pointer">Data coverage and limitations ({data.warnings.length})</summary><ul className="mt-2 list-disc space-y-1 pl-4">{data.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
  </aside>;
}
