import { homedir } from "node:os";
import { join } from "node:path";
import { collectClaude, type HostPort, type UsageSnapshot } from "@poracode/agents-usage";
import {
  claudeProfileKind,
  isClaudeProfileKind,
  parseClaudeProfileInstanceConfig,
} from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import { refreshRejectedClaudeToken, resolveClaudeToken } from "../../runtime/claudeCredentials";
import { scanClaudeCost } from "../../runtime/usageCostScanner";

/**
 * Claude-specific usage collection: per-profile (CLAUDE_CONFIG_DIR-scoped)
 * snapshot collection, the local-log estimated-cost merge, and the
 * auth-miss stale-while-revalidate rule. Extracted from `UsageService`, which
 * keeps the provider-agnostic caching/refresh orchestration.
 */

export interface ClaudeUsageProfile {
  providerId: string;
  configDir: string;
}

export function isClaudeUsageProvider(id: string): boolean {
  return id === "claude" || isClaudeProfileKind(id);
}

/**
 * Claude's OAuth access token can expire while the CLI has been idle, and a
 * one-off usage auth miss does not prove the user has signed out. When this
 * returns true, `UsageService` keeps the last displayable snapshot verbatim
 * (old `fetchedAt` included, so the footer reflects when the displayed numbers
 * were actually obtained and the next refresh cycle keeps trying to recover).
 * A first-time auth miss (no prior displayable snapshot) still renders as not
 * signed in.
 */
export function shouldPreserveClaudeAuthMiss(snap: UsageSnapshot): boolean {
  return snap.status === "auth-missing" && isClaudeUsageProvider(snap.providerId);
}

function resolveNativeTildePath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  return trimmed;
}

/** Enabled Claude profile instances as usage providers, keyed by provider id. */
export function readClaudeUsageProfiles(settings: SharedSettings): Map<string, ClaudeUsageProfile> {
  const profiles = new Map<string, ClaudeUsageProfile>();
  for (const instance of Object.values(settings.agentInstances)) {
    if (instance.enabled === false || instance.driver !== "claude") continue;
    try {
      const cfg = parseClaudeProfileInstanceConfig(instance.config);
      const providerId = claudeProfileKind(instance.id);
      profiles.set(providerId, {
        providerId,
        configDir: resolveNativeTildePath(cfg.configDir),
      });
    } catch {
      // Malformed profile records are ignored by the agent registry too.
    }
  }
  return profiles;
}

/**
 * Collect usage for one Claude profile by scoping the credential host to the
 * profile's CLAUDE_CONFIG_DIR. Never throws into the refresh — failures come
 * back as an error snapshot.
 */
export async function collectClaudeProfile(
  profile: ClaudeUsageProfile,
  host: HostPort,
): Promise<UsageSnapshot> {
  const now = host.now();
  const scopedHost: HostPort = {
    http: host.http,
    now: () => host.now(),
    credentials: {
      getOAuthToken: () => resolveClaudeToken({ CLAUDE_CONFIG_DIR: profile.configDir }),
      refreshOAuthToken: (_providerId, token) =>
        refreshRejectedClaudeToken(token, { CLAUDE_CONFIG_DIR: profile.configDir }),
      getSecret: (providerId, key) => host.credentials.getSecret(providerId, key),
    },
    ...(host.clientVersions ? { clientVersions: host.clientVersions } : {}),
    ...(host.log ? { log: host.log } : {}),
  };
  try {
    const snapshot = await collectClaude(scopedHost);
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

/**
 * Merge estimated 30-day cost + tokens (from local logs at API rates) into a
 * Claude / Claude-profile snapshot. Non-Claude snapshots pass through
 * unchanged. Best-effort and cached; never throws into the refresh.
 */
export async function withClaudeEstimatedCost(
  snapshot: UsageSnapshot,
  profiles: Map<string, ClaudeUsageProfile>,
  now: number,
): Promise<UsageSnapshot> {
  const profile = profiles.get(snapshot.providerId);
  const isBaseClaude = snapshot.providerId === "claude";
  if (!isBaseClaude && !profile) return snapshot;
  try {
    const scan = await scanClaudeCost(
      now,
      profile ? { CLAUDE_CONFIG_DIR: profile.configDir } : undefined,
    );
    if (!scan.estimate) return snapshot;
    return {
      ...snapshot,
      cost: scan.estimate.cost,
      tokens: scan.estimate.tokens,
    };
  } catch {
    return snapshot;
  }
}
