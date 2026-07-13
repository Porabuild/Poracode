import { antigravityWindowId } from "@poracode/agents-usage/antigravity";
import { allUsageProviderDescriptors } from "@poracode/agents-usage/providers";
import type { UsageWindow } from "@poracode/agents-usage/types";
import {
  baseAgentKind,
  claudeProfileKind,
  parseClaudeProfileInstanceConfig,
  type AgentInstanceConfigMap,
} from "@/shared/contracts";

/**
 * Providers the usage tracker shows in the renderer. The canonical id + label +
 * order come from the package catalog (`allUsageProviderDescriptors`), the single
 * source of truth shared with the supervisor. Renderer-only presentation (login
 * affordance, shared reset clock, ring layout) is layered on per id via
 * `RENDERER_META`, so adding a provider means adding a package descriptor plus an
 * optional entry here.
 */
/**
 * One selectable ring layout for a provider whose circle can show different
 * subsets of its windows (e.g. Antigravity's Gemini vs Claude+GPT groups). The
 * user swaps between groups by right-clicking the circle; `key` is the persisted
 * selection and `label` names it in the swap menu.
 */
export type UsageRingGroup = {
  key: string;
  label: string;
  outer: readonly string[];
  inner: readonly string[];
};

export type UsageProvider = {
  id: string;
  label: string;
  /** Offers an in-app browser login (web-session cookie or OAuth device flow). */
  supportsBrowserLogin?: boolean;
  /** Offers an in-app API-key paste sign-in (no browser step, e.g. z.ai). */
  supportsApiKeyLogin?: boolean;
  /**
   * All windows reset on one shared clock, so the UI shows a single reset
   * countdown in the header instead of one per window (e.g. Cursor).
   */
  sharedWindowReset?: boolean;
  /**
   * Window ids to render as concentric rings on the provider circle: `outer` is
   * the faster window (e.g. a 5h session), `inner` the slower one (weekly /
   * monthly). The first id present in the snapshot wins for each slot. When
   * unset, a single ring is drawn on the most-constrained window.
   */
  rings?: { outer: readonly string[]; inner: readonly string[] };
  /**
   * Multiple selectable ring layouts (e.g. Antigravity shows one quota group at
   * a time). When set, the circle renders the user-selected group (default: the
   * first) and offers a right-click swap. Takes precedence over `rings`.
   */
  ringGroups?: readonly UsageRingGroup[];
};

/** Renderer-only presentation, keyed by provider id; merged onto the catalog. */
const RENDERER_META: Record<string, Omit<UsageProvider, "id" | "label">> = {
  // Antigravity reports two quota groups (Gemini, Claude+GPT), each with a 5h
  // (outer) and weekly (inner) window. The circle shows one group at a time —
  // Gemini by default — and right-click swaps to the other. All four windows
  // still render as bars in the expanded usage card.
  antigravity: {
    ringGroups: [
      {
        key: "gemini",
        label: "Gemini",
        outer: [antigravityWindowId("gemini", "session-5h")],
        inner: [antigravityWindowId("gemini", "weekly")],
      },
      {
        key: "claude",
        label: "Claude & GPT",
        outer: [antigravityWindowId("claude", "session-5h")],
        inner: [antigravityWindowId("claude", "weekly")],
      },
    ],
  },
  claude: {
    rings: {
      outer: ["session-5h"],
      inner: ["weekly", "monthly", "weekly-opus", "weekly-sonnet", "weekly-fable"],
    },
  },
  codex: {
    rings: { outer: ["session-5h"], inner: ["weekly", "monthly", "weekly-opus", "weekly-sonnet"] },
  },
  // Copilot uses GitHub's OAuth device flow, the others a captured web-session
  // cookie — both surface as the in-app browser login.
  commandcode: { supportsBrowserLogin: true },
  copilot: { supportsBrowserLogin: true },
  cursor: { sharedWindowReset: true, rings: { outer: ["cursor-auto"], inner: ["cursor-api"] } },
  // Droid signs in via the in-app app.factory.ai browser session. The standard
  // pool's 5h window is the fast outer ring; weekly/monthly the slower inner one.
  // On a legacy (per-cycle) account only `monthly` (Standard) is ring-eligible —
  // the glance ring intentionally tracks the Standard pool; the separate
  // `factory:premium` pool still renders as a bar in the expanded detail panel.
  factory: {
    supportsBrowserLogin: true,
    rings: { outer: ["session-5h"], inner: ["weekly", "monthly"] },
  },
  grok: { supportsBrowserLogin: true },
  opencode: { supportsBrowserLogin: true },
  // z.ai authenticates with a pasted API key, not a browser session.
  // The ring tracks token rate-limits only: the 5h window plus the weekly window
  // when the plan returns one. The monthly MCP-tools quota is a different kind of
  // limit, so it's deliberately omitted from the ring (it still shows as a card bar).
  zai: {
    supportsApiKeyLogin: true,
    rings: { outer: ["session-5h"], inner: ["weekly"] },
  },
};

