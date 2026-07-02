import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type ClaudeRefreshedToken,
  type OAuthToken,
  refreshClaudeOAuthToken,
} from "@lightcode/agents-usage";
import { writeFileAtomic } from "@/shared/atomicFile";
import { coalesceByKey } from "@/shared/coalesce";
import {
  readClaudeCredentialsFromMacKeychainEntry,
  readClaudeCredentialsFromMacKeychainService,
  writeClaudeCredentialsToMacKeychain,
} from "./macClaudeKeychain";
import { createNodeHttpClient } from "./usageHttpClient";
import { readClaudeCredentialsFromWindowsVault } from "./windowsClaudeVault";
import { readClaudeCredsFromWsl } from "./wslCredentials";

/**
 * Claude (Anthropic) credential resolution, reusing the files Poracode's
 * detection already reads. The pure parser is exported separately for tests.
 * Secrets are never logged.
 */

interface ClaudeOAuthBlob {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  subscriptionType?: string;
  rateLimitTier?: string;
}

export interface ClaudeCredentialEnv {
  CLAUDE_CONFIG_DIR?: string | undefined;
  CLAUDE_SECURESTORAGE_CONFIG_DIR?: string | undefined;
  CLAUDE_CODE_CUSTOM_OAUTH_URL?: string | undefined;
}

interface ClaudeTokenCandidate {
  token: OAuthToken;
  refresh?(options?: { force?: boolean }): Promise<OAuthToken | undefined>;
}

