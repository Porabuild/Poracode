import { execFileSync } from "node:child_process";
import {
  copyFileSync as fsCopyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toWslUncPath } from "@/shared/wsl";
import type { AgentEnvContext } from "../../base";
import { buildAgentCommand, execInWsl, quotePosixShellArg } from "../../base";
import { resolveAgentBinaryPath } from "../../binaryResolver";
import {
  FORWARD_RUNTIME_FILE,
  buildNativeHookCommandHeads,
  copyForwardRuntimeFile,
  copyPluginAssetsIfStale,
  createPluginSourceResolver,
  ctxCacheKey,
  ensureNativeStateLink,
  getNativePluginBaseDir,
  getWslPluginBaseDirs,
  hasNativeHookWrapper,
  isWslPluginContext,
  memoByCtx,
  parseExistingHooksJson,
  readBundledPluginVersion,
  readPluginManifest,
  removeStagedPluginDir,
  stagePluginAssetsToWsl,
  writeHooksJsonFile,
  writeNativeHookWrapper,
  type PluginManifest,
} from "../../plugin/installerBase";
import { resolveCodexNativeExecutableForWindows } from "../windowsExecutable";

export interface CodexPluginPaths {
  pluginDir: string;
  /** Private CODEX_HOME used only for Codex processes spawned by Poracode. */
  codexHomeDir: string;
  /** Path to hooks.json inside the private CODEX_HOME. */
  codexHooksPath: string;
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

/**
 * Match any Poracode-staged Codex hook command in hooks.json. Covers both
 * the WSL shape (where `forward.mjs` is invoked directly via an absolute
 * node path) and the native shape (where `poracode-hook.{sh,cmd,ps1}` is the
 * entry point).
 */
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
      return { pluginDir: "", codexHomeDir: "", codexHooksPath: "", version: "0.0.0" };
    }
    const linuxCodexHome = `${wsl.linuxBase}/home`;
    let version = "0.0.0";
    try {
      version = readPluginManifest(wsl.uncBase).version;
    } catch {
      // ignore
    }
    return {
      pluginDir: wsl.linuxBase,
      codexHomeDir: linuxCodexHome,
      codexHooksPath: `${linuxCodexHome}/hooks.json`,
      version,
    };
  }
  const pluginDir = getNativePluginBaseDir("codex", ctx?.baseDir);
  const codexHomeDir = join(pluginDir, "home");
  let version = "0.0.0";
  try {
    version = readPluginManifest(pluginDir).version;
  } catch {
    // ignore
  }
  return {
    pluginDir,
    codexHomeDir,
    codexHooksPath: join(codexHomeDir, "hooks.json"),
    version,
  };
}

const codexPluginPathsMemo = memoByCtx(computeCodexPluginPaths, ctxCacheKey);

export function getCodexPluginPaths(ctx?: AgentEnvContext): CodexPluginPaths {
  return codexPluginPathsMemo.call(ctx);
}

function prunePoracodeGroups(groups: unknown): unknown[] {
  if (!Array.isArray(groups)) return [];
  return groups.filter((g) => {
    if (!g || typeof g !== "object") return true;
    const rec = g as { hooks?: unknown };
    const hooks = rec.hooks;
    if (!Array.isArray(hooks)) return true;
    return !hooks.some((h) => {
      if (!h || typeof h !== "object") return false;
      const cmd = (h as { type?: string; command?: string }).command;
      return typeof cmd === "string" && MANAGED_FORWARD_RE.test(cmd);
    });
  });
}

function commandForEvent(commandHead: string, event: string): string {
  return `${commandHead} ${event}`;
}

function buildPoracodeGroup(event: string, commandHead: string): Record<string, unknown> {
  const command = commandForEvent(commandHead, event);
  const hook = { type: "command", command };
  if (event === "SessionStart" || event === "PreToolUse" || event === "PostToolUse") {
    return { matcher: "*", hooks: [hook] };
  }
  return { hooks: [hook] };
}

/**
 * Merge Poracode Codex hook matcher groups into a parsed `hooks.json`
 * document. `commandHead` is the entire pre-event portion of each hook
 * command — for WSL it's `"<absolute-node-path>" "<forward.mjs-path>"`;
 * for native it's just `"<wrapper-path>"`. Exported for unit tests.
 */
export function mergeCodexHooksDocument(
  existingParsed: unknown,
  commandHead: string,
): { hooks: Record<string, unknown[]> } {
  let hooksRoot: Record<string, unknown> = {};
  if (
    existingParsed &&
    typeof existingParsed === "object" &&
    "hooks" in existingParsed &&
    (existingParsed as { hooks: unknown }).hooks &&
    typeof (existingParsed as { hooks: unknown }).hooks === "object"
  ) {
    hooksRoot = { ...(existingParsed as { hooks: Record<string, unknown> }).hooks };
  }

  for (const event of CODEX_HOOK_EVENTS) {
    const prev = hooksRoot[event];
    const pruned = prunePoracodeGroups(prev);
    pruned.push(buildPoracodeGroup(event, commandHead));
    hooksRoot[event] = pruned;
  }

  return { hooks: hooksRoot as Record<string, unknown[]> };
}

