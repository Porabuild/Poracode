import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import type { CredentialStore, OAuthToken } from "@lightcode/agents-usage";
import { getUsageSecret } from "@/shared/usageSecretStore";
import { resolveCursorToken } from "./cursorCredentials";
import {
  readClaudeCredentialsFromWindowsVault,
  readWindowsCredentialTarget,
} from "./windowsClaudeVault";
import {
  readClaudeCredsFromWsl,
  readCodexAuthFromWsl,
  readGeminiCredsFromWsl,
  readGrokAuthFromWsl,
} from "./wslCredentials";

/**
 * Resolves provider access tokens for the native (host) environment, reusing
 * the same credential files Lightcode's detection already reads. Pure parsers
 * are exported separately so they can be unit-tested without touching disk.
 *
 * Scope (v1): native host only. WSL-side credentials (read over //wsl.localhost
 * UNC) are a later phase. Secrets are never logged.
 */

// ── Claude ───────────────────────────────────────────────────────────

interface ClaudeOAuthBlob {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  subscriptionType?: string;
  rateLimitTier?: string;
}

/**
 * Parse a Claude credential blob into an OAuth token bundle. Accepts either the
 * `~/.claude/.credentials.json` shape (a `claudeAiOauth` wrapper) or a bare
 * oauth object (as the Windows Credential Manager blob may store it).
 */
export function parseClaudeCredentials(content: string): OAuthToken | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const root = parsed as { claudeAiOauth?: ClaudeOAuthBlob };
  const oauth = (root.claudeAiOauth ?? root) as ClaudeOAuthBlob;
  if (!oauth.accessToken) return undefined;
  return {
    accessToken: oauth.accessToken,
    ...(oauth.refreshToken ? { refreshToken: oauth.refreshToken } : {}),
    ...(typeof oauth.expiresAt === "number" ? { expiresAt: oauth.expiresAt } : {}),
    ...(oauth.subscriptionType ? { subscriptionType: oauth.subscriptionType } : {}),
    ...(oauth.rateLimitTier ? { raw: { rateLimitTier: oauth.rateLimitTier } } : {}),
  };
}

function claudeCredentialDirs(): string[] {
  const dirs: string[] = [];
  const configDir = process.env.CLAUDE_CONFIG_DIR?.trim();
  if (configDir) dirs.push(configDir);
  dirs.push(join(homedir(), ".claude"));
  dirs.push(join(homedir(), ".config", "claude"));
  return dirs;
}

async function resolveClaudeToken(): Promise<OAuthToken | undefined> {
  for (const dir of claudeCredentialDirs()) {
    const path = join(dir, ".credentials.json");
    if (!existsSync(path)) continue;
    try {
      const token = parseClaudeCredentials(readFileSync(path, "utf8"));
      if (token) return token;
    } catch {
      // try the next candidate dir
    }
  }
  // On native Windows, Claude Code may store the OAuth token in the Windows
  // Credential Manager rather than a file (Win-CodexBar issue #22). Best-effort
  // fallback; degrades to auth-missing on any failure. The file path above
  // covers Linux, WSL, and the common Windows case.
  if (process.platform === "win32") {
    const blob = await readClaudeCredentialsFromWindowsVault();
    if (blob) {
      const token = parseClaudeCredentials(blob);
      if (token) return token;
    }
    // Signed in only inside WSL? Read the distro's creds (token works anywhere).
    const wslBlob = await readClaudeCredsFromWsl();
    if (wslBlob) {
      const token = parseClaudeCredentials(wslBlob);
      if (token) return token;
    }
  }
  return undefined;
}

// ── Codex ────────────────────────────────────────────────────────────

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

function codexAuthFilePath(): string {
  const home = process.env.CODEX_HOME?.trim();
  return home ? join(home, "auth.json") : join(homedir(), ".codex", "auth.json");
}

async function resolveCodexToken(): Promise<OAuthToken | undefined> {
  // Read fresh every call — the access token is a short-lived JWT the Codex CLI
  // refreshes (~5 min); a cached Bearer would go stale and 401.
  const path = codexAuthFilePath();
  if (existsSync(path)) {
    try {
      const token = parseCodexAuth(readFileSync(path, "utf8"));
      if (token) return token;
    } catch {
      // fall through to the WSL fallback
    }
  }
  if (process.platform === "win32") {
    const blob = await readCodexAuthFromWsl();
    if (blob) {
      const token = parseCodexAuth(blob);
      if (token) return token;
    }
  }
  return undefined;
}

// ── Copilot ──────────────────────────────────────────────────────────

const COPILOT_TOKEN_ENV_VARS = ["COPILOT_GITHUB_TOKEN", "COPILOT_API_TOKEN"] as const;

interface CopilotConfig {
  lastLoggedInUser?: { host?: string; login?: string };
}

function copilotTokenFromEnv(): string | undefined {
  for (const name of COPILOT_TOKEN_ENV_VARS) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function copilotConfigPath(): string {
  const home = process.env.COPILOT_HOME?.trim();
  return home ? join(home, "config.json") : join(homedir(), ".copilot", "config.json");
}

export function copilotCredentialTargetFromConfig(content: string): string | undefined {
  let parsed: CopilotConfig | undefined;
  try {
    parsed = JSON.parse(content) as CopilotConfig;
  } catch {
    return undefined;
  }
  const host = parsed?.lastLoggedInUser?.host?.trim();
  const login = parsed?.lastLoggedInUser?.login?.trim();
  if (!host || !login) return undefined;
  return `copilot-cli/${host}:${login}`;
}

async function resolveCopilotCliToken(): Promise<OAuthToken | undefined> {
  const path = copilotConfigPath();
  if (!existsSync(path)) return undefined;
  try {
    const target = copilotCredentialTargetFromConfig(readFileSync(path, "utf8"));
    if (!target) return undefined;
    const token = await readWindowsCredentialTarget(target);
    return token ? { accessToken: token } : undefined;
  } catch {
    return undefined;
  }
}

async function resolveCopilotToken(): Promise<OAuthToken | undefined> {
  const fromEnv = copilotTokenFromEnv();
  if (fromEnv) return { accessToken: fromEnv };
  const fromCopilotCli = await resolveCopilotCliToken();
  if (fromCopilotCli) return fromCopilotCli;
  return undefined;
}

// ── Grok ─────────────────────────────────────────────────────────────

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

async function resolveGrokToken(): Promise<OAuthToken | undefined> {
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

// ── Gemini ───────────────────────────────────────────────────────────

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

let geminiOAuthClientCache: GeminiOAuthClient | null | undefined;

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
  if (geminiOAuthClientCache !== undefined) return geminiOAuthClientCache ?? undefined;
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

async function resolveGeminiToken(): Promise<OAuthToken | undefined> {
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

// ── Store ────────────────────────────────────────────────────────────

/** Build the native credential store consumed by the usage HostPort. */
export function createNativeCredentialStore(cacheDir?: string): CredentialStore {
  return {
    getOAuthToken: async (providerId) => {
      switch (providerId) {
        case "claude":
          return resolveClaudeToken();
        case "codex":
          return resolveCodexToken();
        case "copilot":
          return resolveCopilotToken();
        case "cursor":
          return resolveCursorToken();
        case "grok":
          return resolveGrokToken();
        case "gemini":
          return resolveGeminiToken();
        default:
          return undefined;
      }
    },
    // Captured session secrets (e.g. a browser-login cookie) live in the
    // safeStorage-sealed store written by main; decrypt and return on demand.
    // Never logged.
    getSecret: async (providerId, key) =>
      cacheDir ? getUsageSecret(cacheDir, providerId, key) : undefined,
  };
}
