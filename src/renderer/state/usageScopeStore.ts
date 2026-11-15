import { create } from "zustand";

interface UsageScopeState {
  /** null means the local Electron host; browser clients resolve null to their active server. */
  desktopId: string | null;
  /** Provider to show first for a contextual Usage-page navigation. */
  preferredProviderId: string | null;
  revealRequest: { providerId: string } | null;
  refreshVersion: number;
  setDesktopId: (desktopId: string | null) => void;
  setPreferredProviderId: (providerId: string | null) => void;
  requestRefresh: () => void;
  revealProvider: (providerId: string) => void;
}

/** Session-only scope shared by the docked Usage panel and compact full-page header. */
export const useUsageScopeStore = create<UsageScopeState>()((set) => ({
  desktopId: null,
  preferredProviderId: null,
  revealRequest: null,
  refreshVersion: 0,
  setDesktopId: (desktopId) =>
    set((state) => (state.desktopId === desktopId ? {} : { desktopId, revealRequest: null })),
  setPreferredProviderId: (preferredProviderId) =>
    set((state) =>
      state.preferredProviderId === preferredProviderId && state.revealRequest === null
        ? {}
        : { preferredProviderId, revealRequest: null },
    ),
  requestRefresh: () => set((state) => ({ refreshVersion: state.refreshVersion + 1 })),
  revealProvider: (providerId) =>
    set({
      revealRequest: { providerId },
      preferredProviderId: null,
    }),
}));
