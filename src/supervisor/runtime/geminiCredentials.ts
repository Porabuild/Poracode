import { createDecipheriv, scryptSync } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { hostname, userInfo } from "node:os";
import { delimiter, dirname, join } from "node:path";
import type { OAuthToken } from "@poracode/agents-usage";
import { resolveGeminiConfigDir } from "../agents/gemini/session";
import { readMacKeychainPassword } from "./macKeychain";
import { readGeminiCredsFromWsl } from "./wslCredentials";

/**
 * Gemini (Google) credential resolution across:
 *   1. `oauth_creds.json` under `<GEMINI_CLI_HOME>/.gemini` / `<GEMINI_HOME>` / `~/.gemini`
 *   2. Encrypted `FileKeychain` (`gemini-credentials.json`, v0.68.0+ fallback)
 *   3. macOS Keychain (`service: "gemini-cli-oauth"`, `account: "main-account"`)
 *   4. WSL fallback (win32 host default scope)
 *
 * Google access tokens last ~1h; expired or rejected tokens are refreshed
 * against `oauth2.googleapis.com/token` using the OAuth client id/secret read
 * from the installed `@google/gemini-cli` / `@google/gemini-cli-core` files.
 * Secrets are never logged.
 */

const GEMINI_KEYCHAIN_SERVICE = "gemini-cli-oauth";
const GEMINI_KEYCHAIN_ACCOUNT = "main-account";
const GEMINI_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const OAUTH_CLIENT_RE =
  /(?:var|const|let)\s+OAUTH_CLIENT_ID\s*=\s*(['"])([^'"]+)\1[\s\S]{0,200}?(?:var|const|let)\s+OAUTH_CLIENT_SECRET\s*=\s*(['"])([^'"]+)\3/;

interface GeminiCredsBlob {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
  id_token?: string;
}

interface GeminiStoredTokenShape {
  token?: {
    accessToken?: unknown;
    refreshToken?: unknown;
    expiresAt?: unknown;
  };
  accessToken?: unknown;
  refreshToken?: unknown;
  expiresAt?: unknown;
  access_token?: unknown;
  refresh_token?: unknown;
  expiry_date?: unknown;
  id_token?: unknown;
}

export interface ResolveGeminiTokenOptions {
  homeDir?: string;
  env?: Readonly<Record<string, string | undefined>>;
  skipWsl?: boolean;
  skipKeychain?: boolean;
  /** Skip OAuth refresh when computing read-only cache identities. */
  skipRefresh?: boolean;
  fileKeychainIdentity?: { hostname: string; username: string };
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

/**
 * Parse a credential JSON stored inside macOS Keychain or `FileKeychain`
 * (`HybridTokenStorage` / `MCPEncryptedFileTokenStorage` envelope or legacy).
 */
export function parseGeminiKeychainCredential(content: string): OAuthToken | undefined {
  let parsed: GeminiStoredTokenShape | undefined;
  try {
    parsed = JSON.parse(content) as GeminiStoredTokenShape;
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;

  const hasEnvelopeToken = parsed.token !== undefined && parsed.token !== null;
  const rawToken = hasEnvelopeToken && typeof parsed.token === "object" ? parsed.token : parsed;
  if (typeof rawToken.accessToken === "string" && rawToken.accessToken.trim()) {
    const refreshToken =
      typeof rawToken.refreshToken === "string" && rawToken.refreshToken.trim()
        ? rawToken.refreshToken.trim()
        : undefined;
    const expiresAt =
      typeof rawToken.expiresAt === "number" && Number.isFinite(rawToken.expiresAt)
        ? rawToken.expiresAt
        : undefined;
    return {
      accessToken: rawToken.accessToken.trim(),
      ...(refreshToken ? { refreshToken } : {}),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    };
  }
  if (hasEnvelopeToken && typeof parsed.token === "object") return undefined;

  return parseGeminiCreds(content);
}

/**
 * Decrypt and parse Gemini CLI v0.68.0's `gemini-credentials.json` (`FileKeychain`).
 */
export function parseGeminiFileKeychain(
  encryptedData: string,
  identity?: { hostname: string; username: string },
): OAuthToken | undefined {
  const parts = encryptedData.trim().split(":");
  if (parts.length !== 3) return undefined;

  try {
    const iv = Buffer.from(parts[0]!, "hex");
    const authTag = Buffer.from(parts[1]!, "hex");
    const encryptedHex = parts[2]!;
    if ((iv.length !== 12 && iv.length !== 16) || authTag.length !== 16) {
      return undefined;
    }
    const host = identity?.hostname ?? hostname();
    const user = identity?.username ?? userInfo().username;
    const salt = `${host}-${user}-gemini-cli`;
    const key = scryptSync(GEMINI_KEYCHAIN_SERVICE, salt, 32);
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    const store = JSON.parse(decrypted) as Record<string, Record<string, string>>;
    const rawCredential = store?.[GEMINI_KEYCHAIN_SERVICE]?.[GEMINI_KEYCHAIN_ACCOUNT];
    if (typeof rawCredential !== "string" || !rawCredential) return undefined;
    return parseGeminiKeychainCredential(rawCredential);
  } catch {
    return undefined;
  }
}

export function resolveGeminiCredentialsDir(options?: ResolveGeminiTokenOptions): string {
  return resolveGeminiConfigDir(options?.env, options?.homeDir);
}

function attachGoogleAccountEmail(token: OAuthToken, configDir: string): OAuthToken {
  if (token.raw && typeof (token.raw as { email?: unknown }).email === "string") {
    return token;
  }
  try {
    const raw = readFileSync(join(configDir, "google_accounts.json"), "utf8");
    const parsed = JSON.parse(raw) as { active?: unknown };
    if (typeof parsed.active === "string" && parsed.active.trim()) {
      return { ...token, raw: { ...token.raw, email: parsed.active.trim() } };
    }
  } catch {
    // ignore missing or malformed google_accounts.json
  }
  return token;
}

interface GeminiOAuthClient {
  clientId: string;
  clientSecret: string;
}

let geminiOAuthClientCache: GeminiOAuthClient | undefined;
const negativeOAuthClientCommands = new Set<string>();

function geminiCommandNames(): string[] {
  return process.platform === "win32"
    ? ["gemini", "gemini.exe", "gemini.cmd", "gemini.ps1"]
    : ["gemini"];
}

function findGeminiCommand(env?: Readonly<Record<string, string | undefined>>): string | undefined {
  const path = env?.PATH ?? env?.Path ?? process.env.PATH ?? process.env.Path;
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

export function extractGeminiOAuthClientFromSource(source: string): GeminiOAuthClient | undefined {
  const match = OAUTH_CLIENT_RE.exec(source);
  const clientId = match?.[2]?.trim();
  const clientSecret = match?.[4]?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

function candidateOAuthClientFilesFromPackageDir(packageDir: string): string[] {
  const files: string[] = [];
  const bundleDir = join(packageDir, "bundle");
  try {
    for (const file of readdirSync(bundleDir)) {
      if (file.endsWith(".js") || file.endsWith(".mjs")) {
        files.push(join(bundleDir, file));
      }
    }
  } catch {
    // no bundle dir (e.g. unbundled v0.68.0 ESM layout)
  }

  const coreOauthCandidates = [
    join(
      packageDir,
      "node_modules",
      "@google",
      "gemini-cli-core",
      "dist",
      "src",
      "code_assist",
      "oauth2.js",
    ),
    join(packageDir, "..", "gemini-cli-core", "dist", "src", "code_assist", "oauth2.js"),
    join(packageDir, "dist", "src", "code_assist", "oauth2.js"),
  ];
  for (const candidate of coreOauthCandidates) {
    if (existsSync(candidate)) files.push(candidate);
  }
  return files;
}

function geminiCliPackageDirsForCommand(resolvedCommand: string): string[] {
  const resolvedDir = dirname(resolvedCommand);
  const candidates = [
    join(resolvedDir, "node_modules", "@google", "gemini-cli"),
    resolvedDir,
    dirname(resolvedDir),
    dirname(dirname(resolvedDir)),
  ];
  return candidates.filter((candidate) => existsSync(join(candidate, "package.json")));
}

function readGeminiOAuthClient(
  env?: Readonly<Record<string, string | undefined>>,
): GeminiOAuthClient | undefined {
  if (geminiOAuthClientCache) return geminiOAuthClientCache;
  const command = findGeminiCommand(env);
  if (!command) return undefined;
  const resolvedCommand = safeRealpath(command);
  if (negativeOAuthClientCommands.has(resolvedCommand)) return undefined;

  for (const packageDir of geminiCliPackageDirsForCommand(resolvedCommand)) {
    for (const file of candidateOAuthClientFilesFromPackageDir(packageDir)) {
      try {
        const content = readFileSync(file, "utf8");
        const client = extractGeminiOAuthClientFromSource(content);
        if (client) {
          geminiOAuthClientCache = client;
          return client;
        }
      } catch {
        // continue scanning other candidate files
      }
    }
  }
  negativeOAuthClientCommands.add(resolvedCommand);
  return undefined;
}

/** Exchange a refresh token for a fresh access token (Google access tokens last ~1h). */
async function refreshGeminiToken(
  refreshToken: string,
  env?: Readonly<Record<string, string | undefined>>,
): Promise<OAuthToken | undefined> {
  const client = readGeminiOAuthClient(env);
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
async function withFreshGeminiToken(
  token: OAuthToken,
  env?: Readonly<Record<string, string | undefined>>,
): Promise<OAuthToken> {
  const nearExpiry = token.expiresAt !== undefined && token.expiresAt < Date.now() + 60_000;
  if (!nearExpiry || !token.refreshToken) return token;
  const refreshed = await refreshGeminiToken(token.refreshToken, env);
  // On failure, return the stale token — the endpoint 401 degrades to auth-missing
  // or triggers `refreshRejectedGeminiToken`.
  return refreshed ? { ...token, ...refreshed } : token;
}

async function readLocalGeminiToken(
  options?: ResolveGeminiTokenOptions,
): Promise<OAuthToken | undefined> {
  const configDir = resolveGeminiCredentialsDir(options);
  try {
    const token = parseGeminiCreds(readFileSync(join(configDir, "oauth_creds.json"), "utf8"));
    if (token) return attachGoogleAccountEmail(token, configDir);
  } catch {
    // fall through to FileKeychain / OS Keychain
  }

  try {
    const token = parseGeminiFileKeychain(
      readFileSync(join(configDir, "gemini-credentials.json"), "utf8"),
      options?.fileKeychainIdentity,
    );
    if (token) return attachGoogleAccountEmail(token, configDir);
  } catch {
    // fall through
  }

  const hasCustomScope = Boolean(
    options?.homeDir || options?.env?.GEMINI_CLI_HOME?.trim() || options?.env?.GEMINI_HOME?.trim(),
  );
  if (!options?.skipKeychain && !hasCustomScope && process.platform === "darwin") {
    const keychainRaw = await readMacKeychainPassword({
      service: GEMINI_KEYCHAIN_SERVICE,
      account: GEMINI_KEYCHAIN_ACCOUNT,
    });
    if (keychainRaw) {
      const token = parseGeminiKeychainCredential(keychainRaw);
      if (token) return attachGoogleAccountEmail(token, configDir);
    }
  }

  return undefined;
}

async function readGeminiTokenWithoutRefresh(
  options?: ResolveGeminiTokenOptions,
): Promise<OAuthToken | undefined> {
  const local = await readLocalGeminiToken(options);
  if (local) return local;

  if (!options?.skipWsl && process.platform === "win32") {
    const blob = await readGeminiCredsFromWsl();
    if (blob) return parseGeminiCreds(blob);
  }
  return undefined;
}

export async function resolveGeminiToken(
  options?: ResolveGeminiTokenOptions,
): Promise<OAuthToken | undefined> {
  const token = await readGeminiTokenWithoutRefresh(options);
  if (!token) return undefined;
  return options?.skipRefresh ? token : withFreshGeminiToken(token, options?.env);
}

/**
 * Force-refresh a Gemini OAuth token after Code Assist rejects it with 401/403.
 */
export async function refreshRejectedGeminiToken(
  rejectedToken: OAuthToken,
  options?: ResolveGeminiTokenOptions,
): Promise<OAuthToken | undefined> {
  // First check if another process already rotated the stored token on disk.
  const latest = await readGeminiTokenWithoutRefresh(options);
  if (latest && latest.accessToken !== rejectedToken.accessToken) {
    return latest;
  }

  const triedRefreshTokens = new Set<string>();
  const tryRefresh = async (
    base: OAuthToken,
    refreshToken: string | undefined,
  ): Promise<OAuthToken | undefined> => {
    if (!refreshToken || triedRefreshTokens.has(refreshToken)) return undefined;
    triedRefreshTokens.add(refreshToken);
    const refreshed = await refreshGeminiToken(refreshToken, options?.env);
    return refreshed ? { ...base, ...refreshed } : undefined;
  };

  return (
    (await tryRefresh(rejectedToken, rejectedToken.refreshToken)) ??
    (latest ? await tryRefresh(latest, latest.refreshToken) : undefined)
  );
}

export function resetGeminiOAuthClientCacheForTests(): void {
  geminiOAuthClientCache = undefined;
  negativeOAuthClientCommands.clear();
}
