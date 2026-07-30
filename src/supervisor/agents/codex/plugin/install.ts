import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toWslUncPath } from "@/shared/wsl";
import type { AgentEnvContext } from "../../base";
import { buildAgentCommand, resolveWslHomeDirectoryAsync } from "../../base";
import { resolveAgentBinaryPath } from "../../binaryResolver";
import {
  FORWARD_RUNTIME_FILE,
  buildNativeHookCommandHeads,
  buildWslHookCommandHead,
  copyForwardRuntimeFile,
  copyPluginAssetsIfStale,
  createPluginSourceResolver,
  getNativeHookWrapperFilename,
  getNativePluginBaseDir,
  getWslPluginBaseDirs,
  hasNativeHookWrapper,
  isWslPluginContext,
  parseExistingHooksJson,
  readBundledPluginVersion,
  readPluginManifest,
  stagePluginAssetsToWsl,
  writeHooksJsonFile,
  writeNativeHookWrapper,
  type PluginManifest,
} from "../../plugin/installerBase";
import { resolveCodexHomeFromBase } from "../profile";
import { resolveCodexNativeExecutableForWindows } from "../windowsExecutable";

export interface CodexPluginPaths {
  pluginDir: string;
  forwardPath: string;
  nativeWrapperPath?: string;
  version: string;
}

const CODEX_HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "Stop",
] as const;

const PORACODE_FORWARD_RE =
  /agent-plugins(?:[/\\]+)codex(?:[/\\]+)(?:forward\.mjs|poracode-hook\.(?:sh|cmd|ps1))/;
const MANAGED_FORWARD_RE =
  /agent-plugins(?:[/\\]+)codex(?:[/\\]+)(?:forward\.mjs|(?:poracode|lightcode)-hook\.(?:sh|cmd|ps1))/;

const callerDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url ?? "file://"));

const resolveSourceDir = createPluginSourceResolver({
  kind: "codex",
  sourceEnvVar: "PORACODE_CODEX_PLUGIN_SOURCE",
  callerDir,
});

export function readBundledCodexPluginVersion(): string {
  return readBundledPluginVersion(resolveSourceDir);
}

function computeCodexPluginPaths(ctx?: AgentEnvContext): CodexPluginPaths {
  if (isWslPluginContext(ctx)) {
    const wsl = getWslPluginBaseDirs(ctx.wslDistro, "codex");
    if (!wsl) {
      return { pluginDir: "", forwardPath: "", version: "0.0.0" };
    }
    let version = "0.0.0";
    try {
      version = readPluginManifest(wsl.uncBase).version;
    } catch {
      // ignore
    }
    return {
      pluginDir: wsl.linuxBase,
      forwardPath: `${wsl.linuxBase}/forward.mjs`,
      version,
    };
  }
  const pluginDir = getNativePluginBaseDir("codex", ctx?.baseDir);
  let version = "0.0.0";
  try {
    version = readPluginManifest(pluginDir).version;
  } catch {
    // ignore
  }
  return {
    pluginDir,
    forwardPath: join(pluginDir, "forward.mjs"),
    nativeWrapperPath: join(pluginDir, getNativeHookWrapperFilename()),
    version,
  };
}

