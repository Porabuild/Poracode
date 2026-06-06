import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { getCachedWslHomeDirectory, resolveWslHomeDirectory } from "../agents/base";

/**
 * Shared "stage files into a WSL distro" primitive used by both the git
 * watcher (parcel native binding + watcher.cjs) and the CLI hook bridge
 * (bridge.mjs). Copies happen via `\\wsl.localhost\<distro>\...` UNC paths,
 * which Node's `fs` writes to natively — no `wsl.exe -- cp` round trip
 * required.
 */

export interface WslHomeDeployResult {
  /** Linux path of the user's home directory inside the distro. */
  home: string;
  /** Linux path of the deploy base (`<home>/.lightcode`). */
  linuxBaseDir: string;
}

export interface WslDeployFile {
  /** Absolute Windows source path. */
  src: string;
  /**
   * POSIX-style path relative to `<home>/.lightcode/` inside the distro.
   * Example: `"watcher/watcher.node"` → `~/.lightcode/watcher/watcher.node`.
   */
  relDest: string;
}

export interface WslBaseDeployResult {
  /** Linux path of the deploy base inside the distro. */
  linuxBaseDir: string;
}

/**
 * Resolve the directory containing WSL helper assets shipped with the app
 * (watcher.node, bridge.mjs, …). The main process exports
 * `LIGHTCODE_WSL_HELPERS_DIR`; we keep a back-compat fallback to the legacy
 * `LIGHTCODE_WSL_WATCHER_DIR` for one release while installs roll over.
 */
export function resolveWslHelpersDir(): string | undefined {
  return process.env.LIGHTCODE_WSL_HELPERS_DIR ?? process.env.LIGHTCODE_WSL_WATCHER_DIR;
}

/**
 * Idempotently stage a set of files into a WSL distro's
 * `<home>/.lightcode/<relDest>`. Returns the resolved home + linuxBaseDir on
 * success, or `null` when:
 *   - `$HOME` cannot be resolved through the bootstrap WSL path
 *   - any source file is missing
 *   - the UNC copy errors out (permission, disk, distro restart, …)
 *
 * Idempotent in the same sense as `prepare-wsl-helpers.mjs` is for the
 * Windows side — re-runs are cheap because identical size+mtime files are
 * skipped.
 */
export function deployFilesToWslHome(
  distro: string,
  files: readonly WslDeployFile[],
): WslHomeDeployResult | null {
  const home = getCachedWslHomeDirectory(distro) ?? resolveWslHomeDirectory(distro);
  if (!home) return null;

  for (const file of files) {
    if (!existsSync(file.src)) return null;
  }

  const uncHome = `\\\\wsl.localhost\\${distro}${home.replaceAll("/", "\\")}`;
  const linuxBaseDir = `${home}/.lightcode`;

  try {
    for (const file of files) {
      const segments = file.relDest.split("/").filter((segment) => segment.length > 0);
      const winDest = [uncHome, ".lightcode", ...segments].join("\\");
      mkdirSync(dirname(winDest), { recursive: true });
      if (isFresh(file.src, winDest)) continue;
      copyFileSync(file.src, winDest);
    }
  } catch {
    return null;
  }

  return { home, linuxBaseDir };
}

export function deployFilesToWslTempBase(
  distro: string,
  baseName: string,
  files: readonly WslDeployFile[],
): WslBaseDeployResult | null {
  for (const file of files) {
    if (!existsSync(file.src)) return null;
  }

  const safeBaseName = baseName.replace(/[^A-Za-z0-9._-]/g, "-");
  const linuxBaseDir = `/tmp/${safeBaseName}`;
  const uncBase = `\\\\wsl.localhost\\${distro}\\tmp\\${safeBaseName}`;

  try {
    for (const file of files) {
      const segments = file.relDest.split("/").filter((segment) => segment.length > 0);
      const winDest = [uncBase, ...segments].join("\\");
      mkdirSync(dirname(winDest), { recursive: true });
      if (isFresh(file.src, winDest)) continue;
      copyFileSync(file.src, winDest);
    }
  } catch {
    return null;
  }

  return { linuxBaseDir };
}

function isFresh(src: string, dest: string): boolean {
  try {
    if (!existsSync(dest)) return false;
    const sourceStat = statSync(src);
    const destStat = statSync(dest);
    if (sourceStat.size !== destStat.size) return false;
    if (sourceStat.mtimeMs > destStat.mtimeMs) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a `const <NAME> = "<x.y.z>"` (or `let` / `var`) declaration out of a
 * bundled WSL helper file and return the literal value. Used by the
 * Windows-side managers to know which version they *expect* to be running
 * inside WSL, so they can compare against the `boot:<version>` line every
 * helper emits on startup. We read from the same `helpersDir` that actually
 * gets deployed, so "expected" always matches "what we just staged" — this
 * way a version mismatch unambiguously means "an older copy is still
 * running" (from a previous supervisor process / before the latest deploy
 * overwrote the file), and the caller can respond accordingly.
 *
 * Returns `undefined` when:
 *   - `resolveWslHelpersDir()` is unset (dev-without-env or test stub)
 *   - the file is missing or unreadable
 *   - the constant cannot be found (older helper without versioning)
 * All of these are treated as "don't version-check" by callers.
 */
export function readBundledHelperVersion(
  filename: string,
  constantName: string,
  helpersDir: string | undefined = resolveWslHelpersDir(),
): string | undefined {
  if (!helpersDir) return undefined;
  try {
    const source = readFileSync(join(helpersDir, filename), "utf8");
    // Anchor to start-of-line (with the `m` flag) so comment-indented
    // example snippets like `//   const X = "x.y.z"` don't match ahead of
    // the real declaration. Only whitespace is allowed before the keyword.
    const pattern = new RegExp(
      `^\\s*(?:export\\s+)?(?:const|let|var)\\s+${constantName}\\s*=\\s*["']([^"'\\s]+)["']`,
      "m",
    );
    return pattern.exec(source)?.[1];
  } catch {
    return undefined;
  }
}
