#!/usr/bin/env node
/**
 * Seriesight release automation — branch promotion + semantic versioning.
 *
 *   node scripts/release.mjs version <major|minor|patch|prerelease> [--preid rc] [--tag] [--push]
 *   node scripts/release.mjs promote --from dev --to staging [--version 1.0.0-rc.1] [--dry-run] [--skip-gates]
 *   node scripts/release.mjs promote --from staging --to main [--version 1.0.0] [--dry-run] [--skip-gates]
 *
 * Flow for `promote`:
 *   1. Assert a clean working tree and that both branches exist.
 *   2. Check out the target branch and merge the source (--no-ff).
 *   3. Run quality gates on the merged tree (typecheck + lint + tests,
 *      plus the production build when promoting to main).
 *   4. Bump package.json, commit `chore(release): vX.Y.Z`, tag `vX.Y.Z`.
 *   5. Push the branch and tag (when a remote exists); the Release workflow
 *      then creates the GitHub release for main after CI gates re-run.
 *
 * Any gate failure rolls the merge back and leaves both branches untouched.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const PACKAGE_JSON = path.join(ROOT, "package.json");

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
};

const DRY = has("--dry-run");
const log = (...m) => console.log(...m);
const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

/* ── subprocess helpers ──────────────────────────────────────────────────── */

