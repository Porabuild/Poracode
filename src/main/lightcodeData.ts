import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveLightcodePaths, type LightcodePaths } from "../shared/lightcodePaths";

function ensureBaseDirectories(paths: LightcodePaths): void {
  mkdirSync(paths.baseDir, { recursive: true });
  mkdirSync(paths.worktreesDir, { recursive: true });
  mkdirSync(paths.attachmentsDir, { recursive: true });
  mkdirSync(paths.logsDir, { recursive: true });
  mkdirSync(paths.cacheDir, { recursive: true });
}

export function prepareLightcodeDataRoot(legacyUserDataDir: string): LightcodePaths {
  const paths = resolveLightcodePaths();
  ensureBaseDirectories(paths);

  const legacyDbPath = join(legacyUserDataDir, "lightcode.db");
  if (!existsSync(paths.dbPath) && existsSync(legacyDbPath)) {
    copyFileSync(legacyDbPath, paths.dbPath);
  }

  const legacyAttachmentsDir = join(legacyUserDataDir, "attachments");
  if (existsSync(legacyAttachmentsDir)) {
    cpSync(legacyAttachmentsDir, paths.attachmentsDir, {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
  }

  const legacyStatusCachePath = join(legacyUserDataDir, "agent-status-cache.json");
  if (!existsSync(paths.statusCachePath) && existsSync(legacyStatusCachePath)) {
    copyFileSync(legacyStatusCachePath, paths.statusCachePath);
  }

  return paths;
}
