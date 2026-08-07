import { createHash } from "node:crypto";
import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import { batchWslCommandsAsync, quotePosixShellArg } from "../base";
import { nativeKimiHomePath } from "./paths";

/**
 * Kimi Code 0.33's agent-core-v2 engine gates first launch in a folder behind
 * a TUI "Trust this folder?" dialog (no CLI flag skips it). The engine
 * pre-trusts a folder when a marker document exists under
 * `$KIMI_CODE_HOME/workspace-trust/<workDirKey>`, so we write that marker
 * before spawning Kimi and the dialog never appears.
 *
 * The workDirKey encoding matches Kimi's `encodeWorkDirKey`
 * (`wd_<slug>_<sha256(normalizedRoot)[0:12]>`) — the same key its session
 * dirs use — and the marker body is the JSON record its trust service reads:
 * `{"root": <absolute path>, "trustedAt": <epoch ms>}`.
 *
 * This encoding is a best-effort mirror of an upstream implementation we do
 * not control: a drift only costs us the marker (Kimi then shows its own
 * dialog, which terminal.ts surfaces). Session discovery in sessionFiles.ts
 * therefore keeps treating the workDirKey as opaque and scans every dir
 * rather than deriving the key from here — do not "optimize" it to use this.
 */

const MAX_WORKDIR_SLUG_LENGTH = 40;
const WORKDIR_KEY_PREFIX = "wd_";
const HASH_LENGTH = 12;

export function slugifyKimiWorkDirName(name: string): string {
  const slug = name
    .toLowerCase()
    .replaceAll(/[^a-z0-9._-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, MAX_WORKDIR_SLUG_LENGTH)
    .replaceAll(/^-+|-+$/g, "");
  return slug === "" || slug === "." || slug === ".." ? "workspace" : slug;
}

/**
 * Derive Kimi's opaque workspace key for a working directory. The hash input
 * is the slash-normalized, trailing-slash-stripped path — Kimi hashes its own
 * post-`chdir` cwd, so callers should pass the resolved (realpath) path.
 */
export function encodeKimiWorkDirKey(workDir: string): string {
  const normalized = workDir.replaceAll("\\", "/").replace(/\/+$/, "");
  const base = normalized.split("/").pop() ?? normalized;
  const slug = slugifyKimiWorkDirName(base);
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, HASH_LENGTH);
  return `${WORKDIR_KEY_PREFIX}${slug}_${hash}`;
}

function resolveTrustRoot(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function trustMarkerRecord(root: string): string {
  return JSON.stringify({ root, trustedAt: Date.now() });
}

function ensureNativeKimiWorkspaceTrust(projectPath: string): boolean {
  const root = resolveTrustRoot(projectPath);
  const markerPath = join(nativeKimiHomePath(), "workspace-trust", encodeKimiWorkDirKey(root));
  try {
    if (existsSync(markerPath)) return true;
    mkdirSync(dirname(markerPath), { recursive: true });
    // `wx` fails instead of overwriting a marker a racing process just wrote.
    writeFileSync(markerPath, trustMarkerRecord(root), { flag: "wx" });
    return true;
  } catch {
    // Best effort: a missed marker only means the TUI shows its own trust
    // dialog, which the terminal status heuristics surface to the user.
    return existsSync(markerPath);
  }
}

// WSL: the marker lives inside the distro, and a profile-set KIMI_CODE_HOME
// only exists in the distro's login env — expand it there (the same way
// sessionFiles.ts honors it) instead of reading the Windows process env.
async function ensureWslKimiWorkspaceTrust(distro: string, linuxPath: string): Promise<boolean> {
  // Kimi hashes its own post-chdir cwd, which resolves symlinks — mirror that
  // with readlink before deriving the key.
  const [resolved] = await batchWslCommandsAsync(distro, [
    `readlink -f -- ${quotePosixShellArg(linuxPath)} 2>/dev/null || printf %s ${quotePosixShellArg(linuxPath)}`,
  ]);
  const trimmed = resolved?.ok ? resolved.stdout.trim() : "";
  const root = trimmed.length > 0 ? trimmed : linuxPath;
  const markerName = encodeKimiWorkDirKey(root);
  const script = [
    'lc_home="${KIMI_CODE_HOME:-$HOME/.kimi-code}"',
    'lc_dir="$lc_home/workspace-trust"',
    `lc_marker="$lc_dir/${markerName}"`,
    // Never overwrite an existing marker; its presence alone is the trusted bit.
    `if [ ! -e "$lc_marker" ]; then mkdir -p "$lc_dir" && printf %s ${quotePosixShellArg(trustMarkerRecord(root))} > "$lc_marker"; fi`,
    // Echoed so the caller can cache the result and stop paying two bridge
    // round trips on every subsequent launch of the same folder.
    'if [ -e "$lc_marker" ]; then printf trusted; fi',
  ].join("; ");
  const [written] = await batchWslCommandsAsync(distro, [script]);
  return written?.ok === true && written.stdout.trim() === "trusted";
}

// Folders whose marker we have already confirmed this session. The marker is
// write-once and nothing in Poracode removes it, so re-checking it costs two
// WSL bridge round trips per launch for no new information. Only successful
// runs are recorded, so a transient failure is retried on the next launch.
const trustedWorkDirs = new Set<string>();

function trustCacheKey(location: ProjectLocation, workDir: string): string {
  return location.kind === "wsl" ? `wsl:${location.distro}:${workDir}` : `native:${workDir}`;
}

/**
 * Ensure the workspace-trust marker exists before a Kimi launch (PTY, ACP
 * session, or capabilities probe). `workDir` defaults to the location's own
 * path; pass it explicitly when the process runs somewhere else (the ACP
 * probe spawns in a scratch dir, not the project). Best effort — failures
 * never block the launch.
 */
export async function ensureKimiWorkspaceTrust(
  location: ProjectLocation,
  workDir?: string,
): Promise<void> {
  const target = workDir ?? (location.kind === "wsl" ? location.linuxPath : location.path);
  const cacheKey = trustCacheKey(location, target);
  if (trustedWorkDirs.has(cacheKey)) return;
  try {
    const trusted =
      location.kind === "wsl"
        ? await ensureWslKimiWorkspaceTrust(location.distro, target)
        : ensureNativeKimiWorkspaceTrust(target);
    if (trusted) trustedWorkDirs.add(cacheKey);
  } catch {
    // Best effort (see ensureNativeKimiWorkspaceTrust).
  }
}

/** Test-only: drop the memoized markers so each case starts from a clean slate. */
export function resetKimiWorkspaceTrustCache(): void {
  trustedWorkDirs.clear();
}
