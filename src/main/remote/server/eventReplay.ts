import { WebSocket } from "ws";
import type { RemoteServerContext } from "./context";

type ReplayContext = Pick<
  RemoteServerContext,
  "replayingClients" | "seq" | "eventBuffer" | "send" | "sendRaw" | "scopeEventForClient"
>;

/** Reads the shared bounded history one frame at a time, including events
 * published during catch-up. Live fan-out excludes this client until caught up. */
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
    const entry = ctx.eventBuffer.find((candidate) => candidate.seq === cursor + 1);
    if (!entry) {
      stop();
      ctx.send(socket, {
        type: "resync-required",
        seq: ctx.seq,
        reason: "Event replay window expired; request a fresh snapshot.",
      });
      return;
    }
    try {
      const data = JSON.stringify({
        type: "event",
        seq: entry.seq,
        event: ctx.scopeEventForClient(entry.event, socket),
      });
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
