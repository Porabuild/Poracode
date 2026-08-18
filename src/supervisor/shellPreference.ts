import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { AvailableWindowsShell, SharedSettings, WindowsShellKind } from "@/shared/settings";
import { WINDOWS_SHELL_AUTO } from "@/shared/settings";
import { getWindowsSystemCommand } from "./agents/base/shellBasics";

export interface WindowsShellPreference {
  shell: string;
  kind: WindowsShellKind;
  args: string[];
}

export interface DetectedPowerShell {
  path: string;
  kind: "pwsh" | "powershell";
}

export type ResolveWindowsExecutable = (name: string) => string | undefined;
type ResolveConfiguredPowerShell = () => DetectedPowerShell | undefined;

let resolveConfiguredPowerShell: ResolveConfiguredPowerShell | undefined;

/**
 * The supervisor is a singleton process, so agent command builders can consult
 * the same persisted internal-shell selection without threading it through
 * every provider adapter. The disposer prevents test/runtime instances from
 * leaving a stale resolver behind.
 */
export function setWindowsPowerShellPreferenceResolver(
  resolver: ResolveConfiguredPowerShell,
): () => void {
  resolveConfiguredPowerShell = resolver;
  return () => {
    if (resolveConfiguredPowerShell === resolver) resolveConfiguredPowerShell = undefined;
  };
}

export interface DetectWindowsShellsOptions {
  /** Test seam: installed pwsh paths that are not PATH-resolved. */
  extraPwshPaths?: readonly string[];
  /** Test seam for resolving the product version of generic install paths. */
  resolvePwshVersion?: (path: string) => string | undefined;
}

/** Store/MSIX App Execution Alias, deprioritized when a real package image is discoverable. */
export function isWindowsAppExecutionAlias(path: string): boolean {
  return /\\appdata\\local\\microsoft\\windowsapps\\[^\\]+$/i.test(path.replaceAll("/", "\\"));
}

function uniqueExistingPaths(
  paths: readonly (string | undefined)[],
  pathExists: (path: string) => boolean,
): string[] {
  const seen = new Set<string>();
  const existing: string[] = [];
  for (const path of paths) {
    if (!path || !pathExists(path)) continue;
    const key = path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    existing.push(path);
  }
  return existing;
}

function windowsProgramFilesDirs(): string[] {
  return uniqueExistingPaths(
    [process.env.ProgramW6432, process.env.ProgramFiles, process.env["ProgramFiles(x86)"]],
    (path) => path.length > 0,
  );
}

/** MSI, winget, Scoop, Chocolatey, and user-scope WinGet package layouts. */
export function windowsPwshWellKnownPaths(): string[] {
  const home = homedir();
  const localAppData = process.env.LOCALAPPDATA;
  const chocolatey = process.env.ChocolateyInstall ?? "C:\\ProgramData\\chocolatey";
  const paths = windowsProgramFilesDirs().flatMap((programFiles) => [
    join(programFiles, "PowerShell", "7", "pwsh.exe"),
    join(programFiles, "PowerShell", "7-preview", "pwsh.exe"),
  ]);
  paths.push(
    join(home, "scoop", "apps", "pwsh", "current", "pwsh.exe"),
    join(chocolatey, "bin", "pwsh.exe"),
  );
  if (localAppData) {
    paths.push(
      join(localAppData, "Microsoft", "WinGet", "Links", "pwsh.exe"),
      join(localAppData, "Microsoft", "powershell", "pwsh.exe"),
    );
  }
  return paths;
}

function listPwshInChildFolders(root: string, pathExists: (path: string) => boolean): string[] {
  try {
    const found: string[] = [];
    for (const name of readdirSync(root)) {
      if (name.toLowerCase() === "current") continue;
      const candidate = join(root, name, "pwsh.exe");
      if (pathExists(candidate)) found.push(candidate);
    }
    return found;
  } catch {
    return [];
  }
}

function listPwshUnderPackageRoot(root: string, pathExists: (path: string) => boolean): string[] {
  try {
    const found: string[] = [];
    for (const name of readdirSync(root)) {
      if (!/^Microsoft\.PowerShell/i.test(name)) continue;
      const packageDir = join(root, name);
      const direct = join(packageDir, "pwsh.exe");
      if (pathExists(direct)) {
        found.push(direct);
        continue;
      }
      try {
        for (const child of readdirSync(packageDir)) {
          const nested = join(packageDir, child, "pwsh.exe");
          if (pathExists(nested)) found.push(nested);
        }
      } catch {
        // Nested version folders are optional (WinGet package roots).
      }
    }
    return found;
  } catch {
    return [];
  }
}

export function parseAppxInstallLocations(stdout: string): string[] {
  return stdout
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => /^[A-Za-z]:[\\/]/u.test(line));
}

