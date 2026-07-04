import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { type LightcodeChannel, resolveLightcodeChannel } from "@/shared/channel";
import {
  resolveLightcodeBaseDir,
  resolveLightcodePaths,
  type LightcodePaths,
} from "@/shared/lightcodePaths";

function ensureBaseDirectories(paths: LightcodePaths): void {
  mkdirSync(paths.baseDir, { recursive: true });
  mkdirSync(paths.worktreesDir, { recursive: true });
  mkdirSync(paths.attachmentsDir, { recursive: true });
  mkdirSync(paths.logsDir, { recursive: true });
  mkdirSync(paths.cacheDir, { recursive: true });
}

/** Pre-rebrand global data dir names, keyed by channel (now `.poracode*`). */
const LEGACY_DATA_DIR_NAME: Record<LightcodeChannel, string> = {
  stable: ".lightcode",
  nightly: ".lightcode-nightly",
};

/**
 * Legacy subtrees not worth importing — large and/or regenerable. `worktrees/`
 * are git-linked checkouts whose admin files/absolute paths would be stale at
 * the new location (they re-create on demand and stay reachable under the legacy
 * dir); `cache/` and `logs/` are disposable.
 */
const SKIP_LEGACY_SUBDIRS = ["worktrees", "cache", "logs"] as const;

/**
 * One-time, crash-safe migration of the pre-rebrand global data dir into the new
 * naming.
 *
 * On first start under the new brand, if `~/.poracode` is absent but the legacy
 * `~/.lightcode` exists, **copy** (never move) it across so existing users keep
 * their database, settings, keybindings, agent profiles, and attachments — the
 * legacy dir is left intact as a backup. The copy lands in a sibling temp dir
 * first and is then **atomically renamed** into place, so a crash mid-copy never
 * leaves a half-written data dir (the next launch just retries).
 *
 * The app keeps the same Electron `appId`, so renderer `localStorage` and the
 * macOS keychain stay put — this home-dir copy is the only state that moves.
 *
 * No-op once the new dir exists, when no legacy dir is present, or when a
 * custom/env base dir is in use.
 */
function migrateLegacyDataDir(baseDir: string): void {
  const channel = resolveLightcodeChannel();
  // Only ever migrate the default home-based dir — never a custom/env override.
  if (baseDir !== resolveLightcodeBaseDir(channel)) return;
  if (existsSync(baseDir)) return;
  const legacyDir = join(homedir(), LEGACY_DATA_DIR_NAME[channel]);
  if (!existsSync(legacyDir)) return;
  const skip = SKIP_LEGACY_SUBDIRS.map((name) => join(legacyDir, name));
  const tempDir = `${baseDir}.migrating`;
  try {
    rmSync(tempDir, { recursive: true, force: true }); // clear any stale partial copy
    cpSync(legacyDir, tempDir, {
      recursive: true,
      filter: (src) => !skip.some((dir) => src === dir || src.startsWith(dir + sep)),
    });
    renameSync(tempDir, baseDir); // atomic publish — baseDir exists only when complete
    console.info(`[migrate] imported legacy data dir ${legacyDir} -> ${baseDir}`);
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true });
    console.warn(`[migrate] failed to import legacy data dir ${legacyDir} -> ${baseDir}:`, error);
  }
}

export function prepareLightcodeDataRoot(baseDir?: string): LightcodePaths {
  const paths = resolveLightcodePaths(baseDir);
  migrateLegacyDataDir(paths.baseDir);
  ensureBaseDirectories(paths);
  return paths;
}

/**
 * Remove attachment subdirectories that don't belong to any known thread.
 * Call after the database is initialized.
 */
export function cleanupOrphanedAttachments(attachmentsDir: string, validThreadIds: string[]): void {
  if (!existsSync(attachmentsDir)) return;

  const validDirNames = new Set(validThreadIds.map((id) => id.replace(/:/g, "-").slice(0, 12)));

  let entries: string[];
  try {
    entries = readdirSync(attachmentsDir);
  } catch (error) {
    console.warn("[attachments] failed to read attachments directory for cleanup:", error);
    return;
  }

  for (const entry of entries) {
    // Draft-pane attachments live under directories prefixed with `draft-` and
    // are referenced by file path from persisted user messages once the draft
    // is sent. Keep them so re-opened threads can still resolve their images.
    if (entry.startsWith("draft-")) continue;
    if (!validDirNames.has(entry)) {
      rmSync(join(attachmentsDir, entry), { recursive: true, force: true });
    }
  }
}
