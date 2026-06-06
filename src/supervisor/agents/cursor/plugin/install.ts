import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toWslUncPath } from "@/shared/wsl";
import type { AgentEnvContext } from "../../base";
import { getCachedWslHomeDirectory } from "../../base";
import {
  FORWARD_RUNTIME_FILE,
  buildNativeHookCmdShellCommand,
  buildWslHookCommandHead,
  copyForwardRuntimeFile,
  copyPluginAssetsIfStale,
  createPluginSourceResolver,
  ctxCacheKey,
  getNativePluginBaseDir,
  getWslPluginBaseDirs,
  isWslPluginContext,
  memoByCtx,
  parseExistingHooksJson,
  readBundledPluginVersion,
  readPluginManifest,
  removeStagedPluginDir,
  stagePluginAssetsToWsl,
  verifyStagedPluginAt,
  writeHooksJsonFile,
  writeNativeHookWrapper,
  type PluginManifest,
} from "../../plugin/installerBase";

export interface CursorPluginPaths {
  /** Plugin staging dir holding `forward.mjs`, the runtime sibling, and the wrapper. */
  pluginDir: string;
  /**
   * Cursor's hooks.json file. Cursor only reads from `~/.cursor/hooks.json`
   * (or `<project>/.cursor/hooks.json`); `CURSOR_CONFIG_DIR` does NOT redirect
   * hook discovery, so we merge our managed entries into the user's global
   * file (Lightcode-managed entries are tagged by the staged command path and
   * pruned/replaced on every reinstall).
   */
  globalHooksPath: string;
}

interface CursorHookSpec {
  event: string;
  matcher?: string;
}

const CURSOR_HOOK_SPECS: ReadonlyArray<CursorHookSpec> = [
  { event: "sessionStart" },
  { event: "beforeSubmitPrompt" },
  { event: "preToolUse", matcher: "*" },
  { event: "postToolUse", matcher: "*" },
  { event: "stop" },
];

/** Cursor's hook timeout field is documented in seconds (not milliseconds). */
const CURSOR_HOOK_TIMEOUT_SECONDS = 5;

/**
 * Match any Lightcode-staged Cursor hook command in hooks.json. Covers both
 * the WSL shape (`forward.mjs` invoked via absolute node path) and native
 * (`lightcode-hook.{sh,cmd,ps1}` wrapper).
 */
const LIGHTCODE_FORWARD_RE =
  /agent-plugins(?:[/\\]+)cursor(?:[/\\]+)(?:forward\.mjs|lightcode-hook\.(?:sh|cmd|ps1))/;

const callerDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url ?? "file://"));

const resolveSourceDir = createPluginSourceResolver({
  kind: "cursor",
  sourceEnvVar: "LIGHTCODE_CURSOR_PLUGIN_SOURCE",
  callerDir,
});

export function readBundledCursorPluginVersion(): string {
  return readBundledPluginVersion(resolveSourceDir);
}

function nativeGlobalCursorDir(): string {
  return join(homedir(), ".cursor");
}

function wslGlobalCursorHooksPath(distro: string): string {
  const home = getCachedWslHomeDirectory(distro);
  return home ? `${home}/.cursor/hooks.json` : "";
}

function computeCursorPluginPaths(ctx?: AgentEnvContext): CursorPluginPaths {
  if (isWslPluginContext(ctx)) {
    const wsl = getWslPluginBaseDirs(ctx.wslDistro, "cursor");
    if (!wsl) return { pluginDir: "", globalHooksPath: "" };
    return {
      pluginDir: wsl.linuxBase,
      globalHooksPath: wslGlobalCursorHooksPath(ctx.wslDistro),
    };
  }
  return {
    pluginDir: getNativePluginBaseDir("cursor", ctx?.baseDir),
    globalHooksPath: join(nativeGlobalCursorDir(), "hooks.json"),
  };
}

const cursorPluginPathsMemo = memoByCtx(computeCursorPluginPaths, ctxCacheKey);

export function getCursorPluginPaths(ctx?: AgentEnvContext): CursorPluginPaths {
  return cursorPluginPathsMemo.call(ctx);
}

function pruneLightcodeEntries(entries: unknown): unknown[] {
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => {
    if (!entry || typeof entry !== "object") return true;
    const cmd = (entry as { command?: unknown }).command;
    return !(typeof cmd === "string" && LIGHTCODE_FORWARD_RE.test(cmd));
  });
}

function buildLightcodeEntry(spec: CursorHookSpec, commandHead: string): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    type: "command",
    command: `${commandHead} ${spec.event}`,
    timeout: CURSOR_HOOK_TIMEOUT_SECONDS,
  };
  if (spec.matcher !== undefined) entry.matcher = spec.matcher;
  return entry;
}

