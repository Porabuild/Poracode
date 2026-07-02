import type { AgentUpdateInfo } from "@/shared/contracts";

/**
 * Pure update-command resolution shared between the supervisor (which runs the
 * command) and the renderer (which previews it in tooltips). No Node APIs —
 * safe to import from both processes.
 *
 * The resolver picks, in priority order:
 *   1. The provider's bundled `builtIn` self-updater (e.g. `claude update`,
 *      `opencode upgrade`) — those CLIs know how to migrate themselves across
 *      install channels (npm → native installer → brew) without our help.
 *   2. A package-manager command inferred from the executable path (brew,
 *      winget, pnpm-global, bun-global, npm-global).
 *   3. A last-resort `npm install -g <pkg>@latest` for kinds that publish on
 *      npm but live somewhere we don't recognise (PATH overrides, wrappers).
 */

export type UpdateStrategy =
  | "built-in"
  | "npm-global"
  | "pnpm-global"
  | "bun-global"
  | "brew"
  | "winget"
  | "installer";

export interface UpdateCommandSpec {
  binary: string;
  args: string[];
  strategy: UpdateStrategy;
}

export function formatUpdateCommandLine(command: { binary: string; args: string[] }): string {
  return [command.binary, ...command.args].join(" ");
}

function normalizeCommandPath(value: string): string {
  return value.replaceAll("\\", "/").toLowerCase();
}

function looksLikeNpmInstallPath(executablePath: string | undefined): boolean {
  if (!executablePath) return false;
  const normalized = normalizeCommandPath(executablePath);
  return (
    normalized.includes("/node_modules/.bin/") ||
    normalized.includes("/lib/node_modules/") ||
    normalized.includes("/npm/node_modules/") ||
    normalized.includes("/node_modules/") ||
    normalized.includes("/.npm-global/") ||
    normalized.includes("/appdata/roaming/npm/") ||
    /\/n\/versions\//.test(normalized) ||
    /\/\.nvm\/versions\/node\//.test(normalized) ||
    /\/\.volta\//.test(normalized) ||
    /\/\.fnm\//.test(normalized) ||
    /\/asdf\/installs\/nodejs\//.test(normalized)
  );
}

function looksLikeBrewPath(executablePath: string | undefined): boolean {
  if (!executablePath) return false;
  const normalized = normalizeCommandPath(executablePath);
  return (
    normalized.includes("/opt/homebrew/cellar/") ||
    normalized.includes("/usr/local/cellar/") ||
    normalized.includes("/homebrew/cellar/") ||
    normalized.startsWith("/opt/homebrew/bin/") ||
    normalized.startsWith("/home/linuxbrew/.linuxbrew/")
  );
}

function looksLikeWingetPath(executablePath: string | undefined): boolean {
  if (!executablePath) return false;
  const normalized = normalizeCommandPath(executablePath);
  return (
    normalized.includes("/winget/packages/") ||
    /\/users\/[^/]+\/appdata\/local\/microsoft\/winget\//.test(normalized)
  );
}

function looksLikePnpmGlobalPath(executablePath: string | undefined): boolean {
  if (!executablePath) return false;
  const normalized = normalizeCommandPath(executablePath);
  return (
    normalized.includes("/.local/share/pnpm/") ||
    normalized.includes("/library/pnpm/") ||
    normalized.includes("/appdata/local/pnpm/") ||
    normalized.includes("/pnpm/global/")
  );
}

function looksLikeBunGlobalPath(executablePath: string | undefined): boolean {
  if (!executablePath) return false;
  const normalized = normalizeCommandPath(executablePath);
  return normalized.includes("/.bun/bin/");
}

export interface ResolveUpdateCommandInput {
  update: AgentUpdateInfo | undefined;
  executablePath: string | undefined;
  envKind: "windows" | "wsl" | "posix";
  skipBuiltIn?: boolean;
}

