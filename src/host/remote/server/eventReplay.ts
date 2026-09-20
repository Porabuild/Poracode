import { WebSocket } from "ws";
import type { RemoteServerContext } from "./context";

/** One bounded-history replay pump (deep-review consolidation): walks a
 * seq-contiguous buffer one frame at a time with backpressured raw sends,
 * seeking by index (`seq - buffer[0].seq`), reusing the entry's ingest-time
 * serialization, and degrading to `resync-required` when the window expired.
 * Live fan-out excludes the client until caught up (the membership set).
 *
 * `frameFor` returns the wire frame for one entry, or null to terminate the
 * socket (a scoping error is fatal by policy). `resyncSeq` is the CURRENT
 * head sequence reported inside the resync frame. */
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
    frameFor(entry: Entry): string;
  },
): void {
  let cursor = lastSeenSeq;
  const stop = (): void => {
    source.membership.delete(socket);
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
      stop();
      source.send(socket, {
        type: "resync-required",
        seq: source.resync.seq,
        reason: source.resync.reason,
      });
      return;
    }
    let data: string;
    try {
      data = source.frameFor(entry);
    } catch {
      stop();
      socket.terminate();
      return;
    }
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
  "replayingClients" | "seq" | "eventBuffer" | "send" | "sendRaw" | "scopeEventForClient"
>;

/** Reads the shared bounded history one frame at a time, including events
 * published during catch-up. Live fan-out excludes this client until caught up.
 *
 * WS5: the buffer is seq-contiguous, so each step seeks by index (`seq -
 * buffer[0].seq`) instead of scanning, and reuses the entry's ingest-time
 * serialization unless per-client scoping actually rewrote the event. */
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
      const scoped = ctx.scopeEventForClient(entry.event, socket);
      return scoped === entry.event
        ? `{"type":"event","seq":${entry.seq},"space":"loopback","event":${entry.json}}`
        : JSON.stringify({ type: "event", seq: entry.seq, space: "loopback", event: scoped });
    },
  });
}
