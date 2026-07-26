import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OAuthToken } from "@poracode/agents-usage";
import { readCommandCodeApiKeyFromWsl, readCommandCodeAuthFromWsl } from "./wslCredentials";

export const COMMAND_CODE_API_KEY_ENV = "COMMAND_CODE_API_KEY";

function cleaned(raw: string | undefined): string | undefined {
  let value = raw?.trim();
  if (!value) return undefined;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value || undefined;
}

/** Pure: resolve Command Code's supported API-key environment variable. */
export function parseCommandCodeEnv(
  env: Record<string, string | undefined>,
): OAuthToken | undefined {
  const accessToken = cleaned(env[COMMAND_CODE_API_KEY_ENV]);
  return accessToken ? { accessToken } : undefined;
}

/** Pure: parse the `auth.json` written by `command-code login`. */
export function parseCommandCodeAuth(content: string): OAuthToken | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  const accessToken = typeof record.apiKey === "string" ? record.apiKey.trim() : "";
  if (!accessToken) return undefined;
  const userName = typeof record.userName === "string" ? record.userName.trim() : "";
  return userName ? { accessToken, raw: { userName } } : { accessToken };
}

/** Resolve the same API key Command Code v1.4.1 uses, including WSL fallback. */
export async function resolveCommandCodeToken(): Promise<OAuthToken | undefined> {
  const envToken = parseCommandCodeEnv(process.env);
  if (envToken) return envToken;

  try {
    const token = parseCommandCodeAuth(
      await readFile(join(homedir(), ".commandcode", "auth.json"), "utf8"),
    );
    if (token) return token;
  } catch {
    // fall through to the WSL fallback
  }

  if (process.platform !== "win32") return undefined;
  const wslEnvToken = cleaned(await readCommandCodeApiKeyFromWsl());
  if (wslEnvToken) return { accessToken: wslEnvToken };
  const wslAuth = await readCommandCodeAuthFromWsl();
  return wslAuth ? parseCommandCodeAuth(wslAuth) : undefined;
}
