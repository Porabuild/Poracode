import { mkdirSync } from "node:fs";
import { resolvePoracodePaths, type PoracodePaths } from "@/shared/poracodePaths";

function ensureBaseDirectories(paths: PoracodePaths): void {
  mkdirSync(paths.baseDir, { recursive: true });
  mkdirSync(paths.worktreesDir, { recursive: true });
  mkdirSync(paths.attachmentsDir, { recursive: true });
  mkdirSync(paths.logsDir, { recursive: true });
  mkdirSync(paths.cacheDir, { recursive: true });
}

export function preparePoracodeDataRoot(baseDir?: string): PoracodePaths {
  const paths = resolvePoracodePaths(baseDir);
  ensureBaseDirectories(paths);
  return paths;
}
