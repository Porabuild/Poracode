import { allUsageProviderDescriptors, type UsageWindow } from "@lightcode/agents-usage";

/**
 * Providers the usage tracker shows in the renderer. The canonical id + label +
 * order come from the package catalog (`allUsageProviderDescriptors`), the single
 * source of truth shared with the supervisor. Renderer-only presentation (login
 * affordance, shared reset clock, ring layout) is layered on per id via
 * `RENDERER_META`, so adding a provider means adding a package descriptor plus an
 * optional entry here.
 */
export type UsageProvider = {
  id: string;
  label: string;
  /** Offers an in-app browser login (web-session cookie or OAuth device flow). */
  supportsBrowserLogin?: boolean;
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
};

/** Renderer-only presentation, keyed by provider id; merged onto the catalog. */
const RENDERER_META: Record<string, Omit<UsageProvider, "id" | "label">> = {
  claude: {
    rings: { outer: ["session-5h"], inner: ["weekly", "monthly", "weekly-opus", "weekly-sonnet"] },
  },
  codex: {
    rings: { outer: ["session-5h"], inner: ["weekly", "monthly", "weekly-opus", "weekly-sonnet"] },
  },
  // Copilot uses GitHub's OAuth device flow, the others a captured web-session
  // cookie — both surface as the in-app browser login.
  copilot: { supportsBrowserLogin: true },
  cursor: { sharedWindowReset: true, rings: { outer: ["cursor-auto"], inner: ["cursor-api"] } },
  grok: { supportsBrowserLogin: true },
  opencode: { supportsBrowserLogin: true },
};

export const USAGE_PROVIDERS: ReadonlyArray<UsageProvider> = allUsageProviderDescriptors().map(
  (d) => ({ id: d.id, label: d.label, ...RENDERER_META[d.id] }),
);

/** Providers that expose the browser-overlay login (cookie or device flow). */
export function supportsBrowserLogin(providerId: string): boolean {
  return USAGE_PROVIDERS.some((p) => p.id === providerId && p.supportsBrowserLogin === true);
}

/** Providers whose windows share one reset clock (one header countdown, no per-window resets). */
export function usesSharedWindowReset(providerId: string): boolean {
  return USAGE_PROVIDERS.some((p) => p.id === providerId && p.sharedWindowReset === true);
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

/**
 * Pick the ring(s) for a provider circle. Providers with a real short-vs-long
 * split (per their `rings` spec) render the faster window as the outer ring and
 * the slower one as the inner ring — like a clock's hands. Everyone else renders
 * a single ring on the most-constrained window.
 */
export function pickUsageRings(
  providerId: string,
  windows: readonly UsageWindow[] | undefined,
): { outer?: UsageWindow; inner?: UsageWindow } {
  if (!windows || windows.length === 0) return {};
  const spec = USAGE_PROVIDERS.find((p) => p.id === providerId)?.rings;
  if (spec) {
    const outer = firstWindowMatching(windows, spec.outer);
    const inner = firstWindowMatching(windows, spec.inner);
    if (outer && inner) return { outer, inner };
    if (outer) return { outer };
    if (inner) return { outer: inner };
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
): UsageProvider[] {
  const enabled = USAGE_PROVIDERS.filter((p) => !disabledProviders.includes(p.id));
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
