import { createContext, useContext, type ReactNode } from "react";
import type { useRemoteDesktop } from "./useRemoteDesktop";

/**
 * Shared app-level state for the routed PWA. `useRemoteDesktop` owns the whole
 * remote session (sockets, snapshots, mutations) and must be called exactly
 * once — it lives in the root layout and is handed to every route through
 * context, alongside the cross-route thread filter.
 *
 * The session and the chrome/filter state live in two separate contexts so
 * that consumers who only need the stable chrome fields don't re-render on
 * every remote socket/snapshot churn. `MobileAppProvider` still accepts one
 * combined value (for call-site compatibility) and fans it out to both.
 */
export type RemoteSession = ReturnType<typeof useRemoteDesktop>;

export interface RemoteContextValue {
  readonly remote: RemoteSession;
}

export interface MobileChromeContextValue {
  /** Project filter for the thread list, validated against the live project
   * list and persisted across sessions; shared by the wide sidebar and the
   * narrow /threads route. */
  readonly projectFilter: string | null;
  readonly setProjectFilter: (next: string | null) => void;
  /** Thread search on the narrow home screen: toggled from the shell header,
   * rendered by the /threads route into the shell's header search host. */
  readonly threadSearchOpen: boolean;
  readonly setThreadSearchOpen: (open: boolean) => void;
  readonly threadSearchHost: HTMLElement | null;
  /** Scroll-driven chrome: the /threads list reports its scroll direction and
   * the shell collapses/reveals the header and composer dock accordingly. */
  readonly setChromeHidden: (hidden: boolean) => void;
}

export interface MobileAppContextValue extends RemoteContextValue, MobileChromeContextValue {}

const RemoteContext = createContext<RemoteContextValue | null>(null);
const MobileChromeContext = createContext<MobileChromeContextValue | null>(null);

/**
 * Fans a single combined value out to the remote-session and chrome contexts.
 * Kept as the one provider call sites (and tests that wrap children in it)
 * already use, so splitting the contexts doesn't ripple outward.
 */
export function MobileAppProvider(props: {
  readonly value: MobileAppContextValue;
  readonly children: ReactNode;
}) {
  const {
    remote,
    projectFilter,
    setProjectFilter,
    threadSearchOpen,
    setThreadSearchOpen,
    threadSearchHost,
    setChromeHidden,
  } = props.value;

  const remoteValue: RemoteContextValue = { remote };
  const chromeValue: MobileChromeContextValue = {
    projectFilter,
    setProjectFilter,
    threadSearchOpen,
    setThreadSearchOpen,
    threadSearchHost,
    setChromeHidden,
  };

  return (
    <RemoteContext.Provider value={remoteValue}>
      <MobileChromeContext.Provider value={chromeValue}>
        {props.children}
      </MobileChromeContext.Provider>
    </RemoteContext.Provider>
  );
}

/** Composed view for consumers that genuinely need both slices. Prefer
 * `useRemote()` or `useMobileChrome()` when only one slice is needed — those
 * don't re-render when the other slice's provider value changes. */
export function useMobileApp(): MobileAppContextValue {
  const remote = useRemote();
  const chrome = useMobileChrome();
  return { remote, ...chrome };
}

export function useRemote(): RemoteSession {
  const value = useContext(RemoteContext);
  if (!value) {
    throw new Error("useRemote must be used within the mobile root layout.");
  }
  return value.remote;
}

export function useMobileChrome(): MobileChromeContextValue {
  const value = useContext(MobileChromeContext);
  if (!value) {
    throw new Error("useMobileChrome must be used within the mobile root layout.");
  }
  return value;
}
