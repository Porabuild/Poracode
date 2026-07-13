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
 * The script is idempotent: every small asset is refreshed on each run, so a
 * partial restage or same-size edit cannot leave stale packaged content.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const agentsDir = join(repoRoot, "src", "supervisor", "agents");
const destBase = join(repoRoot, "resources", "agent-plugins");
const PROVIDER_RUNTIME_ASSETS = ["forward.mjs", "poracode-status.mjs"];

/**
 * @typedef {{ kind: string; assets: readonly string[]; srcDir: string }} AgentPluginSource
 */

/**
 * Discover provider plugin sources in stable kind order.
 *
 * @param {string} sourceAgentsDir
 * @returns {AgentPluginSource[]}
 */
export function discoverAgentPluginSources(sourceAgentsDir) {
  return readdirSync(sourceAgentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ kind: entry.name, srcDir: join(sourceAgentsDir, entry.name, "plugin") }))
    .filter(({ srcDir }) => existsSync(join(srcDir, "plugin.json")))
    .map(({ kind, srcDir }) => {
      const runtimeAssets = PROVIDER_RUNTIME_ASSETS.filter((asset) =>
        existsSync(join(srcDir, asset)),
      );
      if (runtimeAssets.length !== 1) {
        throw new Error(
          `[prepare-agent-plugins] ${kind} must provide exactly one runtime asset ` +
            `(${PROVIDER_RUNTIME_ASSETS.join(" or ")}): ${srcDir}`,
        );
      }
      return { kind, assets: ["plugin.json", runtimeAssets[0]], srcDir };
    })
    .sort((a, b) => a.kind.localeCompare(b.kind));
}

/**
 * Resolve and validate the shared runtime copied beside every forwarder.
 *
 * @param {string} sourceAgentsDir
 */
export function resolveSharedForwardRuntime(sourceAgentsDir) {
  const runtime = {
    src: join(sourceAgentsDir, "plugin", "forward-runtime", "poracode-hook-runtime.mjs"),
    destRel: join("_runtime", "poracode-hook-runtime.mjs"),
  };
  if (!existsSync(runtime.src)) {
    throw new Error(`[prepare-agent-plugins] missing shared runtime source: ${runtime.src}`);
  }
  return runtime;
}

/**
 * @param {{ sourceAgentsDir: string; destinationBase: string }} options
 */
export function stageAgentPlugins({ sourceAgentsDir, destinationBase }) {
  const plugins = discoverAgentPluginSources(sourceAgentsDir);
  const sharedRuntime = resolveSharedForwardRuntime(sourceAgentsDir);
  for (const plugin of plugins) {
    stagePlugin(plugin, destinationBase);
  }
  stageSharedRuntime(sharedRuntime, destinationBase);
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

    // Always copy — size+mtime heuristics can falsely skip after partial
    // restages or same-size edits (matches the bug we fixed for bridge.mjs).
    // Plugin assets are small; the copy is <1ms.
    copyFileSync(src, dest);
    console.log(`[prepare-agent-plugins] ${kind}/${asset} -> ${dest}`);
  }
}

function stageSharedRuntime(sharedRuntime, destinationBase) {
  const dest = join(destinationBase, sharedRuntime.destRel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(sharedRuntime.src, dest);
  console.log(`[prepare-agent-plugins] _runtime -> ${dest}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  stageAgentPlugins({ sourceAgentsDir: agentsDir, destinationBase: destBase });
}