const CODEX_LINK_TARGETS = [
  { name: "sessions", kind: "dir" as const },
  { name: "session_index.jsonl", kind: "file" as const },
  { name: "auth.json", kind: "file" as const },
  { name: "config.toml", kind: "file" as const },
];

function seedNativeCodexHome(codexHomeDir: string): void {
  mkdirSync(codexHomeDir, { recursive: true });
  const globalCodexHome = join(homedir(), ".codex");
  mkdirSync(join(globalCodexHome, "sessions"), { recursive: true });
  if (!existsSync(join(globalCodexHome, "session_index.jsonl"))) {
    writeFileSync(join(globalCodexHome, "session_index.jsonl"), "", { flag: "a" });
  }
  restorePrivateStateFile(codexHomeDir, globalCodexHome, "auth.json");
  restorePrivateStateFile(codexHomeDir, globalCodexHome, "config.toml");

  for (const { name, kind } of CODEX_LINK_TARGETS) {
    ensureNativeStateLink(join(globalCodexHome, name), join(codexHomeDir, name), kind);
  }
}

function restorePrivateStateFile(
  codexHomeDir: string,
  globalCodexHome: string,
  file: "auth.json" | "config.toml",
): void {
  const source = join(codexHomeDir, file);
  const target = join(globalCodexHome, file);
  if (existsSync(target) || !existsSync(source)) return;
  try {
    fsCopyFileSync(source, target);
  } catch {
    // Best-effort recovery for Windows when file symlinks were unavailable.
  }
}

