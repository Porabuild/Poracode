import type { HostPort, UsageSnapshot } from "@poracode/agents-usage";
import type { AgentKind, AgentStatus } from "@/shared/contracts";
import { coalesceByKey } from "@/shared/coalesce";
import type { AgentAdapter } from "../agents/base";
import {
  scanAntigravityUsage,
  type AntigravityUsageRuntime,
} from "../agents/antigravity/antigravityUsageScanner";
import { scanFxUsage } from "../agents/fx/usage";
import { scanOpenCodeUsage } from "../agents/opencode/openCodeUsageScanner";

/**
 * Providers collected supervisor-side rather than via the package's pure HTTP
 * registry, because they need process / SQLite access it can't do: `opencode`
 * reads a local SQLite store plus the opencode.ai web session, `antigravity`
 * reads signed-in CLI/ACP quota or its local language server, and `fx` runs the
 * CLI's `fx usage --json`.
 *
 * Modeled on the package's `UsageCollector` registry so the service stays
 * provider-agnostic — adding a local provider is a new entry here, not another
 * branch in `usageService`.
 */
export interface LocalUsageCollector {
  readonly id: string;
  collect(nowMs: number, host: HostPort, signal?: AbortSignal): Promise<UsageSnapshot>;
}

export interface LocalUsageRuntime {
  status: AgentStatus;
  adapter: AgentAdapter;
}

export interface LocalUsageCollectorsOptions {
  getActiveAntigravityWslDistros?: () => readonly string[];
  /** Actual detected runtime statuses/adapters; never inferred from provider ids. */
  getUsageRuntime?: (agentKind: AgentKind) => Promise<LocalUsageRuntime | undefined>;
}

const ANTIGRAVITY_USAGE_ID = "antigravity";

export function createLocalUsageCollectors(
  options: LocalUsageCollectorsOptions = {},
): LocalUsageCollector[] {
  const antigravityInFlight = new Map<string, Promise<UsageSnapshot>>();
  return [
    { id: "opencode", collect: (nowMs, host) => scanOpenCodeUsage(nowMs, host) },
    {
      id: ANTIGRAVITY_USAGE_ID,
      collect: (nowMs, _host, signal) =>
        coalesceByKey(antigravityInFlight, ANTIGRAVITY_USAGE_ID, () =>
          scanAntigravityUsage(nowMs, options.getActiveAntigravityWslDistros?.() ?? [], {
            ...(signal ? { signal } : {}),
            getRuntime: async (): Promise<AntigravityUsageRuntime | undefined> =>
              options.getUsageRuntime?.(ANTIGRAVITY_USAGE_ID),
          }),
        ),
    },
    { id: "fx", collect: (nowMs) => scanFxUsage(nowMs) },
  ];
}
