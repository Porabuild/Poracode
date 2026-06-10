import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OAuthToken } from "@lightcode/agents-usage";
import { readClaudeCredentialsFromMacKeychain } from "./macClaudeKeychain";
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
): Promise<OAuthToken | undefined> {
  for (const dir of claudeConfigDirs(env)) {
    const path = join(dir, ".credentials.json");
    if (!existsSync(path)) continue;
    try {
      const token = parseClaudeCredentials(readFileSync(path, "utf8"));
      if (token) return token;
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
