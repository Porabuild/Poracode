import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import type { OAuthToken } from "@poracode/agents-usage";
import { readGeminiCredsFromWsl } from "./wslCredentials";

/**
 * Gemini (Google) credential resolution from `~/.gemini/oauth_creds.json`, with
 * refresh: Google access tokens last ~1h, so a near-expiry token is exchanged
 * for a fresh one using the OAuth client id/secret extracted from the installed
 * Gemini CLI bundle. The pure parser is exported separately for tests. Secrets
 * are never logged.
 */

interface GeminiCredsBlob {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
  id_token?: string;
}

/** Best-effort: pull the account email out of an OIDC id_token (no verification). */
function emailFromIdToken(idToken: string | undefined): string | undefined {
  if (!idToken) return undefined;
  const payload = idToken.split(".")[1];
  if (!payload) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: unknown;
    };
    return typeof claims.email === "string" ? claims.email : undefined;
  } catch {
    return undefined;
  }
}

/** Parse `~/.gemini/oauth_creds.json` into an OAuth token bundle. */
export function parseGeminiCreds(content: string): OAuthToken | undefined {
  let parsed: GeminiCredsBlob | undefined;
  try {
    parsed = JSON.parse(content) as GeminiCredsBlob;
  } catch {
    return undefined;
  }
  const accessToken = parsed?.access_token;
  if (!accessToken) return undefined;
  const email = emailFromIdToken(parsed.id_token);
  return {
    accessToken,
    ...(parsed.refresh_token ? { refreshToken: parsed.refresh_token } : {}),
    ...(typeof parsed.expiry_date === "number" ? { expiresAt: parsed.expiry_date } : {}),
    ...(email ? { raw: { email } } : {}),
  };
}

function geminiCredsFilePath(): string {
  const home = process.env.GEMINI_HOME?.trim();
  return home ? join(home, "oauth_creds.json") : join(homedir(), ".gemini", "oauth_creds.json");
}

const GEMINI_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

interface GeminiOAuthClient {
  clientId: string;
  clientSecret: string;
}

/** Sentinel for "OAuth client not yet looked up", distinct from a cached null ("looked up, absent"). */
const UNRESOLVED = Symbol("gemini-oauth-client-unresolved");
let geminiOAuthClientCache: GeminiOAuthClient | null | typeof UNRESOLVED = UNRESOLVED;

function geminiCommandNames(): string[] {
  return process.platform === "win32"
    ? ["gemini", "gemini.exe", "gemini.cmd", "gemini.ps1"]
    : ["gemini"];
}

function findGeminiCommand(): string | undefined {
  const path = process.env.PATH ?? process.env.Path;
  if (!path) return undefined;
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    for (const command of geminiCommandNames()) {
      const candidate = join(dir, command);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

function safeRealpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function findGeminiCliPackageDir(): string | undefined {
  const command = findGeminiCommand();
  if (!command) return undefined;
  const resolvedCommand = safeRealpath(command);
  const candidates = [
    join(dirname(resolvedCommand), "node_modules", "@google", "gemini-cli"),
    dirname(dirname(resolvedCommand)),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "package.json"))) return candidate;
  }
  return undefined;
}

function readGeminiOAuthClient(): GeminiOAuthClient | undefined {
  if (geminiOAuthClientCache !== UNRESOLVED) return geminiOAuthClientCache ?? undefined;
  // Cache the failure unless we find a client below, so we probe disk only once.
  geminiOAuthClientCache = null;
  const packageDir = findGeminiCliPackageDir();
  if (!packageDir) return undefined;
  const bundleDir = join(packageDir, "bundle");
  try {
    for (const file of readdirSync(bundleDir)) {
      if (!file.endsWith(".js")) continue;
      const content = readFileSync(join(bundleDir, file), "utf8");
      const match = content.match(
        /var OAUTH_CLIENT_ID = "([^"]+)";\s*var OAUTH_CLIENT_SECRET = "([^"]+)";/,
      );
      const clientId = match?.[1];
      const clientSecret = match?.[2];
      if (clientId && clientSecret) {
        geminiOAuthClientCache = { clientId, clientSecret };
        return geminiOAuthClientCache;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Exchange a refresh token for a fresh access token (Google access tokens last ~1h). */
async function refreshGeminiToken(refreshToken: string): Promise<OAuthToken | undefined> {
  const client = readGeminiOAuthClient();
  if (!client) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(GEMINI_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.clientId,
        client_secret: client.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
      signal: controller.signal,
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return undefined;
    return {
      accessToken: json.access_token,
      refreshToken,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Refresh the token if it is expired/near-expiry and a refresh token is present. */
async function withFreshGeminiToken(token: OAuthToken): Promise<OAuthToken> {
  const nearExpiry = token.expiresAt !== undefined && token.expiresAt < Date.now() + 60_000;
  if (!nearExpiry || !token.refreshToken) return token;
  const refreshed = await refreshGeminiToken(token.refreshToken);
  // On failure, return the stale token — the endpoint 401 degrades to auth-missing.
  return refreshed ? { ...token, ...refreshed } : token;
}

export async function resolveGeminiToken(): Promise<OAuthToken | undefined> {
  const path = geminiCredsFilePath();
  if (existsSync(path)) {
    try {
      const token = parseGeminiCreds(readFileSync(path, "utf8"));
      if (token) return withFreshGeminiToken(token);
    } catch {
      // fall through to the WSL fallback
    }
  }
  if (process.platform === "win32") {
    const blob = await readGeminiCredsFromWsl();
    if (blob) {
      const token = parseGeminiCreds(blob);
      if (token) return withFreshGeminiToken(token);
    }
  }
  return undefined;
}
