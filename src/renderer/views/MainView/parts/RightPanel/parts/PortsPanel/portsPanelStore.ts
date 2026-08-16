import { create } from "zustand";

interface PortsPanelChromeState {
  refreshVersion: number;
  manualForwardVersion: number;
  loading: boolean;
  requestRefresh: () => void;
  requestManualForward: () => void;
  setLoading: (loading: boolean) => void;
}

/** Session-only chrome shared by the docked Ports panel and its header actions. */
export const usePortsPanelChromeStore = create<PortsPanelChromeState>()((set) => ({
  refreshVersion: 0,
  manualForwardVersion: 0,
  loading: false,
  requestRefresh: () => set((state) => ({ refreshVersion: state.refreshVersion + 1 })),
  requestManualForward: () =>
    set((state) => ({ manualForwardVersion: state.manualForwardVersion + 1 })),
  setLoading: (loading) => set((state) => (state.loading === loading ? {} : { loading })),
}));