export function resolveSharedUpdateCommand(
  input: ResolveUpdateCommandInput,
): UpdateCommandSpec | undefined {
  const pkg = input.update;
  if (!pkg) return undefined;

  if (!input.skipBuiltIn && pkg.builtIn) {
    return { binary: pkg.builtIn.binary, args: pkg.builtIn.args, strategy: "built-in" };
  }

  const path = input.executablePath;
  const isBrewPath = looksLikeBrewPath(path);

  if (pkg.brew && isBrewPath) {
    return { binary: "brew", args: ["upgrade", pkg.brew], strategy: "brew" };
  }
  if (pkg.homebrewCask && isBrewPath) {
    return { binary: "brew", args: ["upgrade", "--cask", pkg.homebrewCask], strategy: "brew" };
  }
  if (pkg.winget && looksLikeWingetPath(path) && input.envKind === "windows") {
    return {
      binary: "winget",
      args: ["upgrade", "--id", pkg.winget, "--silent", "--accept-package-agreements"],
      strategy: "winget",
    };
  }
  if (pkg.npm && looksLikePnpmGlobalPath(path)) {
    return {
      binary: "pnpm",
      args: ["add", "-g", `${pkg.npm}@latest`],
      strategy: "pnpm-global",
    };
  }
  if (pkg.npm && looksLikeBunGlobalPath(path)) {
    return { binary: "bun", args: ["i", "-g", `${pkg.npm}@latest`], strategy: "bun-global" };
  }
  if (pkg.npm && looksLikeNpmInstallPath(path)) {
    return {
      binary: "npm",
      args: ["install", "-g", `${pkg.npm}@latest`],
      strategy: "npm-global",
    };
  }

  // Last resort: try npm-global. Most legacy agents publish via npm, so even
  // when the install location doesn't match a known pattern (PATH overrides,
  // wrappers, etc.) `npm i -g <pkg>` is usually the right call. Failures are
  // surfaced to the user verbatim.
  if (pkg.npm) {
    return {
      binary: "npm",
      args: ["install", "-g", `${pkg.npm}@latest`],
      strategy: "npm-global",
    };
  }
  if (pkg.brew) {
    return { binary: "brew", args: ["upgrade", pkg.brew], strategy: "brew" };
  }
  return undefined;
}

/**
 * Latest-known publish channel for an update spec, when one exists. Used by the
 * supervisor to probe the registry for an "is outdated?" check.
 */
export function getNpmPackageNameForUpdate(
  update: AgentUpdateInfo | undefined,
): string | undefined {
  return update?.npm;
}

/**
 * Compare two semver-ish strings (e.g. "0.130.0"). Returns true when `latest`
 * is strictly newer than `installed`. Pre-release suffixes (`-alpha.1`) are
 * compared lexicographically as a tiebreaker; non-semver inputs fall back to
 * exact-string inequality so a mismatch still surfaces.
 */
export function isNewerVersion(latest: string, installed: string): boolean {
  const splitParts = (value: string): { numeric: number[]; rest: string } => {
    const [core, ...preParts] = value.replace(/^v/, "").split("-");
    const numeric = (core ?? "").split(".").map((segment) => Number.parseInt(segment, 10));
    return { numeric, rest: preParts.join("-") };
  };
  const a = splitParts(latest);
  const b = splitParts(installed);
  const looksNumeric = (parts: number[]) =>
    parts.length > 0 && parts.every((segment) => Number.isFinite(segment));
  if (!looksNumeric(a.numeric) || !looksNumeric(b.numeric)) {
    return latest !== installed;
  }
  const length = Math.max(a.numeric.length, b.numeric.length);
  for (let i = 0; i < length; i += 1) {
    const left = a.numeric[i] ?? 0;
    const right = b.numeric[i] ?? 0;
    if (left !== right) return left > right;
  }
  if (a.rest === b.rest) return false;
  if (!a.rest) return true;
  if (!b.rest) return false;
  return a.rest > b.rest;
}