/**
 * Merge Lightcode Cursor hook entries into a parsed `hooks.json` document.
 * Preserves any non-Lightcode entries the user has authored. `commandHead` is
 * the entire pre-event portion of each hook command — for WSL it's
 * `'<absolute-node-path>' '<forward.mjs-path>'`, for native it's just
 * `"<wrapper-path>"`. Exported for unit tests.
 */
export function mergeCursorHooksDocument(
  existingParsed: unknown,
  commandHead: string,
): { version: number; hooks: Record<string, unknown[]> } {
  let hooksRoot: Record<string, unknown> = {};
  if (
    existingParsed &&
    typeof existingParsed === "object" &&
    "hooks" in existingParsed &&
    existingParsed.hooks &&
    typeof existingParsed.hooks === "object"
  ) {
    hooksRoot = { ...(existingParsed.hooks as Record<string, unknown>) };
  }

  for (const spec of CURSOR_HOOK_SPECS) {
    const prev = hooksRoot[spec.event];
    const pruned = pruneLightcodeEntries(prev);
    pruned.push(buildLightcodeEntry(spec, commandHead));
    hooksRoot[spec.event] = pruned;
  }

  return { version: 1, hooks: hooksRoot as Record<string, unknown[]> };
}

function removeCursorHooksDocument(existingParsed: unknown): {
  version: number;
  hooks: Record<string, unknown[]>;
} {
  let hooksRoot: Record<string, unknown> = {};
  if (
    existingParsed &&
    typeof existingParsed === "object" &&
    "hooks" in existingParsed &&
    existingParsed.hooks &&
    typeof existingParsed.hooks === "object"
  ) {
    hooksRoot = { ...(existingParsed.hooks as Record<string, unknown>) };
  }

  for (const spec of CURSOR_HOOK_SPECS) {
    const pruned = pruneLightcodeEntries(hooksRoot[spec.event]);
    if (pruned.length > 0) hooksRoot[spec.event] = pruned;
    else delete hooksRoot[spec.event];
  }

  return { version: 1, hooks: hooksRoot as Record<string, unknown[]> };
}

export interface InstallCursorPluginOptions {
  /**
   * Absolute path to the Node binary the staged hook command should use.
   *
   * - **WSL contexts:** required. Comes from `resolveNodeForDistro`.
   * - **Native contexts:** optional. When provided (preferred), the wrapper
   *   exec's the bare Node binary directly; otherwise it falls back to
   *   `ELECTRON_RUN_AS_NODE=1` against the bundled Electron binary.
   */
  resolvedNodePath?: string | undefined;
  /**
   * Override `~/.cursor` (or the WSL distro equivalent) when writing the
   * merged `hooks.json`. Tests pass a temp dir to avoid touching the user's
   * real Cursor config; production calls leave this undefined.
   */
  globalCursorDirOverride?: string;
}