const STATIC_USAGE_PROVIDERS: ReadonlyArray<UsageProvider> = allUsageProviderDescriptors().map(
  (d) => ({ id: d.id, label: d.label, ...RENDERER_META[d.id] }),
);

export const USAGE_PROVIDERS: ReadonlyArray<UsageProvider> = STATIC_USAGE_PROVIDERS;

function rendererMeta(providerId: string): Omit<UsageProvider, "id" | "label"> | undefined {
  return RENDERER_META[providerId] ?? RENDERER_META[baseAgentKind(providerId)];
}

export function isClaudeUsageProvider(providerId: string): boolean {
  return baseAgentKind(providerId) === "claude";
}

function claudeProfileUsageProviders(
  agentInstances: AgentInstanceConfigMap | undefined,
): UsageProvider[] {
  if (!agentInstances) return [];
  const profiles: UsageProvider[] = [];
  for (const instance of Object.values(agentInstances)) {
    if (instance.enabled === false || instance.driver !== "claude") continue;
    try {
      parseClaudeProfileInstanceConfig(instance.config);
    } catch {
      continue;
    }
    const label = instance.displayName ?? instance.id;
    profiles.push({
      id: claudeProfileKind(instance.id),
      label: `Claude ${label}`,
      ...rendererMeta("claude"),
    });
  }
  profiles.sort((a, b) => a.label.localeCompare(b.label));
  return profiles;
}

export function usageProvidersForAgentInstances(
  agentInstances: AgentInstanceConfigMap | undefined,
): UsageProvider[] {
  const profiles = claudeProfileUsageProviders(agentInstances);
  if (profiles.length === 0) return [...STATIC_USAGE_PROVIDERS];
  const out: UsageProvider[] = [];
  for (const provider of STATIC_USAGE_PROVIDERS) {
    out.push(provider);
    if (provider.id === "claude") {
      out.push(...profiles);
    }
  }
  return out;
}

/** Providers that expose the browser-overlay login (cookie or device flow). */
export function supportsBrowserLogin(providerId: string): boolean {
  return rendererMeta(providerId)?.supportsBrowserLogin === true;
}

/** Providers that sign in by pasting an API key (no browser step, e.g. z.ai). */
export function supportsApiKeyLogin(providerId: string): boolean {
  return rendererMeta(providerId)?.supportsApiKeyLogin === true;
}

/** Providers whose windows share one reset clock (one header countdown, no per-window resets). */
export function usesSharedWindowReset(providerId: string): boolean {
  return rendererMeta(providerId)?.sharedWindowReset === true;
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
export function usageRingGroups(providerId: string): readonly UsageRingGroup[] {
  return rendererMeta(providerId)?.ringGroups ?? [];
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
  spec: { outer: readonly string[]; inner: readonly string[] },
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
  const meta = rendererMeta(providerId);
  const groups = meta?.ringGroups;
  if (groups && groups.length > 0) {
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

/**
 * Enabled providers ordered by the user's saved order, with the rest at the
 * tail. Shared by the usage panel and the sidebar rail so a reorder in either
 * place is reflected in both (both persist to `usage.providerOrder`).
 */
export function resolveDisplayedProviders(
  providerOrder: readonly string[],
  disabledProviders: readonly string[],
  agentInstances?: AgentInstanceConfigMap,
): UsageProvider[] {
  const enabled = usageProvidersForAgentInstances(agentInstances).filter(
    (p) => !disabledProviders.includes(p.id),
  );
  const byId = new Map(enabled.map((p) => [p.id, p]));
  const ordered: UsageProvider[] = [];
  const seen = new Set<string>();
  for (const id of providerOrder) {
    const provider = byId.get(id);
    if (provider && !seen.has(id)) {
      ordered.push(provider);
      seen.add(id);
    }
  }
  for (const provider of enabled) {
    if (!seen.has(provider.id)) {
      ordered.push(provider);
      seen.add(provider.id);
    }
  }
  return ordered;
}
