import { WebSocket } from "ws";
import type { RemoteServerContext } from "./context";

/** One bounded-history replay pump (deep-review consolidation): walks a
 * seq-contiguous buffer one frame at a time with backpressured raw sends,
 * seeking by index (`seq - buffer[0].seq`), reusing the entry's ingest-time
 * serialization, and degrading to `resync-required` when the window expired.
 * Live fan-out excludes the client until caught up (the membership set).
 *
 * `frameFor` returns the wire frame for one entry or `resync` to terminate the
 * pump with the current head `resync-required` frame for THIS socket (the
 * bounded-catalog undeclared case, exactly like window expiry — a scoping
 * error is fatal by policy instead and throws). `resyncSeq` is the CURRENT head
 * sequence reported inside the resync frame. */
export function replayBoundedHistory<Entry extends { readonly seq: number }>(
  socket: WebSocket,
  lastSeenSeq: number,
  source: {
    readonly membership: Set<WebSocket>;
    readonly headSeq: number;
    readonly buffer: readonly Entry[];
    readonly send: (
      socket: WebSocket,
      message: { readonly type: "resync-required"; readonly seq: number; readonly reason: string },
    ) => void;
    readonly sendRaw: (
      socket: WebSocket,
      data: string,
      onSendCompleted: (error: Error | null | undefined) => void,
    ) => boolean;
    readonly resync: { readonly seq: number; readonly reason: string };
    frameFor(
      entry: Entry,
    ): { readonly kind: "frame"; readonly data: string } | { readonly kind: "resync" };
  },
): void {
  let cursor = lastSeenSeq;
  const stop = (): void => {
    source.membership.delete(socket);
  };
  const requestResync = (): void => {
    stop();
    source.send(socket, {
      type: "resync-required",
      seq: source.resync.seq,
      reason: source.resync.reason,
    });
  };
  const pump = (): void => {
    if (!source.membership.has(socket)) return;
    if (socket.readyState !== WebSocket.OPEN) {
      stop();
      return;
    }
    if (cursor === source.headSeq) {
      stop();
      return;
    }
    const oldest = source.buffer[0];
    const index = oldest ? cursor + 1 - oldest.seq : -1;
    const entry = index >= 0 ? source.buffer[index] : undefined;
    // Undeliverable oversized events advance the head without entering the
    // buffer, so the index alone cannot prove contiguity — verify the entry
    // really is the next one before sending it.
    if (!entry || entry.seq !== cursor + 1) {
      requestResync();
      return;
    }
    let frame: { readonly kind: "frame"; readonly data: string } | { readonly kind: "resync" };
    try {
      frame = source.frameFor(entry);
    } catch {
      stop();
      socket.terminate();
      return;
    }
    if (frame.kind === "resync") {
      // The entry is not deliverable to THIS socket (an undeclared client
      // crossing a bounded catalog signal): resync and stop, like window
      // expiry, so the client refetches authoritative state and later live
      // frames still reach it.
      requestResync();
      return;
    }
    const data = frame.data;
    const sent = source.sendRaw(socket, data, (error) => {
      if (error) {
        stop();
        socket.terminate();
        return;
      }
      cursor = entry.seq;
      setImmediate(pump);
    });
    if (!sent) stop();
  };
  pump();
}

type ReplayContext = Pick<
  RemoteServerContext,
  | "replayingClients"
  | "seq"
  | "eventBuffer"
  | "boundedCatalogChangeClients"
  | "send"
  | "sendRaw"
  | "scopeEventForClient"
>;

/** Reads the shared bounded history one frame at a time, including events
 * published during catch-up. Live fan-out excludes this client until caught up.
 *
 * WS5: the buffer is seq-contiguous, so each step seeks by index (`seq -
 * buffer[0].seq`) instead of scanning, and reuses the entry's ingest-time
 * serialization unless per-client scoping actually rewrote the event.
 *
 * Bounded catalog changes: the retained entry is the canonical signal. A
 * declared socket replays the signal frame; an undeclared socket gets one
 * per-socket `resync-required` and the pump stops (the live full list was
 * never retained). */
export function replayEvents(ctx: ReplayContext, socket: WebSocket, lastSeenSeq: number): void {
  replayBoundedHistory(socket, lastSeenSeq, {
    membership: ctx.replayingClients,
    // Live reads, not call-time snapshots: the head advances and the buffer
    // is trimmed while the pump runs, and the original semantics chase both.
    get headSeq() {
      return ctx.seq;
    },
    get buffer() {
      return ctx.eventBuffer;
    },
    send: ctx.send,
    sendRaw: ctx.sendRaw,
    get resync() {
      return { seq: ctx.seq, reason: "Event replay window expired; request a fresh snapshot." };
    },
    frameFor: (entry) => {
      if (entry.catalogChange === "signal" && !ctx.boundedCatalogChangeClients.has(socket)) {
        return { kind: "resync" };
      }
      const scoped = ctx.scopeEventForClient(entry.event, socket);
      const data =
        scoped === entry.event
          ? `{"type":"event","seq":${entry.seq},"space":"loopback","event":${entry.json}}`
          : JSON.stringify({ type: "event", seq: entry.seq, space: "loopback", event: scoped });
      return { kind: "frame", data };
    },
  });
}