export function installCursorPlugin(
  ctx?: AgentEnvContext,
  options?: InstallCursorPluginOptions,
): { ok: true; paths: CursorPluginPaths; version: string } | { ok: false; reason: string } {
  let sourceDir: string;
  try {
    sourceDir = resolveSourceDir();
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }

  let manifest: PluginManifest;
  try {
    manifest = readPluginManifest(sourceDir);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }

  if (isWslPluginContext(ctx)) {
    if (!options?.resolvedNodePath) {
      return {
        ok: false,
        reason:
          "WSL Cursor plugin install requires a resolved node path; the adapter must call resolveNodeForDistro before installing.",
      };
    }
    return installCursorPluginWsl(
      ctx.wslDistro,
      sourceDir,
      manifest,
      options.resolvedNodePath,
      options.globalCursorDirOverride,
    );
  }

  const pluginDir = getNativePluginBaseDir("cursor", ctx?.baseDir);
  mkdirSync(pluginDir, { recursive: true });
  copyPluginAssetsIfStale(sourceDir, pluginDir);
  copyForwardRuntimeFile(pluginDir);
  const wrapperPath = writeNativeHookWrapper(pluginDir, {
    ...(options?.resolvedNodePath ? { nodePath: options.resolvedNodePath } : {}),
  });

  const globalCursorDir = options?.globalCursorDirOverride ?? nativeGlobalCursorDir();
  const hooksPath = join(globalCursorDir, "hooks.json");
  const existing = parseExistingHooksJson(hooksPath);
  if (existing === null && existsSync(hooksPath)) {
    return { ok: false, reason: `malformed Cursor hooks.json at ${hooksPath} (invalid JSON)` };
  }

  const commandHead = buildNativeHookCmdShellCommand(wrapperPath);

  try {
    const merged = mergeCursorHooksDocument(existing, commandHead);
    writeHooksJsonFile(hooksPath, merged);
  } catch (error) {
    return {
      ok: false,
      reason: `failed to write Cursor hooks.json at ${hooksPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  console.log(
    `[supervisor] Cursor hook plugin staged v${manifest.version} at ${pluginDir}; merged hooks into ${hooksPath}`,
  );

  return {
    ok: true,
    version: manifest.version,
    paths: { pluginDir, globalHooksPath: hooksPath },
  };
}

function installCursorPluginWsl(
  distro: string,
  sourceDir: string,
  manifest: PluginManifest,
  resolvedNodePath: string,
  globalCursorDirOverride: string | undefined,
): { ok: true; paths: CursorPluginPaths; version: string } | { ok: false; reason: string } {
  const staged = stagePluginAssetsToWsl(distro, sourceDir, "cursor", {
    includeForwardRuntime: true,
  });
  if (!staged.ok) return staged;

  const linuxForward = `${staged.linuxPluginDir}/forward.mjs`;
  const linuxHooksPath = globalCursorDirOverride
    ? `${globalCursorDirOverride}/hooks.json`
    : `${staged.deploy.home}/.cursor/hooks.json`;
  const uncHooks = toWslUncPath(distro, linuxHooksPath);

  const existing = parseExistingHooksJson(uncHooks);
  if (existing === null && existsSync(uncHooks)) {
    return {
      ok: false,
      reason: `malformed Cursor hooks.json at ${linuxHooksPath} in wsl distro ${distro}`,
    };
  }

  const commandHead = buildWslHookCommandHead(resolvedNodePath, linuxForward);

  try {
    const merged = mergeCursorHooksDocument(existing, commandHead);
    writeHooksJsonFile(uncHooks, merged);
  } catch (error) {
    return {
      ok: false,
      reason: `failed to write hooks.json at ${linuxHooksPath} in wsl distro ${distro}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  console.log(
    `[supervisor] Cursor hook plugin staged v${manifest.version} in WSL distro ${distro} at ${staged.linuxPluginDir}; merged hooks into ${linuxHooksPath}`,
  );

  return {
    ok: true,
    version: manifest.version,
    paths: { pluginDir: staged.linuxPluginDir, globalHooksPath: linuxHooksPath },
  };
}

export function isCursorPluginInstalled(
  ctx?: AgentEnvContext,
): Promise<{ installed: boolean; version?: string }> {
  if (isWslPluginContext(ctx)) {
    const wsl = getWslPluginBaseDirs(ctx.wslDistro, "cursor");
    if (!wsl) return Promise.resolve({ installed: false });
    const hooksPath = toWslUncPath(ctx.wslDistro, wslGlobalCursorHooksPath(ctx.wslDistro));
    return Promise.resolve(verifyCursorInstallAt(wsl.uncBase, "wsl", hooksPath));
  }
  const hooksPath = join(nativeGlobalCursorDir(), "hooks.json");
  return Promise.resolve(
    verifyCursorInstallAt(getNativePluginBaseDir("cursor", ctx?.baseDir), "native", hooksPath),
  );
}

export function uninstallCursorPlugin(ctx?: AgentEnvContext): void {
  const hooksPath = isWslPluginContext(ctx)
    ? toWslUncPath(ctx.wslDistro, wslGlobalCursorHooksPath(ctx.wslDistro))
    : join(nativeGlobalCursorDir(), "hooks.json");
  const existing = parseExistingHooksJson(hooksPath);
  if (existing !== null || existsSync(hooksPath)) {
    writeHooksJsonFile(hooksPath, removeCursorHooksDocument(existing));
  }
  removeStagedPluginDir("cursor", ctx);
}

function hooksJsonHasLightcodeEntry(hooksPath: string): boolean {
  if (!existsSync(hooksPath)) return false;
  try {
    const doc = JSON.parse(readFileSync(hooksPath, "utf8")) as { hooks?: Record<string, unknown> };
    if (!doc.hooks) return false;
    for (const spec of CURSOR_HOOK_SPECS) {
      const entries = doc.hooks[spec.event];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!entry || typeof entry !== "object") continue;
        const cmd = (entry as { command?: string }).command;
        if (typeof cmd === "string" && LIGHTCODE_FORWARD_RE.test(cmd)) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

const CURSOR_VERIFY_ASSETS = ["plugin.json", "forward.mjs", FORWARD_RUNTIME_FILE] as const;

function verifyCursorInstallAt(
  readableDir: string,
  target: "native" | "wsl",
  hooksPath: string,
): { installed: boolean; version?: string } {
  return verifyStagedPluginAt(readableDir, target, {
    assets: CURSOR_VERIFY_ASSETS,
    extraCheck: () => hooksJsonHasLightcodeEntry(hooksPath),
  });
}
