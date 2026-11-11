import type { UsageProviderDescriptor, UsageRingGroup, UsageRingSpec, UsageWindow } from "./types";
import { antigravityRingGroups } from "./collectors/antigravity.ts";

export const BUILT_IN_USAGE_PROVIDER_DESCRIPTORS = {
  claude: {
    id: "claude",
    rings: {
      outer: ["session-5h"],
      inner: ["weekly", "monthly", "weekly-opus", "weekly-sonnet", "weekly-fable"],
    },
    label: "Claude",
    mechanism: "oauth-endpoint",
    needsLogin: false,
    windowIds: ["session-5h", "weekly", "weekly-opus", "weekly-sonnet", "weekly-fable", "monthly"],
  },
  codex: {
    id: "codex",
    rings: { outer: ["session-5h"], inner: ["weekly", "monthly", "weekly-opus", "weekly-sonnet"] },
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
    rings: { outer: ["weekly", "cursor-auto"], inner: ["cursor-api"] },
    label: "Cursor",
    mechanism: "oauth-endpoint",
    needsLogin: false,
    windowIds: ["weekly", "monthly", "cursor-auto", "cursor-api", "extra-usage"],
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
    rings: { outer: ["session-5h"], inner: ["weekly", "monthly"] },
    label: "Command Code",
    mechanism: "oauth-endpoint",
    needsLogin: false,
    // Monthly credit pool plus rolling 5h / weekly USD caps from windowLimits.
    windowIds: ["session-5h", "weekly", "monthly"],
  },
  muse: {
    id: "muse",
    rings: { outer: ["session-5h"], inner: ["weekly"] },
    label: "Muse Code",
    // A saved browser session supplies quota and spend; otherwise reuse CLI OAuth.
    mechanism: "oauth-endpoint",
    needsLogin: true,
    browserSessionForDetails: true,
    windowIds: ["session-5h", "weekly"],
    refreshPolicy: {
      defaultIntervalMinutes: 15,
      rateLimitBackoffMs: [15, 30, 60].map((minutes) => minutes * 60_000),
    },
  },
  factory: {
    id: "factory",
    rings: { outer: ["session-5h"], inner: ["weekly", "monthly"] },
    label: "Droid",
    mechanism: "cookie",
    needsLogin: true,
    // Standard token-rate-limit pool; optional pools use dynamic ids.
    windowIds: ["session-5h", "weekly", "monthly"],
  },
  zai: {
    id: "zai",
    rings: { outer: ["session-5h"], inner: ["weekly"] },
    label: "z.ai",
    mechanism: "api-key",
    needsLogin: true,
    windowIds: ["session-5h", "weekly", "monthly"],
  },
  devin: {
    id: "devin",
    rings: { outer: ["daily"], inner: ["weekly"] },
    label: "Devin",
    mechanism: "oauth-endpoint",
    needsLogin: false,
    windowIds: ["daily", "weekly"],
  },
  kimi: {
    id: "kimi",
    rings: { outer: ["session-5h"], inner: ["weekly"] },
    label: "Kimi Code",
    mechanism: "api-key",
    needsLogin: true,
    windowIds: ["session-5h", "weekly"],
  },
  qwen: {
    id: "qwen",
    rings: { outer: ["session-5h"], inner: ["weekly", "monthly"] },
    label: "Alibaba Token Plan",
    mechanism: "cookie",
    needsLogin: true,
    apiKeyFallback: true,
    windowIds: ["session-5h", "weekly", "monthly"],
  },
  qoder: {
    id: "qoder",
    label: "Qoder",
    mechanism: "cookie",
    needsLogin: true,
    apiKeyFallback: true,
    windowIds: ["monthly"],
  },
} satisfies Record<string, UsageProviderDescriptor>;

/** Descriptors for the built-in HTTP collectors, in registration order. */
export function builtInUsageProviderDescriptors(): UsageProviderDescriptor[] {
  return Object.values(BUILT_IN_USAGE_PROVIDER_DESCRIPTORS);
}

/**
 * The canonical catalog of every usage provider Poracode supports, the single
 * source of truth for the renderer's provider list and the supervisor's default
 * collection set so the two never drift.
 *
 * Most providers are HTTP collectors registered in `registry.ts`. Several are
 * collected supervisor-side because they need process / SQLite access the pure
 * HTTP registry can't do — they have a descriptor here but no package collector:
 * `antigravity` prefers its local language server and falls back to Cloud Code
 * with official ACP credentials, while `opencode` needs the supervisor to read
 * the CLI's local `auth.json` Go key (direct `/zen/go/v1/usage` endpoint) plus
 * the opencode.ai cookie session for the Zen balance. Go quota meters come from
 * the API key first, the web session as fallback — never from local
 * `opencode.db` spend. `fx` runs `fx usage --json` supervisor-side.
 */
