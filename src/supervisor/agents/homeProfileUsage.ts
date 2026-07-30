import {
  collectCodex,
  collectCopilot,
  collectGemini,
  collectGrok,
  type HostPort,
  type OAuthToken,
  type UsageSnapshot,
} from "@poracode/agents-usage";
import {
  homeProfileKind,
  isHomeProfileDriver,
  parseHomeProfileInstanceConfig,
  type HomeProfileDriver,
} from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import { resolveCodexToken } from "../runtime/codexCredentials";
import { resolveCopilotToken } from "../runtime/copilotCredentials";
import { resolveGeminiToken } from "../runtime/geminiCredentials";
import { resolveGrokToken } from "../runtime/grokCredentials";
import { resolveNativeHomeProfilePath } from "./homeProfile";

export interface HomeUsageProfile {
  providerId: string;
  driver: HomeProfileDriver;
  homeDir: string;
}

interface HomeUsageProfileSpec {
  collect(host: HostPort): Promise<UsageSnapshot>;
  resolveToken(homeDir: string): Promise<OAuthToken | undefined>;
}

const HOME_USAGE_PROFILE_SPECS: Record<HomeProfileDriver, HomeUsageProfileSpec> = {
  codex: {
    collect: collectCodex,
    resolveToken: (homeDir) => resolveCodexToken({ CODEX_HOME: homeDir }),
  },
  copilot: {
    collect: collectCopilot,
    resolveToken: (homeDir) => resolveCopilotToken({ COPILOT_HOME: homeDir }),
  },
  gemini: {
    collect: collectGemini,
    resolveToken: (homeDir) => resolveGeminiToken({ GEMINI_CLI_HOME: homeDir }),
  },
  grok: {
    collect: collectGrok,
    resolveToken: (homeDir) => resolveGrokToken({ GROK_HOME: homeDir }),
  },
};

export function readHomeUsageProfiles(settings: SharedSettings): Map<string, HomeUsageProfile> {
  const profiles = new Map<string, HomeUsageProfile>();
  for (const instance of Object.values(settings.agentInstances)) {
    if (instance.enabled === false || !isHomeProfileDriver(instance.driver)) continue;
    try {
      const config = parseHomeProfileInstanceConfig(instance.config);
      const providerId = homeProfileKind(instance.driver, instance.id);
      profiles.set(providerId, {
        providerId,
        driver: instance.driver,
        homeDir: resolveNativeHomeProfilePath(config.homeDir),
      });
    } catch {
      // Malformed profile records are ignored by the agent registry too.
    }
  }
  return profiles;
}

export async function collectHomeProfile(
  profile: HomeUsageProfile,
  host: HostPort,
): Promise<UsageSnapshot> {
  const now = host.now();
  const spec = HOME_USAGE_PROFILE_SPECS[profile.driver];
  const scopedHost: HostPort = {
    http: host.http,
    now: () => host.now(),
    credentials: {
      getOAuthToken: () => spec.resolveToken(profile.homeDir),
      getSecret: async () => undefined,
    },
    ...(host.clientVersions ? { clientVersions: host.clientVersions } : {}),
    ...(host.log ? { log: host.log } : {}),
  };
  try {
    const snapshot = await spec.collect(scopedHost);
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
