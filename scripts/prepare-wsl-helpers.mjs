/**
 * Stages every Node helper that we run *inside* a WSL distro into
 * `resources/wsl-helpers/` so electron-builder can bundle them as
 * extraResources. Five artefacts ride this pipeline:
 *
 *   1. `watcher.node` — @parcel/watcher Linux x64 native binding,
 *      downloaded via `npm pack`. Loaded by `bridge.mjs` for watch
 *      subscriptions.
 *   2. `bridge.mjs` — the in-distro server (hook ingress + /v1/fs/*
 *      + /v1/watch/*). Copied from `src/supervisor/wsl/bridge/bridge.mjs`.
 *   3. `mcp-probe.mjs` — self-contained MCP client used to verify workspace
 *      servers in the same distro where providers run.
 *   4. `mcp-filter.mjs` — same-environment MCP proxy that removes disabled tools.
 *   5. `cursor-sdk-worker.mjs` — isolated transport shell that dynamically
 *      imports a Cursor SDK installed inside the target distro.
 *
 * Idempotency: presence + non-zero size on `watcher.node` skips the
 * `npm pack` download. Other helpers are compared byte-for-byte before copy,
 * avoiding redundant writes without the stale-resource risk of size/mtime
 * heuristics.
 */

import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const PARCEL_WATCHER_PKG = "@parcel/watcher-linux-x64-glibc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const destDir = join(repoRoot, "resources", "wsl-helpers");

mkdirSync(destDir, { recursive: true });

stageWatcherBinary();
stageHookBridge();
stageMcpProbe();
stageMcpFilter();
stageCursorSdkWorker();

function stageWatcherBinary() {
  const dest = join(destDir, "watcher.node");
  if (existsSync(dest) && statSync(dest).size > 0) {
    console.log("[prepare-wsl-helpers] watcher.node already present, skipping");
    return;
  }

  const tmp = join(tmpdir(), `wsl-helpers-watcher-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });

  try {
    execSync(`npm pack ${PARCEL_WATCHER_PKG} --pack-destination .`, {
      cwd: tmp,
      stdio: "pipe",
    });

    const tgz = readdirSync(tmp).find((f) => f.endsWith(".tgz"));
    if (!tgz) {
      throw new Error(`Failed to download ${PARCEL_WATCHER_PKG}`);
    }

    execSync(`tar -xf "${tgz}"`, { cwd: tmp, stdio: "pipe" });

    const src = join(tmp, "package", "watcher.node");
    if (!existsSync(src)) {
      throw new Error("watcher.node not found in extracted package");
    }

    copyFileSync(src, dest);
    console.log(`[prepare-wsl-helpers] ${PARCEL_WATCHER_PKG} -> ${dest}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function stageHookBridge() {
  const src = join(repoRoot, "src", "supervisor", "wsl", "bridge", "bridge.mjs");
  if (!existsSync(src)) {
    throw new Error(`hook bridge source missing: ${src}`);
  }
  const dest = join(destDir, "bridge.mjs");
  copyIfChanged(src, dest, "bridge.mjs");
}

function stageMcpProbe() {
  const src = join(repoRoot, "dist", "main", "mcpProbeWorker.mjs");
  if (!existsSync(src)) {
    throw new Error(`MCP probe worker missing; run build:electron first: ${src}`);
  }
  assertSelfContainedWorker(src);
  const dest = join(destDir, "mcp-probe.mjs");
  copyIfChanged(src, dest, "mcpProbeWorker.mjs");
}

function stageMcpFilter() {
  const src = join(repoRoot, "dist", "main", "mcpToolFilterWorker.mjs");
  if (!existsSync(src)) {
    throw new Error(`MCP filter worker missing; run build:electron first: ${src}`);
  }
  assertSelfContainedWorker(src);
  const dest = join(destDir, "mcp-filter.mjs");
  copyIfChanged(src, dest, "mcpToolFilterWorker.mjs");
}

function stageCursorSdkWorker() {
  const src = join(repoRoot, "dist", "main", "cursorSdkWorker.mjs");
  if (!existsSync(src)) {
    throw new Error(`Cursor SDK worker missing; run build:electron first: ${src}`);
  }
  assertSelfContainedWorker(src, "Cursor SDK worker");
  const dest = join(destDir, "cursor-sdk-worker.mjs");
  copyIfChanged(src, dest, "cursorSdkWorker.mjs");
}

function copyIfChanged(src, dest, label) {
  if (existsSync(dest) && readFileSync(src).equals(readFileSync(dest))) {
    console.log(`[prepare-wsl-helpers] ${label} already current, skipping`);
    return;
  }
  copyFileSync(src, dest);
  console.log(`[prepare-wsl-helpers] ${label} -> ${dest}`);
}

function assertSelfContainedWorker(path, label = "MCP probe worker") {
  const source = readFileSync(path, "utf8");
  const imports = source.matchAll(/^import(?:[\s\S]*?\sfrom\s*)?["']([^"']+)["'];?$/gm);
  const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
  const external = [...imports].map((match) => match[1]).filter((name) => !builtins.has(name));
  if (external.length > 0) {
    throw new Error(`${label} is not self-contained: ${[...new Set(external)].join(", ")}`);
  }
}