async function seedWslCodexHome(
  distro: string,
  home: string,
  linuxCodexHome: string,
): Promise<void> {
  const uncCodexHome = toWslUncPath(distro, linuxCodexHome);
  mkdirSync(uncCodexHome, { recursive: true });
  const globalCodexHome = `${home}/.codex`;
  const linkExists = (path: string) =>
    `[ -e ${quotePosixShellArg(path)} ] || [ -L ${quotePosixShellArg(path)} ]`;
  // ln -s can fail on Windows-mounted filesystems (9p / DrvFs). For files,
  // fall back to hardlink, then copy. Dirs only get the symlink attempt.
  const linkLine = (name: string, kind: "dir" | "file") => {
    const target = quotePosixShellArg(`${linuxCodexHome}/${name}`);
    const source = quotePosixShellArg(`${globalCodexHome}/${name}`);
    const attempts = [
      linkExists(`${linuxCodexHome}/${name}`),
      `ln -s ${source} ${target}`,
      ...(kind === "file" ? [`ln ${source} ${target}`, `cp ${source} ${target}`] : []),
    ];
    return attempts.join(" || ");
  };
  const script = [
    [
      "mkdir -p",
      quotePosixShellArg(linuxCodexHome),
      quotePosixShellArg(`${globalCodexHome}/sessions`),
    ].join(" "),
    `touch ${quotePosixShellArg(`${globalCodexHome}/session_index.jsonl`)}`,
    ...CODEX_LINK_TARGETS.map(({ name, kind }) => linkLine(name, kind)),
  ].join("\n");
  await execInWsl(distro, "/", "sh", ["-lc", script], { timeout: 15_000 }).catch((error) => {
    console.warn(`[codex] WSL plugin install failed for distro ${distro}:`, error);
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
    return installCodexPluginWsl(ctx.wslDistro, sourceDir, manifest, options.resolvedNodePath);
  }

  const pluginDir = getNativePluginBaseDir("codex", ctx?.baseDir);
  const codexHomeDir = join(pluginDir, "home");
  mkdirSync(pluginDir, { recursive: true });
  seedNativeCodexHome(codexHomeDir);
  copyPluginAssetsIfStale(sourceDir, pluginDir);
  copyForwardRuntimeFile(pluginDir);
  const wrapperPath = writeNativeHookWrapper(pluginDir, {
    ...(options?.resolvedNodePath ? { nodePath: options.resolvedNodePath } : {}),
  });

  const hooksPath = join(codexHomeDir, "hooks.json");
  const existing = parseExistingHooksJson(hooksPath);
  if (existing === null && existsSync(hooksPath)) {
    return { ok: false, reason: "malformed private Codex hooks.json (invalid JSON)" };
  }

  // Native command shape: `<wrapper-command-head> <event>`. The wrapper sets
  // ELECTRON_RUN_AS_NODE=1 and execs the bundled Electron Node on
  // forward.mjs (which lives next to the wrapper).
  const commandHead = buildNativeHookCommandHeads(wrapperPath).command;

  try {
    const merged = mergeCodexHooksDocument(existing, commandHead);
    writeHooksJsonFile(hooksPath, merged);
  } catch (error) {
    return {
      ok: false,
      reason: `failed to write private Codex hooks.json: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  console.log(
    [
      `[supervisor] Codex hook plugin staged v${manifest.version}`,
      `  pluginDir: ${pluginDir}`,
      `  CODEX_HOME: ${codexHomeDir}`,
    ].join("\n"),
  );

  return {
    ok: true,
    version: manifest.version,
    paths: {
      pluginDir,
      codexHomeDir,
      codexHooksPath: hooksPath,
      version: manifest.version,
    },
  };
}

async function installCodexPluginWsl(
  distro: string,
  sourceDir: string,
  manifest: PluginManifest,
  resolvedNodePath: string,
): Promise<{ ok: true; paths: CodexPluginPaths; version: string } | { ok: false; reason: string }> {
  const staged = stagePluginAssetsToWsl(distro, sourceDir, "codex", {
    includeForwardRuntime: true,
  });
  if (!staged.ok) return staged;

  const linuxForward = `${staged.linuxPluginDir}/forward.mjs`;
  const linuxCodexHome = `${staged.linuxPluginDir}/home`;
  await seedWslCodexHome(distro, staged.deploy.home, linuxCodexHome);
  const linuxHooksPath = `${linuxCodexHome}/hooks.json`;
  const uncHooks = toWslUncPath(distro, linuxHooksPath);

  const existing = parseExistingHooksJson(uncHooks);
  if (existing === null && existsSync(uncHooks)) {
    return {
      ok: false,
      reason: `malformed private Codex hooks.json in wsl distro ${distro}`,
    };
  }

  // WSL command shape: `"<absolute-node-path>" "<forward.mjs-path>" <event>`.
  // /bin/sh -c never has to resolve `node` from PATH because both are
  // absolute paths.
  const commandHead = `${JSON.stringify(resolvedNodePath)} ${JSON.stringify(linuxForward)}`;

  try {
    const merged = mergeCodexHooksDocument(existing, commandHead);
    writeHooksJsonFile(uncHooks, merged);
  } catch (error) {
    return {
      ok: false,
      reason: `failed to write hooks.json in wsl distro ${distro}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  console.log(
    [
      `[supervisor] Codex hook plugin staged v${manifest.version} (wsl:${distro})`,
      `  pluginDir: ${staged.linuxPluginDir}`,
      `  CODEX_HOME: ${linuxCodexHome}`,
    ].join("\n"),
  );

  return {
    ok: true,
    version: manifest.version,
    paths: {
      pluginDir: staged.linuxPluginDir,
      codexHomeDir: linuxCodexHome,
      codexHooksPath: linuxHooksPath,
      version: manifest.version,
    },
  };
}

export function isCodexPluginInstalled(
  ctx?: AgentEnvContext,
): Promise<{ installed: boolean; version?: string }> {
  if (isWslPluginContext(ctx)) {
    const wsl = getWslPluginBaseDirs(ctx.wslDistro, "codex");
    if (!wsl) return Promise.resolve({ installed: false });
    return Promise.resolve(verifyCodexInstallAt(wsl.uncBase, "wsl"));
  }
  return Promise.resolve(
    verifyCodexInstallAt(getNativePluginBaseDir("codex", ctx?.baseDir), "native"),
  );
}

export function uninstallCodexPlugin(ctx?: AgentEnvContext): void {
  removeStagedPluginDir("codex", ctx);
}

function verifyCodexInstallAt(
  readableDir: string,
  target: "native" | "wsl",
): { installed: boolean; version?: string } {
  const hooksPath = join(readableDir, "home", "hooks.json");
  if (!existsSync(join(readableDir, "plugin.json"))) return { installed: false };
  if (!existsSync(join(readableDir, "forward.mjs"))) return { installed: false };
  if (!existsSync(join(readableDir, FORWARD_RUNTIME_FILE))) return { installed: false };
  if (!hasNativeHookWrapper(readableDir, target)) return { installed: false };
  if (!existsSync(hooksPath)) return { installed: false };
  try {
    const raw = readFileSync(hooksPath, "utf8");
    const doc = JSON.parse(raw) as { hooks?: Record<string, unknown> };
    if (!doc.hooks) return { installed: false };
    let found = false;
    for (const event of CODEX_HOOK_EVENTS) {
      const groups = doc.hooks[event];
      if (!Array.isArray(groups)) continue;
      for (const g of groups) {
        if (!g || typeof g !== "object") continue;
        const hooks = (g as { hooks?: unknown }).hooks;
        if (!Array.isArray(hooks)) continue;
        for (const h of hooks) {
          if (!h || typeof h !== "object") continue;
          const cmd = (h as { command?: string }).command;
          if (typeof cmd === "string" && PORACODE_FORWARD_RE.test(cmd)) {
            found = true;
            break;
          }
        }
      }
    }
    if (!found) return { installed: false };
    const version = readPluginManifest(readableDir).version;
    return { installed: true, version };
  } catch {
    return { installed: false };
  }
}