function listMsixPwshFromAppx(pathExists: (path: string) => boolean): string[] {
  const powershell = getWindowsSystemCommand("WindowsPowerShell\\v1.0\\powershell.exe");
  const result = spawnSync(
    powershell,
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-AppxPackage -Name Microsoft.PowerShell* -ErrorAction SilentlyContinue | Sort-Object { if ($_.Name -eq 'Microsoft.PowerShell') { 0 } else { 1 } } | ForEach-Object { $_.InstallLocation }",
    ],
    { encoding: "utf8", shell: false, timeout: 5_000, windowsHide: true },
  );
  if (result.error || result.status !== 0) return [];
  return parseAppxInstallLocations(`${result.stdout ?? ""}`)
    .map((dir) => join(dir, "pwsh.exe"))
    .filter(pathExists);
}

/**
 * Real Store/MSIX images, not the Local\Microsoft\WindowsApps execution alias.
 * Filesystem probes first (WinGet package roots, readable WindowsApps dirs);
 * Appx is the fallback when the package directory is not listable.
 */
export function findInstalledWindowsPwsh(
  pathExists: (path: string) => boolean = existsSync,
  options?: { probeAppx?: boolean },
): string[] {
  const localAppData = process.env.LOCALAPPDATA;
  const scoopRoot = join(homedir(), "scoop", "apps", "pwsh");
  const msixFromFs = [
    ...(localAppData
      ? listPwshUnderPackageRoot(join(localAppData, "Microsoft", "WinGet", "Packages"), pathExists)
      : []),
    ...windowsProgramFilesDirs().flatMap((programFiles) =>
      listPwshUnderPackageRoot(join(programFiles, "WindowsApps"), pathExists),
    ),
  ];
  const found = [
    ...windowsProgramFilesDirs().flatMap((programFiles) =>
      listPwshInChildFolders(join(programFiles, "PowerShell"), pathExists),
    ),
    ...windowsPwshWellKnownPaths().filter(pathExists),
    ...listPwshInChildFolders(scoopRoot, pathExists),
    ...msixFromFs,
  ];
  if (msixFromFs.length === 0 && options?.probeAppx !== false && pathExists === existsSync) {
    found.push(...listMsixPwshFromAppx(pathExists));
  }
  return uniqueExistingPaths(found, pathExists);
}

function canonicalizeWindowsPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

export function inferPwshVersion(path: string): string | undefined {
  const normalized = path.replaceAll("/", "\\");
  const msix = /Microsoft\.PowerShell(?:Preview)?_(\d+(?:\.\d+){1,3})/i.exec(normalized)?.[1];
  if (msix) {
    return /^\d+\.\d+\.\d+\.0$/u.test(msix) ? msix.slice(0, -2) : msix;
  }
  const folder = /\\(?:PowerShell|pwsh)\\([^\\]+)\\pwsh\.exe$/i.exec(normalized)?.[1];
  if (folder && folder.toLowerCase() !== "current") return folder;
  return undefined;
}

export function parsePwshVersion(stdout: string): string | undefined {
  return stdout
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .find((line) => /^\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z.-]+)?$/u.test(line));
}

export function probePwshVersion(path: string): string | undefined {
  const result = spawnSync(
    path,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$PSVersionTable.PSVersion.ToString()",
    ],
    { encoding: "utf8", shell: false, timeout: 5_000, windowsHide: true },
  );
  if (result.error || result.status !== 0) return undefined;
  return parsePwshVersion(`${result.stdout ?? ""}`);
}

function toPwshShell(
  path: string,
  resolvePwshVersion: (path: string) => string | undefined,
): AvailableWindowsShell {
  const inferredVersion = inferPwshVersion(path) ?? inferPwshVersion(canonicalizeWindowsPath(path));
  const previewPackage = /Microsoft\.PowerShellPreview_/iu.test(path);
  const version =
    inferredVersion && inferredVersion !== "7" && inferredVersion !== "7-preview" && !previewPackage
      ? inferredVersion
      : (resolvePwshVersion(path) ??
        (previewPackage && inferredVersion ? `${inferredVersion}-preview` : inferredVersion));
  return version ? { path, kind: "pwsh", version } : { path, kind: "pwsh" };
}

function collectLaunchablePwsh(
  resolved: string | undefined,
  installed: readonly string[],
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (path: string | undefined, allowAlias = false) => {
    if (!path || (!allowAlias && isWindowsAppExecutionAlias(path))) return;
    const key = canonicalizeWindowsPath(path).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(path);
  };
  add(resolved);
  for (const path of installed) add(path);
  if (ordered.length === 0) add(resolved, true);
  return ordered;
}

export function inferWindowsShellKind(path: string): WindowsShellKind {
  const name = basename(path).toLowerCase();
  if (name === "pwsh" || name === "pwsh.exe") return "pwsh";
  if (name === "powershell" || name === "powershell.exe") return "powershell";
  return "cmd";
}

function pushShell(
  shells: AvailableWindowsShell[],
  seenPaths: Set<string>,
  path: string | undefined,
  kind: WindowsShellKind,
): void {
  if (!path) return;
  const key = path.toLowerCase();
  if (seenPaths.has(key)) return;
  seenPaths.add(key);
  shells.push({ path, kind });
}

