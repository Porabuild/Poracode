import type { HostPort, UsageSnapshot } from "@lightcode/agents-usage";
import { scanAntigravityUsage } from "./antigravityUsageScanner";
import { scanOpenCodeUsage } from "./openCodeUsageScanner";

/**
 * Providers collected supervisor-side rather than via the package's pure HTTP
 * registry, because they need process / SQLite access it can't do: `opencode`
 * reads a local SQLite store plus the opencode.ai web session, `antigravity`
 * probes its local language server.
 *
 * Modeled on the package's `UsageCollector` registry so the service stays
 * provider-agnostic — adding a local provider is a new entry here, not another
 * branch in `usageService`.
 */
export interface LocalUsageCollector {
  readonly id: string;
  collect(nowMs: number, host: HostPort): Promise<UsageSnapshot>;
}

export interface LocalUsageCollectorsOptions {
  getActiveAntigravityWslDistros?: () => readonly string[];
}

export function createLocalUsageCollectors(
  options: LocalUsageCollectorsOptions = {},
): LocalUsageCollector[] {
  return [
    { id: "opencode", collect: (nowMs, host) => scanOpenCodeUsage(nowMs, host) },
    {
      id: "antigravity",
      collect: (nowMs) =>
        scanAntigravityUsage(nowMs, options.getActiveAntigravityWslDistros?.() ?? []),
    },
  ];
}
