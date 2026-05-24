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
 * Currently registered:
 *   - claude: plugin.json, forward.mjs
 *   - codex: plugin.json, forward.mjs
 *   - cursor: plugin.json, forward.mjs
 *   - gemini: plugin.json, forward.mjs
 *   - copilot: plugin.json, forward.mjs
 *   - grok: plugin.json, forward.mjs
 *   - opencode: plugin.json, lightcode-status.mjs (in-process plugin, no forward.mjs)
 *
 * Plus a shared forwarder runtime under `_runtime/lightcode-hook-runtime.mjs`
 * that's deployed next to each `forward.mjs` at install time. Single source
 * of truth for the manifest read / postWithRetry / envelope plumbing across
 * all forwarder providers.
 *
 * The script is idempotent: each asset is only copied when missing or stale
 * (size/mtime mismatch).
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const destBase = join(repoRoot, "resources", "agent-plugins");

/** @type {ReadonlyArray<{ kind: string; assets: readonly string[]; srcDir: string }>} */
const PLUGINS = [
  {
    kind: "claude",
    assets: ["plugin.json", "forward.mjs"],
    srcDir: join(repoRoot, "src", "supervisor", "agents", "claude", "plugin"),
  },
  {
    kind: "codex",
    assets: ["plugin.json", "forward.mjs"],
    srcDir: join(repoRoot, "src", "supervisor", "agents", "codex", "plugin"),
  },
  {
    kind: "cursor",
    assets: ["plugin.json", "forward.mjs"],
    srcDir: join(repoRoot, "src", "supervisor", "agents", "cursor", "plugin"),
  },
  {
    kind: "gemini",
    assets: ["plugin.json", "forward.mjs"],
    srcDir: join(repoRoot, "src", "supervisor", "agents", "gemini", "plugin"),
  },
  {
    kind: "copilot",
    assets: ["plugin.json", "forward.mjs"],
    srcDir: join(repoRoot, "src", "supervisor", "agents", "copilot", "plugin"),
  },
  {
    kind: "grok",
    assets: ["plugin.json", "forward.mjs"],
    srcDir: join(repoRoot, "src", "supervisor", "agents", "grok", "plugin"),
  },
  {
    kind: "opencode",
    assets: ["plugin.json", "lightcode-status.mjs"],
    srcDir: join(repoRoot, "src", "supervisor", "agents", "opencode", "plugin"),
  },
];

const SHARED_RUNTIME = {
  src: join(
    repoRoot,
    "src",
    "supervisor",
    "agents",
    "plugin",
    "forward-runtime",
    "lightcode-hook-runtime.mjs",
  ),
  destRel: join("_runtime", "lightcode-hook-runtime.mjs"),
};

for (const plugin of PLUGINS) {
  stagePlugin(plugin);
}
stageSharedRuntime();

function stagePlugin({ kind, assets, srcDir }) {
  const destDir = join(destBase, kind);
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

function stageSharedRuntime() {
  if (!existsSync(SHARED_RUNTIME.src)) {
    throw new Error(`[prepare-agent-plugins] missing shared runtime source: ${SHARED_RUNTIME.src}`);
  }
  const dest = join(destBase, SHARED_RUNTIME.destRel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(SHARED_RUNTIME.src, dest);
  console.log(`[prepare-agent-plugins] _runtime -> ${dest}`);
}
