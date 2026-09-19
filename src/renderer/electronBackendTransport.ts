import type { ElectronHostBridge } from "@/shared/clientRuntime";
import type { IpcProcedurePayload, SupervisorEvent } from "@/shared/ipc";

/** The interests payload this window publishes to main (`setRendererEventInterests`). */
type RendererInterests = IpcProcedurePayload<"setRendererEventInterests">;

/**
 * Desktop renderer event gate over the sequenced desktop-IPC relay (V5 plan
 * 2.5 / H4): the direct renderer stream, its grants, its chunked large-reply
 * framing, and its recovery barriers are gone. Requests travel through the
 * preload procedure invoke (main → backend-host call-* operations), and
 * events cross this one channel, deduped and recovery-gated by the host's
 * monotonic relay sequence:
 *
 * - a sequenced event applies only when it advances the cursor;
 * - `supervisor-event-gap` (host-side IPC shedding) rebuilds subscribed
 *   threads from persisted state without advancing the cursor past the gap;
 * - `backendSupervisorReset` (a new backend child, new sequence space) drops
 *   the cursor and rebuilds everything subscribed.
 */
export class ElectronBackendTransport {
  private lastSequence = 0;
  private readonly listeners = new Set<(event: SupervisorEvent) => void>();
  private interests: RendererInterests = { terminalThreadIds: [], runtimeThreadIds: [] };

  constructor(private readonly host: ElectronHostBridge) {
    host.onSupervisorEvent((event, rendererSequence) => {
      if (rendererSequence !== undefined) {
        if (rendererSequence <= this.lastSequence) return;
        this.lastSequence = rendererSequence;
      }
      this.dispatch(event);
    });
    host.onSupervisorEventGap(() => {
      // Retained events inside a merged loss range must still be delivered,
      // so the cursor stays unchanged and the rebuild covers the loss.
      this.dispatchRebuildForInterests();
    });
    host.onBackendSupervisorReset(() => {
      this.lastSequence = 0;
      this.dispatchRebuildForInterests();
    });
  }

  subscribe(listener: (event: SupervisorEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async setEventInterests(interests: RendererInterests): Promise<void> {
    this.interests = {
      terminalThreadIds: [...new Set(interests.terminalThreadIds)],
      runtimeThreadIds: [...new Set(interests.runtimeThreadIds)],
    };
    await this.host.invokeProcedure("setRendererEventInterests", [this.interests]);
  }

  /**
   * Rebuilds subscribed threads after unrecoverable relay loss. Without a
   * loss scope every subscribed thread resets (the safe fallback); a scope
   * narrows the reset to the threads the window actually subscribes to, so
   * one thread's lost events no longer wipe every open transcript (WS6
   * P1-10).
   */
  private dispatchRebuildForInterests(lostThreadIds?: ReadonlySet<string>): void {
    const inScope = (threadId: string): boolean =>
      lostThreadIds === undefined || lostThreadIds.has(threadId);
    for (const threadId of this.interests.terminalThreadIds) {
      if (inScope(threadId)) this.dispatch({ type: "thread-scrollback-resync", threadId });
    }
    for (const threadId of this.interests.runtimeThreadIds) {
      if (inScope(threadId)) this.dispatch({ type: "thread-reset", threadId });
    }
  }

  private dispatch(event: SupervisorEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
