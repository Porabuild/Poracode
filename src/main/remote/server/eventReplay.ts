import { WebSocket } from "ws";
import type { RemoteServerContext } from "./context";

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
  let cursor = lastSeenSeq;
  const stop = (): void => {
    ctx.replayingClients.delete(socket);
  };
  const pump = (): void => {
    if (!ctx.replayingClients.has(socket)) return;
    if (socket.readyState !== WebSocket.OPEN) {
      stop();
      return;
    }
    if (cursor === ctx.seq) {
      stop();
      return;
    }
    const oldest = ctx.eventBuffer[0];
    const index = oldest ? cursor + 1 - oldest.seq : -1;
    const entry = index >= 0 ? ctx.eventBuffer[index] : undefined;
    // Undeliverable oversized events advance `seq` without entering the
    // buffer, so the index alone cannot prove contiguity — verify the entry
    // really is the next one before sending it.
    if (!entry || entry.seq !== cursor + 1) {
      stop();
      ctx.send(socket, {
        type: "resync-required",
        seq: ctx.seq,
        reason: "Event replay window expired; request a fresh snapshot.",
      });
      return;
    }
    try {
      const scoped = ctx.scopeEventForClient(entry.event, socket);
      const data =
        scoped === entry.event
          ? `{"type":"event","seq":${entry.seq},"event":${entry.json}}`
          : JSON.stringify({ type: "event", seq: entry.seq, event: scoped });
      const sent = ctx.sendRaw(socket, data, (error) => {
        if (error) {
          stop();
          socket.terminate();
          return;
        }
        cursor = entry.seq;
        setImmediate(pump);
      });
      if (!sent) stop();
    } catch {
      stop();
      socket.terminate();
    }
  };
  pump();
}
