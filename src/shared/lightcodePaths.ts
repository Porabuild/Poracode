import { homedir } from "node:os";
import { join } from "node:path";
import { type LightcodeChannel, resolveLightcodeChannel, userDataDirNameFor } from "./channel";

export interface LightcodePaths {
  baseDir: string;
  dbPath: string;
  settingsPath: string;
  keybindingsPath: string;
  worktreesDir: string;
  attachmentsDir: string;
  logsDir: string;
  terminalLogsDir: string;
  cacheDir: string;
  statusCachePath: string;
  agentPluginsDir: string;
  /**
   * Cache directory for ACP registry agent icons. Icons are downloaded once
   * at install/backfill time, served from disk via the `lightcode-local://`
   * protocol so the renderer paints them synchronously on app start instead
   * of fetching the CDN URL on every mount.
   */
  acpIconsDir: string;
}

export function resolveLightcodeBaseDir(
  channel: LightcodeChannel = resolveLightcodeChannel(),
  homeDir: string = homedir(),
): string {
  return join(homeDir, userDataDirNameFor(channel));
}

export function resolveLightcodePaths(baseDir: string = resolveLightcodeBaseDir()): LightcodePaths {
  const logsDir = join(baseDir, "logs");
  const cacheDir = join(baseDir, "cache");
  return {
    baseDir,
    dbPath: join(baseDir, "state.sqlite"),
    settingsPath: join(baseDir, "settings.json"),
    keybindingsPath: join(baseDir, "keybindings.json"),
    worktreesDir: join(baseDir, "worktrees"),
    attachmentsDir: join(baseDir, "attachments"),
    logsDir,
    terminalLogsDir: join(logsDir, "terminal"),
    cacheDir,
    statusCachePath: join(cacheDir, "agent-status-cache.json"),
    agentPluginsDir: join(baseDir, "agent-plugins"),
    acpIconsDir: join(cacheDir, "acp-icons"),
  };
}
