import type { BackendBrowserEvent, BackendNativeRequest } from "@/shared/backendHostProtocol";
import type {
  RemoteBrowserCommand,
  RemoteBrowserInput,
  RemoteBrowserMirrorStatus,
  RemoteBrowserState,
} from "@/shared/remote";
import type {
  RemoteBrowserGatewayLike,
  RemoteBrowserWatcherSink,
} from "@/main/remote/RemoteBrowserGateway";

type PoracodeDiagnosticTags = import("@/shared/diagnostics/sentryPrivacy").PoracodeDiagnosticTags;

/**
 * Backend-side half of the browser bridge; Electron keeps the WebContents/CDP handles.
 *
 * Watch start/stop and refresh are fire-and-forget: nobody awaits their
 * promises, so an unhandled rejection would tear down the shared backend
 * process. Every one of them is settled explicitly here — failures are
 * reported through `reportError` with the failed action named, and a failed
 * watch-start additionally marks the registered watchers "unavailable" (the
 * shape Electron itself broadcasts) and resets the watch bookkeeping so the
 * next `watch()` or client-driven `refresh()` retries the start. Retrying with
 * `browser-refresh` alone cannot recover: Electron only mirrors while a
 * watcher is registered, so a failed start must be re-issued.
 */
export class BackendRemoteBrowserProxy implements RemoteBrowserGatewayLike {
  private readonly sinks = new Set<RemoteBrowserWatcherSink>();
  /** A watch-start request is on the wire and has not settled yet. */
  private startInFlight = false;
  /** We last told Electron to watch and have not told it to stop since. */
  private nativeWatchActive = false;
  /** Bumped on every watch start/stop request so stale settlements are ignored. */
  private watchSeq = 0;

  constructor(
    private readonly requestNative: (request: BackendNativeRequest) => Promise<unknown>,
    private readonly reportError: (error: unknown, tags?: PoracodeDiagnosticTags) => void,
  ) {}

  state(): Promise<RemoteBrowserState> {
    return this.requestNative({
      operation: "browser-state",
      payload: {},
    }) as Promise<RemoteBrowserState>;
  }

  command(command: RemoteBrowserCommand): Promise<RemoteBrowserState> {
    return this.requestNative({
      operation: "browser-command",
      payload: command,
    }) as Promise<RemoteBrowserState>;
  }

  async dispatchInput(input: RemoteBrowserInput): Promise<void> {
    await this.requestNative({ operation: "browser-input", payload: input });
  }

  watch(sink: RemoteBrowserWatcherSink): () => void {
    this.sinks.add(sink);
    this.ensureNativeWatch();
    return () => {
      this.sinks.delete(sink);
      if (this.sinks.size === 0) this.releaseNativeWatch();
    };
  }

  refresh(): void {
    if (this.sinks.size === 0) return;
    if (!this.nativeWatchActive && !this.startInFlight) {
      this.ensureNativeWatch();
      return;
    }
    void this.requestNative({ operation: "browser-refresh", payload: {} }).then(
      () => undefined,
      (error: unknown) => this.reportFailure("Remote browser refresh failed", error),
    );
  }

  publish(event: BackendBrowserEvent): void {
    for (const sink of this.sinks) {
      try {
        if (event.type === "frame") sink.onFrame(event);
        else if (event.type === "state") sink.onState(event.state);
        else sink.onStatus(event.status);
      } catch {
        // Same contract as the local gateway: one broken sink must not stop
        // delivery to the rest (or escape into the event loop).
      }
    }
  }

  dispose(): void {
    this.sinks.clear();
    this.releaseNativeWatch();
  }

  /** Start mirroring unless a start is unsettled or Electron already watches. */
  private ensureNativeWatch(): void {
    if (this.nativeWatchActive || this.startInFlight) return;
    const seq = ++this.watchSeq;
    this.startInFlight = true;
    void this.requestNative({ operation: "browser-watch-start", payload: {} }).then(
      () => {
        if (seq !== this.watchSeq) return; // superseded by a watch-stop
        this.startInFlight = false;
        this.nativeWatchActive = true;
      },
      (error: unknown) => {
        if (seq !== this.watchSeq) return; // superseded by a watch-stop
        this.startInFlight = false;
        this.reportFailure("Remote browser watch failed to start", error);
        this.broadcastStatus({
          status: "unavailable",
          tabId: null,
          reason: error instanceof Error ? error.message : String(error),
        });
      },
    );
  }

  /**
   * Tell Electron to stop mirroring, but only when a watch may actually exist
   * on its side; a stop for a watch that never started would just produce a
   * second failing request. Settled optimistically — Electron's watch-start is
   * idempotent, so re-issuing one after an uncertain stop is always safe.
   */
  private releaseNativeWatch(): void {
    if (!this.nativeWatchActive && !this.startInFlight) return;
    ++this.watchSeq;
    this.startInFlight = false;
    this.nativeWatchActive = false;
    void this.requestNative({ operation: "browser-watch-stop", payload: {} }).then(
      () => undefined,
      (error: unknown) => this.reportFailure("Remote browser watch failed to stop", error),
    );
  }

  private broadcastStatus(status: RemoteBrowserMirrorStatus): void {
    this.publish({ type: "status", status });
  }

  private reportFailure(action: string, error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error);
    this.reportError(new Error(`${action}: ${detail}`), {
      "poracode.feature_area": "remote-access",
    });
  }
}
