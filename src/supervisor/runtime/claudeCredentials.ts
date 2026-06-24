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
import { readClaudeCredentialsFromMacKeychain } from "./macClaudeKeychain";
import { createNodeHttpClient } from "./usageHttpClient";
import { readClaudeCredentialsFromWindowsVault } from "./windowsClaudeVault";
import { readClaudeCredsFromWsl } from "./wslCredentials";

/**
 * Claude (Anthropic) credential resolution, reusing the files Lightcode's
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
  for (const dir of claudeConfigDirs(env)) {
    const path = join(dir, ".credentials.json");
    if (!existsSync(path)) continue;
    try {
      const content = readFileSync(path, "utf8");
      const token = parseClaudeCredentials(content);
      // File-backed creds are the only source we can persist a rotated token to,
      // so refresh is scoped here (covers every Claude profile + the common base
      // case). Keychain/vault/WSL sources below are returned as-is. Coalesce per
      // path so the base "claude" resolver and a profile aliasing the same file
      // share one refresh instead of both POSTing (and burning) the refresh token.
      if (token) {
        const resolved = await coalesceByKey(claudeRefreshInFlight, path, () =>
          refreshClaudeFileTokenIfExpired(path, content, token, deps),
        );
        // A live, usable token wins. A dead one (expired + unrefreshable) yields
        // undefined: fall through to the platform stores below — the live token
        // may instead live in the Keychain/Vault/WSL — and ultimately to
        // auth-missing rather than returning the stale token and pinning the
        // usage card on "Rate limited".
        if (resolved) return resolved;
      }
    } catch {
      // try the next candidate dir
    }
  }
  // Current native Claude Code builds on macOS store the same JSON payload in
  // the login keychain instead of writing `~/.claude/.credentials.json`.
  if (process.platform === "darwin") {
    const blob = await readClaudeCredentialsFromMacKeychain(env);
    if (blob) {
      const token = parseClaudeCredentials(blob);
      if (token) return token;
    }
  }
  if (hasExplicitClaudeConfig(env)) {
    return undefined;
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

/**
 * Self-refresh of an expired Claude OAuth access token, the way the Claude Code
 * CLI does it: POST the stored refresh token to Anthropic's OAuth endpoint and
 * rewrite the credentials file with the rotated token. The access token has a
 * short (~8h) TTL; when no running CLI keeps it fresh it expires, the usage
 * endpoint 401s, and the provider card flips to "Not signed in" until the
 * account is used again. Refreshing here keeps usage live for idle accounts.
 *
 * Refresh tokens are single-use, and the on-disk file is shared with the Claude
 * Code CLI (anthropics/claude-code#24317), so this is deliberately conservative:
 *  - It only fires once the token is *past* expiry plus a grace window — never
 *    while it is still valid — so a CLI that refreshes proactively always wins
 *    the rotation and we step in only for genuinely idle/dead tokens.
 *  - Concurrent refreshes of one file are coalesced per path (in-process) and
 *    the file is re-read after the network call to defer to a rotation another
 *    writer just performed instead of clobbering it.
 *  - Any failure returns the original token (degrades to "not signed in",
 *    exactly as before). Secrets are never logged.
 *
 * A residual race remains and is inherent to single-use refresh tokens: a CLI
 * that has been running but idle *past* the access-token expiry holds the old
 * refresh token in memory, so our rotation can force it to re-login when it next
 * wakes. We accept this (rare) case rather than not refreshing at all.
 */

/** Refresh only once the token is this far PAST expiry (lets a live CLI rotate first). */
const EXPIRY_GRACE_MS = 30_000;

export function isClaudeTokenExpired(
  token: Pick<OAuthToken, "expiresAt">,
  nowMs: number,
  graceMs = EXPIRY_GRACE_MS,
): boolean {
  return typeof token.expiresAt === "number" && token.expiresAt + graceMs <= nowMs;
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

/**
 * Given the credentials file content the caller just read and its parsed token,
 * refresh + persist when the access token is (grace-)expired. Returns the token
 * the collector should use: the still-valid token, the freshly rotated one on a
 * successful refresh, or `undefined` when the token is expired and cannot be
 * refreshed.
 *
 * Returning `undefined` (rather than the stale expired token) on a failed
 * refresh is deliberate: an idle account whose refresh token is dead/rotated
 * otherwise keeps firing an expired token at the usage endpoint every cycle,
 * which the server answers with a 429 — leaving the card stuck on "Rate limited"
 * instead of the truthful "Not signed in". Signaling absence lets the collector
 * report `auth-missing` and the user re-auth.
 */
export async function refreshClaudeFileTokenIfExpired(
  path: string,
  originalContent: string,
  token: OAuthToken,
  deps: ClaudeRefreshDeps,
): Promise<OAuthToken | undefined> {
  // Still valid (or no expiry recorded) — use as-is. Covers tokens without a
  // refresh token, which a live CLI keeps fresh.
  if (!isClaudeTokenExpired(token, deps.now())) return token;

  // Expired with no way to refresh: treat as signed out.
  if (!token.refreshToken) return undefined;

  const refreshed = await deps.refresh(token.refreshToken, deps.now());
  if (!refreshed) {
    // Refresh failed (revoked/rotated refresh token, or the OAuth endpoint is
    // itself rate-limiting us). A live CLI may have rotated the on-disk token
    // while we were in flight — defer to that if it is now valid; otherwise
    // report signed-out instead of returning the stale expired token.
    try {
      const after = parseClaudeCredentials(deps.readFile(path));
      if (after?.accessToken && !isClaudeTokenExpired(after, deps.now())) return after;
    } catch {
      // Re-read failed — fall through to signed-out.
    }
    return undefined;
  }

  // Re-read after the network round-trip (up to ~15s): if another writer rotated
  // the token while we were in flight, return theirs rather than clobbering it
  // with a write derived from now-stale content.
  let latestContent = originalContent;
  try {
    latestContent = deps.readFile(path);
    const after = parseClaudeCredentials(latestContent);
    if (after?.accessToken && !isClaudeTokenExpired(after, deps.now())) return after;
  } catch {
    // Re-read failed; merge into the content the caller already gave us.
  }

  try {
    deps.writeFile(path, mergeClaudeCredentialsJson(latestContent, refreshed));
  } catch {
    // Persisting failed (read-only fs, perms). Still return the fresh token so
    // this fetch succeeds; the next cycle re-refreshes from the unchanged file.
  }
  return {
    ...token,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: refreshed.expiresAt,
  };
}
