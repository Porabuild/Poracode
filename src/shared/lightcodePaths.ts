import { homedir } from "node:os";
import { join } from "node:path";

export interface LightcodePaths {
  baseDir: string;
  dbPath: string;
  settingsPath: string;
  worktreesDir: string;
  attachmentsDir: string;
  logsDir: string;
  terminalLogsDir: string;
  cacheDir: string;
  statusCachePath: string;
}

export function resolveLightcodeBaseDir(homeDir: string = homedir()): string {
  return join(homeDir, ".lightcode");
}

export function resolveLightcodePaths(baseDir: string = resolveLightcodeBaseDir()): LightcodePaths {
  const logsDir = join(baseDir, "logs");
  const cacheDir = join(baseDir, "cache");
  return {
    baseDir,
    dbPath: join(baseDir, "state.sqlite"),
    settingsPath: join(baseDir, "settings.json"),
    worktreesDir: join(baseDir, "worktrees"),
    attachmentsDir: join(baseDir, "attachments"),
    logsDir,
    terminalLogsDir: join(logsDir, "terminal"),
    cacheDir,
    statusCachePath: join(cacheDir, "agent-status-cache.json"),
  };
}
