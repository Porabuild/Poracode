import { create } from "zustand";

/**
 * Per-provider "a login secret is stored" flags, sourced from the main process
 * (`getUsageLoginState`). This is the persistent source of truth for whether a
 * provider is signed in, decoupled from the usage snapshot — so a failed or
 * empty usage fetch (transient error, no displayable windows) never flips the
 * card back to "Sign in". The card keeps it in sync after sign-in/out without a
 * round-trip via `setStored`.
 */

interface UsageLoginStateStore {
  stored: Record<string, boolean>;
  setAll: (stored: Record<string, boolean>) => void;
  setStored: (providerId: string, stored: boolean) => void;
}

export const useUsageLoginStateStore = create<UsageLoginStateStore>()((set) => ({
  stored: {},
  setAll: (stored) => set({ stored }),
  setStored: (providerId, stored) =>
    set((prev) =>
      prev.stored[providerId] === stored
        ? prev
        : { stored: { ...prev.stored, [providerId]: stored } },
    ),
}));

/** Narrow per-provider selector — re-renders only when this provider changes. */
export function useHasStoredSession(providerId: string): boolean {
  return useUsageLoginStateStore((s) => s.stored[providerId] ?? false);
}
