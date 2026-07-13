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

/**
 * Command Code plugin installer.
 *
 * Command Code has a Claude-Code-compatible hook system but, unlike Claude, no
 * `--settings <path>` flag — hooks are only read from `~/.commandcode/
 * settings.json` (user) or `<project>/.commandcode/settings.json`. We therefore
 * MERGE our managed hook entries into the user's global `settings.json`,
 * preserving every other key the user has authored. User-source hooks are
 * auto-trusted by the CLI (no `trusted-hooks.json` fingerprint prompt), so a
 * merged install runs headlessly.
 *
 * Poracode-managed entries are tagged by the staged command path
 * (`PORACODE_FORWARD_RE`) and pruned/replaced on every reinstall and removed
 * on uninstall, so the user's own hooks are never clobbered.
 */

export interface CommandCodePluginPaths {
  /** Plugin staging dir holding `forward.mjs`, the runtime sibling, and the wrapper. */
  pluginDir: string;
  /** The user `~/.commandcode/settings.json` we merge managed hooks into. */
  globalSettingsPath: string;
}

interface CommandCodeHookSpec {
  event: string;
}

/**
 * The three events Command Code validates. `Stop` is the authoritative
 * turn-finished (idle) edge; the tool events corroborate `working`.
 */
const COMMANDCODE_HOOK_SPECS: ReadonlyArray<CommandCodeHookSpec> = [
  { event: "PreToolUse" },
  { event: "PostToolUse" },
  { event: "Stop" },
];

/**
 * Match any Poracode-staged Command Code hook command. Covers both the WSL
 * shape (`forward.mjs` invoked via absolute node path) and native
 * (`poracode-hook.{sh,cmd,ps1}` wrapper).
 */
const PORACODE_FORWARD_RE =
  /agent-plugins(?:[/\\]+)commandcode(?:[/\\]+)(?:forward\.mjs|poracode-hook\.(?:sh|cmd|ps1))/;
const MANAGED_FORWARD_RE =
  /agent-plugins(?:[/\\]+)commandcode(?:[/\\]+)(?:forward\.mjs|(?:poracode|lightcode)-hook\.(?:sh|cmd|ps1))/;

const callerDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url ?? "file://"));

const resolveSourceDir = createPluginSourceResolver({
  kind: "commandcode",
  sourceEnvVar: "PORACODE_COMMANDCODE_PLUGIN_SOURCE",
  callerDir,
});

export function readBundledCommandCodePluginVersion(): string {
  return readBundledPluginVersion(resolveSourceDir);
}

function nativeGlobalCommandCodeDir(): string {
  return join(homedir(), ".commandcode");
}

function wslGlobalCommandCodeSettingsPath(distro: string): string {
  const home = getCachedWslHomeDirectory(distro);
  return home ? `${home}/.commandcode/settings.json` : "";
}

function computeCommandCodePluginPaths(ctx?: AgentEnvContext): CommandCodePluginPaths {
  if (isWslPluginContext(ctx)) {
    const wsl = getWslPluginBaseDirs(ctx.wslDistro, "commandcode");
    if (!wsl) return { pluginDir: "", globalSettingsPath: "" };
    return {
      pluginDir: wsl.linuxBase,
      globalSettingsPath: wslGlobalCommandCodeSettingsPath(ctx.wslDistro),
    };
  }
  return {
    pluginDir: getNativePluginBaseDir("commandcode", ctx?.baseDir),
    globalSettingsPath: join(nativeGlobalCommandCodeDir(), "settings.json"),
  };
}

const commandCodePluginPathsMemo = memoByCtx(computeCommandCodePluginPaths, ctxCacheKey);

export function getCommandCodePluginPaths(ctx?: AgentEnvContext): CommandCodePluginPaths {
  return commandCodePluginPathsMemo.call(ctx);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

/** True when a hook entry's nested `hooks[].command` points at our staged forwarder. */
function entryMatchesForwarder(entry: unknown, pattern: RegExp): boolean {
  if (!entry || typeof entry !== "object") return false;
  const hooks = (entry as { hooks?: unknown }).hooks;
  if (!Array.isArray(hooks)) return false;
  return hooks.some(
    (h) =>
      h &&
      typeof h === "object" &&
      typeof (h as { command?: unknown }).command === "string" &&
      pattern.test((h as { command: string }).command),
  );
}

function prunePoracodeEntries(entries: unknown): unknown[] {
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => !entryMatchesForwarder(entry, MANAGED_FORWARD_RE));
}

