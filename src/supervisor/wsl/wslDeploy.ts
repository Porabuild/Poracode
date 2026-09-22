import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toWslUncPath } from "@/shared/wsl";
import { getWslStagingService, type WslStagingService } from "./staging";

/**
 * Shared "stage files into a WSL distro" primitive used by both the git
 * watcher (parcel native binding + watcher.cjs) and the CLI hook bridge
 * (bridge.mjs), and by provider plugin installs and launch-helper staging.
 *
 * Every copy runs in the supervisor-owned staging worker over
 * `\\wsl.localhost\<distro>\...` UNC paths. There is no synchronous entry
 * point: callers await, so a stalled distro only ever stalls its own
 * operation while the supervisor event loop (and every other session) keeps
 * advancing.
 */

export interface WslHomeDeployResult {
  /** Linux path of the user's home directory inside the distro. */
  home: string;
  /** Linux path of the deploy base (`<home>/.poracode`). */
  linuxBaseDir: string;
}

export interface WslDeployFile {
  /** Absolute Windows source path. */
  src: string;
  /**
   * POSIX-style path relative to `<home>/.poracode/` inside the distro.
   * Example: `"watcher/watcher.node"` → `~/.poracode/watcher/watcher.node`.
   */
  relDest: string;
}

export interface WslBaseDeployResult {
  /** Linux path of the deploy base inside the distro. */
  linuxBaseDir: string;
}

export interface WslDeployOptions {
  /** Test seam: replace the shared staging service. */
  staging?: WslStagingService;
  signal?: AbortSignal;
}

/**
 * Resolve the directory containing WSL helper assets shipped with the app
 * (watcher.node, bridge.mjs, …). The main process exports
 * `PORACODE_WSL_HELPERS_DIR`; we keep a back-compat fallback to the legacy
 * `PORACODE_WSL_WATCHER_DIR` for one release while installs roll over.
 */
export function resolveWslHelpersDir(): string | undefined {
  return process.env.PORACODE_WSL_HELPERS_DIR ?? process.env.PORACODE_WSL_WATCHER_DIR;
}

/**
 * Idempotently stage a set of files into a WSL distro's
 * `<home>/.poracode/<relDest>`. Returns the resolved home + linuxBaseDir on
 * success, or `null` when `$HOME` cannot be resolved, a source file is
 * missing, or the staging worker fails.
 *
 * Content-addressed freshness: a destination whose bytes already match the
 * source is left alone, and every write lands through a temp file + rename so
 * a reader never sees a partial helper.
 */
export async function deployFilesToWslHome(
  distro: string,
  files: readonly WslDeployFile[],
  options?: WslDeployOptions,
): Promise<WslHomeDeployResult | null> {
  if (!filesArePresent(files)) return null;
  const staging = options?.staging ?? getWslStagingService();
  const home = await staging.resolveHome(distro, options);
  if (!home) return null;
  try {
    await staging.deployHome(distro, { home, files }, options);
  } catch {
    return null;
  }
  return { home, linuxBaseDir: `${home}/.poracode` };
}

/**
 * Stage a file set under a content-addressed `/tmp/<baseName>-<hash>` base
 * inside the distro. Identical content shares one directory (single-flight
 * per distro), and two different file sets can never overwrite each other.
 */
export async function deployFilesToWslTempBase(
  distro: string,
  baseName: string,
  files: readonly WslDeployFile[],
  options?: WslDeployOptions,
): Promise<WslBaseDeployResult | null> {
  if (!filesArePresent(files)) return null;
  try {
    const staging = options?.staging ?? getWslStagingService();
    return await staging.deployTemp(distro, { baseName, files }, options);
  } catch {
    return null;
  }
}

/**
 * Best-effort removal for a staged path, isolated in the staging worker.
 * Cleanup is advisory: callers await it so the removal is visible to later
 * staging work, but a failure never fails the operation that owns the
 * resource.
 */
export async function removeWslStagedPath(
  distro: string,
  linuxPath: string,
  options?: WslDeployOptions,
): Promise<void> {
  try {
    const staging = options?.staging ?? getWslStagingService();
    await staging.remove(distro, toWslUncPath(distro, linuxPath), options);
  } catch {
    // Cleanup is best effort.
  }
}

function filesArePresent(files: readonly WslDeployFile[]): boolean {
  return files.every((file) => existsSync(file.src));
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
