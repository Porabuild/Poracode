import { create } from "zustand";

interface UsageScopeState {
  /** null means the local Electron host; browser clients resolve null to their active server. */
  desktopId: string | null;
  /** Provider to show first for a contextual Usage-page navigation. */
  preferredProviderId: string | null;
  refreshVersion: number;
  setDesktopId: (desktopId: string | null) => void;
  setPreferredProviderId: (providerId: string | null) => void;
  requestRefresh: () => void;
}

/** Session-only scope shared by the docked Usage panel and compact full-page header. */
export const useUsageScopeStore = create<UsageScopeState>()((set) => ({
  desktopId: null,
  preferredProviderId: null,
  refreshVersion: 0,
  setDesktopId: (desktopId) => set((state) => (state.desktopId === desktopId ? {} : { desktopId })),
  setPreferredProviderId: (preferredProviderId) =>
    set((state) =>
      state.preferredProviderId === preferredProviderId ? {} : { preferredProviderId },
    ),
  requestRefresh: () => set((state) => ({ refreshVersion: state.refreshVersion + 1 })),
}));
