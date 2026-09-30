import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { type PoracodeChannel, resolvePoracodeChannel, userDataDirNameFor } from "./channel";

export interface PoracodePaths {
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
   * Writable root for Agent Plugins packages the user installs. Each immediate
   * child directory containing a `plugin.json` is loaded as one package.
   *
   * @see https://agent-plugins.org/client-implementers/loading-and-discovery
   */
  pluginsDir: string;
  /** Parent of the per-plugin `PLUGIN_DATA` directories handed to MCP servers. */
  pluginDataDir: string;
  /**
   * Durable record of package installations Poracode discovered outside its own
   * bundle, keyed by an opaque provider slot id. Lives beside `settings.json`
   * rather than under `cacheDir` because it is the one thing that must survive
   * an app update: it is what lets a resolved installation be re-found without
   * a PATH-dependent package-manager probe.
   */
  packageInstallPinsPath: string;
  /**
   * Cache directory for ACP registry agent icons. Icons are downloaded once
   * at install/backfill time, served from disk via the `poracode-local://`
   * protocol so the renderer paints them synchronously on app start instead
   * of fetching the CDN URL on every mount.
   */
  acpIconsDir: string;
}

export function resolvePoracodeBaseDir(
  channel: PoracodeChannel = resolvePoracodeChannel(),
  homeDir: string = homedir(),
): string {
  return join(homeDir, userDataDirNameFor(channel));
}

/**
 * The supervisor's data base dir as handed down through the environment, or
 * `undefined` when it is absent or unusable. The guards mirror the supervisor
 * boot's own parsing: `process.env.X = undefined` coerces to the literal
 * string "undefined", and a relative path would make writes land relative to
 * an arbitrary cwd. Callers compose their own fallback (the supervisor boots
 * with `~/.poracode`).
 */
export function poracodeBaseDirFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env["PORACODE_DATA_DIR"]?.trim();
  return raw && raw !== "undefined" && isAbsolute(raw) ? raw : undefined;
}

export function resolvePoracodePaths(baseDir: string = resolvePoracodeBaseDir()): PoracodePaths {
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
    pluginsDir: join(baseDir, "plugins"),
    pluginDataDir: join(baseDir, "plugin-data"),
    packageInstallPinsPath: join(baseDir, "package-install-pins.json"),
    acpIconsDir: join(cacheDir, "acp-icons"),
  };
}