export function getCodexPluginPaths(ctx?: AgentEnvContext): CodexPluginPaths {
  return computeCodexPluginPaths(ctx);
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function pruneManagedHookGroups(groups: unknown): unknown[] {
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((group) => {
    if (!group || typeof group !== "object" || Array.isArray(group)) return [group];
    const hooks = (group as { hooks?: unknown }).hooks;
    if (!Array.isArray(hooks)) return [group];
    const retained = hooks.filter((hook) => {
      if (!hook || typeof hook !== "object") return true;
      const command = (hook as { command?: unknown }).command;
      return typeof command !== "string" || !MANAGED_FORWARD_RE.test(command);
    });
    if (retained.length === hooks.length) return [group];
    return retained.length > 0 ? [{ ...(group as Record<string, unknown>), hooks: retained }] : [];
  });
}

function buildPoracodeHookGroup(event: string, commandHead: string): Record<string, unknown> {
  const hook = { type: "command", command: `${commandHead} ${event}` };
  return event === "SessionStart" || event === "PreToolUse" || event === "PostToolUse"
    ? { matcher: "*", hooks: [hook] }
    : { hooks: [hook] };
}

export interface CodexHooksDocument extends Record<string, unknown> {
  hooks: Record<string, unknown[]>;
}

export function mergeCodexHooksDocument(
  existingParsed: unknown,
  commandHead: string,
): CodexHooksDocument {
  const document = recordOrEmpty(existingParsed);
  const hooksRoot = recordOrEmpty(document.hooks);
  for (const event of CODEX_HOOK_EVENTS) {
    hooksRoot[event] = [
      ...pruneManagedHookGroups(hooksRoot[event]),
      buildPoracodeHookGroup(event, commandHead),
    ];
  }
  return { ...document, hooks: hooksRoot as Record<string, unknown[]> };
}

export function removeManagedCodexHooksDocument(existingParsed: unknown): CodexHooksDocument {
  const document = recordOrEmpty(existingParsed);
  const hooksRoot = recordOrEmpty(document.hooks);
  for (const event of CODEX_HOOK_EVENTS) {
    if (!Array.isArray(hooksRoot[event])) continue;
    const retained = pruneManagedHookGroups(hooksRoot[event]);
    if (retained.length > 0) hooksRoot[event] = retained;
    else delete hooksRoot[event];
  }
  return { ...document, hooks: hooksRoot as Record<string, unknown[]> };
}

interface ResolvedCodexHome {
  runtimePath: string;
  readablePath: string;
}

function resolveNativeCodexHome(rawHomeDir?: string): ResolvedCodexHome {
  const nativeHome = homedir();
  const configuredHome = rawHomeDir ?? (process.env.CODEX_HOME?.trim() || undefined);
  const runtimePath = resolveCodexHomeFromBase(configuredHome, nativeHome, "native");
  return { runtimePath, readablePath: runtimePath };
}

function resolveWslCodexHome(
  distro: string,
  wslHome: string,
  rawHomeDir?: string,
): ResolvedCodexHome {
  const runtimePath = resolveCodexHomeFromBase(rawHomeDir, wslHome, "posix");
  return { runtimePath, readablePath: toWslUncPath(distro, runtimePath) };
}

async function resolveCodexHome(
  ctx: AgentEnvContext | undefined,
  rawHomeDir?: string,
  knownWslHome?: string,
): Promise<ResolvedCodexHome> {
  if (!isWslPluginContext(ctx)) return resolveNativeCodexHome(rawHomeDir);
  const wslHome = knownWslHome ?? (await resolveWslHomeDirectoryAsync(ctx.wslDistro));
  if (!wslHome) {
    throw new Error(`Unable to resolve the WSL home directory for ${ctx.wslDistro}.`);
  }
  return resolveWslCodexHome(ctx.wslDistro, wslHome, rawHomeDir);
}

export async function resolveCodexHooksPath(
  ctx?: AgentEnvContext,
  profileHomeDir?: string,
): Promise<string> {
  const home = await resolveCodexHome(ctx, profileHomeDir);
  return join(home.readablePath, "hooks.json");
}

function parseHooksDocument(hooksPath: string): unknown {
  const existing = parseExistingHooksJson(hooksPath);
  if (existing === null && existsSync(hooksPath)) {
    throw new Error(`Malformed Codex hooks file: ${hooksPath}`);
  }
  return existing;
}

function hasManagedHookForEveryEvent(existingParsed: unknown): boolean {
  const hooksRoot = recordOrEmpty(recordOrEmpty(existingParsed).hooks);
  return CODEX_HOOK_EVENTS.every((event) => {
    const groups = hooksRoot[event];
    return (
      Array.isArray(groups) &&
      groups.some((group) => {
        if (!group || typeof group !== "object") return false;
        const hooks = (group as { hooks?: unknown }).hooks;
        return (
          Array.isArray(hooks) &&
          hooks.some((hook) => {
            if (!hook || typeof hook !== "object") return false;
            const command = (hook as { command?: unknown }).command;
            return typeof command === "string" && PORACODE_FORWARD_RE.test(command);
          })
        );
      })
    );
  });
}

const MIN_CODEX_SEMVER = [0, 122, 0] as const;
const CODEX_HOOKS_FEATURE_RENAME_SEMVER = [0, 130, 0] as const;
const CODEX_GOALS_FEATURE_SEMVER = [0, 130, 0] as const;

export function parseCodexVersionLine(line: string): [number, number, number] | null {
  const m = /codex-cli\s+(\d+)\.(\d+)\.(\d+)/i.exec(line.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function semverGte(a: [number, number, number], b: readonly [number, number, number]): boolean {
  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[2] >= b[2];
}

/**
 * Probe `codex --version` on PATH. Returns null if unavailable or unparsable.
 *
 * On Windows the shared launch builder bypasses npm `.cmd` shims so probe
 * grandchildren do not create visible console windows.
 */
export function probeCodexCliSemver(): [number, number, number] | null {
  try {
    const windowsLocation = { kind: "windows" as const, path: homedir() };
    const resolvedCodexPath =
      process.platform === "win32" ? resolveAgentBinaryPath(windowsLocation, "codex") : undefined;
    const nativeCodexPath = resolveCodexNativeExecutableForWindows(resolvedCodexPath);
    const spec =
      process.platform === "win32"
        ? buildAgentCommand(
            windowsLocation,
            nativeCodexPath ?? resolvedCodexPath ?? "codex",
            ["--version"],
            nativeCodexPath ?? resolvedCodexPath,
          )
        : { command: "codex", args: ["--version"] };
    const out = execFileSync(spec.command, spec.args, {
      encoding: "utf8",
      timeout: 8000,
      windowsHide: true,
      ...(spec.cwd ? { cwd: spec.cwd } : {}),
      ...(spec.env ? { env: spec.env } : {}),
    });
    return parseCodexVersionLine(out);
  } catch {
    return null;
  }
}

export function isCodexSemverSupportedForHooks(v: [number, number, number] | null): boolean {
  if (!v) return false;
  return semverGte(v, MIN_CODEX_SEMVER);
}

export function isCodexSemverSupportedForGoals(v: [number, number, number] | null): boolean {
  if (!v) return false;
  return semverGte(v, CODEX_GOALS_FEATURE_SEMVER);
}

export function isCodexVersionSupportedForHooks(): boolean {
  return isCodexSemverSupportedForHooks(probeCodexCliSemver());
}

export function codexHooksFeatureFlagForSemver(v: [number, number, number] | null): string {
  return v && semverGte(v, CODEX_HOOKS_FEATURE_RENAME_SEMVER) ? "hooks" : "codex_hooks";
}

export interface InstallCodexPluginOptions {
  /**
   * Absolute path to the Node binary the staged hook command should use.
   *
   * - **WSL contexts:** required. Comes from `resolveNodeForDistro`.
   * - **Native contexts:** optional. When provided (preferred), the wrapper
   *   exec's the bare Node binary directly; otherwise it falls back to
   *   `ELECTRON_RUN_AS_NODE=1` against the bundled Electron binary.
   */
  resolvedNodePath?: string | undefined;
  /** Selected profile home. Omit for the base Codex home. */
  profileHomeDir?: string | undefined;
}

export async function installCodexPlugin(
  ctx?: AgentEnvContext,
  options?: InstallCodexPluginOptions,
): Promise<{ ok: true; paths: CodexPluginPaths; version: string } | { ok: false; reason: string }> {
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
          "WSL Codex plugin install requires a resolved node path; the adapter must call resolveNodeForDistro before installing.",
      };
    }
    return installCodexPluginWsl(
      ctx,
      sourceDir,
      manifest,
      options.resolvedNodePath,
      options.profileHomeDir,
    );
  }

  const paths = getCodexPluginPaths(ctx);
  const { pluginDir } = paths;
  mkdirSync(pluginDir, { recursive: true });
  copyPluginAssetsIfStale(sourceDir, pluginDir);
  copyForwardRuntimeFile(pluginDir);
  const wrapperPath = writeNativeHookWrapper(pluginDir, {
    ...(options?.resolvedNodePath ? { nodePath: options.resolvedNodePath } : {}),
  });

  try {
    const home = await resolveCodexHome(ctx, options?.profileHomeDir);
    const hooksPath = join(home.readablePath, "hooks.json");
    const merged = mergeCodexHooksDocument(
      parseHooksDocument(hooksPath),
      buildNativeHookCommandHeads(wrapperPath).command,
    );
    writeHooksJsonFile(hooksPath, merged);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }

  console.log(
    [
      `[supervisor] Codex hook plugin staged v${manifest.version}`,
      `  pluginDir: ${pluginDir}`,
    ].join("\n"),
  );

  return {
    ok: true,
    version: manifest.version,
    paths: { ...paths, version: manifest.version },
  };
}

