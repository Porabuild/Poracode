import { createHash } from "node:crypto";
import { collectCodex, type HostPort, type UsageSnapshot } from "@poracode/agents-usage";
import { codexProfileKind, parseCodexProfileInstanceConfig } from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import { resolveCodexToken } from "../../runtime/codexCredentials";
import type { UsageProfileSource } from "../../runtime/usageProfileTypes";
import { resolveNativeTildePath } from "../base/sessionFs";

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

/** Register profile collection and cache custody at the provider boundary. */
export function createCodexUsageProfileSource(settings: SharedSettings): UsageProfileSource {
  return {
    collectors: [...readCodexUsageProfiles(settings).values()].map((profile) => ({
      providerId: profile.providerId,
      collect: (host) => collectCodexProfile(profile, host),
      cacheIdentity: async () => {
        const token = await resolveCodexToken({ CODEX_HOME: profile.homeDir });
        // Only the opaque fingerprint persists; home changes and login/logout
        // invalidate old quota before display and after asynchronous enrichment.
        return createHash("sha256")
          .update(JSON.stringify({ homeDir: profile.homeDir, token }))
          .digest("hex");
      },
    })),
  };
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
      // The profile home is authoritative: no fallback to the host or WSL account.
      getOAuthToken: () => resolveCodexToken({ CODEX_HOME: profile.homeDir }),
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
