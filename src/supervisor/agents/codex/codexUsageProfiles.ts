import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { collectCodex, type HostPort, type UsageSnapshot } from "@poracode/agents-usage";
import { codexProfileKind, parseCodexProfileInstanceConfig } from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import { parseCodexAuth } from "../../runtime/codexCredentials";

/**
 * Codex-specific usage collection for profiles: each profile owns a
 * `CODEX_HOME`, so its usage is the ChatGPT account whose token lives in
 * `<homeDir>/auth.json` — never the global `~/.codex` token the base Codex
 * tile uses. Mirrors `claudeUsageProfiles`.
 */

export interface CodexUsageProfile {
  providerId: string;
  homeDir: string;
}

function resolveNativeTildePath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  return trimmed;
}

/** Enabled Codex profile instances as usage providers, keyed by provider id. */
export function readCodexUsageProfiles(settings: SharedSettings): Map<string, CodexUsageProfile> {
  const profiles = new Map<string, CodexUsageProfile>();
  for (const instance of Object.values(settings.agentInstances)) {
    if (instance.enabled === false || instance.driver !== "codex") continue;
    try {
      const cfg = parseCodexProfileInstanceConfig(instance.config);
      const providerId = codexProfileKind(instance.id);
      profiles.set(providerId, { providerId, homeDir: resolveNativeTildePath(cfg.homeDir) });
    } catch {
      // Malformed profile records are ignored by the agent registry too.
    }
  }
  return profiles;
}

/**
 * Collect usage for one Codex profile by scoping the credential host to the
 * profile's `CODEX_HOME`. Read fresh every call — the access token is a
 * short-lived JWT the CLI refreshes. Never throws into the refresh.
 */
export async function collectCodexProfile(
  profile: CodexUsageProfile,
  host: HostPort,
): Promise<UsageSnapshot> {
  const now = host.now();
  const scopedHost: HostPort = {
    http: host.http,
    now: () => host.now(),
    credentials: {
      getOAuthToken: () => {
        const path = join(profile.homeDir, "auth.json");
        if (!existsSync(path)) return Promise.resolve(undefined);
        try {
          return Promise.resolve(parseCodexAuth(readFileSync(path, "utf8")));
        } catch {
          return Promise.resolve(undefined);
        }
      },
      getSecret: (providerId, key) => host.credentials.getSecret(providerId, key),
    },
    ...(host.clientVersions ? { clientVersions: host.clientVersions } : {}),
    ...(host.log ? { log: host.log } : {}),
  };
  try {
    const snapshot = await collectCodex(scopedHost);
    return { ...snapshot, providerId: profile.providerId };
  } catch (error) {
    return {
      providerId: profile.providerId,
      status: "error",
      windows: [],
      fetchedAt: now,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
