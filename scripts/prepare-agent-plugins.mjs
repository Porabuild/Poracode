/**
 * Stages agent CLI hook plugin assets that must exist as real files on disk
 * (i.e. outside the electron asar, reachable by the agent's own child
 * processes). Mirrors the `prepare-wsl-helpers` pattern used for `bridge.mjs`
 * + `watcher.node`.
 *
 * In dev the supervisor resolves plugin assets directly from `src/…/plugin/`
 * via a path relative to `dist/main/supervisor.cjs`. In packaged builds the
 * `src/` tree is not included, so electron-builder must bundle these assets
 * as `extraResources` (kept out of `app.asar`) under
 * `<resources>/agent-plugins/<kind>/`. `resolveSourceDir()` in
 * `install.ts` checks `process.resourcesPath/agent-plugins/<kind>` first.
 *
 * Provider assets are discovered from
 * `src/supervisor/agents/<kind>/plugin/`: a directory participates when it
 * contains `plugin.json`, and must contain exactly one supported runtime asset
 * (`forward.mjs`, or OpenCode's in-process `poracode-status.mjs`). This keeps
 * packaging registration beside the provider instead of duplicating a list in
 * this script.
 *
 * Plus a shared forwarder runtime under `_runtime/poracode-hook-runtime.mjs`
 * that's deployed next to each `forward.mjs` at install time. Single source
 * of truth for the manifest read / postWithRetry / envelope plumbing across
 * all forwarder providers.
 *
 * The script is idempotent: each asset is compared byte-for-byte before it is
 * copied, so repeated dev starts avoid writes without leaving stale content.
 */

import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "../src/shared/atomicFile.ts";
import { readBoundedRuntimeFileSync } from "../src/shared/readBoundedRuntimeFile.ts";
import {
  discoverAgentPluginSources,
  resolveSharedForwardRuntime,
} from "../src/shared/agentPluginAssetSources.ts";
export {
  discoverAgentPluginSources,
  resolveSharedForwardRuntime,
} from "../src/shared/agentPluginAssetSources.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const agentsDir = join(repoRoot, "src", "supervisor", "agents");
const destBase = join(repoRoot, "resources", "agent-plugins");
const MAX_ASSET_BYTES = 8 * 1024 * 1024;

/**
 * @param {{ sourceAgentsDir: string; destinationBase: string }} options
 */
export function stageAgentPlugins({ sourceAgentsDir, destinationBase }) {
  const inside = (parent, child) => {
    const path = relative(resolve(parent), resolve(child));
    return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
  };
  if (inside(sourceAgentsDir, destinationBase) || inside(destinationBase, sourceAgentsDir)) {
    throw new Error("Agent plugin source and owned staging roots must not overlap.");
  }
  // Lexical paths do not detect a symlinked parent. Resolve the nearest existing
  // ancestor of each root before any mkdir, copy or prune so a destination alias
  // can never make cleanup operate on the source tree.
  const realpathOfNearestAncestor = (path) => {
    let current = resolve(path);
    const missing = [];
    while (!existsSync(current)) {
      missing.unshift(basename(current));
      const parent = dirname(current);
      if (parent === current) return current;
      current = parent;
    }
    return resolve(realpathSync.native(current), ...missing);
  };
  if (
    inside(
      realpathOfNearestAncestor(sourceAgentsDir),
      realpathOfNearestAncestor(destinationBase),
    ) ||
    inside(realpathOfNearestAncestor(destinationBase), realpathOfNearestAncestor(sourceAgentsDir))
  ) {
    throw new Error("Agent plugin source and owned staging roots must not overlap physically.");
  }
  if (existsSync(destinationBase) && lstatSync(destinationBase).isSymbolicLink()) {
    throw new Error("Agent plugin staging root must not be a symbolic link.");
  }
  const inspectStage = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink())
        throw new Error("Agent plugin staging cannot follow symbolic links.");
      if (stat.isDirectory()) inspectStage(path);
      else if (!stat.isFile()) throw new Error("Agent plugin staging entry is not a regular file.");
    }
  };
  if (existsSync(destinationBase)) inspectStage(destinationBase);
  const plugins = discoverAgentPluginSources(sourceAgentsDir);
  const sharedRuntime = resolveSharedForwardRuntime(sourceAgentsDir);
  for (const plugin of plugins) {
    stagePlugin(plugin, destinationBase);
  }
  stageSharedRuntime(sharedRuntime, destinationBase);
  const expected = new Set([
    ...plugins.flatMap((plugin) => plugin.assets.map((asset) => join(plugin.kind, asset))),
    sharedRuntime.destRel,
  ]);
  // This destination is app-owned build output, never an installed user plugin
  // directory. Retained removed packages would fail the new resource declaration.
  const prune = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isDirectory()) {
        prune(path);
        if (readdirSync(path).length === 0) rmSync(path, { recursive: true });
      } else if (!expected.has(relative(destinationBase, path))) rmSync(path);
    }
  };
  prune(destinationBase);
}

function stagePlugin({ kind, assets, srcDir }, destinationBase) {
  const destDir = join(destinationBase, kind);
  mkdirSync(destDir, { recursive: true });

  for (const asset of assets) {
    const src = join(srcDir, asset);
    if (!existsSync(src)) {
      throw new Error(`[prepare-agent-plugins] missing ${kind} asset: ${src}`);
    }
    const dest = join(destDir, asset);

    copyIfChanged(src, dest, `${kind}/${asset}`);
  }
}

function stageSharedRuntime(sharedRuntime, destinationBase) {
  const dest = join(destinationBase, sharedRuntime.destRel);
  mkdirSync(dirname(dest), { recursive: true });
  copyIfChanged(sharedRuntime.src, dest, "_runtime");
}

function copyIfChanged(src, dest, label) {
  const sourceStat = lstatSync(src);
  if (!sourceStat.isFile()) throw new Error("Agent plugin source is not a regular file.");
  const bytes = readBoundedRuntimeFileSync(src, MAX_ASSET_BYTES);
  if (existsSync(dest) && bytes.equals(readBoundedRuntimeFileSync(dest, MAX_ASSET_BYTES))) {
    console.log(`[prepare-agent-plugins] ${label} already current, skipping`);
    return;
  }
  // Do not reopen the source or destination through copyFile after admission.
  // A concurrently replaced FIFO cannot make the final asset write block.
  writeFileAtomic(dest, bytes, { mode: sourceStat.mode & 0o777 });
  console.log(`[prepare-agent-plugins] ${label} -> ${dest}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  stageAgentPlugins({ sourceAgentsDir: agentsDir, destinationBase: destBase });
}
