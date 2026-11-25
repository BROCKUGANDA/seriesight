/**
 * Non-destructive backup/restore verification for the VPS PostgreSQL volume.
 *
 * Dumps the live `seriesight` database, restores it into a disposable
 * `seriesight_restore_drill` database, verifies that the core tables are queryable,
 * then drops the disposable database. The live database is never modified.
 */
import { closeSync, openSync, readFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const composeFile = "deploy/vps/compose.yaml";
const drillDb = "seriesight_restore_drill";
const backupPath = join(tmpdir(), `seriesight-restore-${randomUUID()}.dump`);

function run(args, options = {}) {
  const result = spawnSync("docker", ["compose", "--env-file", ".env", "-f", composeFile, ...args], {
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) throw new Error(`Command failed: docker compose ${args.join(" ")}`);
  return result.stdout ?? "";
}

function psql(sql, database = "postgres") {
  return run(["exec", "-T", "db", "psql", "-v", "ON_ERROR_STOP=1", "-U", "seriesight", "-d", database, "-tAc", sql]);
}

function cleanup() {
  try { unlinkSync(backupPath); } catch { /* already removed */ }
}

try {
  const fd = openSync(backupPath, "w");
  try {
    run(["exec", "-T", "db", "pg_dump", "-U", "seriesight", "-d", "seriesight", "-Fc"], {
      stdio: ["ignore", fd, "inherit"],
      encoding: null,
    });
  } finally {
    closeSync(fd);
  }

  psql(`DROP DATABASE IF EXISTS ${drillDb};`);
  let verified = false;
  try {
    psql(`CREATE DATABASE ${drillDb};`);
    const dump = spawnSync("docker", ["compose", "--env-file", ".env", "-f", composeFile, "exec", "-T", "db", "pg_restore", "--clean", "--if-exists", "-U", "seriesight", "-d", drillDb], {
      input: readFileSync(backupPath),
      stdio: ["pipe", "ignore", "inherit"],
    });
    if (dump.status !== 0) throw new Error("pg_restore failed");

    const count = psql('SELECT count(*) FROM "DraftSessionRecord";', drillDb).trim();
    const users = psql('SELECT count(*) FROM "AuthUserRecord";', drillDb).trim();
    if (!/^\d+$/.test(count) || !/^\d+$/.test(users)) throw new Error("Restored database did not return valid counts");
    console.log(`Restore verified: ${users} users, ${count} draft sessions.`);
    verified = true;
  } finally {
    psql(`DROP DATABASE IF EXISTS ${drillDb};`);
  }
  if (!verified) process.exitCode = 1;
} catch (error) {
  console.error(`Backup/restore drill failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  cleanup();
}
