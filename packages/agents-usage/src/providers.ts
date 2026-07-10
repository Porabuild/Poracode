import type { UsageProviderDescriptor } from "./types";

export const BUILT_IN_USAGE_PROVIDER_DESCRIPTORS = {
  claude: {
    id: "claude",
    label: "Claude",
    mechanism: "oauth-endpoint",
    needsLogin: false,
    windowIds: ["session-5h", "weekly", "weekly-opus", "weekly-sonnet", "weekly-fable", "monthly"],
  },
  codex: {
    id: "codex",
    label: "Codex",
    mechanism: "oauth-endpoint",
    needsLogin: false,
    windowIds: ["session-5h", "weekly"],
  },
  copilot: {
    id: "copilot",
    label: "GitHub Copilot",
    mechanism: "oauth-endpoint",
    needsLogin: false,
    windowIds: ["monthly"],
  },
  cursor: {
    id: "cursor",
    label: "Cursor",
    mechanism: "oauth-endpoint",
    needsLogin: false,
    windowIds: ["monthly", "cursor-auto", "cursor-api"],
  },
  grok: {
    id: "grok",
    label: "Grok",
    mechanism: "oauth-endpoint",
    needsLogin: false,
    windowIds: ["monthly"],
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    mechanism: "oauth-endpoint",
    needsLogin: false,
    // Dynamic: one `gemini:<modelId>` window per model the quota API returns.
    windowIds: [],
  },
  commandcode: {
    id: "commandcode",
    label: "Command Code",
    mechanism: "cookie",
    needsLogin: true,
    windowIds: ["monthly"],
  },
  factory: {
    id: "factory",
    label: "Droid",
    mechanism: "cookie",
    needsLogin: true,
    // Standard token-rate-limit pool; optional pools use dynamic ids.
    windowIds: ["session-5h", "weekly", "monthly"],
  },
  zai: {
    id: "zai",
    label: "z.ai",
    mechanism: "api-key",
    needsLogin: true,
    windowIds: ["session-5h", "weekly", "monthly"],
  },
} satisfies Record<string, UsageProviderDescriptor>;

/** Descriptors for the built-in HTTP collectors, in registration order. */
export function builtInUsageProviderDescriptors(): UsageProviderDescriptor[] {
  return Object.values(BUILT_IN_USAGE_PROVIDER_DESCRIPTORS);
}

/**
 * The canonical catalog of every usage provider Lightcode supports, the single
 * source of truth for the renderer's provider list and the supervisor's default
 * collection set so the two never drift.
 *
 * Most providers are HTTP collectors registered in `registry.ts`. A couple are
 * collected supervisor-side because they need process / SQLite access the pure
 * HTTP registry can't do — they have a descriptor here but no package collector:
 * `antigravity` probes its local language server (cli-jsonrpc), and `opencode`
 * reads a local SQLite store plus the opencode.ai web session (local-log).
 */
export const LOCAL_USAGE_PROVIDER_DESCRIPTORS: readonly UsageProviderDescriptor[] = [
  {
    id: "antigravity",
    label: "Antigravity",
    mechanism: "cli-jsonrpc",
    needsLogin: false,
    windowIds: [],
  },
  {
    id: "opencode",
    label: "OpenCode",
    mechanism: "local-log",
    needsLogin: true,
    windowIds: ["session-5h", "weekly", "monthly"],
  },
];

/** Every usage provider, registry HTTP collectors first then the local ones. */
export function allUsageProviderDescriptors(): UsageProviderDescriptor[] {
  return [...builtInUsageProviderDescriptors(), ...LOCAL_USAGE_PROVIDER_DESCRIPTORS];
}
