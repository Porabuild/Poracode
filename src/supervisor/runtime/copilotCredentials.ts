import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OAuthToken } from "@lightcode/agents-usage";
import { readWindowsCredentialTarget } from "./windowsClaudeVault";
import { readCopilotTokenFromWsl } from "./wslCredentials";

/**
 * GitHub Copilot credential resolution: an explicit env token, the Copilot CLI's
 * config (whose token lives in the Windows Credential Manager), or — on native
 * Windows — a `gh auth token` read from inside WSL. The config-target parser is
 * exported separately for tests. Secrets are never logged.
 */

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

export async function resolveCopilotToken(): Promise<OAuthToken | undefined> {
  const fromEnv = copilotTokenFromEnv();
  if (fromEnv) return { accessToken: fromEnv };
  const fromCopilotCli = await resolveCopilotCliToken();
  if (fromCopilotCli) return fromCopilotCli;
  // Signed in only inside WSL? `gh auth token` works regardless of which env
  // fetches with it, matching the other providers' native→WSL fallback.
  if (process.platform === "win32") {
    const wslToken = await readCopilotTokenFromWsl();
    if (wslToken) return { accessToken: wslToken };
  }
  return undefined;
}
