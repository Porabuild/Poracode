import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OAuthToken } from "@poracode/agents-usage";
import { readGrokAuthFromWsl } from "./wslCredentials";

/**
 * Grok (xAI) credential resolution from `~/.grok/auth.json` (field name varies).
 * The pure parser is exported separately for tests. Secrets are never logged.
 */

const GROK_TOKEN_KEYS = [
  "access_token",
  "accessToken",
  "token",
  "api_key",
  "apiKey",
  "session_token",
  "jwt",
] as const;

/** Parse `~/.grok/auth.json` into an OAuth token bundle (field name varies). */
export function parseGrokAuth(content: string): OAuthToken | undefined {
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const sources: Record<string, unknown>[] = [parsed];
  const nested = parsed.tokens;
  if (nested && typeof nested === "object") sources.push(nested as Record<string, unknown>);
  for (const source of sources) {
    for (const key of GROK_TOKEN_KEYS) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) return { accessToken: value.trim() };
    }
  }
  return undefined;
}

function grokAuthFilePath(): string {
  const home = process.env.GROK_HOME?.trim();
  return home ? join(home, "auth.json") : join(homedir(), ".grok", "auth.json");
}

export async function resolveGrokToken(): Promise<OAuthToken | undefined> {
  const path = grokAuthFilePath();
  if (existsSync(path)) {
    try {
      const token = parseGrokAuth(readFileSync(path, "utf8"));
      if (token) return token;
    } catch {
      // fall through to the WSL fallback
    }
  }
  if (process.platform === "win32") {
    const blob = await readGrokAuthFromWsl();
    if (blob) {
      const token = parseGrokAuth(blob);
      if (token) return token;
    }
  }
  return undefined;
}
