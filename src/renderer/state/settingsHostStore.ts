import { create } from "zustand";
import {
  selectBrowserBridgeClientServer,
  selectBrowserBridgeDesktop,
} from "@/renderer/state/remoteServers/browserBridge";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";

/**
 * The host a remote client's host-backed settings and utility pages act on.
 *
 * In a remote client the bridge client is that host: profile, synced settings,
 * agent statuses, and agent install/sign-in all go through it. The bridge's own
 * selection is module state, so this store is the reactive half: choosing a
 * host rebinds the bridge and re-renders every page scoped to it. Session-only,
 * like the machine selection in desktop settings.
 */
interface SettingsHostState {
  /** The connection the user last chose; `null` follows the bridge's default. */
  desktopId: string | null;
  choose(desktopId: string): void;
}

export const useSettingsHostStore = create<SettingsHostState>((set) => ({
  desktopId: null,
  choose: (desktopId) => {
    selectBrowserBridgeDesktop(desktopId);
    set({ desktopId });
  },
}));

/** The host the bridge client currently talks to, re-rendering on a choice. */
export function useSettingsHostServer(): RemoteServerRecord | undefined {
  // Subscribed only for the re-render; the bridge holds the actual selection.
  useSettingsHostStore((state) => state.desktopId);
  return useRemoteServersStore(selectBrowserBridgeClientServer);
}
