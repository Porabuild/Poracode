#!/usr/bin/env bun
/**
 * Regenerate the vendored-TUI patch series.
 *
 * Diffs `tui/opencode/` against the pinned upstream tag and writes one
 * numbered patch per changed/added file into `tui/opencode/patches/`.
 * Then verifies: apply the series onto a fresh upstream extract and require a
 * byte-for-byte match with the vendored tree.
 *
 *   bun scripts/regenerate-tui-patches.mjs [--tag v2.1.0] [--upstream <dir>]
 *       [--no-verify]
 *
 * `--upstream` skips the download and diffs against an existing checkout.
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendored = join(repo, "tui", "opencode");
const patchesDir = join(vendored, "patches");
const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const tag = flag("tag") ?? readTag();
const upstreamDir = flag("upstream");
const verify = !args.includes("--no-verify");

function readTag() {
  const match = readFileSync(join(vendored, "UPSTREAM.md"), "utf8").match(/Tag: `([^`]+)`/);
  if (!match) throw new Error("UPSTREAM.md does not declare a Tag.");
  return match[1];
}

function walk(root, base = root, out = []) {
  for (const entry of readdirSync(root)) {
    if (entry === ".git" || entry === "patches" || entry === "node_modules") continue;
    const full = join(root, entry);
    if (statSync(full).isDirectory()) walk(full, base, out);
    else out.push(relative(base, full).split(sep).join("/"));
  }
  return out.sort();
}

function bytes(path) {
  return readFileSync(path);
}

function equalTree(a, b) {
  const files = walk(a);
  const other = walk(b);
  const missing = files.filter((f) => !other.includes(f));
  const extra = other.filter((f) => !files.includes(f));
  const changed = files.filter(
    (f) => other.includes(f) && !bytes(join(a, f)).equals(bytes(join(b, f))),
  );
  return { missing, extra, changed };
}

const scratch = mkdtempSync(join(tmpdir(), "tui-patch-"));
try {
  // Resolve the upstream tree.
  let upstream = upstreamDir ? resolve(upstreamDir) : join(scratch, "upstream");
  if (!upstreamDir) {
    const url = `https://github.com/anomalyco/opencode/archive/refs/tags/${tag}.tar.gz`;
    console.log(`fetching ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const archive = join(scratch, "upstream.tar.gz");
    writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
    execFileSync("tar", ["-xzf", archive, "-C", scratch]);
    upstream = join(scratch, `opencode-${tag.replace(/^v/, "")}`);
  }

  // Build the upstream subset: every vendored path that exists upstream.
  const vendoredFiles = walk(vendored).filter(
    (f) => f !== "UPSTREAM.md" && !f.startsWith("patches/") && !f.endsWith(".tsbuildinfo"),
  );
  const subset = join(scratch, "subset");
  const upstreamMissing = [];
  for (const file of vendoredFiles) {
    const source = join(upstream, file);
    if (!existsSync(source)) {
      upstreamMissing.push(file);
      continue;
    }
    mkdirSync(dirname(join(subset, file)), { recursive: true });
    cpSync(source, join(subset, file));
  }

  // Git repo over the subset → overlay vendored → per-file diffs.
  const git = (cwd, ...rest) => execFileSync("git", ["-C", cwd, ...rest], { encoding: "utf8" });
  const work = join(scratch, "work");
  cpSync(subset, work, { recursive: true });
  git(work, "init", "-q");
  git(work, "config", "user.email", "poracode@vendor");
  git(work, "config", "user.name", "poracode");
  git(work, "config", "core.autocrlf", "false");
  git(work, "add", "-A");
  git(work, "commit", "-qm", "upstream");
  for (const file of vendoredFiles) {
    const target = join(work, file);
    if (existsSync(join(vendored, file))) {
      mkdirSync(dirname(target), { recursive: true });
      cpSync(join(vendored, file), target);
    } else rmSync(target, { force: true });
  }
  git(work, "add", "-A");
  const changed = git(work, "diff", "--cached", "--name-only")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (changed.length === 0) {
    console.log("no vendored differences — patch series would be empty");
  }
  rmSync(patchesDir, { recursive: true, force: true });
  mkdirSync(patchesDir, { recursive: true });
  changed.forEach((file, index) => {
    const diff = git(work, "diff", "--cached", "HEAD", "--", file);
    const name = `${String(index + 1).padStart(4, "0")}-${file.replaceAll("/", "_")}.patch`;
    writeFileSync(join(patchesDir, name), diff);
  });
  console.log(`wrote ${changed.length} patches to tui/opencode/patches/`);
  if (upstreamMissing.length)
    console.log(
      `note: ${upstreamMissing.length} vendored paths have no upstream counterpart (Poracode-only or upstream-removed):\n  ${upstreamMissing.join("\n  ")}`,
    );

  if (verify && changed.length > 0) {
    const check = join(scratch, "check");
    cpSync(subset, check, { recursive: true });
    for (const patch of readdirSync(patchesDir).sort())
      execFileSync("git", ["-C", check, "apply", join(patchesDir, patch)]);
    const diff = equalTree(check, vendored);
    // UPSTREAM.md and patches/ are vendored-only; exclude from comparison.
    diff.extra = diff.extra.filter((f) => f !== "UPSTREAM.md" && !f.startsWith("patches/"));
    if (diff.missing.length || diff.extra.length || diff.changed.length) {
      console.error("verification FAILED — patched tree diverges from vendored:");
      console.error(`  missing: ${diff.missing.join(", ") || "-"}`);
      console.error(`  extra: ${diff.extra.join(", ") || "-"}`);
      console.error(`  changed: ${diff.changed.join(", ") || "-"}`);
      process.exit(1);
    }
    console.log("verified: regenerated patches reproduce the vendored tree byte-for-byte");
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
