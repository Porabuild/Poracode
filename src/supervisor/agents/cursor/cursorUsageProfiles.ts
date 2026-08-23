import { collectCursorFromApiKey, type HostPort, type UsageSnapshot } from "@poracode/agents-usage";
import { cursorProfileKind } from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";

/**
 * Cursor profiles cannot isolate `cursor-agent login`, so each profile's usage
 * is the User API key's own billing period — the same exchange cursor-agent
 * performs when `CURSOR_API_KEY` is set.
 */

export interface CursorUsageProfile {
  providerId: string;
  apiKey: string;
}

/** Enabled Cursor profile instances as usage providers, keyed by provider id. */
export function readCursorUsageProfiles(settings: SharedSettings): Map<string, CursorUsageProfile> {
  const profiles = new Map<string, CursorUsageProfile>();
  for (const instance of Object.values(settings.agentInstances)) {
    if (instance.enabled === false || instance.driver !== "cursor") continue;
    const apiKey = instance.environment?.CURSOR_API_KEY?.value.trim();
    if (!apiKey) continue;
    profiles.set(cursorProfileKind(instance.id), {
      providerId: cursorProfileKind(instance.id),
      apiKey,
    });
  }
  return profiles;
}

/**
 * Collect usage for one Cursor profile from its User API key. Never throws
 * into the refresh — failures come back as an error / auth-missing snapshot.
 */
export async function collectCursorProfile(
  profile: CursorUsageProfile,
  host: HostPort,
): Promise<UsageSnapshot> {
  const now = host.now();
  try {
    return await collectCursorFromApiKey(host, profile.apiKey, profile.providerId);
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
