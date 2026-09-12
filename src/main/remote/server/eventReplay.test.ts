import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import type { BufferedSupervisorEvent } from "./context";
import { replayEvents } from "./eventReplay";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function entry(seq: number): BufferedSupervisorEvent {
  return {
    seq,
    bytes: 1,
    event: { type: "thread-reset", threadId: `thread-${seq}` },
    json: JSON.stringify({ type: "thread-reset", threadId: `thread-${seq}` }),
  };
}

function fixture() {
  const socket = {
    readyState: WebSocket.OPEN,
    terminate: vi.fn<() => void>(),
  } as unknown as WebSocket;
  const callbacks: Array<(error?: Error) => void> = [];
  const sent: number[] = [];
  const context: Parameters<typeof replayEvents>[0] = {
    replayingClients: new Set([socket]),
    eventBuffer: [entry(1), entry(2)],
    get seq() {
      return this.eventBuffer.at(-1)?.seq ?? 0;
    },
    send: vi.fn<Parameters<typeof replayEvents>[0]["send"]>(),
    sendRaw: (_socket, data, onSent) => {
      sent.push((JSON.parse(data) as { seq: number }).seq);
      callbacks.push(onSent!);
      return true;
    },
    scopeEventForClient: (event) => event,
  };
  const drain = (): void => {
    callbacks.shift()!();
    vi.runOnlyPendingTimers();
  };
  return { socket, context, callbacks, sent, drain };
}

it("keeps one frame in flight and catches events published during the drain", () => {
  const { context, socket, sent, drain } = fixture();
  replayEvents(context, socket, 0);
  expect(sent).toEqual([1]);
  context.eventBuffer.push(entry(3));
  vi.runAllTimers();
  expect(sent).toEqual([1]);
  drain();
  expect(sent).toEqual([1, 2]);
  drain();
  expect(sent).toEqual([1, 2, 3]);
  drain();
  expect(context.replayingClients.size).toBe(0);
});

it("requests resync if history expires while a send is blocked", () => {
  const { context, socket, sent, drain } = fixture();
  replayEvents(context, socket, 0);
  context.eventBuffer.splice(0, 2, entry(3));
  drain();
  expect(sent).toEqual([1]);
  expect(context.send).toHaveBeenCalledWith(
    socket,
    expect.objectContaining({ type: "resync-required", seq: 3 }),
  );
  expect(context.replayingClients.size).toBe(0);
});

it("stops a closed connection's pending replay without sending another frame", () => {
  const { context, socket, sent, drain } = fixture();
  replayEvents(context, socket, 0);
  context.replayingClients.delete(socket);
  drain();
  expect(sent).toEqual([1]);
});

it("terminates on asynchronous send failure instead of admitting live events after a gap", () => {
  const { context, socket, callbacks, sent } = fixture();
  replayEvents(context, socket, 0);
  callbacks.shift()!(new Error("socket write failed"));
  vi.runAllTimers();
  expect(socket.terminate).toHaveBeenCalledOnce();
  expect(context.replayingClients.size).toBe(0);
  expect(sent).toEqual([1]);
});
