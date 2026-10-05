import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import type { RuntimeEvent } from "@/shared/contracts";
import type { RuntimeHistoryNoticeLookup } from "@/shared/runtimeHistoryNotice";
import { publishSupervisorEvent, scopeEventForClient } from "../remoteAccessServerEvents";
import type { RemoteAccessServerHost, RemoteAccessServerOptions } from "../remoteAccessServerTypes";
import { dropWebSocketClient, send, sendRaw } from "../remoteAccessServerWs";
import type { RemoteBroadcastEvent } from "./context";
import { replayEvents } from "./eventReplay";
import { outboundFrameBytes } from "./outboundBudget";
import {
  PrincipalAdmissionController,
  resolvePrincipalAdmissionLimits,
} from "./principalAdmission";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** No listening server, database or timers: exercise the real publisher,
 * gates, cap and reserved send path with authenticated transport doubles. */
class Socket {
  readonly readyState = WebSocket.OPEN;
  bufferedAmount = 0;
  readonly sent: string[] = [];
  readonly callbacks: Array<(error?: Error) => void> = [];
  readonly terminate = vi.fn<() => void>();

  send(data: string, callback?: (error?: Error) => void): void {
    this.sent.push(data);
    if (callback) this.callbacks.push(callback);
  }

  once(): this {
    return this;
  }

  flush(): void {
    for (const callback of this.callbacks.splice(0)) callback();
  }

  get ws(): WebSocket {
    return this as unknown as WebSocket;
  }
  get frames(): Array<{ type: string; seq: number; space: string; event: RemoteBroadcastEvent }> {
    return this.sent.map((data) => JSON.parse(data));
  }
}

function fixture(count: number, options: Partial<RemoteAccessServerOptions> = {}) {
  const sockets = Array.from({ length: count }, () => new Socket());
  const host = {
    options: { ownsSupervisorPersistence: false, ...options },
    seq: 0,
    eventBuffer: [],
    supervisorEventListeners: new Set(),
    backgroundTasksByThread: new Map(),
    clients: new Map(
      sockets.map((socket, index) => [socket.ws, { sessionId: `principal-${index}` }]),
    ),
    replayingClients: new Set(),
    clientLiveness: new Map(),
    terminalWatches: new Map(),
    gitStateInterests: new Map(),
    itemInterests: new Map(),
    noticeCapableClients: new Set(),
    boundedCatalogChangeClients: new Set(),
    terminalCursorSync: { clearConnection: () => {} },
    detachDesktopInternalClient: () => {},
    notifyEventInterestsChanged: () => {},
  } as unknown as RemoteAccessServerHost;
  const admission = new PrincipalAdmissionController(
    resolvePrincipalAdmissionLimits(host.options),
    {
      evictSocket: (ws) => dropWebSocketClient(host, ws),
    },
  );
  (host as { principalAdmission: PrincipalAdmissionController }).principalAdmission = admission;
  const publish = (event: RemoteBroadcastEvent) =>
    publishSupervisorEvent(host, event, new Set([event.type]), new Set());
  return { host, sockets, admission, publish };
}

function delta(threadId: string, text = "visible 界🙂"): RuntimeEvent {
  return { type: "content.delta", threadId, itemId: "item", stream: "assistant_text", delta: text };
}

function single(threadId: string, text?: string): RemoteBroadcastEvent {
  return { type: "thread-runtime-event", threadId, event: delta(threadId, text) };
}

const request: RuntimeEvent = {
  type: "request.opened",
  threadId: "thread",
  requestId: "request",
  requestType: "tool_call_approval",
  payload: { summary: "Permission prompt" },
};
const turn: RuntimeEvent = {
  type: "turn.completed",
  threadId: "thread",
  turnId: "turn",
  state: "completed",
};

function gapPort(
  lookupNotice: (threadId: string) => RuntimeHistoryNoticeLookup,
): NonNullable<RemoteAccessServerOptions["runtimeHistoryGap"]> {
  return {
    lookupNotice,
    read: () => null,
    readNotice: () => null,
    acknowledge: async () => {
      throw new Error("Unused acknowledgement");
    },
  };
}