export const LOCAL_USAGE_PROVIDER_DESCRIPTORS: readonly UsageProviderDescriptor[] = [
  {
    id: "antigravity",
    ringGroups: antigravityRingGroups,
    label: "Antigravity",
    mechanism: "cli-jsonrpc",
    needsLogin: false,
    windowIds: [],
  },
  {
    id: "opencode",
    rings: { outer: ["session-5h"], inner: ["weekly", "monthly"] },
    label: "OpenCode",
    // Go plan meters come from the CLI's Go API key directly; the cookie login
    // remains for the Zen balance and as a fallback source for the Go windows.
    mechanism: "cookie",
    needsLogin: true,
    windowIds: ["session-5h", "weekly", "monthly"],
  },
  {
    id: "fx",
    rings: { outer: ["session-5h"], inner: ["weekly", "monthly", "daily"] },
    label: "fx",
    mechanism: "cli-jsonrpc",
    needsLogin: false,
    windowIds: ["session-5h", "weekly", "monthly", "daily", "extra-usage"],
  },
];

/** Every usage provider, registry HTTP collectors first then the local ones. */
export function allUsageProviderDescriptors(): UsageProviderDescriptor[] {
  return [...builtInUsageProviderDescriptors(), ...LOCAL_USAGE_PROVIDER_DESCRIPTORS];
}

function usageRingDescriptor(providerId: string): UsageProviderDescriptor | undefined {
  const descriptors = allUsageProviderDescriptors();
  return (
    descriptors.find((item) => item.id === providerId) ??
    descriptors.find((item) => item.id === providerId.split(":", 1)[0])
  );
}

function firstWindowMatching(
  windows: readonly UsageWindow[],
  ids: readonly string[],
): UsageWindow | undefined {
  for (const id of ids) {
    const match = windows.find((w) => w.id === id);
    if (match) return match;
  }
  return undefined;
}

/** The selectable ring groups for a provider, or [] when it has none. */
export function usageRingGroups(
  providerId: string,
  windows?: readonly UsageWindow[],
): readonly UsageRingGroup[] {
  const groups = usageRingDescriptor(providerId)?.ringGroups;
  return typeof groups === "function" ? groups(windows) : (groups ?? []);
}

/** Resolve the selected ring group for a provider, defaulting to the first. */
function resolveRingGroup(
  groups: readonly UsageRingGroup[],
  selectedKey: string | undefined,
): UsageRingGroup | undefined {
  return groups.find((g) => g.key === selectedKey) ?? groups[0];
}

function ringsFromSpec(
  windows: readonly UsageWindow[],
  spec: UsageRingSpec,
): { outer?: UsageWindow; inner?: UsageWindow } | undefined {
  const outer = firstWindowMatching(windows, spec.outer);
  const inner = firstWindowMatching(windows, spec.inner);
  if (outer && inner) return { outer, inner };
  if (outer) return { outer };
  if (inner) return { outer: inner };
  return undefined;
}

/**
 * Pick the ring(s) for a provider circle. Providers with selectable ring groups
 * (Antigravity) render the user-selected group; providers with a real
 * short-vs-long split (per their `rings` spec) render the faster window as the
 * outer ring and the slower one as the inner ring — like a clock's hands.
 * Everyone else renders a single ring on the most-constrained window.
 */
export function pickUsageRings(
  providerId: string,
  windows: readonly UsageWindow[] | undefined,
  selectedRingGroup?: string,
): { outer?: UsageWindow; inner?: UsageWindow } {
  if (!windows || windows.length === 0) return {};
  const meta = usageRingDescriptor(providerId);
  const groups = usageRingGroups(providerId, windows);
  if (groups.length > 0) {
    const group = resolveRingGroup(groups, selectedRingGroup);
    const fromGroup = group ? ringsFromSpec(windows, group) : undefined;
    if (fromGroup) return fromGroup;
  } else if (meta?.rings) {
    const fromSpec = ringsFromSpec(windows, meta.rings);
    if (fromSpec) return fromSpec;
  }
  const worst = [...windows].sort((a, b) => b.usedPercent - a.usedPercent)[0];
  return worst ? { outer: worst } : {};
}