function run(cmd, cmdArgs, opts = {}) {
  if (DRY && !opts.allowInDryRun) {
    log(`  [dry-run] ${cmd} ${cmdArgs.join(" ")}`);
    return "";
  }
  try {
    const out = execFileSync(cmd, cmdArgs, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    return out ? out.trim() : "";
  } catch (err) {
    if (opts.capture && opts.throwOnFail) throw err;
    if (opts.capture) {
      die(`${cmd} ${cmdArgs.join(" ")} failed:\n${err.stdout ?? ""}${err.stderr ?? ""}`);
    }
    throw err;
  }
}

const git = (cmdArgs, opts) => run("git", cmdArgs, opts);
const hasCommand = (name) => {
  try {
    execFileSync(name === "git" || name === "gh" ? name : name, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

/* ── quality gates ───────────────────────────────────────────────────────── */

const RUNNER = hasCommand("bun") ? "bun" : "npm";

function runGate(argsForRunner) {
  const cmd = RUNNER === "bun" ? "bun" : "npm";
  const finalArgs = RUNNER === "bun" ? argsForRunner : ["run", ...argsForRunner];
  log(`▸ gate: ${cmd} ${finalArgs.join(" ")}`);
  try {
    execFileSync(cmd, finalArgs, { cwd: ROOT, stdio: "inherit" });
  } catch {
    throw new Error(`gate failed: ${cmd} ${finalArgs.join(" ")}`);
  }
}

function runGates(promotingToMain) {
  if (has("--skip-gates")) {
    log("⚠ gates skipped (--skip-gates)");
    return;
  }
  log("── quality gates ──");
  runGate(["run", "verify"]);
  if (promotingToMain) {
    runGate(["run", "build"]);
  }
}

/* ── versioning ──────────────────────────────────────────────────────────── */

function readPackage() {
  return JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8"));
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

function parseVersion(v) {
  const m = SEMVER.exec(v);
  if (!m) die(`invalid version: ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? null };
}

function formatVersion({ major, minor, patch, pre }) {
  return pre ? `${major}.${minor}.${patch}-${pre}` : `${major}.${minor}.${patch}`;
}

function bump(v, kind, preid = "rc") {
  const p = parseVersion(v);
  switch (kind) {
    case "major":
      return formatVersion({ major: p.major + 1, minor: 0, patch: 0, pre: null });
    case "minor":
      return formatVersion({ major: p.major, minor: p.minor + 1, patch: 0, pre: null });
    case "patch":
      return formatVersion({ major: p.major, minor: p.minor, patch: p.patch + 1, pre: null });
    case "prerelease": {
      if (p.pre && p.pre.startsWith(`${preid}.`)) {
        const n = +p.pre.slice(preid.length + 1);
        if (Number.isFinite(n)) return formatVersion({ ...p, pre: `${preid}.${n + 1}` });
      }
      const base = { major: p.major, minor: p.minor, patch: p.patch, pre: `${preid}.1` };
      if (p.pre) return formatVersion(base);
      return formatVersion({ major: p.major, minor: p.minor + 1, patch: 0, pre: base.pre });
    }
    default:
      die(`unknown bump kind: ${kind}`);
  }
}

function stripPre(v) {
  const p = parseVersion(v);
  return formatVersion({ ...p, pre: null });
}

function setVersion(newVersion) {
  if (DRY) {
    log(`  [dry-run] set package.json version → ${newVersion}`);
    return;
  }
  const pkg = readPackage();
  pkg.version = newVersion;
  fs.writeFileSync(PACKAGE_JSON, `${JSON.stringify(pkg, null, 2)}\n`);
}

/* ── git state ───────────────────────────────────────────────────────────── */

function assertCleanTree() {
  const status = git(["status", "--porcelain"], { capture: true, allowInDryRun: true });
  if (status.length > 0) {
    die(`working tree is not clean — commit or stash first:\n${status.split("\n").slice(0, 8).join("\n")}`);
  }
}

const branchExists = (name) =>
  git(["rev-parse", "--verify", "--quiet", `refs/heads/${name}`], { capture: true, allowInDryRun: true }).length > 0;

function currentBranch() {
  return git(["rev-parse", "--abbrev-ref", "HEAD"], { capture: true, allowInDryRun: true });
}

const hasRemote = () => git(["remote"], { capture: true, allowInDryRun: true }).length > 0;

/* ── commands ────────────────────────────────────────────────────────────── */

function cmdVersion() {
  const kind = args.find((a) => !a.startsWith("--") && a !== "version");
  if (!["major", "minor", "patch", "prerelease"].includes(kind)) {
    die("usage: release.mjs version <major|minor|patch|prerelease> [--preid rc] [--tag] [--push]");
  }
  const preid = value("--preid") ?? "rc";
  const next = bump(readPackage().version, kind, preid);

  log(`── version ${kind}: ${readPackage().version} → ${next} ──`);
  assertCleanTree();
  setVersion(next);
  git(["add", "package.json"], { allowInDryRun: true });
  git(["commit", "-m", `chore(release): v${next}`], { allowInDryRun: true });
  if (has("--tag")) {
    git(["tag", `-a`, `v${next}`, "-m", `Seriesight v${next}`], { allowInDryRun: true });
  }
  if (has("--push") && hasRemote()) {
    git(["push", "origin", currentBranch(), ...(has("--tag") ? [`v${next}`] : [])], { allowInDryRun: true });
  }
  log(`✓ version ${next}${has("--tag") ? ` — tagged v${next}` : ""}`);
}

function cmdPromote() {
  const from = value("--from");
  const to = value("--to");
  if (!from || !to) die("usage: release.mjs promote --from <branch> --to <branch> [--version X.Y.Z] [--dry-run] [--skip-gates]");
  const explicit = value("--version");

  log(`── promote ${from} → ${to}${DRY ? " (dry run)" : ""} ──`);
  assertCleanTree();
  if (!branchExists(from)) die(`branch not found: ${from}`);
  if (!branchExists(to)) die(`branch not found: ${to}`);

  const startingBranch = currentBranch();
  const toShaBefore = git(["rev-parse", to], { capture: true, allowInDryRun: true });

  // 1. merge
  git(["checkout", to], { allowInDryRun: true });
  try {
    git(["merge", "--no-ff", from, "-m", `merge: promote ${from} into ${to}`], { allowInDryRun: true });
  } catch {
    if (!DRY) {
      git(["reset", "--hard", toShaBefore]);
      git(["checkout", startingBranch]);
    }
    die("merge conflict — resolve manually, then rerun.");
  }

  // 2. gates on the merged tree; roll back on failure
  try {
    runGates(to === "main");
  } catch {
    log("✗ gates failed — rolling back the merge");
    if (!DRY) {
      git(["reset", "--hard", toShaBefore]);
      git(["checkout", startingBranch]);
    }
    process.exit(1);
  }

  // 3. version
  const pkg = readPackage();
  let next = explicit;
  if (!next) {
    next = to === "main" ? stripPre(pkg.version) : bump(pkg.version, "prerelease", "rc");
  }
  const parsed = parseVersion(next);
  if (to === "main" && parsed.pre) die(`main releases must be final versions — ${next} has a prerelease tag`);

  setVersion(next);
  git(["add", "package.json"], { allowInDryRun: true });
  git(["commit", "-m", `chore(release): v${next}`], { allowInDryRun: true });
  git(["tag", "-a", `v${next}`, "-m", `Seriesight v${next}`], { allowInDryRun: true });

  // 4. push — the Release workflow creates the GitHub release from the tag
  if (hasRemote()) {
    git(["push", "origin", to, `v${next}`], { allowInDryRun: true });
    if (to === "main") log(`▸ GitHub Release for v${next} is created by .github/workflows/release.yml after CI gates`);
  } else {
    log("⚠ no git remote — skipped push (tag exists locally)");
  }

  git(["checkout", startingBranch], { allowInDryRun: true });
  log(`✓ ${to} is now v${next} (tag v${next})`);
}

/* ── entry ───────────────────────────────────────────────────────────────── */

const command = args[0];
if (command === "version") cmdVersion();
else if (command === "promote") cmdPromote();
else {
  log("Seriesight release automation\n");
  log("  node scripts/release.mjs version <major|minor|patch|prerelease> [--preid rc] [--tag] [--push]");
  log("  node scripts/release.mjs promote --from dev --to staging [--version X.Y.Z-rc.N] [--dry-run] [--skip-gates]");
  log("  node scripts/release.mjs promote --from staging --to main [--version X.Y.Z] [--dry-run] [--skip-gates]");
}
