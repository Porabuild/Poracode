import { collectClaude } from "./collectors/claude";
import { collectCodex } from "./collectors/codex";
import { collectCommandCode } from "./collectors/commandcode";
import { collectCopilot } from "./collectors/copilot";
import { collectCursor } from "./collectors/cursor";
import { collectFactory } from "./collectors/factory";
import { collectGemini } from "./collectors/gemini";
import { collectGrok } from "./collectors/grok";
import { collectKimi } from "./collectors/kimi";
import { collectQwen } from "./collectors/qwen";
import { collectZai } from "./collectors/zai";
import type { CollectOptions, HostPort } from "./host";
import { BUILT_IN_USAGE_PROVIDER_DESCRIPTORS } from "./providers";
import type { UsageProviderDescriptor, UsageSnapshot } from "./types";

/**
 * A self-contained usage collector for one provider. Adding a provider is a new
 * file under `collectors/`, a descriptor in `providers.ts`, and one entry in
 * `BUILT_IN`, mirroring the supervisor's `agents/registry.ts`.
 */
export interface UsageCollector {
  readonly descriptor: UsageProviderDescriptor;
  collect(host: HostPort, opts?: CollectOptions): Promise<UsageSnapshot>;
}

const CLAUDE_COLLECTOR: UsageCollector = {
  descriptor: BUILT_IN_USAGE_PROVIDER_DESCRIPTORS.claude,
  collect: collectClaude,
};

const CODEX_COLLECTOR: UsageCollector = {
  descriptor: BUILT_IN_USAGE_PROVIDER_DESCRIPTORS.codex,
  collect: collectCodex,
};

const COPILOT_COLLECTOR: UsageCollector = {
  descriptor: BUILT_IN_USAGE_PROVIDER_DESCRIPTORS.copilot,
  collect: collectCopilot,
};

const CURSOR_COLLECTOR: UsageCollector = {
  descriptor: BUILT_IN_USAGE_PROVIDER_DESCRIPTORS.cursor,
  collect: collectCursor,
};

const GROK_COLLECTOR: UsageCollector = {
  descriptor: BUILT_IN_USAGE_PROVIDER_DESCRIPTORS.grok,
  collect: collectGrok,
};

const GEMINI_COLLECTOR: UsageCollector = {
  descriptor: BUILT_IN_USAGE_PROVIDER_DESCRIPTORS.gemini,
  collect: collectGemini,
};

const COMMANDCODE_COLLECTOR: UsageCollector = {
  descriptor: BUILT_IN_USAGE_PROVIDER_DESCRIPTORS.commandcode,
  collect: collectCommandCode,
};

const FACTORY_COLLECTOR: UsageCollector = {
  descriptor: BUILT_IN_USAGE_PROVIDER_DESCRIPTORS.factory,
  collect: collectFactory,
};

const ZAI_COLLECTOR: UsageCollector = {
  descriptor: BUILT_IN_USAGE_PROVIDER_DESCRIPTORS.zai,
  collect: collectZai,
};

const KIMI_COLLECTOR: UsageCollector = {
  descriptor: BUILT_IN_USAGE_PROVIDER_DESCRIPTORS.kimi,
  collect: collectKimi,
};

const QWEN_COLLECTOR: UsageCollector = {
  descriptor: BUILT_IN_USAGE_PROVIDER_DESCRIPTORS.qwen,
  collect: collectQwen,
};

// Antigravity is collected supervisor-side from its local language server
// (LS-only), not here; see src/supervisor/runtime/antigravityUsageScanner.ts.

const BUILT_IN: UsageCollector[] = [
  CLAUDE_COLLECTOR,
  CODEX_COLLECTOR,
  COPILOT_COLLECTOR,
  CURSOR_COLLECTOR,
  GROK_COLLECTOR,
  GEMINI_COLLECTOR,
  COMMANDCODE_COLLECTOR,
  FACTORY_COLLECTOR,
  ZAI_COLLECTOR,
  KIMI_COLLECTOR,
  QWEN_COLLECTOR,
];

export interface UsageCollectorRegistry {
  has(id: string): boolean;
  descriptors(): UsageProviderDescriptor[];
  /** Collect one provider. Errors are caught and returned as an `error` snapshot. */
  collect(id: string, host: HostPort, opts?: CollectOptions): Promise<UsageSnapshot>;
  /** Collect many providers concurrently (defaults to all registered). */
  collectAll(
    ids: readonly string[] | undefined,
    host: HostPort,
    opts?: CollectOptions,
  ): Promise<UsageSnapshot[]>;
}

/**
 * Build a usage registry from the built-in collectors plus any caller-supplied
 * extras (e.g. cookie-based or API-key providers added in a later phase).
 */
export function createUsageCollectorRegistry(extra: UsageCollector[] = []): UsageCollectorRegistry {
  const collectors = new Map<string, UsageCollector>();
  for (const collector of [...BUILT_IN, ...extra]) {
    collectors.set(collector.descriptor.id, collector);
  }

  async function collectOne(
    id: string,
    host: HostPort,
    opts?: CollectOptions,
  ): Promise<UsageSnapshot> {
    const collector = collectors.get(id);
    if (!collector) {
      return { providerId: id, status: "unsupported", windows: [], fetchedAt: host.now() };
    }
    try {
      return await collector.collect(host, opts);
    } catch (err) {
      return {
        providerId: id,
        status: "error",
        windows: [],
        fetchedAt: host.now(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    has: (id) => collectors.has(id),
    descriptors: () => [...collectors.values()].map((c) => c.descriptor),
    collect: collectOne,
    collectAll: (ids, host, opts) => {
      const targets = ids ?? [...collectors.keys()];
      return Promise.all(targets.map((id) => collectOne(id, host, opts)));
    },
  };
}
