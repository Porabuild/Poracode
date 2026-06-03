import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OAuthToken } from "@lightcode/agents-usage";
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

export async function resolveClaudeToken(): Promise<OAuthToken | undefined> {
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
