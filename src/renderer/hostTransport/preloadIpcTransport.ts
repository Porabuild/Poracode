import type { ElectronHostBridge } from "@/shared/clientRuntime";
import type { HostServiceCapabilities } from "@/shared/hostControlProtocol";
import { UNKNOWN_HOST_SERVICE_CAPABILITIES } from "@/shared/hostControlProtocol";
import type { IpcProcedureName, SupervisorEvent } from "@/shared/ipc";
import type { EventSequenceSpace } from "@/shared/eventSequenceSpace";
import { isRemoteRoutableProcedure } from "@/renderer/remoteProcedureRoutes";
import { snapshotRendererEventInterests } from "@/renderer/state/rendererEventInterests";
import {
  HOST_TRANSPORT_VERSION,
  type HostEventListener,
  type HostIdentity,
  type HostTransport,
} from "./types";

/**
 * V6 B.6: preload IPC is bootstrap + `local-shell` only. Live
 * `supervisor-event` / `thread-output` envelopes do not cross this
 * channel — the loopback HTTP+WS leg is the data plane. Backend-child
 * reset still rebuilds subscribed threads so a new sequence space does
 * not strand open transcripts. A2: the interest list is read from the
 * renderer's own registry at rebuild time instead of being mirrored here
 * from the removed `setRendererEventInterests` IPC sync.
 */
export class PreloadIpcTransport implements HostTransport {
  readonly version = HOST_TRANSPORT_VERSION;
  readonly identity: HostIdentity = { kind: "managed" };
  private readonly lastBySpace: Record<EventSequenceSpace, number> = { ipc: 0, loopback: 0 };
  private readonly listeners = new Set<
    (event: SupervisorEvent, seq?: number, space?: EventSequenceSpace) => void
  >();
  private loopbackActive = false;

  constructor(
    private readonly host: ElectronHostBridge,
    readonly capabilities: HostServiceCapabilities = UNKNOWN_HOST_SERVICE_CAPABILITIES,
  ) {
    host.onBackendSupervisorReset(() => {
      this.lastBySpace.ipc = 0;
      this.lastBySpace.loopback = 0;
      this.dispatchRebuildForInterests();
    });
  }

  subscribe(
    listener: (event: SupervisorEvent, seq?: number, space?: EventSequenceSpace) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeEvents(listener: HostEventListener): () => void {
    return this.subscribe(listener);
  }

  request(name: IpcProcedureName, args: unknown[]): Promise<unknown> {
    if (isRemoteRoutableProcedure(name)) {
      return Promise.reject(
        new Error(`IPC data plane removed for ${name}; loopback HTTP is required`),
      );
    }
    return this.host.invokeProcedure(name, args);
  }

  /** Delivers one sequenced event from a named space (per-session cursor). */
  dispatchSequencedEvent(
    event: SupervisorEvent,
    seq: number | undefined,
    space: EventSequenceSpace,
  ): void {
    if (seq !== undefined) {
      if (seq <= this.lastBySpace[space]) return;
      this.lastBySpace[space] = seq;
    }
    this.dispatch(event, seq, space);
  }

  /** Delivers one event that arrived over the loopback WS (per-session cursor). */
  dispatchLoopbackEvent(event: SupervisorEvent, seq?: number): void {
    this.dispatchSequencedEvent(event, seq, "loopback");
  }

  /** Rebuilds subscribed threads when the loopback leg flips. */
  setLoopbackActive(active: boolean): void {
    if (this.loopbackActive === active) return;
    this.loopbackActive = active;
    if (active) {
      // Both counters originate in the loopback server, including desktop-event
      // frames named "ipc". Restarting that server resets both spaces.
      this.lastBySpace.ipc = 0;
      this.lastBySpace.loopback = 0;
    }
    this.dispatchRebuildForInterests();
  }

  /** Rebuild hook the loopback intake calls on activation, loss, and resume. */
  rebuildSubscribedState(lostThreadIds?: ReadonlySet<string>): void {
    this.dispatchRebuildForInterests(lostThreadIds);
  }

  private dispatchRebuildForInterests(lostThreadIds?: ReadonlySet<string>): void {
    const inScope = (threadId: string): boolean =>
      lostThreadIds === undefined || lostThreadIds.has(threadId);
    const interests = snapshotRendererEventInterests();
    for (const threadId of interests.terminalThreadIds) {
      if (inScope(threadId)) this.dispatch({ type: "thread-scrollback-resync", threadId });
    }
    for (const threadId of interests.runtimeThreadIds) {
      if (inScope(threadId)) this.dispatch({ type: "thread-reset", threadId });
    }
  }

  private dispatch(
    event: SupervisorEvent,
    seq?: number,
    space: EventSequenceSpace = "loopback",
  ): void {
    for (const listener of this.listeners) listener(event, seq, space);
  }
}

/** Historical name kept for tests that still import the preload event gate. */
export { PreloadIpcTransport as ElectronBackendTransport };
