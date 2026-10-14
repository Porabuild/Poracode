import type { ProjectLocation } from "@/shared/contracts";
import {
  MuseMspClient,
  spawnMuseServeHost,
  type MuseMspNotificationHandler,
  type SpawnMuseServeHostOptions,
} from "./client";
import { stopMuseServeHost } from "./hostLifecycle";
import { assertMspSchemaVersion } from "./protocol";

type Observer = Awaited<ReturnType<typeof spawnMuseServeHost>> & {
  client: MuseMspClient;
  initialized: boolean;
  unavailable: boolean;
};

/**
 * Muse 1.4.6's writer host cannot resolve its own newly spawned nested sessions.
 * A foreign host can read and follow them without loading a session or acquiring
 * a writer lease. Start one lazily per parent, and never issue model-turn methods.
 */
export class MuseSubagentObserver {
  private opening: Promise<Observer> | undefined;
  private observer: Observer | undefined;
  private disposed = false;
  private stopping: Promise<void> | undefined;

  constructor(
    private readonly location: ProjectLocation,
    private readonly options: SpawnMuseServeHostOptions,
    private readonly onNotification: MuseMspNotificationHandler,
    private readonly onDisconnected: () => void = () => {},
  ) {}

  async request(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (method !== "session/read" && method !== "view/subscribe")
      throw new Error(`Muse transcript observer cannot issue ${method}.`);
    if (this.disposed) throw new Error("Muse transcript observer is closed.");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!this.opening) {
        const opening = this.open().catch((error: unknown) => {
          if (this.opening === opening) this.opening = undefined;
          throw error;
        });
        this.opening = opening;
      }
      const opening = this.opening;
      const observer = await opening;
      if (this.disposed) throw new Error("Muse transcript observer is closed.");
      if (!observer.unavailable) return observer.client.request(method, params);
      if (this.opening === opening) this.opening = undefined;
    }
    throw new Error("Muse transcript observer disconnected.");
  }

  dispose(): Promise<void> {
    this.disposed = true;
    this.observer?.client.dispose();
    this.stopping ??= this.stop().catch((error: unknown) => {
      this.stopping = undefined;
      throw error;
    });
    return this.stopping;
  }

  private async open(): Promise<Observer> {
    // A failed shutdown remains owned and must finish before another host starts.
    await this.close();
    const hosted = await spawnMuseServeHost(this.location, this.options);
    const observer: Observer = {
      ...hosted,
      client: new MuseMspClient(hosted.transport),
      initialized: false,
      unavailable: false,
    };
    this.observer = observer;
    observer.client.onNotification((method, params) => {
      if (!this.disposed && !observer.unavailable) this.onNotification(method, params);
    });
    observer.client.onError(() => this.disconnect(observer));
    observer.child.once("close", () => this.disconnect(observer));
    observer.child.once("error", () => this.disconnect(observer));
    try {
      if (this.disposed) throw new Error("Muse transcript observer is closed.");
      const result = await observer.client.initialize("poracode_subagent_view", "1.0.0");
      assertMspSchemaVersion(result.schema.version);
      if (observer.unavailable) throw new Error("Muse transcript observer disconnected.");
      observer.initialized = true;
      return observer;
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  private disconnect(observer: Observer): void {
    if (this.observer !== observer || observer.unavailable) return;
    observer.unavailable = true;
    observer.client.dispose();
    if (observer.initialized && !this.disposed) this.onDisconnected();
  }

  private async stop(): Promise<void> {
    // Await a pending spawn/handshake so disposal never strands a late host.
    await this.opening?.catch(() => undefined);
    await this.close();
  }

  private async close(): Promise<void> {
    const observer = this.observer;
    if (!observer) return;
    await stopMuseServeHost(this.location, observer.child, observer.client, observer.hostCookie);
    this.observer = undefined;
  }
}