async function installCodexPluginWsl(
  ctx: AgentEnvContext & { envKind: "wsl"; wslDistro: string },
  sourceDir: string,
  manifest: PluginManifest,
  resolvedNodePath: string,
  profileHomeDir?: string,
): Promise<{ ok: true; paths: CodexPluginPaths; version: string } | { ok: false; reason: string }> {
  const staged = stagePluginAssetsToWsl(ctx.wslDistro, sourceDir, "codex", {
    includeForwardRuntime: true,
  });
  if (!staged.ok) return staged;

  try {
    const home = await resolveCodexHome(ctx, profileHomeDir, staged.deploy.home);
    const hooksPath = join(home.readablePath, "hooks.json");
    const commandHead = buildWslHookCommandHead(
      resolvedNodePath,
      `${staged.linuxPluginDir}/forward.mjs`,
    );
    writeHooksJsonFile(
      hooksPath,
      mergeCodexHooksDocument(parseHooksDocument(hooksPath), commandHead),
    );
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }

  console.log(
    [
      `[supervisor] Codex hook plugin staged v${manifest.version} (wsl:${ctx.wslDistro})`,
      `  pluginDir: ${staged.linuxPluginDir}`,
    ].join("\n"),
  );

  return {
    ok: true,
    version: manifest.version,
    paths: {
      pluginDir: staged.linuxPluginDir,
      forwardPath: `${staged.linuxPluginDir}/forward.mjs`,
      version: manifest.version,
    },
  };
}

