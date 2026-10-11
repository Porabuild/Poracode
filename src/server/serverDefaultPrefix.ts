import { homedir } from "node:os";
import { win32 } from "node:path";

/**
 * Default standalone-server install prefix: `/opt/poracode` on POSIX,
 * `%LOCALAPPDATA%\Poracode\server` on Windows.
 *
 * `scripts/server-host-tools.mjs` has the same function for the installer
 * scripts and the launcher. It is kept as a separate copy (pinned by a parity
 * test) because the server bundle may only include declared runtime sources,
 * and `scripts/` is not one of them.
 */
export function defaultServerPrefix(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (platform !== "win32") return "/opt/poracode";
  const localAppData =
    envValue(env, "LOCALAPPDATA") ||
    win32.join(envValue(env, "USERPROFILE") || homedir(), "AppData", "Local");
  return win32.join(localAppData, "Poracode", "server");
}

function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  return env[name] ?? env[name.toUpperCase()] ?? env[name.toLowerCase()];
}
