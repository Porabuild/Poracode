import {
  BACKEND_RENDERER_STREAM_VERSION,
  type BackendHostOutboundMessage,
} from "@/shared/backendHostProtocol";
import type { SupervisorEvent } from "@/shared/ipc";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { BackendHostCore, filterSupervisorEventForInterests } from "./BackendHostCore";
import { BackendRendererStream, type RendererStreamRevocation } from "./BackendRendererStream";
import { RendererStreamOwnership } from "./RendererStreamOwnership";
import { createRendererEventPublication } from "./rendererEventPublication";
import { createSupervisorEventRelay, type RendererStreamDelivery } from "./supervisorEventRelay";
import { planDesktopRelay } from "./supervisorEventFallback";

const streams: BackendRendererStream[] = [];

afterEach(async () => {
  await Promise.all(streams.splice(0).map((stream) => stream.dispose()));
});

const SLOW_GRANT = { windowId: 11, generation: 1, binding: "b-11" };
const HEALTHY_GRANT = { windowId: 22, generation: 1, binding: "b-22" };

function threadOutput(data: string): SupervisorEvent {
  return {
    type: "thread-output",
    threadId: "t-iso",
    data,
    outputLength: data.length,
    terminalInstanceId: "gen-test",
  };
}

/**
 * Gate 4 §5.4 (F10): one slow renderer must exhaust ONLY its bounded
 * delivery/recovery budget — bounded 1013 close plus a generation-fenced
 * recovery barrier scoped to its own window — while a simultaneous healthy
 * renderer keeps exact terminal events and control, and no supervisor-wide
 * terminal shedding signal arises solely from the slow peer.
 *
 * Composes the REAL production path: the real renderer stream over real
 * WebSockets, the real per-window ownership registry, the real relay
 * planner, and the REAL publication unit from `rendererEventPublication.ts`
 * (the exact function `src/backend/index.ts` hands to the relay) — with a
 * spy on the real `BackendHostCore.setSupervisorOutputBackpressured` proving
 * the global shed signal never fires.
 */