describe("publication-local runtime frame cache", () => {
  it.each([1, 4, 16])(
    "meets the exact fan-out serialization bound for %i clients without hidden bytes or sequence gaps",
    (count) => {
      const { host, sockets, publish } = fixture(count);
      sockets.forEach((socket, index) =>
        host.itemInterests.set(socket.ws, new Set([`visible-${index}`])),
      );
      const events = [
        ...sockets.map((_, index) => single(`visible-${index}`, "v")),
        ...Array.from({ length: 64 }, (_, index) => single(`hidden-${index}`, `H${index}`)),
      ];
      const stringify = vi.spyOn(JSON, "stringify");
      const calls = events.map((event) => {
        const before = stringify.mock.calls.length;
        publish(event);
        return stringify.mock.calls.length - before;
      });
      expect(calls).toEqual(events.map((_, index) => (count === 1 && index === 0 ? 1 : 2)));
      expect(stringify).toHaveBeenCalledTimes(count === 1 ? 129 : 2 * (count + 64));
      for (const [index, socket] of sockets.entries()) {
        expect(socket.frames.map((frame) => frame.seq)).toEqual(events.map((_, seq) => seq + 1));
        expect(socket.frames.map((frame) => frame.event)).toEqual(
          events.map((event, eventIndex) =>
            eventIndex === index
              ? event
              : {
                  type: "thread-runtime-events",
                  threadId:
                    eventIndex < count ? `visible-${eventIndex}` : `hidden-${eventIndex - count}`,
                  events: [],
                },
          ),
        );
        expect(socket.sent.every((data) => !data.includes('"delta":"H'))).toBe(true);
        expect(
          socket.frames.every((frame) => frame.type === "event" && frame.space === "loopback"),
        ).toBe(true);
      }
    },
  );

  it("keeps legacy clients full and delivers permission/question/lifecycle control through uninterested projections", () => {
    const { host, sockets, publish } = fixture(3);
    host.itemInterests.set(sockets[1]!.ws, new Set());
    host.itemInterests.set(sockets[2]!.ws, new Set());
    const question: RuntimeEvent = {
      ...request,
      requestId: "question",
      requestType: "tool_user_input",
    };
    const events: RemoteBroadcastEvent[] = [
      single("thread"),
      { type: "thread-runtime-event", threadId: "thread", event: request },
      {
        type: "thread-runtime-events",
        threadId: "thread",
        events: [delta("thread"), request, question, turn],
        flowSeq: 4,
        flowBytes: 500,
      },
      { type: "thread-reset", threadId: "thread" },
    ];
    const stringify = vi.spyOn(JSON, "stringify");
    for (const event of events) publish(event);
    expect(stringify).toHaveBeenCalledTimes(6); // two scoped content frames, two full control frames
    expect(sockets[0]!.frames.map((frame) => frame.event)).toEqual(events);
    for (const socket of sockets.slice(1)) {
      expect(socket.frames.map((frame) => frame.event)).toEqual([
        { type: "thread-runtime-events", threadId: "thread", events: [] },
        events[1],
        { ...events[2], events: [request, question, turn] },
        events[3],
      ]);
    }
  });

  it.each(["notice", "error", "throw"] as const)(
    "scopes equal interests independently for notice capability and lookup %s",
    (mode) => {
      const lookupNotice = vi.fn<() => RuntimeHistoryNoticeLookup>(() => {
        if (mode === "throw") throw new Error("Lookup failed");
        return mode === "error"
          ? { kind: "error", error: new Error("Lookup failed") }
          : { kind: "notice" };
      });
      const { host, sockets, publish } = fixture(4, { runtimeHistoryGap: gapPort(lookupNotice) });
      sockets.forEach((socket) => host.itemInterests.set(socket.ws, new Set()));
      host.noticeCapableClients.add(sockets[0]!.ws);
      host.noticeCapableClients.add(sockets[2]!.ws);
      const event: RemoteBroadcastEvent = {
        type: "thread-runtime-events",
        threadId: "thread",
        events: [delta("thread", "secret"), request, turn],
      };
      const stringify = vi.spyOn(JSON, "stringify");
      publish(event);
      expect(stringify).toHaveBeenCalledTimes(3); // canonical, controls-only, fully gated
      expect(lookupNotice).toHaveBeenCalledTimes(2);
      sockets.forEach((socket, index) => {
        expect(socket.frames[0]!.event).toEqual({
          ...event,
          events: index % 2 === 0 ? [request, turn] : [],
        });
        expect(socket.sent[0]).not.toContain("secret");
      });
    },
  );

  it("never reuses a prior socket's notice result even when the next lookup fails", () => {
    let lookup = 0;
    const { host, sockets, publish } = fixture(4, {
      runtimeHistoryGap: gapPort(() => {
        lookup += 1;
        if (lookup === 4) throw new Error("Lookup failed");
        return lookup === 2 ? { kind: "error", error: "unavailable" } : { kind: "clean" };
      }),
    });
    sockets.forEach((socket) => host.itemInterests.set(socket.ws, new Set(["thread"])));
    const event = single("thread", "secret");
    const stringify = vi.spyOn(JSON, "stringify");
    publish(event);
    expect(stringify).toHaveBeenCalledTimes(2);
    expect(lookup).toBe(4);
    expect(sockets.map((socket) => socket.frames[0]!.event)).toEqual([
      event,
      { type: "thread-runtime-events", threadId: "thread", events: [] },
      event,
      { type: "thread-runtime-events", threadId: "thread", events: [] },
    ]);
  });

  it("shares only identical multi-thread subsets after both gates", () => {
    const { host, sockets, publish } = fixture(4, {
      runtimeHistoryGap: gapPort((id) => ({ kind: id === "a" ? "notice" : "clean" })),
    });
    sockets.forEach((socket, index) => {
      host.itemInterests.set(socket.ws, new Set([index < 2 ? "a" : "b"]));
      if (index < 3) host.noticeCapableClients.add(socket.ws);
    });
    const event: RemoteBroadcastEvent = {
      type: "thread-runtime-events-multi",
      batches: [
        { threadId: "a", events: [delta("a"), request] },
        { threadId: "b", events: [delta("b")] },
      ],
    };
    const stringify = vi.spyOn(JSON, "stringify");
    publish(event);
    expect(stringify).toHaveBeenCalledTimes(4); // canonical plus three actual projections
    expect(sockets.map((socket) => socket.frames[0]!.event)).toEqual([
      { ...event, batches: [event.batches[0], { threadId: "b", events: [] }] },
      { ...event, batches: [event.batches[0], { threadId: "b", events: [] }] },
      { ...event, batches: [{ threadId: "a", events: [request] }, event.batches[1]] },
      { ...event, batches: [{ threadId: "a", events: [] }, event.batches[1]] },
    ]);
  });

  it("keeps canonical replay truthful and contiguous across live interest changes and reconnect scoping", () => {
    vi.useFakeTimers();
    const { host, sockets, publish } = fixture(2);
    const live = sockets[0]!;
    const replay = sockets[1]!;
    host.itemInterests.set(live.ws, new Set());
    host.itemInterests.set(replay.ws, new Set());
    host.replayingClients.add(replay.ws);
    const events = [
      single("thread", "first"),
      single("thread", "second"),
      { type: "thread-reset", threadId: "thread" } as const,
    ];
    publish(events[0]!);
    host.itemInterests.set(live.ws, new Set(["thread"]));
    publish(events[1]!);
    publish(events[2]!);
    expect(live.frames.map((frame) => frame.event)).toEqual([
      { type: "thread-runtime-events", threadId: "thread", events: [] },
      events[1],
      events[2],
    ]);
    expect(replay.sent).toEqual([]);
    expect(host.eventBuffer.map((entry) => entry.event)).toEqual(events);
    expect(host.eventBuffer.map((entry) => JSON.parse(entry.json))).toEqual(events);
    replayEvents(
      {
        ...host,
        send: (ws, message) => send(host, ws, message),
        sendRaw: (ws, data, callback) => sendRaw(host, ws, data, callback),
        scopeEventForClient: (event, ws) => scopeEventForClient(host, event, ws),
      },
      replay.ws,
      0,
    );
    replay.flush();
    // A reconnect changing interests between replay frames sees the canonical
    // second event, never a cached live empty from another recipient.
    host.itemInterests.set(replay.ws, new Set(["thread"]));
    vi.runOnlyPendingTimers();
    replay.flush();
    vi.runOnlyPendingTimers();
    replay.flush();
    vi.runOnlyPendingTimers();
    expect(replay.frames).toEqual(live.frames);
    expect(replay.frames.map((frame) => frame.seq)).toEqual([1, 2, 3]);
    expect(host.replayingClients.has(replay.ws)).toBe(false);
  });

  it("uses the capped canonical event for cache identities and retained replay", () => {
    const { host, sockets, publish } = fixture(3, { maxWebSocketOutboundBufferBytes: 4096 });
    for (const socket of sockets.slice(1)) host.itemInterests.set(socket.ws, new Set());
    const event: RemoteBroadcastEvent = {
      type: "thread-runtime-events",
      threadId: "thread",
      events: [
        {
          type: "item.completed",
          threadId: "thread",
          itemId: "item",
          payload: { result: "secret".repeat(2000) },
        },
        turn,
      ],
    };
    publish(event);
    expect(host.eventBuffer[0]!.event).not.toBe(event);
    expect(sockets[0]!.frames[0]!.event).toEqual(host.eventBuffer[0]!.event);
    expect(sockets[0]!.sent[0]).toContain("__poracode");
    for (const socket of sockets.slice(1))
      expect(socket.frames[0]!.event).toEqual({ ...event, events: [turn] });
    for (const socket of sockets) {
      expect(socket.sent[0]).not.toContain("secret");
      expect(socket.terminate).not.toHaveBeenCalled();
    }
  });

  it("reserves every shared frame separately and drops a congested socket without affecting peers", () => {
    const { host, sockets, admission, publish } = fixture(3, {
      maxWebSocketOutboundBufferBytes: 1024,
    });
    for (const socket of sockets) host.itemInterests.set(socket.ws, new Set());
    sockets[0]!.bufferedAmount = 1024;
    // Share a principal as well as a serialized frame; reservations must still
    // be per socket and last until each socket's own write callback.
    host.clients.set(sockets[2]!.ws, host.clients.get(sockets[1]!.ws)!);
    publish(single("thread"));
    expect(sockets[0]!.terminate).toHaveBeenCalledOnce();
    expect(sockets[0]!.sent).toEqual([]);
    expect(admission.outboundQueuedBytes("principal-0")).toBe(0);
    expect(sockets[1]!.sent).toEqual(sockets[2]!.sent);
    const bytes = outboundFrameBytes(Buffer.byteLength(sockets[1]!.sent[0]!, "utf8"));
    expect(admission.outboundQueuedBytes("principal-1")).toBe(bytes * 2);
    sockets[1]!.flush();
    expect(admission.outboundQueuedBytes("principal-1")).toBe(bytes);
    sockets[2]!.flush();
    expect(admission.outboundQueuedBytes("principal-1")).toBe(0);
  });
});