export async function isCodexPluginInstalled(
  ctx?: AgentEnvContext,
  profileHomeDir?: string,
): Promise<{ installed: boolean; version?: string }> {
  let hooksPath: string;
  try {
    hooksPath = await resolveCodexHooksPath(ctx, profileHomeDir);
  } catch {
    return { installed: false };
  }
  if (isWslPluginContext(ctx)) {
    const wsl = getWslPluginBaseDirs(ctx.wslDistro, "codex");
    if (!wsl) return { installed: false };
    return verifyCodexInstallAt(wsl.uncBase, hooksPath, "wsl");
  }
  return verifyCodexInstallAt(getNativePluginBaseDir("codex", ctx?.baseDir), hooksPath, "native");
}

export async function uninstallCodexPlugin(
  ctx?: AgentEnvContext,
  profileHomeDir?: string,
): Promise<void> {
  const hooksPath = await resolveCodexHooksPath(ctx, profileHomeDir);
  if (!existsSync(hooksPath)) return;
  writeHooksJsonFile(hooksPath, removeManagedCodexHooksDocument(parseHooksDocument(hooksPath)));
}

function verifyCodexInstallAt(
  readableDir: string,
  hooksPath: string,
  target: "native" | "wsl",
): { installed: boolean; version?: string } {
  if (!existsSync(join(readableDir, "plugin.json"))) return { installed: false };
  if (!existsSync(join(readableDir, "forward.mjs"))) return { installed: false };
  if (!existsSync(join(readableDir, FORWARD_RUNTIME_FILE))) return { installed: false };
  if (!hasNativeHookWrapper(readableDir, target)) return { installed: false };
  if (!hasManagedHookForEveryEvent(parseExistingHooksJson(hooksPath))) return { installed: false };
  try {
    const version = readPluginManifest(readableDir).version;
    return { installed: true, version };
  } catch {
    return { installed: false };
  }
}
