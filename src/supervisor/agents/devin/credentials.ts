import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { parse } from "smol-toml";

export function devinCredentialsPath(): string {
  const root =
    process.platform === "win32"
      ? process.env.APPDATA || join(homedir(), "AppData", "Roaming")
      : process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(root, "devin", "credentials.toml");
}

export function parseDevinCredentials(
  content: string,
): { accessToken: string; raw?: { baseUrl: string } } | undefined {
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
