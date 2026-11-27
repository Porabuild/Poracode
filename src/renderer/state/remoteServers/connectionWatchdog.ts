import { msg as sharedMsg } from "@/shared/messages";
import { syncDesktopBrowserBridgeClient } from "./browserBridge";
import { getRemoteServerEventSocketEntry } from "./eventSocketRegistry";
import { isRemoteConnectAttemptInFlight } from "./sessionReconnect";
import type { RemoteServersState } from "./types";

/** How often the watchdog looks at "connecting" hosts. */
export const CONNECTION_WATCHDOG_INTERVAL_MS = 5_000;
/** "Connecting" with nothing in flight (no connect pass, scheduled retry,
 * socket attempt, or handshake) is a lost transition: report the host
 * unreachable. */
export const CONNECTING_IDLE_LIMIT_MS = 30_000;
/** No legitimate attempt keeps "connecting" this long: every read in it is
 * bounded well below this, so it is reported unreachable regardless. */
export const CONNECTING_HARD_LIMIT_MS = 90_000;

interface ConnectionWatchdogStore {
  getState(): RemoteServersState;
  setState(update: (state: RemoteServersState) => Partial<RemoteServersState>): void;
}

function attemptInFlight(connectionKey: string): boolean {
  if (isRemoteConnectAttemptInFlight(connectionKey)) return true;
  const entry = getRemoteServerEventSocketEntry(connectionKey);
  return (
    entry !== undefined &&
    (entry.connecting || entry.reconnectTimer !== null || entry.socket?.readyState === 0)
  );
}

/**
 * Last line of defense for the status invariant: a host never stays
 * "connecting" without an attempt that can still settle it. Whatever future
 * path forgets a transition, the host converges to "offline" (and its socket
 * ladder is asked to retry now) instead of a spinner that never resolves.
 * Returns the uninstaller.
 */
export function installRemoteConnectionWatchdog(
  store: ConnectionWatchdogStore,
  options: { readonly now?: () => number } = {},
): () => void {
  const now = options.now ?? (() => Date.now());
  const connectingSince = new Map<string, number>();

  const check = (): void => {
    const { runtime, hostUpdateRestarts } = store.getState();
    for (const key of connectingSince.keys()) {
      if (runtime[key]?.status !== "connecting") connectingSince.delete(key);
    }
    const stalled: string[] = [];
    const at = now();
    for (const [key, entry] of Object.entries(runtime)) {
      if (entry.status !== "connecting") continue;
      // A host restarting for an update owns its own bounded wait and settles
      // the status itself; it is not a lost transition.
      if (hostUpdateRestarts[key] !== undefined) {
        connectingSince.delete(key);
        continue;
      }
      const since = connectingSince.get(key);
      if (since === undefined) {
        connectingSince.set(key, at);
        continue;
      }
      const age = at - since;
      if (
        age >= CONNECTING_HARD_LIMIT_MS ||
        (age >= CONNECTING_IDLE_LIMIT_MS && !attemptInFlight(key))
      ) {
        stalled.push(key);
      }
    }
    if (stalled.length === 0) return;
    const message = sharedMsg("remote.server.unreachable");
    store.setState((state) => {
      const next = { ...state.runtime };
      for (const key of stalled) {
        const current = next[key];
        if (current?.status === "connecting")
          next[key] = { ...current, status: "offline", message };
      }
      return { runtime: next };
    });
    syncDesktopBrowserBridgeClient(store.getState());
    for (const key of stalled) {
      connectingSince.delete(key);
      getRemoteServerEventSocketEntry(key)?.nudge?.();
    }
  };

  const timer = setInterval(check, CONNECTION_WATCHDOG_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    connectingSince.clear();
  };
}
