import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OAuthToken } from "@poracode/agents-usage";
import { readCodexAuthFromWsl } from "./wslCredentials";

/**
 * Codex (OpenAI / ChatGPT) credential resolution from `~/.codex/auth.json`. The
 * pure parser is exported separately for tests. Secrets are never logged.
 */

interface CodexAuthBlob {
  OPENAI_API_KEY?: string | null;
  tokens?: { access_token?: string; refresh_token?: string; account_id?: string };
}

/** Parse `~/.codex/auth.json` contents into an OAuth token bundle. */
export function parseCodexAuth(content: string): OAuthToken | undefined {
  let parsed: CodexAuthBlob | undefined;
  try {
    parsed = JSON.parse(content) as CodexAuthBlob;
  } catch {
    return undefined;
  }
  const accessToken = parsed?.tokens?.access_token;
  if (!accessToken) return undefined;
  return {
    accessToken,
    ...(parsed.tokens?.refresh_token ? { refreshToken: parsed.tokens.refresh_token } : {}),
    ...(parsed.tokens?.account_id ? { accountId: parsed.tokens.account_id } : {}),
  };
}

export interface CodexCredentialEnv {
  CODEX_HOME?: string | undefined;
}

function codexAuthFilePath(env: CodexCredentialEnv): string {
  const home = env.CODEX_HOME?.trim();
  return home ? join(home, "auth.json") : join(homedir(), ".codex", "auth.json");
}

export async function resolveCodexToken(
  env: CodexCredentialEnv = process.env,
): Promise<OAuthToken | undefined> {
  // Read fresh every call — the access token is a short-lived JWT the Codex CLI
  // refreshes (~5 min); a cached Bearer would go stale and 401.
  const path = codexAuthFilePath(env);
  if (existsSync(path)) {
    try {
      const token = parseCodexAuth(readFileSync(path, "utf8"));
      if (token) return token;
    } catch {
      // fall through to the WSL fallback
    }
  }
  if (!env.CODEX_HOME?.trim() && process.platform === "win32") {
    const blob = await readCodexAuthFromWsl();
    if (blob) {
      const token = parseCodexAuth(blob);
      if (token) return token;
    }
  }
  return undefined;
}
