import { createHash } from "node:crypto";
import { collectGemini, type HostPort, type UsageSnapshot } from "@poracode/agents-usage";
import { geminiProfileKind, parseGeminiProfileInstanceConfig } from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import { refreshRejectedGeminiToken, resolveGeminiToken } from "../../runtime/geminiCredentials";
import type { UsageProfileSource } from "../../runtime/usageProfileTypes";
import { resolveNativeTildePath } from "../base/sessionFs";

/**
 * Gemini-specific usage collection for profiles: each profile owns a
 * `GEMINI_CLI_HOME`, so its usage is the Google account stored under
 * `<homeDir>/.gemini/` — never the host `~/.gemini`, macOS Keychain, or WSL
 * fallback. Mirrors `codexUsageProfiles`.
 */

export interface GeminiUsageProfile {
  providerId: string;
  homeDir: string;
}

/** Register profile collection and cache custody at the provider boundary. */
export function createGeminiUsageProfileSource(settings: SharedSettings): UsageProfileSource {
  return {
    collectors: [...readGeminiUsageProfiles(settings).values()].map((profile) => ({
      providerId: profile.providerId,
      collect: (host) => collectGeminiProfile(profile, host),
      cacheIdentity: async () => {
        const token = await resolveGeminiToken({
          homeDir: profile.homeDir,
          skipWsl: true,
          skipKeychain: true,
          skipRefresh: true,
        });
        return createHash("sha256")
          .update(JSON.stringify({ homeDir: profile.homeDir, token }))
          .digest("hex");
      },
    })),
  };
}

/** Enabled Gemini profile instances as usage providers, keyed by provider id. */
export function readGeminiUsageProfiles(settings: SharedSettings): Map<string, GeminiUsageProfile> {
  const profiles = new Map<string, GeminiUsageProfile>();
  for (const instance of Object.values(settings.agentInstances)) {
    if (instance.enabled === false || instance.driver !== "gemini") continue;
    try {
      const cfg = parseGeminiProfileInstanceConfig(instance.config);
      const providerId = geminiProfileKind(instance.id);
      profiles.set(providerId, { providerId, homeDir: resolveNativeTildePath(cfg.homeDir) });
    } catch {
      // Malformed profile records are ignored by the agent registry too.
    }
  }
  return profiles;
}

/** Collect usage for one Gemini profile, scoped strictly to its `GEMINI_CLI_HOME`. */
export async function collectGeminiProfile(
  profile: GeminiUsageProfile,
  host: HostPort,
): Promise<UsageSnapshot> {
  const now = host.now();
  const scopeOptions = {
    homeDir: profile.homeDir,
    skipWsl: true,
    skipKeychain: true,
  } as const;
  const scopedHost: HostPort = {
    http: host.http,
    now: () => host.now(),
    credentials: {
      getOAuthToken: () => resolveGeminiToken(scopeOptions),
      refreshOAuthToken: (_providerId, token) => refreshRejectedGeminiToken(token, scopeOptions),
      getSecret: (providerId, key) => host.credentials.getSecret(providerId, key),
    },
    ...(host.clientVersions ? { clientVersions: host.clientVersions } : {}),
    ...(host.log ? { log: host.log } : {}),
  };
  try {
    const snapshot = await collectGemini(scopedHost);
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