describe("renderer congestion isolation (Gate 4 §5.4 / F10)", () => {
  it("contains a slow renderer to its own budget without global supervisor shedding", async () => {
    const shedSpy = vi.spyOn(BackendHostCore.prototype, "setSupervisorOutputBackpressured");
    const ownership = new RendererStreamOwnership();
    const interests = {
      terminalThreadIds: ["t-iso"],
      runtimeThreadIds: ["t-iso"],
      allRuntimeEvents: false as const,
    };
    ownership.setWindows([
      {
        windowId: SLOW_GRANT.windowId,
        grant: SLOW_GRANT,
        interests,
        receivesShellRemainder: false,
      },
      {
        windowId: HEALTHY_GRANT.windowId,
        grant: HEALTHY_GRANT,
        interests,
        receivesShellRemainder: false,
      },
    ]);
    const revocations: RendererStreamRevocation[] = [];
    const stream = new BackendRendererStream({
      ownership,
      onRequest: async (request) => ({ served: request.id }),
      onStreamRecovery: (batch) => revocations.push(...batch),
    });
    streams.push(stream);
    const info = await stream.start();

    // Production composition: the publication unit under test feeds the real
    // relay exactly as `src/backend/index.ts` wires it.
    const sent: BackendHostOutboundMessage[] = [];
    const publish: (event: SupervisorEvent) => RendererStreamDelivery | undefined =
      createRendererEventPublication({ getStream: () => stream });
    const relay = createSupervisorEventRelay({
      publishToRendererStream: publish,
      observeEvent: () => undefined,
      planDesktopRelay: (event) =>
        planDesktopRelay({
          event,
          ownershipArmed: ownership.isArmed(),
          fallbackWindows: ownership.fallbackWindows(),
          isTerminalBootstrapRetainedFor: () => false,
          filterEventForInterests: (filtered, eventInterests) =>
            filterSupervisorEventForInterests(filtered, eventInterests),
          filterShellEvent: (shell) => shell,
        }),
      sendToMain: (message) => sent.push(message),
    });

    const slow = await subscribedClient(info, SLOW_GRANT);
    const healthy = await subscribedClient(info, HEALTHY_GRANT);

    // Congest ONLY the slow renderer past the stream's high watermark while
    // it is still inside its bounded delivery budget: this is exactly the
    // condition that used to flip supervisor-wide shedding on.
    setServerBufferedAmount(stream, SLOW_GRANT.windowId, 600 * 1024);
    expect(stream.isBackpressured()).toBe(true);

    relay(threadOutput("frame-one-exact"));
    await waitForMessage(
      healthy.messages,
      (message) => message.type === "event" && eventData(message) === "frame-one-exact",
    );
    // Within budget the slow window still receives — and even so, no global
    // supervisor shed signal may arise from its congestion alone.
    await waitForMessage(
      slow.messages,
      (message) => message.type === "event" && eventData(message) === "frame-one-exact",
    );
    expect(shedSpy).not.toHaveBeenCalled();
    expect(sent).toEqual([]);

    // Push the slow renderer over its bounded budget. It must be closed with
    // 1013 and given a recovery barrier for its own window — not queued
    // unboundedly, and not at the healthy window's expense.
    setServerBufferedAmount(stream, SLOW_GRANT.windowId, 2 * 1024 * 1024);
    relay(threadOutput("frame-two-exact"));
    await expect(nextClose(slow.socket)).resolves.toBe(1013);
    await waitFor(() => revocations.length === 1);
    expect(revocations[0]).toEqual({
      windowId: SLOW_GRANT.windowId,
      generation: SLOW_GRANT.generation,
      fromSequence: 1,
      toSequence: 2,
      threadIds: ["t-iso"],
    });
    expect(stream.getDiagnostics().slowClientDisconnects).toBe(1);
    // The over-budget event never reached the slow window: bounded close
    // instead of unbounded queueing.
    expect(slow.messages.filter((message) => message.type === "event").map(eventData)).toEqual([
      "frame-one-exact",
    ]);

    // The healthy renderer continues exact terminal events after the slow
    // peer's death — contiguous sequence, exact bytes — and still no global
    // shed signal.
    relay(threadOutput("frame-three-exact"));
    await waitForMessage(
      healthy.messages,
      (message) => message.type === "event" && eventData(message) === "frame-three-exact",
    );
    const healthyEvents = healthy.messages.filter((message) => message.type === "event");
    expect(healthyEvents.map(eventData)).toEqual([
      "frame-one-exact",
      "frame-two-exact",
      "frame-three-exact",
    ]);
    expect(healthyEvents.map((message) => message.seq)).toEqual([1, 2, 3]);
    expect(healthyEvents[2]).toMatchObject({
      event: {
        type: "thread-output",
        threadId: "t-iso",
        data: "frame-three-exact",
        outputLength: "frame-three-exact".length,
        terminalInstanceId: "gen-test",
      },
    });
    expect(shedSpy).not.toHaveBeenCalled();

    // Recovery for the lost window stays local: from the moment the slow
    // peer dies, the desktop-IPC fallback carries targeted copies addressed
    // to the slow window only — the healthy window keeps direct delivery and
    // nothing is broadcast.
    const envelopes = sent.flatMap((message) =>
      message.kind === "supervisor-event"
        ? [{ event: message.event, target: message.target, seq: message.rendererSequence }]
        : [],
    );
    expect(envelopes).toHaveLength(2);
    expect(envelopes[0]).toMatchObject({
      seq: 2,
      target: { windowId: SLOW_GRANT.windowId, generation: SLOW_GRANT.generation },
      event: { type: "thread-output", threadId: "t-iso", data: "frame-two-exact" },
    });
    expect(envelopes[1]).toMatchObject({
      seq: 3,
      target: { windowId: SLOW_GRANT.windowId, generation: SLOW_GRANT.generation },
      event: { type: "thread-output", threadId: "t-iso", data: "frame-three-exact" },
    });

    // Control plane is unaffected: the healthy renderer still gets an exact
    // request/reply round-trip after the slow peer was shed.
    healthy.socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request",
        id: "ctl-1",
        operation: "database",
        name: "dbGetProjects",
        payload: {},
      }),
    );
    await waitForMessage(
      healthy.messages,
      (message) => message.type === "reply" && message.id === "ctl-1",
    );
    expect(
      healthy.messages.find((message) => message.type === "reply" && message.id === "ctl-1"),
    ).toEqual({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "reply",
      id: "ctl-1",
      ok: true,
      data: { served: "ctl-1" },
    });
    expect(shedSpy).not.toHaveBeenCalled();

    healthy.socket.close();
  }, 15_000);
});

function eventData(message: Record<string, unknown>): unknown {
  return (message.event as { data?: unknown } | undefined)?.data;
}

function setServerBufferedAmount(
  stream: BackendRendererStream,
  windowId: number,
  bytes: number,
): void {
  const clients = (
    stream as unknown as { clients: Map<WebSocket, { ownedWindowIds: Set<number> }> }
  ).clients;
  for (const [socket, state] of clients) {
    if (state.ownedWindowIds.has(windowId)) {
      Object.defineProperty(socket, "bufferedAmount", { configurable: true, value: bytes });
      return;
    }
  }
  throw new Error(`No bound server socket owns window ${windowId}.`);
}

async function subscribedClient(
  info: { url: string; token: string },
  grant: { windowId: number; generation: number; binding: string },
): Promise<{ socket: WebSocket; messages: Record<string, unknown>[] }> {
  const socket = new WebSocket(`${info.url}?token=${info.token}`);
  // The hello frame can arrive in the same tick as `open`; collect from
  // construction so the ack wait below never misses its frames.
  const messages: Record<string, unknown>[] = [];
  socket.on("message", (data) => {
    messages.push(JSON.parse(data.toString()) as Record<string, unknown>);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  await waitForMessage(messages, (message) => message.type === "hello");
  socket.send(
    JSON.stringify({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "interests",
      terminalThreadIds: ["t-iso"],
      runtimeThreadIds: ["t-iso"],
      lastSeq: 0,
      ownership: grant,
    }),
  );
  await waitForMessage(messages, (message) => message.type === "interests-ack");
  return { socket, messages };
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Condition not met in time.");
}

async function waitForMessage(
  messages: Record<string, unknown>[],
  predicate: (message: Record<string, unknown>) => boolean,
  timeoutMs = 2_000,
): Promise<void> {
  await waitFor(() => messages.some(predicate), timeoutMs);
}

function nextClose(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => socket.once("close", resolve));
}
