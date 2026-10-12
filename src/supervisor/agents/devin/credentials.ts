import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { parse } from "smol-toml";

/** Native XDG data root for the default account (host process resolution). */
export function devinDefaultDataRoot(): string {
  return process.platform === "win32"
    ? process.env.APPDATA || join(homedir(), "AppData", "Roaming")
    : process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
}

/** Native config root for the default account (host process resolution). */
export function devinDefaultConfigRoot(): string {
  return process.platform === "win32"
    ? process.env.APPDATA || join(homedir(), "AppData", "Roaming")
    : process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

export function devinCredentialsPath(): string {
  return join(devinDefaultDataRoot(), "devin", "credentials.toml");
}

export interface DevinCredentials {
  accessToken: string;
  raw?: { baseUrl: string };
}

/**
 * Parse the native credential file. Only the token and routing metadata the
 * CLI itself stores are surfaced; tenant/webapp fields stay in the file so the
 * native login keeps full attribution (never inject a copied key alone).
 */
export function parseDevinCredentials(content: string): DevinCredentials | undefined {
  try {
    const data = parse(content);
    const key = data.windsurf_api_key;
    if (typeof key !== "string" || !key.trim()) return undefined;
    return {
      accessToken: key.trim(),
      ...(typeof data.api_server_url === "string" ? { raw: { baseUrl: data.api_server_url } } : {}),
    };
  } catch {
    return undefined;
  }
}

export async function readDevinCredentials() {
  return readFile(devinCredentialsPath(), "utf8")
    .then(parseDevinCredentials)
    .catch(() => undefined);
}

/**
 * Read credentials at an explicit path (an execution context's resolved root).
 * Read-only projection for auth status: the file itself is never copied,
 * rewritten, or linked — the native CLI keeps owning it.
 */
export async function readDevinCredentialsAt(path: string) {
  return readFile(path, "utf8")
    .then(parseDevinCredentials)
    .catch(() => undefined);
}
