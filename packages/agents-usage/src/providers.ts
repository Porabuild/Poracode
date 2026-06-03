import { builtInUsageProviderDescriptors } from "./registry";
import type { UsageProviderDescriptor } from "./types";

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