/** Command Code's nested hook entry: `{ hooks: [{ type: "command", command }] }`. */
function buildPoracodeEntry(
  spec: CommandCodeHookSpec,
  commandHead: string,
): Record<string, unknown> {
  return { hooks: [{ type: "command", command: `${commandHead} ${spec.event}` }] };
}

/**
 * Merge Poracode hook entries into a parsed `settings.json` document,
 * preserving every other key (and any non-Poracode hooks). `commandHead` is
 * the pre-event portion of the hook command. Exported for unit tests.
 */
export function mergeCommandCodeSettings(
  existingParsed: unknown,
  commandHead: string,
): Record<string, unknown> {
  const settings = asObject(existingParsed);
  const hooksRoot = asObject(settings.hooks);
  for (const spec of COMMANDCODE_HOOK_SPECS) {
    const pruned = prunePoracodeEntries(hooksRoot[spec.event]);
    pruned.push(buildPoracodeEntry(spec, commandHead));
    hooksRoot[spec.event] = pruned;
  }
  settings.hooks = hooksRoot;
  return settings;
}

/**
 * Remove only Poracode-managed hook entries from a parsed `settings.json`,
 * leaving the user's other settings and hooks intact. Exported for unit tests.
 */
export function removeCommandCodeHooks(existingParsed: unknown): Record<string, unknown> {
  const settings = asObject(existingParsed);
  const hooksRoot = asObject(settings.hooks);
  for (const spec of COMMANDCODE_HOOK_SPECS) {
    const pruned = prunePoracodeEntries(hooksRoot[spec.event]);
    if (pruned.length > 0) hooksRoot[spec.event] = pruned;
    else delete hooksRoot[spec.event];
  }
  if (Object.keys(hooksRoot).length === 0) delete settings.hooks;
  else settings.hooks = hooksRoot;
  return settings;
}

export interface InstallCommandCodePluginOptions {
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
   * Override `~/.commandcode` (or the WSL distro equivalent) when writing the
   * merged `settings.json`. Tests pass a temp dir to avoid touching the user's
   * real config; production calls leave this undefined.
   */
  globalCommandCodeDirOverride?: string;
}

