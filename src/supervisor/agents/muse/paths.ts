import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Native Muse Code config / data paths.
 *
 * Muse follows XDG on Linux-style hosts:
 *   config → ${XDG_CONFIG_HOME:-~/.config}/muse
 *   data   → ${XDG_DATA_HOME:-~/.local/share}/muse
 *
 * Kept in a leaf module so detection, session discovery, and tests can share
 * the same resolution without import cycles.
 */

export function nativeMuseConfigHome(): string {
  const xdg = process.env["XDG_CONFIG_HOME"];
  if (xdg && xdg.trim().length > 0) return join(xdg, "muse");
  return join(homedir(), ".config", "muse");
}

export function nativeMuseDataHome(): string {
  const xdg = process.env["XDG_DATA_HOME"];
  if (xdg && xdg.trim().length > 0) return join(xdg, "muse");
  return join(homedir(), ".local", "share", "muse");
}

export function nativeMuseAuthPath(): string {
  const override = process.env["MUSE_AUTH_PATH"];
  if (override && override.trim().length > 0) return override;
  return join(nativeMuseConfigHome(), "auth.json");
}

export function nativeMuseSessionsRoot(): string {
  return join(nativeMuseDataHome(), "sessions");
}

/** POSIX shell snippet that expands Muse config home inside a WSL distro. */
export const WSL_MUSE_CONFIG_HOME = "${XDG_CONFIG_HOME:-$HOME/.config}/muse";

/** POSIX shell snippet resolving the launcher's supported auth-file override. */
export const WSL_MUSE_AUTH_PATH =
  "${MUSE_AUTH_PATH:-${XDG_CONFIG_HOME:-$HOME/.config}/muse/auth.json}";

/** POSIX shell snippet that expands Muse data home inside a WSL distro. */
export const WSL_MUSE_DATA_HOME = "${XDG_DATA_HOME:-$HOME/.local/share}/muse";