/**
 * Detect every supported Windows shell in automatic preference order. PATH
 * resolution is tried first; Store/MSIX aliases and installer layouts are
 * then resolved to a real pwsh.exe so node-pty can spawn it.
 */
export function detectWindowsShells(
  resolveExecutable: ResolveWindowsExecutable,
  pathExists: (path: string) => boolean = existsSync,
  options?: DetectWindowsShellsOptions,
): AvailableWindowsShell[] {
  if (process.platform !== "win32") return [];

  const shells: AvailableWindowsShell[] = [];
  const seenPaths = new Set<string>();
  const resolvedPwsh = resolveExecutable("pwsh.exe") ?? resolveExecutable("pwsh");
  const installedPwsh =
    options?.extraPwshPaths !== undefined
      ? uniqueExistingPaths(options.extraPwshPaths, pathExists)
      : findInstalledWindowsPwsh(pathExists);
  const resolvePwshVersion = options?.resolvePwshVersion ?? probePwshVersion;
  for (const path of collectLaunchablePwsh(resolvedPwsh, installedPwsh)) {
    const shell = toPwshShell(path, resolvePwshVersion);
    const key = canonicalizeWindowsPath(shell.path).toLowerCase();
    if (seenPaths.has(key)) continue;
    seenPaths.add(key);
    shells.push(shell);
  }

  const legacyPowerShell = getWindowsSystemCommand("WindowsPowerShell\\v1.0\\powershell.exe");
  pushShell(
    shells,
    seenPaths,
    resolveExecutable("powershell.exe") ??
      resolveExecutable("powershell") ??
      (pathExists(legacyPowerShell) ? legacyPowerShell : undefined),
    "powershell",
  );

  const commandPrompt = getWindowsSystemCommand("cmd.exe");
  pushShell(
    shells,
    seenPaths,
    resolveExecutable("cmd.exe") ?? resolveExecutable("cmd") ?? commandPrompt,
    "cmd",
  );
  return shells;
}

export function detectPowerShell(
  resolveExecutable: ResolveWindowsExecutable,
): DetectedPowerShell | undefined {
  if (process.platform !== "win32") return undefined;
  return (
    resolveConfiguredPowerShell?.() ??
    detectWindowsShells(resolveExecutable, () => false, {
      extraPwshPaths: [],
      resolvePwshVersion: () => undefined,
    }).find((shell): shell is DetectedPowerShell => shell.kind !== "cmd")
  );
}

export function selectWindowsPowerShell(
  configuredPath: string,
  availableShells: readonly AvailableWindowsShell[],
): DetectedPowerShell | undefined {
  const powerShells = availableShells.filter(
    (shell): shell is DetectedPowerShell => shell.kind !== "cmd",
  );
  const selected =
    configuredPath === WINDOWS_SHELL_AUTO
      ? undefined
      : powerShells.find((shell) => shell.path.toLowerCase() === configuredPath.toLowerCase());
  return selected ?? powerShells[0];
}

/** Parse a compact argument field into argv without invoking a shell. */
export function parseWindowsShellArguments(value: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let tokenStarted = false;

  const push = () => {
    if (tokenStarted) args.push(current);
    current = "";
    tokenStarted = false;
  };

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (quote === '"' && character === "\\") {
      const escaped = value[index + 1];
      if (escaped === '"' || escaped === "\\") {
        current += escaped;
        index += 1;
      } else {
        current += "\\";
      }
      tokenStarted = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
      tokenStarted = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      tokenStarted = true;
      continue;
    }
    if (/\s/u.test(character)) {
      push();
      continue;
    }
    current += character;
    tokenStarted = true;
  }
  push();
  return args;
}

function preferredWindowsShellArgs(kind: WindowsShellKind, argumentsText: string): string[] {
  return [...(kind === "cmd" ? [] : ["-NoLogo"]), ...parseWindowsShellArguments(argumentsText)];
}

export function selectWindowsShell(
  settings: Pick<SharedSettings, "windowsShellPath" | "windowsShellArguments">,
  availableShells: readonly AvailableWindowsShell[],
): WindowsShellPreference {
  const explicitOverride = settings.windowsShellPath !== WINDOWS_SHELL_AUTO;
  const selected = explicitOverride
    ? availableShells.find(
        (shell) => shell.path.toLowerCase() === settings.windowsShellPath.toLowerCase(),
      )
    : undefined;
  const staleOverride = explicitOverride && !selected;
  const shell = selected ?? availableShells[0];
  const argumentsText = staleOverride ? "" : settings.windowsShellArguments;
  if (!shell) {
    return {
      shell: getWindowsSystemCommand("cmd.exe"),
      kind: "cmd",
      args: preferredWindowsShellArgs("cmd", argumentsText),
    };
  }

  return {
    shell: shell.path,
    kind: shell.kind,
    args: preferredWindowsShellArgs(shell.kind, argumentsText),
  };
}