export function installCommandCodePlugin(
  ctx?: AgentEnvContext,
  options?: InstallCommandCodePluginOptions,
): { ok: true; paths: CommandCodePluginPaths; version: string } | { ok: false; reason: string } {
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
          "WSL Command Code plugin install requires a resolved node path; the adapter must call resolveNodeForDistro before installing.",
      };
    }
    return installCommandCodePluginWsl(
      ctx.wslDistro,
      sourceDir,
      manifest,
      options.resolvedNodePath,
      options.globalCommandCodeDirOverride,
    );
  }

  const pluginDir = getNativePluginBaseDir("commandcode", ctx?.baseDir);
  mkdirSync(pluginDir, { recursive: true });
  copyPluginAssetsIfStale(sourceDir, pluginDir);
  copyForwardRuntimeFile(pluginDir);
  const wrapperPath = writeNativeHookWrapper(pluginDir, {
    ...(options?.resolvedNodePath ? { nodePath: options.resolvedNodePath } : {}),
  });

  const globalDir = options?.globalCommandCodeDirOverride ?? nativeGlobalCommandCodeDir();
  const settingsPath = join(globalDir, "settings.json");
  const existing = parseExistingHooksJson(settingsPath);
  if (existing === null && existsSync(settingsPath)) {
    return {
      ok: false,
      reason: `malformed Command Code settings.json at ${settingsPath} (invalid JSON)`,
    };
  }

  const commandHead = buildNativeHookCmdShellCommand(wrapperPath);

  try {
    writeHooksJsonFile(settingsPath, mergeCommandCodeSettings(existing, commandHead));
  } catch (error) {
    return {
      ok: false,
      reason: `failed to write Command Code settings.json at ${settingsPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  console.log(
    `[supervisor] Command Code hook plugin staged v${manifest.version} at ${pluginDir}; merged hooks into ${settingsPath}`,
  );

  return {
    ok: true,
    version: manifest.version,
    paths: { pluginDir, globalSettingsPath: settingsPath },
  };
}

function installCommandCodePluginWsl(
  distro: string,
  sourceDir: string,
  manifest: PluginManifest,
  resolvedNodePath: string,
  globalCommandCodeDirOverride: string | undefined,
): { ok: true; paths: CommandCodePluginPaths; version: string } | { ok: false; reason: string } {
  const staged = stagePluginAssetsToWsl(distro, sourceDir, "commandcode", {
    includeForwardRuntime: true,
  });
  if (!staged.ok) return staged;

  const linuxForward = `${staged.linuxPluginDir}/forward.mjs`;
  const linuxSettingsPath = globalCommandCodeDirOverride
    ? `${globalCommandCodeDirOverride}/settings.json`
    : `${staged.deploy.home}/.commandcode/settings.json`;
  const uncSettings = toWslUncPath(distro, linuxSettingsPath);

  const existing = parseExistingHooksJson(uncSettings);
  if (existing === null && existsSync(uncSettings)) {
    return {
      ok: false,
      reason: `malformed Command Code settings.json at ${linuxSettingsPath} in wsl distro ${distro}`,
    };
  }

  const commandHead = buildWslHookCommandHead(resolvedNodePath, linuxForward);

  try {
    writeHooksJsonFile(uncSettings, mergeCommandCodeSettings(existing, commandHead));
  } catch (error) {
    return {
      ok: false,
      reason: `failed to write settings.json at ${linuxSettingsPath} in wsl distro ${distro}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  console.log(
    `[supervisor] Command Code hook plugin staged v${manifest.version} in WSL distro ${distro} at ${staged.linuxPluginDir}; merged hooks into ${linuxSettingsPath}`,
  );

  return {
    ok: true,
    version: manifest.version,
    paths: { pluginDir: staged.linuxPluginDir, globalSettingsPath: linuxSettingsPath },
  };
}

export function isCommandCodePluginInstalled(
  ctx?: AgentEnvContext,
): Promise<{ installed: boolean; version?: string }> {
  if (isWslPluginContext(ctx)) {
    const wsl = getWslPluginBaseDirs(ctx.wslDistro, "commandcode");
    if (!wsl) return Promise.resolve({ installed: false });
    const settingsPath = toWslUncPath(
      ctx.wslDistro,
      wslGlobalCommandCodeSettingsPath(ctx.wslDistro),
    );
    return Promise.resolve(verifyCommandCodeInstallAt(wsl.uncBase, "wsl", settingsPath));
  }
  const settingsPath = join(nativeGlobalCommandCodeDir(), "settings.json");
  return Promise.resolve(
    verifyCommandCodeInstallAt(
      getNativePluginBaseDir("commandcode", ctx?.baseDir),
      "native",
      settingsPath,
    ),
  );
}

export function uninstallCommandCodePlugin(ctx?: AgentEnvContext): void {
  const settingsPath = isWslPluginContext(ctx)
    ? toWslUncPath(ctx.wslDistro, wslGlobalCommandCodeSettingsPath(ctx.wslDistro))
    : join(nativeGlobalCommandCodeDir(), "settings.json");
  const existing = parseExistingHooksJson(settingsPath);
  if (existing !== null || existsSync(settingsPath)) {
    writeHooksJsonFile(settingsPath, removeCommandCodeHooks(existing));
  }
  removeStagedPluginDir("commandcode", ctx);
}

function settingsJsonHasPoracodeEntry(settingsPath: string): boolean {
  if (!existsSync(settingsPath)) return false;
  try {
    const doc = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      hooks?: Record<string, unknown>;
    };
    if (!doc.hooks || typeof doc.hooks !== "object") return false;
    for (const spec of COMMANDCODE_HOOK_SPECS) {
      const entries = doc.hooks[spec.event];
      if (!Array.isArray(entries)) continue;
      if (entries.some((entry) => entryMatchesForwarder(entry, PORACODE_FORWARD_RE))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

const COMMANDCODE_VERIFY_ASSETS = ["plugin.json", "forward.mjs", FORWARD_RUNTIME_FILE] as const;

function verifyCommandCodeInstallAt(
  readableDir: string,
  target: "native" | "wsl",
  settingsPath: string,
): { installed: boolean; version?: string } {
  return verifyStagedPluginAt(readableDir, target, {
    assets: COMMANDCODE_VERIFY_ASSETS,
    extraCheck: () => settingsJsonHasPoracodeEntry(settingsPath),
  });
}
