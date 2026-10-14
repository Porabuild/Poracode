interface LifecycleEventTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

interface LifecycleDocument extends LifecycleEventTarget {
  readonly visibilityState: DocumentVisibilityState;
}

export interface RemoteServerLifecycleEnvironment {
  readonly window: LifecycleEventTarget;
  readonly document: LifecycleDocument;
}

/**
 * Reconnect persisted remote servers as soon as a suspended browser becomes
 * usable again. Event bursts are coalesced so pageshow + online + visible do
 * not start three concurrent snapshot passes.
 */
export function installRemoteServerLifecycle(
  reconnect: () => void | Promise<void>,
  environment: RemoteServerLifecycleEnvironment = { window, document },
): () => void {
  let disposed = false;
  let scheduled = false;

  const requestReconnect = (): void => {
    if (disposed || environment.document.visibilityState === "hidden" || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (disposed || environment.document.visibilityState === "hidden") return;
      void Promise.resolve(reconnect()).catch(() => undefined);
    });
  };
  const handleVisibility = (): void => {
    if (environment.document.visibilityState === "visible") requestReconnect();
  };

  environment.window.addEventListener("pageshow", requestReconnect);
  environment.window.addEventListener("online", requestReconnect);
  environment.document.addEventListener("visibilitychange", handleVisibility);

  return () => {
    disposed = true;
    environment.window.removeEventListener("pageshow", requestReconnect);
    environment.window.removeEventListener("online", requestReconnect);
    environment.document.removeEventListener("visibilitychange", handleVisibility);
  };
}
