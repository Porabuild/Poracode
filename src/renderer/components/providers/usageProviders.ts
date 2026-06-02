/**
 * Providers the usage tracker supports in the renderer. Mirrors the built-in
 * collectors registered in `@lightcode/agents-usage`; adding a provider means
 * adding a collector there and an entry here.
 */
export type UsageProvider = {
  id: string;
  label: string;
  /** Offers an in-app browser login that captures a web session cookie. */
  supportsCookieLogin?: boolean;
  /**
   * All windows reset on one shared clock, so the UI shows a single reset
   * countdown in the header instead of one per window (e.g. Cursor).
   */
  sharedWindowReset?: boolean;
};

export const USAGE_PROVIDERS: ReadonlyArray<UsageProvider> = [
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex" },
  { id: "copilot", label: "GitHub Copilot", supportsCookieLogin: true },
  { id: "cursor", label: "Cursor", sharedWindowReset: true },
  { id: "grok", label: "Grok", supportsCookieLogin: true },
  { id: "gemini", label: "Gemini" },
  { id: "opencode", label: "OpenCode", supportsCookieLogin: true },
];

/** Providers that expose the browser-overlay cookie login. */
export function supportsCookieLogin(providerId: string): boolean {
  return USAGE_PROVIDERS.some((p) => p.id === providerId && p.supportsCookieLogin === true);
}

/** Providers whose windows share one reset clock (one header countdown, no per-window resets). */
export function usesSharedWindowReset(providerId: string): boolean {
  return USAGE_PROVIDERS.some((p) => p.id === providerId && p.sharedWindowReset === true);
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
