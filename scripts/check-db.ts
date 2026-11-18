// Integrity check for the local SQLite demo database after the disk-full event.
import { db } from "../src/lib/db";

const quickCheck: Array<{ quick_check: string }> = await db.$queryRaw`PRAGMA quick_check`;
console.log("quick_check:", quickCheck.map((r) => r.quick_check).join(","));

const tables: Array<{ name: string }> = await db.$queryRaw`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`;
console.log("tables (" + tables.length + "):", tables.map((t) => t.name).join(", "));

const sessions: Array<{ n: bigint }> = await db.$queryRaw`SELECT count(*) as n FROM DraftSessionRecord`;
console.log("draft_sessions rows:", sessions[0].n.toString());

await db.$disconnect();
