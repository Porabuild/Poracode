import { collectClaude } from "./collectors/claude";
import { collectCodex } from "./collectors/codex";
import { collectCommandCode } from "./collectors/commandcode";
import { collectCopilot } from "./collectors/copilot";
import { collectCursor } from "./collectors/cursor";
import { collectFactory } from "./collectors/factory";
import { collectGemini } from "./collectors/gemini";
import { collectGrok } from "./collectors/grok";
import { collectZai } from "./collectors/zai";
import type { CollectOptions, HostPort } from "./host";
import type { UsageProviderDescriptor, UsageSnapshot } from "./types";

/**
 * A self-contained usage collector for one provider. Adding a provider is a new
 * file under `collectors/` plus one entry in `BUILT_IN` — no shared-file edits,
 * mirroring the supervisor's `agents/registry.ts`.
 */
export interface UsageCollector {
  readonly descriptor: UsageProviderDescriptor;
  collect(host: HostPort, opts?: CollectOptions): Promise<UsageSnapshot>;
}

const CLAUDE_COLLECTOR: UsageCollector = {
  descriptor: {
    id: "claude",
    label: "Claude",
    mechanism: "oauth-endpoint",
    needsLogin: false,
    windowIds: ["session-5h", "weekly", "weekly-opus", "weekly-sonnet", "weekly-fable", "monthly"],
  },
  collect: collectClaude,
};

const CODEX_COLLECTOR: UsageCollector = {
  descriptor: {
    id: "codex",
    label: "Codex",
    mechanism: "oauth-endpoint",
    needsLogin: false,
    windowIds: ["session-5h", "weekly"],
  },
  collect: collectCodex,
};

const COPILOT_COLLECTOR: UsageCollector = {
  descriptor: {
    id: "copilot",
    label: "GitHub Copilot",
    mechanism: "oauth-endpoint",
    needsLogin: false,
    windowIds: ["monthly"],
  },
  collect: collectCopilot,
};

const CURSOR_COLLECTOR: UsageCollector = {
  descriptor: {
    id: "cursor",
    label: "Cursor",
    mechanism: "oauth-endpoint",
    needsLogin: false,
    windowIds: ["monthly", "cursor-auto", "cursor-api"],
  },
  collect: collectCursor,
};

const GROK_COLLECTOR: UsageCollector = {
  descriptor: {
    id: "grok",
    label: "Grok",
    mechanism: "oauth-endpoint",
    needsLogin: false,
    windowIds: ["monthly"],
  },
  collect: collectGrok,
};

const GEMINI_COLLECTOR: UsageCollector = {
  descriptor: {
    id: "gemini",
    label: "Gemini",
    mechanism: "oauth-endpoint",
    needsLogin: false,
    // Dynamic: one `gemini:<modelId>` window per model the quota API returns.
    windowIds: [],
  },
  collect: collectGemini,
};

const COMMANDCODE_COLLECTOR: UsageCollector = {
  descriptor: {
    id: "commandcode",
    label: "Command Code",
    mechanism: "cookie",
    needsLogin: true,
    windowIds: ["monthly"],
  },
  collect: collectCommandCode,
};

const FACTORY_COLLECTOR: UsageCollector = {
  descriptor: {
    id: "factory",
    label: "Droid",
    mechanism: "cookie",
    needsLogin: true,
    // Standard token-rate-limit pool; the optional "core" pool and legacy
    // "premium" pool flow through dynamically as `factory:<pool>` ids.
    windowIds: ["session-5h", "weekly", "monthly"],
  },
  collect: collectFactory,
};

const ZAI_COLLECTOR: UsageCollector = {
  descriptor: {
    id: "zai",
    label: "z.ai",
    // HTTP collector reading a Bearer API key — native (`Z_AI_API_KEY`) or a key
    // pasted into the in-app sign-in. `needsLogin` drives that sign-in affordance.
    mechanism: "api-key",
    needsLogin: true,
    windowIds: ["session-5h", "weekly", "monthly"],
  },
  collect: collectZai,
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
];

/** Descriptors for the built-in HTTP collectors, in registration order. */
export function builtInUsageProviderDescriptors(): UsageProviderDescriptor[] {
  return BUILT_IN.map((collector) => collector.descriptor);
}

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
