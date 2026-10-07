import { useEffect, useLayoutEffect, useState } from "react";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { installRemoteServerLifecycle } from "@/renderer/state/remoteServers/lifecycle";

export type RemoteServerConnectionState = {
  /** Saved servers finished hydrating (or failed to) and the first connect pass started. */
  checked: boolean;
  /** That first connect pass has settled. */
  initialConnectSettled: boolean;
};

/**
 * Hydrates saved remote servers, connects them once, and force-reconnects
 * them when the page resumes. Desktop starts `checked` because it never shows
 * the browser connection gate.
 */
export function useRemoteServerConnection({
  autoConnect = true,
}: { autoConnect?: boolean } = {}): RemoteServerConnectionState {
  const connectAll = useRemoteServersStore((state) => state.connectAll);
  const [checked, setChecked] = useState(() => !isBrowserClientRuntime());
  const [initialConnectSettled, setInitialConnectSettled] = useState(false);

  // Layout effect so an already-hydrated store opens the gate before paint.
  useLayoutEffect(() => {
    let active = true;
    const finishHydration = () => {
      if (!active) return;
      setChecked(true);
      const finishConnection = () => {
        if (active) setInitialConnectSettled(true);
      };
      if (autoConnect) void connectAll().then(finishConnection, finishConnection);
      else finishConnection();
    };
    if (useRemoteServersStore.persist.hasHydrated()) {
      finishHydration();
    } else {
      void Promise.resolve(useRemoteServersStore.persist.rehydrate()).then(
        finishHydration,
        finishHydration,
      );
    }
    return () => {
      active = false;
    };
  }, [connectAll, autoConnect]);

  useEffect(
    () =>
      autoConnect
        ? installRemoteServerLifecycle(() => connectAll({ forceTransportReconnect: true }))
        : undefined,
    [connectAll, autoConnect],
  );

  return { checked, initialConnectSettled };
}
