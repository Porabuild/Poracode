import { createContext, useContext } from "react";
import type { useRemoteDesktop } from "./useRemoteDesktop";

/**
 * Shared app-level state for the routed PWA. `useRemoteDesktop` owns the whole
 * remote session (sockets, snapshots, mutations) and must be called exactly
 * once — it lives in the root layout and is handed to every route through this
 * context, alongside the cross-route thread filter.
 */
export type RemoteSession = ReturnType<typeof useRemoteDesktop>;

export interface MobileAppContextValue {
  readonly remote: RemoteSession;
  /** Project filter for the thread list, validated against the live project
   * list and persisted across sessions; shared by the wide sidebar and the
   * narrow /threads route. */
  readonly projectFilter: string | null;
  readonly setProjectFilter: (next: string | null) => void;
}

const MobileAppContext = createContext<MobileAppContextValue | null>(null);

export const MobileAppProvider = MobileAppContext.Provider;

export function useMobileApp(): MobileAppContextValue {
  const value = useContext(MobileAppContext);
  if (!value) {
    throw new Error("useMobileApp must be used within the mobile root layout.");
  }
  return value;
}

export function useRemote(): RemoteSession {
  return useMobileApp().remote;
}
