import type { ProjectLocation } from "@/shared/contracts";
import {
  MuseMspClient,
  spawnMuseServeHost,
  type MuseMspNotificationHandler,
  type SpawnMuseServeHostOptions,
} from "./client";
import { stopMuseServeHost } from "./hostLifecycle";
import { assertMspSchemaVersion, isMspRpcError } from "./protocol";

type Observer = Awaited<ReturnType<typeof spawnMuseServeHost>> & {
  client: MuseMspClient;
  initialized: boolean;
  unavailable: boolean;
};

/**
 * Prefer the writer's native child reads. Older hosts cannot resolve their
 * nested sessions; only a typed read refusal uses a foreign read-only host,
 * without loading the child or acquiring a writer lease. Subscription-only
 * refusals let the transcript manager poll the already-readable writer.
 */
export class MuseSubagentObserver {
  private opening: Promise<Observer> | undefined;
  private observer: Observer | undefined;
  private disposed = false;
  private stopping: Promise<void> | undefined;
  private readonly foreignSessions = new Set<string>();

  constructor(
    private readonly location: ProjectLocation,
    private readonly options: SpawnMuseServeHostOptions,
    private readonly onNotification: MuseMspNotificationHandler,
    private readonly onDisconnected: () => void = () => {},
    private readonly owner?: Pick<MuseMspClient, "request">,
  ) {}

  async request(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (method !== "session/read" && method !== "view/subscribe")
      throw new Error(`Muse transcript observer cannot issue ${method}.`);
    if (this.disposed) throw new Error("Muse transcript observer is closed.");
    const sessionId = typeof params?.["sessionId"] === "string" ? params["sessionId"] : undefined;
    if (this.owner && sessionId && !this.foreignSessions.has(sessionId)) {
      try {
        return await this.owner.request(method, params);
      } catch (error) {
        if (this.disposed) throw new Error("Muse transcript observer is closed.", { cause: error });
        if (method !== "session/read" || !isMspRpcError(error) || error.kind !== "sessionNotFound")
          throw error;
        this.foreignSessions.add(sessionId);
      }
    }
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
