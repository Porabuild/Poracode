import type { BackendBrowserEvent, BackendNativeRequest } from "@/shared/backendHostProtocol";
import type { RemoteBrowserCommand, RemoteBrowserInput, RemoteBrowserState } from "@/shared/remote";
import type {
  RemoteBrowserGatewayLike,
  RemoteBrowserWatcherSink,
} from "@/main/remote/RemoteBrowserGateway";

/** Backend-side half of the browser bridge; Electron keeps the WebContents/CDP handles. */
export class BackendRemoteBrowserProxy implements RemoteBrowserGatewayLike {
  private readonly sinks = new Set<RemoteBrowserWatcherSink>();

  constructor(
    private readonly requestNative: (request: BackendNativeRequest) => Promise<unknown>,
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
    if (this.sinks.size === 1) {
      void this.requestNative({ operation: "browser-watch-start", payload: {} });
    }
    return () => {
      this.sinks.delete(sink);
      if (this.sinks.size === 0) {
        void this.requestNative({ operation: "browser-watch-stop", payload: {} });
      }
    };
  }

  refresh(): void {
    void this.requestNative({ operation: "browser-refresh", payload: {} });
  }

  publish(event: BackendBrowserEvent): void {
    for (const sink of this.sinks) {
      if (event.type === "frame") sink.onFrame(event);
      else if (event.type === "state") sink.onState(event.state);
      else sink.onStatus(event.status);
    }
  }

  dispose(): void {
    if (this.sinks.size > 0) {
      this.sinks.clear();
      void this.requestNative({ operation: "browser-watch-stop", payload: {} });
    }
  }
}
