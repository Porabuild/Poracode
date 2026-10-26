#!/usr/bin/env bun
/**
 * Sync the vendored TUI to a new upstream tag.
 *
 *   bun scripts/sync-tui-upstream.mjs --tag vX.Y.Z [--upstream <dir>]
 *
 * Fetches the tag, rebuilds the vendored subset from the upstream files that
 * still exist, applies `tui/opencode/patches/*.patch`, and reports:
 *   - patches that no longer apply (written as <name>.rej beside the series)
 *   - vendored paths upstream removed
 *   - upstream files the slice never picked up that now exist (new content is
 *     NOT adopted — extend the subset deliberately)
 *
 * On success the refreshed tree REPLACES tui/opencode/packages content; run
 * `bun install --cwd tui` + the TUI gates after.
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
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
const tag = flag("tag");
const upstreamDir = flag("upstream");
const apply = args.includes("--apply");
if (!tag && !upstreamDir) {
  console.error("usage: sync-tui-upstream.mjs --tag vX.Y.Z [--upstream <dir>] [--apply]");
  process.exit(1);
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

const scratch = mkdtempSync(join(tmpdir(), "tui-sync-"));
try {
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

  const vendoredFiles = walk(vendored).filter(
    (f) => f !== "UPSTREAM.md" && !f.startsWith("patches/"),
  );
  const next = join(scratch, "next");
  const removedUpstream = [];
  const keptLocalOnly = [];
  for (const file of vendoredFiles) {
    const source = join(upstream, file);
    if (!existsSync(source)) {
      removedUpstream.push(file);
      continue;
    }
    mkdirSync(dirname(join(next, file)), { recursive: true });
    cpSync(source, join(next, file));
  }

  // Paths upstream added inside the slice's packages are reported, not adopted.
  const sliceRoots = [...new Set(vendoredFiles.map((f) => f.split("/").slice(0, 2).join("/")))];
  const upstreamFiles = walk(upstream).filter(
    (f) =>
      sliceRoots.some((root) => f.startsWith(`${root}/`)) &&
      !f.includes("/test/") &&
      !f.endsWith(".md"),
  );
  const upstreamAdded = upstreamFiles.filter((f) => !vendoredFiles.includes(f));

  // Apply the patch series onto the fresh subset.
  const rejected = [];
  if (existsSync(patchesDir)) {
    for (const patch of readdirSync(patchesDir).sort()) {
      const file = join(patchesDir, patch);
      try {
        execFileSync("git", ["-C", next, "apply", file], { stdio: "pipe" });
      } catch {
        rejected.push(patch);
        // Reproduce the failure verbosely: git apply --reject writes .rej files.
        try {
          execFileSync("git", ["-C", next, "apply", "--reject", file], { stdio: "pipe" });
        } catch {
          /* best effort */
        }
      }
    }
  }

  console.log(`upstream ${tag}: ${vendoredFiles.length - removedUpstream.length} files refreshed`);
  if (removedUpstream.length)
    console.log(
      `upstream removed ${removedUpstream.length} vendored paths (kept local copies; review):\n  ${removedUpstream.join("\n  ")}`,
    );
  if (rejected.length)
    console.log(
      `${rejected.length} patches CONFLICTED (see *.rej under the sync dir):\n  ${rejected.join("\n  ")}`,
    );
  if (upstreamAdded.length)
    console.log(
      `upstream added ${upstreamAdded.length} files inside the sliced packages (not adopted; review the slice):\n  ${upstreamAdded.slice(0, 30).join("\n  ")}${upstreamAdded.length > 30 ? "\n  …" : ""}`,
    );

  if (apply && rejected.length === 0) {
    // Local-only files (no upstream counterpart) carry over verbatim.
    for (const file of vendoredFiles) {
      if (removedUpstream.includes(file)) continue;
      if (!existsSync(join(upstream, file))) keptLocalOnly.push(file);
    }
    for (const file of keptLocalOnly) {
      mkdirSync(dirname(join(next, file)), { recursive: true });
      cpSync(join(vendored, file), join(next, file));
    }
    // Swap the vendored tree's packages content (preserving UPSTREAM.md + patches/).
    for (const entry of readdirSync(vendored)) {
      if (entry === "UPSTREAM.md" || entry === "patches" || entry === "LICENSE") continue;
      rmSync(join(vendored, entry), { recursive: true, force: true });
    }
    for (const entry of readdirSync(next))
      cpSync(join(next, entry), join(vendored, entry), { recursive: true });
    console.log("vendored tree updated — regenerate the patch series and refresh UPSTREAM.md");
  } else if (apply) {
    console.log("--apply skipped: resolve patch conflicts first (dir kept: " + next + ")");
  } else {
    console.log(`dry run — staged at ${next} (pass --apply to write the vendored tree)`);
  }
} finally {
  if (!apply) rmSync(scratch, { recursive: true, force: true });
}