interface ClaudeStoredTokenIO {
  read(): string | undefined | Promise<string | undefined>;
  write(content: string): void | Promise<void>;
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

/**
 * Candidate Claude Code config dirs, honoring an explicit CLAUDE_CONFIG_DIR
 * override. Shared by credential lookup and the local cost scanner.
 */
export function claudeConfigDirs(
  env: { CLAUDE_CONFIG_DIR?: string | undefined } = process.env,
): string[] {
  const configDir = env.CLAUDE_CONFIG_DIR?.trim();
  if (configDir) {
    return [configDir];
  }
  return [join(homedir(), ".claude"), join(homedir(), ".config", "claude")];
}

function hasExplicitClaudeConfig(env: ClaudeCredentialEnv): boolean {
  return Boolean(
    env.CLAUDE_CONFIG_DIR?.trim() || env.CLAUDE_SECURESTORAGE_CONFIG_DIR !== undefined,
  );
}

export async function resolveClaudeToken(
  env: ClaudeCredentialEnv = process.env,
  deps: ClaudeRefreshDeps = prodClaudeRefreshDeps(),
): Promise<OAuthToken | undefined> {
  for (const candidate of await readClaudeTokenCandidates(env, deps)) {
    const resolved = await resolveClaudeCandidateToken(candidate, deps, { force: false });
    if (resolved) return resolved;
  }
  return undefined;
}

export async function refreshRejectedClaudeToken(
  rejectedToken: OAuthToken,
  env: ClaudeCredentialEnv = process.env,
  deps: ClaudeRefreshDeps = prodClaudeRefreshDeps(),
): Promise<OAuthToken | undefined> {
  const candidates = await readClaudeTokenCandidates(env, deps);
  const rejectedIndex = candidates.findIndex(
    (candidate) => candidate.token.accessToken === rejectedToken.accessToken,
  );
  const startIndex = rejectedIndex >= 0 ? rejectedIndex : 0;
  for (let i = startIndex; i < candidates.length; i += 1) {
    const candidate = candidates[i]!;
    if (candidate.token.accessToken === rejectedToken.accessToken) {
      const refreshed = await resolveClaudeCandidateToken(candidate, deps, { force: true });
      if (refreshed?.accessToken && refreshed.accessToken !== rejectedToken.accessToken) {
        return refreshed;
      }
      continue;
    }
    const fallback = await resolveClaudeCandidateToken(candidate, deps, { force: false });
    if (fallback?.accessToken && fallback.accessToken !== rejectedToken.accessToken) {
      return fallback;
    }
  }
  return undefined;
}

async function readClaudeTokenCandidates(
  env: ClaudeCredentialEnv,
  deps: ClaudeRefreshDeps,
): Promise<ClaudeTokenCandidate[]> {
  const candidates: ClaudeTokenCandidate[] = [];
  for (const dir of claudeConfigDirs(env)) {
    const path = join(dir, ".credentials.json");
    if (!existsSync(path)) continue;
    try {
      const content = deps.readFile(path);
      const token = parseClaudeCredentials(content);
      if (token) {
        candidates.push({
          token,
          refresh: (options) =>
            coalesceByKey(claudeRefreshInFlight, `file:${path}`, () =>
              refreshClaudeFileTokenIfExpired(path, content, token, deps, options),
            ),
        });
      }
    } catch {
      // try the next candidate dir
    }
  }
  // Current native Claude Code builds on macOS store the same JSON payload in
  // the login keychain instead of writing `~/.claude/.credentials.json`.
  if (process.platform === "darwin") {
    const entry = await readClaudeCredentialsFromMacKeychainEntry(env);
    if (entry) {
      const token = parseClaudeCredentials(entry.content);
      if (token) {
        candidates.push({
          token,
          refresh: (options) =>
            coalesceByKey(claudeRefreshInFlight, `keychain:${entry.service}`, () =>
              refreshClaudeKeychainTokenIfExpired(
                entry.service,
                entry.content,
                token,
                deps,
                options,
              ),
            ),
        });
      }
    }
  }
  if (hasExplicitClaudeConfig(env)) {
    return candidates;
  }
  // On native Windows, Claude Code may store the OAuth token in the Windows
  // Credential Manager rather than a file (Win-CodexBar issue #22). Best-effort
  // fallback; degrades to auth-missing on any failure. The file path above
  // covers Linux, WSL, and the common Windows case.
  if (process.platform === "win32") {
    const blob = await readClaudeCredentialsFromWindowsVault();
    if (blob) {
      const token = parseClaudeCredentials(blob);
      if (token) candidates.push({ token });
    }
    // Signed in only inside WSL? Read the distro's creds (token works anywhere).
    const wslBlob = await readClaudeCredsFromWsl();
    if (wslBlob) {
      const token = parseClaudeCredentials(wslBlob);
      if (token) candidates.push({ token });
    }
  }
  return candidates;
}

async function resolveClaudeCandidateToken(
  candidate: ClaudeTokenCandidate,
  deps: Pick<ClaudeRefreshDeps, "now">,
  options: { force: boolean },
): Promise<OAuthToken | undefined> {
  if (
    candidate.refresh &&
    (options.force || isClaudeTokenRefreshDue(candidate.token, deps.now()))
  ) {
    return candidate.refresh(options);
  }
  if (options.force) return undefined;
  if (isClaudeTokenExpired(candidate.token, deps.now())) return undefined;
  return candidate.token;
}

/**
 * Claude OAuth access tokens are short-lived. Refresh before expiry so an idle
 * Claude account can keep usage live, and force-refresh after the usage
 * endpoint explicitly rejects a token. The refresh token is shared with the
 * Claude Code CLI and may rotate, so every write re-reads the backing store and
 * defers to a token another process already refreshed.
 */
const REFRESH_SKEW_MS = 5 * 60_000;

export function isClaudeTokenExpired(token: Pick<OAuthToken, "expiresAt">, nowMs: number): boolean {
  return typeof token.expiresAt === "number" && token.expiresAt <= nowMs;
}

export function isClaudeTokenRefreshDue(
  token: Pick<OAuthToken, "expiresAt">,
  nowMs: number,
  skewMs = REFRESH_SKEW_MS,
): boolean {
  return typeof token.expiresAt === "number" && token.expiresAt <= nowMs + skewMs;
}

/**
 * Merge a refreshed token into the original credentials JSON, preserving the
 * file's wrapper shape (`{ claudeAiOauth: {...} }` or a bare object) and every
 * other field (subscriptionType, scopes, …). Returns the serialized JSON.
 */
export function mergeClaudeCredentialsJson(
  originalContent: string,
  refreshed: ClaudeRefreshedToken,
): string {
  const parsed = JSON.parse(originalContent) as Record<string, unknown>;
  const wrapped = typeof parsed?.claudeAiOauth === "object" && parsed.claudeAiOauth !== null;
  const oauth = (wrapped ? parsed.claudeAiOauth : parsed) as Record<string, unknown>;
  oauth.accessToken = refreshed.accessToken;
  oauth.refreshToken = refreshed.refreshToken;
  oauth.expiresAt = refreshed.expiresAt;
  return JSON.stringify(parsed);
}

/** Injectable I/O for {@link refreshClaudeFileTokenIfExpired}; defaulted for prod. */
export interface ClaudeRefreshDeps {
  now(): number;
  refresh(refreshToken: string, nowMs: number): Promise<ClaudeRefreshedToken | undefined>;
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
}

export function defaultClaudeRefreshDeps(): ClaudeRefreshDeps {
  const http = createNodeHttpClient();
  return {
    now: () => Date.now(),
    refresh: (refreshToken, nowMs) => refreshClaudeOAuthToken(http, refreshToken, nowMs),
    readFile: (path) => readFileSync(path, "utf8"),
    // Atomic write with owner-only perms (cleans up its temp file on failure),
    // so a torn or crashed write never corrupts or leaks the credentials file.
    writeFile: (path, content) => writeFileAtomic(path, content, { encoding: "utf8", mode: 0o600 }),
  };
}

/** Built once and reused so the http client isn't rebuilt on every resolve. */
let cachedRefreshDeps: ClaudeRefreshDeps | undefined;
function prodClaudeRefreshDeps(): ClaudeRefreshDeps {
  return (cachedRefreshDeps ??= defaultClaudeRefreshDeps());
}

/** In-flight refresh per resolved creds path, so same-tick callers share one POST. */
const claudeRefreshInFlight = new Map<string, Promise<OAuthToken | undefined>>();

async function refreshClaudeStoredTokenIfNeeded(
  originalContent: string,
  token: OAuthToken,
  deps: ClaudeRefreshDeps,
  io: ClaudeStoredTokenIO,
  options: { force?: boolean } = {},
): Promise<OAuthToken | undefined> {
  const now = deps.now();
  const force = options.force === true;
  if (!force && !isClaudeTokenRefreshDue(token, now)) return token;

  if (!token.refreshToken) {
    return force || isClaudeTokenExpired(token, now) ? undefined : token;
  }

  const refreshed = await deps.refresh(token.refreshToken, now);
  if (!refreshed) {
    try {
      const afterContent = await io.read();
      const after = afterContent ? parseClaudeCredentials(afterContent) : undefined;
      if (
        after?.accessToken &&
        after.accessToken !== token.accessToken &&
        !isClaudeTokenRefreshDue(after, deps.now())
      ) {
        return after;
      }
    } catch {
      // Re-read failed — fall through to the normal failed-refresh handling.
    }
    if (!force && !isClaudeTokenExpired(token, deps.now())) return token;
    return undefined;
  }

  let latestContent = originalContent;
  try {
    const afterContent = await io.read();
    if (afterContent) {
      latestContent = afterContent;
      const after = parseClaudeCredentials(afterContent);
      if (
        after?.accessToken &&
        after.accessToken !== token.accessToken &&
        !isClaudeTokenRefreshDue(after, deps.now())
      ) {
        return after;
      }
    }
  } catch {
    // Re-read failed; merge into the content the caller already gave us.
  }

  try {
    await io.write(mergeClaudeCredentialsJson(latestContent, refreshed));
  } catch {
    // Persisting failed (read-only fs, locked keychain). Still return the fresh
    // token so this collection succeeds; the next cycle will retry persistence.
  }
  return {
    ...token,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: refreshed.expiresAt,
  };
}

export async function refreshClaudeFileTokenIfExpired(
  path: string,
  originalContent: string,
  token: OAuthToken,
  deps: ClaudeRefreshDeps,
  options: { force?: boolean } = {},
): Promise<OAuthToken | undefined> {
  return refreshClaudeStoredTokenIfNeeded(
    originalContent,
    token,
    deps,
    {
      read: () => deps.readFile(path),
      write: (content) => deps.writeFile(path, content),
    },
    options,
  );
}

async function refreshClaudeKeychainTokenIfExpired(
  service: string,
  originalContent: string,
  token: OAuthToken,
  deps: ClaudeRefreshDeps,
  options: { force?: boolean } = {},
): Promise<OAuthToken | undefined> {
  return refreshClaudeStoredTokenIfNeeded(
    originalContent,
    token,
    deps,
    {
      read: () => readClaudeCredentialsFromMacKeychainService(service),
      write: (content) => writeClaudeCredentialsToMacKeychain(service, content),
    },
    options,
  );
}
