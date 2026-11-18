/**
 * File-drop adapter — batch import seam for internal systems that deliver
 * data as files (nightly exports from an org's S3 bucket, academy CSVs, BI
 * hand-offs). Accepts JSON arrays/objects and CSV, validates shape, and
 * publishes a `data.file.imported` event. Large files are summarized, never
 * embedded whole, in the event payload.
 */
import { publishAndDispatch } from "../bus";
import type { IntegrationEvent, DispatchOutcome } from "../types";
import { ERRORS } from "@/domain/errors";

export interface FileDropResult {
  event: IntegrationEvent;
  outcome: DispatchOutcome;
  summary: { filename: string; format: "json" | "csv"; recordCount: number; warnings: string[] };
}

function parseCsv(text: string): { records: number; warnings: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw ERRORS.webhookPayloadInvalid("CSV needs a header row and at least one data row.");
  const headerCount = lines[0].split(",").length;
  const warnings: string[] = [];
  let records = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").length;
    if (cols !== headerCount) warnings.push(`Row ${i + 1}: ${cols} columns, expected ${headerCount} — row skipped.`);
    else records += 1;
  }
  return { records, warnings };
}

function parseJsonPayload(text: string): { records: number; warnings: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw ERRORS.webhookPayloadInvalid("The file is neither valid JSON nor CSV.");
  }
  const warnings: string[] = [];
  let records = 0;
  if (Array.isArray(parsed)) {
    records = parsed.length;
  } else if (parsed !== null && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const candidate = obj.games ?? obj.records ?? obj.series ?? obj.rows;
    if (Array.isArray(candidate)) {
      records = candidate.length;
      warnings.push(`Top-level object detected; counted the "${obj.games ? "games" : obj.records ? "records" : obj.series ? "series" : "rows"}" array.`);
    } else {
      records = 1;
      warnings.push("Single JSON object imported as one record.");
    }
  } else {
    throw ERRORS.webhookPayloadInvalid("JSON payload must be an object or array.");
  }
  return { records, warnings };
}

/** Ingest a dropped file. `filename` extension decides the parser. */
export async function importFileDrop(filename: string, content: string): Promise<FileDropResult> {
  const lower = filename.toLowerCase();
  const format: "json" | "csv" = lower.endsWith(".json") || lower.endsWith(".jsonl") ? "json" : lower.endsWith(".csv") || lower.endsWith(".txt") ? "csv" : "json";
  const { records, warnings } = format === "csv" ? parseCsv(content) : parseJsonPayload(content);

  const { event, outcome } = await publishAndDispatch({
    topic: "data.file.imported",
    source: `adapter:file-drop:${format}`,
    direction: "inbound",
    correlationId: null,
    payload: {
      filename,
      format,
      recordCount: records,
      warnings,
      bytes: content.length,
      importedAt: new Date().toISOString(),
    },
  });
  return { event, outcome, summary: { filename, format, recordCount: records, warnings } };
}
