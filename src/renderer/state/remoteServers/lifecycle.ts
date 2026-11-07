interface LifecycleEventTarget {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

interface LifecycleDocument extends LifecycleEventTarget {
  readonly visibilityState: DocumentVisibilityState;
}

export interface RemoteServerLifecycleEnvironment {
  readonly window: LifecycleEventTarget;
  readonly document: LifecycleDocument;
  readonly now?: () => number;
}

/**
 * A page hidden longer than this was likely suspended (mobile browsers freeze
 * background tabs), so its sockets may look open while the peer is gone.
 * Shorter tab switches keep their sockets; a health probe verifies them.
 */
export const REMOTE_SERVER_LONG_SUSPEND_MS = 60_000;

export interface RemoteServerResumeSignal {
  /**
   * True when the transports are presumed dead and must be replaced: the
   * network came back, the page was restored from the back/forward cache, or
   * it was hidden long enough to have been suspended. False for an ordinary
   * tab or app switch, where live sockets only need a health probe.
   */
  readonly forceTransportReconnect: boolean;
}

/**
 * Reconnect persisted remote servers as soon as a suspended browser becomes
 * usable again. Event bursts are coalesced so pageshow + online + visible do
 * not start three concurrent passes; the strongest signal in a burst wins.
 */
export function installRemoteServerLifecycle(
  reconnect: (signal: RemoteServerResumeSignal) => void | Promise<void>,
  environment: RemoteServerLifecycleEnvironment = { window, document },
): () => void {
  const now = environment.now ?? (() => Date.now());
  let disposed = false;
  let scheduled = false;
  let forceRequested = false;
  let hiddenAt: number | null = environment.document.visibilityState === "hidden" ? now() : null;

  const requestReconnect = (force: boolean): void => {
    forceRequested ||= force;
    if (disposed || environment.document.visibilityState === "hidden" || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const forceTransportReconnect = forceRequested;
      forceRequested = false;
      if (disposed || environment.document.visibilityState === "hidden") return;
      void Promise.resolve(reconnect({ forceTransportReconnect })).catch(() => undefined);
    });
  };
  const handlePageShow = (event: Event): void => {
    // A fresh load is the initial mount, which already connects; only a page
    // restored from the back/forward cache holds stale transports.
    if ((event as PageTransitionEvent).persisted === true) requestReconnect(true);
  };
  const handleOnline = (): void => requestReconnect(true);
  const handleVisibility = (): void => {
    if (environment.document.visibilityState === "hidden") {
      hiddenAt ??= now();
      return;
    }
    if (environment.document.visibilityState !== "visible") return;
    const suspended = hiddenAt !== null && now() - hiddenAt >= REMOTE_SERVER_LONG_SUSPEND_MS;
    hiddenAt = null;
    requestReconnect(suspended);
  };

  environment.window.addEventListener("pageshow", handlePageShow);
  environment.window.addEventListener("online", handleOnline);
  environment.document.addEventListener("visibilitychange", handleVisibility);

  return () => {
    disposed = true;
    environment.window.removeEventListener("pageshow", handlePageShow);
    environment.window.removeEventListener("online", handleOnline);
    environment.document.removeEventListener("visibilitychange", handleVisibility);
  };
}
