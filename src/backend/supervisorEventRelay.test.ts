import {
  BACKEND_HOST_PROTOCOL_VERSION,
  BACKEND_RENDERER_STREAM_VERSION,
  type BackendHostOutboundMessage,
} from "@/shared/backendHostProtocol";
import type { SupervisorEvent, SupervisorReply } from "@/shared/ipc";
import { SupervisorIpcSender } from "@/supervisor/supervisorIpcSender";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { BackendRendererStream } from "./BackendRendererStream";
import { RendererStreamOwnership } from "./RendererStreamOwnership";
import {
  createBackendHostShedPolicy,
  createSupervisorEventRelay,
  type RendererStreamDelivery,
} from "./supervisorEventRelay";
import { planDesktopRelay } from "./supervisorEventFallback";
import { filterSupervisorEventForInterests } from "./BackendHostCore";

const streams: BackendRendererStream[] = [];

afterEach(async () => {
  await Promise.all(streams.splice(0).map((stream) => stream.dispose()));
});

const BULK_EVENT: SupervisorEvent = {
  type: "thread-output",
  threadId: "thread-1",
  data: "bulk bytes",
  outputLength: 10,
  terminalInstanceId: "gen-1",
};

const CONTROL_EVENT: SupervisorEvent = {
  type: "thread-state",
  threadId: "thread-1",
  status: "working",
  attention: "none",
  canResumeWithConfig: false,
};

const GRANT_A = { windowId: 7, generation: 1, binding: "b-7" };
const GRANT_B = { windowId: 8, generation: 2, binding: "b-8" };

interface SupervisorEnvelope {
  event: SupervisorEvent;
  rendererSequence?: number;
  target?: { windowId: number; generation: number };
}

interface RelayHarness {
  stream: BackendRendererStream;
  ownership: RendererStreamOwnership;
  info: { url: string; token: string };
  relay(event: SupervisorEvent): void;
  supervisorEvents(): SupervisorEnvelope[];
}

/**
 * Composes the real renderer stream, the real per-window ownership registry,
 * and the real relay planner — the production wiring, not a stand-in
 * predicate — and captures what reaches backend-to-main IPC.
 */
async function makeHarness(): Promise<RelayHarness> {
  const ownership = new RendererStreamOwnership();
  const stream = new BackendRendererStream({ ownership });
  streams.push(stream);
  const info = await stream.start();
  const sent: BackendHostOutboundMessage[] = [];
  const relay = createSupervisorEventRelay({
    publishToRendererStream: (event) => stream.publish(event),
    observeEvent: () => undefined,
    planDesktopRelay: (event) =>
      planDesktopRelay({
        event,
        ownershipArmed: ownership.isArmed(),
        fallbackWindows: ownership.fallbackWindows(),
        isTerminalBootstrapRetainedFor: () => false,
        filterEventForInterests: (filtered, interests) =>
          filterSupervisorEventForInterests(filtered, interests),
        filterShellEvent: (shell) => shell,
      }),
    sendToMain: (message) => sent.push(message),
  });
  return {
    stream,
    ownership,
    info,
    relay: (event) => relay(event),
    supervisorEvents: (): SupervisorEnvelope[] =>
      sent.flatMap((message): SupervisorEnvelope[] => {
        if (message.kind !== "supervisor-event") return [];
        return [
          {
            event: message.event,
            ...(message.rendererSequence !== undefined
              ? { rendererSequence: message.rendererSequence }
              : {}),
            ...(message.target ? { target: message.target } : {}),
          },
        ];
      }),
  };
}

/** Connects with real sockets and presents an ownership binding on interests. */
async function connectBoundClient(
  info: { url: string; token: string },
  ownership: { windowId: number; generation: number; binding: string },
  threadIds: string[],
): Promise<{
  socket: WebSocket;
  ack: Record<string, unknown>;
  messages: Record<string, unknown>[];
}> {
  const socket = new WebSocket(`${info.url}?token=${info.token}`);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const messages: Record<string, unknown>[] = [];
  socket.on("message", (data) => {
    messages.push(JSON.parse(data.toString()) as Record<string, unknown>);
  });
  // A window watching a thread subscribes both content kinds. The frame
  // version must track the production stream contract: a stale version is
  // loudly rejected with 1008 (see rendererStreamLargeReplyAdmission's
  // explicit v5-rejection case), so valid peers always present the current
  // version.
  socket.send(
    JSON.stringify({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "interests",
      terminalThreadIds: threadIds,
      runtimeThreadIds: threadIds,
      lastSeq: 0,
      ownership,
    }),
  );
  await waitForMessage(messages, (message) => message.type === "interests-ack");
  const ack = messages.find((message) => message.type === "interests-ack")!;
  return { socket, ack, messages };
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
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (messages.some(predicate)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for a matching stream message.");
}

function emptyInterests(threadIds: string[]): {
  terminalThreadIds: string[];
  runtimeThreadIds: string[];
  allRuntimeEvents: boolean;
} {
  return {
    terminalThreadIds: [...threadIds],
    runtimeThreadIds: [...threadIds],
    allRuntimeEvents: false,
  };
}

function envelopeAt(envelopes: SupervisorEnvelope[], index: number): SupervisorEnvelope {
  const entry = envelopes[index];
  if (!entry) throw new Error(`Expected a supervisor-event envelope at index ${index}.`);
  return entry;
}

describe("createSupervisorEventRelay (composed with the real stream ownership)", () => {
  it("relays everything before the first per-window push, sequenced as before", async () => {
    const harness = await makeHarness();
    // No ownership push yet: legacy full-relay mode.
    harness.relay(BULK_EVENT);
    harness.relay(CONTROL_EVENT);
    const envelopes = harness.supervisorEvents();
    expect(envelopes.map((entry) => entry.event.type)).toEqual(["thread-output", "thread-state"]);
    expect(envelopeAt(envelopes, 0)).toMatchObject({ rendererSequence: 1 });
    expect(envelopeAt(envelopes, 1).rendererSequence).toBe(2);
  });

  it("keeps direct-owned bulk out of main while an unowned sibling only pulls its own traffic", async () => {
    const harness = await makeHarness();
    // Disjoint: window 7 owns thread-1 delivery directly; window 8 is a
    // registered fallback consumer that subscribes to thread-2 only.
    harness.ownership.setWindows([
      {
        windowId: GRANT_A.windowId,
        grant: GRANT_A,
        interests: emptyInterests(["thread-1"]),
        receivesShellRemainder: false,
      },
      {
        windowId: GRANT_B.windowId,
        grant: GRANT_B,
        interests: emptyInterests(["thread-2"]),
        receivesShellRemainder: false,
      },
    ]);
    const client = await connectBoundClient(harness.info, GRANT_A, ["thread-1"]);

    // A-only bulk: the sole interested window owns it — zero copies to main.
    harness.relay({ ...BULK_EVENT, threadId: "thread-1" });
    expect(harness.supervisorEvents()).toEqual([]);

    // B-only bulk: reaches exactly B, targeted and sequenced.
    harness.relay({ ...BULK_EVENT, threadId: "thread-2", data: "B bulk" });
    const bCopy = harness.supervisorEvents();
    expect(bCopy).toHaveLength(1);
    expect(envelopeAt(bCopy, 0)).toMatchObject({
      rendererSequence: 2,
      target: { windowId: 8, generation: 2 },
      event: { threadId: "thread-2" },
    });

    // Shared bulk crosses only for the fallback window.
    harness.relay({ ...BULK_EVENT, threadId: "thread-2", data: "shared bulk" });
    const shared = harness.supervisorEvents().slice(-1);
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({ target: { windowId: 8 } });

    // Controls always reach main for shell consumers, sequence-less.
    harness.relay(CONTROL_EVENT);
    const control = harness.supervisorEvents().slice(-1);
    expect(envelopeAt(control, 0)).toMatchObject({ event: { type: "thread-state" } });
    expect(envelopeAt(control, 0).rendererSequence).toBeUndefined();
    expect(envelopeAt(control, 0).target).toBeUndefined();

    client.socket.close();
  });

  it("restores bulk copies for its window when the owning socket drops", async () => {
    const harness = await makeHarness();
    harness.ownership.setWindows([
      {
        windowId: GRANT_A.windowId,
        grant: GRANT_A,
        interests: emptyInterests(["thread-1"]),
        receivesShellRemainder: false,
      },
    ]);
    const client = await connectBoundClient(harness.info, GRANT_A, ["thread-1"]);
    expect(harness.ownership.fallbackWindows()).toEqual([]);

    client.socket.close();
    await waitFor(() => harness.ownership.fallbackWindows().length === 1);

    harness.relay({ ...BULK_EVENT, data: "after close" });
    const envelopes = harness.supervisorEvents();
    expect(envelopes).toHaveLength(1);
    expect(envelopeAt(envelopes, 0)).toMatchObject({
      rendererSequence: 1,
      target: { windowId: 7, generation: 1 },
    });
  });

  it("splits a mixed batch: control remainder reaches main sequence-less, bulk only targeted", async () => {
    const harness = await makeHarness();
    harness.ownership.setWindows([
      {
        windowId: GRANT_A.windowId,
        grant: GRANT_A,
        interests: emptyInterests(["thread-1"]),
        receivesShellRemainder: false,
      },
    ]);
    // Window 7 stays unowned → fallback consumer for thread-1.
    const mixed: SupervisorEvent = {
      type: "thread-runtime-events",
      threadId: "thread-1",
      events: [
        { type: "item.started", threadId: "thread-1", itemId: "i1", itemType: "assistant_message" },
        { type: "turn.completed", threadId: "thread-1", turnId: "t1", state: "completed" },
      ],
    };
    harness.relay(mixed);

    const envelopes = harness.supervisorEvents();
    expect(envelopes).toHaveLength(2);
    // Targeted copy first, carrying the full batch for the fallback window.
    expect(envelopeAt(envelopes, 0)).toMatchObject({
      rendererSequence: 1,
      target: { windowId: 7, generation: 1 },
      event: {
        type: "thread-runtime-events",
        events: [{ type: "item.started" }, { type: "turn.completed" }],
      },
    });
    // The shell remainder is the control half only, with no sequence.
    expect(envelopes[1]).toMatchObject({
      event: { type: "thread-runtime-events", events: [{ type: "turn.completed" }] },
    });
    expect(envelopeAt(envelopes, 1).rendererSequence).toBeUndefined();
  });

  it("keeps direct-owned bulk inside a mixed batch out of main entirely", async () => {
    const harness = await makeHarness();
    harness.ownership.setWindows([
      {
        windowId: GRANT_A.windowId,
        grant: GRANT_A,
        interests: emptyInterests(["thread-1"]),
        receivesShellRemainder: false,
      },
    ]);
    const client = await connectBoundClient(harness.info, GRANT_A, ["thread-1"]);

    const mixed: SupervisorEvent = {
      type: "thread-runtime-events",
      threadId: "thread-1",
      events: [
        { type: "item.started", threadId: "thread-1", itemId: "i1", itemType: "assistant_message" },
        { type: "turn.completed", threadId: "thread-1", turnId: "t1", state: "completed" },
      ],
    };
    harness.relay(mixed);

    const envelopes = harness.supervisorEvents();
    expect(envelopes).toHaveLength(1);
    // Only the control remainder crossed; the bulk half stayed out of main.
    expect(envelopeAt(envelopes, 0)).toMatchObject({
      event: { type: "thread-runtime-events", events: [{ type: "turn.completed" }] },
    });
    expect(envelopeAt(envelopes, 0).rendererSequence).toBeUndefined();
    await waitForMessage(client.messages, (message) => message.type === "event");
    client.socket.close();
  });

  it("publishes to the stream before observing and relaying, once per event", () => {
    const publishToRendererStream = vi.fn<() => RendererStreamDelivery | undefined>(
      () => undefined,
    );
    const observeEvent = vi.fn<(event: SupervisorEvent) => boolean | void>();
    const plan = vi.fn<(event: SupervisorEvent) => ReturnType<typeof planDesktopRelay>>(() => ({
      mode: "targeted",
      copies: [],
      shellEvent: null,
    }));
    const sendToMain = vi.fn<(message: BackendHostOutboundMessage) => void>();
    const relay = createSupervisorEventRelay({
      publishToRendererStream,
      observeEvent,
      planDesktopRelay: plan,
      sendToMain,
    });

    relay(BULK_EVENT);

    expect(publishToRendererStream).toHaveBeenCalledBefore(observeEvent);
    expect(observeEvent).toHaveBeenCalledBefore(plan);
    expect(publishToRendererStream).toHaveBeenCalledExactlyOnceWith(BULK_EVENT);
    expect(sendToMain).not.toHaveBeenCalled();
  });

  it("honors a consumer-vetoed event without touching the planner", () => {
    const sent: BackendHostOutboundMessage[] = [];
    const relay = createSupervisorEventRelay({
      publishToRendererStream: () => ({ delivered: true, sequence: 3 }),
      observeEvent: () => true,
      planDesktopRelay: () => {
        throw new Error("planner must not run for vetoed events");
      },
      sendToMain: (message) => sent.push(message),
    });

    relay(BULK_EVENT);

    expect(sent).toEqual([]);
  });

  it("relays bulk over IPC while its window is a fallback consumer, even when the stream delivered it", () => {
    // Regression (MC-1): a ready WS client receiving the event must not
    // suppress the desktop-IPC fallback — suppression keys only on the
    // backend-side ownership table, never on per-event delivery.
    const sent: BackendHostOutboundMessage[] = [];
    const relay = createSupervisorEventRelay({
      publishToRendererStream: () => ({ delivered: true, sequence: 7 }),
      observeEvent: () => undefined,
      planDesktopRelay: (event) =>
        planDesktopRelay({
          event,
          ownershipArmed: true,
          fallbackWindows: [
            {
              windowId: 8,
              generation: 2,
              interests: emptyInterests(["thread-1"]),
              receivesShellRemainder: false,
            },
          ],
          isTerminalBootstrapRetainedFor: () => false,
          filterEventForInterests: (filtered, interests) =>
            filterSupervisorEventForInterests(filtered, interests),
          filterShellEvent: (shell) => shell,
        }),
      sendToMain: (message) => sent.push(message),
    });

    relay(BULK_EVENT);

    expect(sent).toEqual([
      {
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "supervisor-event",
        event: BULK_EVENT,
        rendererSequence: 7,
        target: { windowId: 8, generation: 2 },
      },
    ]);
  });
});

function bulk(sequence: number): BackendHostOutboundMessage {
  return sequenced(BULK_EVENT, sequence);
}

function sequenced(
  event: SupervisorEvent,
  sequence: number,
  target?: { windowId: number; generation: number },
): BackendHostOutboundMessage {
  return {
    version: BACKEND_HOST_PROTOCOL_VERSION,
    kind: "supervisor-event",
    event,
    rendererSequence: sequence,
    ...(target ? { target } : {}),
  };
}

function gap(fromSequence: number, toSequence: number): BackendHostOutboundMessage {
  return {
    version: BACKEND_HOST_PROTOCOL_VERSION,
    kind: "supervisor-event-gap",
    fromSequence,
    toSequence,
  };
}

describe("createBackendHostShedPolicy", () => {
  const policy = createBackendHostShedPolicy();

  it("sheds only sequenced bulk renderer content, including targeted copies", () => {
    const sheddable: BackendHostOutboundMessage[] = [
      bulk(4),
      sequenced(
        {
          type: "thread-runtime-event",
          threadId: "thread-1",
          event: {
            type: "content.delta",
            threadId: "thread-1",
            itemId: "i1",
            stream: "assistant_text",
            delta: "x",
          },
        },
        5,
      ),
      // A targeted per-window copy of rebuildable bulk sheds like its
      // untargeted ancestor did — its window recovers by replay/resync.
      sequenced(BULK_EVENT, 6, { windowId: 7, generation: 1 }),
    ];
    for (const message of sheddable) {
      expect(policy.isSheddable(message)).toBe(true);
    }

    const kept: BackendHostOutboundMessage[] = [
      // Main-only state that no renderer rebuild can restore.
      sequenced(
        {
          type: "thread-state",
          threadId: "thread-1",
          status: "working",
          attention: "none",
          canResumeWithConfig: false,
        },
        7,
      ),
      sequenced({ type: "crossagent-selection-used", selections: [] }, 8),
      // Sequence-less shell remainders cannot anchor a gap signal.
      { version: BACKEND_HOST_PROTOCOL_VERSION, kind: "supervisor-event", event: CONTROL_EVENT },
      // Pre-stream events carry no sequence to anchor a gap signal to.
      { version: BACKEND_HOST_PROTOCOL_VERSION, kind: "supervisor-event", event: BULK_EVENT },
      // Mixed runtime batches would lose irreplaceable events.
      sequenced(
        {
          type: "thread-runtime-events",
          threadId: "thread-1",
          events: [
            { type: "item.completed", threadId: "thread-1", itemId: "i1" },
            { type: "turn.completed", threadId: "thread-1", turnId: "t1", state: "completed" },
          ],
        },
        9,
      ),
      // A shed truncation would resurrect deleted turns on the renderer, so it
      // stays non-sheddable — even when batched with rebuildable bulk content.
      sequenced(
        {
          type: "thread-runtime-event",
          threadId: "thread-1",
          event: {
            type: "runtime.truncated",
            threadId: "thread-1",
            itemId: "i1",
            removedCompletedTurnAnchors: ["t1"],
          },
        },
        10,
      ),
      // Recovery barriers are recovery signals, never sheddable traffic.
      {
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "renderer-stream-recovery",
        windowId: 7,
        generation: 1,
        fromSequence: 1,
        toSequence: 2,
      },
      // Non-supervisor traffic has no recovery path.
      {
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "reply",
        replyTo: "r1",
        ok: true,
        data: null,
      },
      { version: BACKEND_HOST_PROTOCOL_VERSION, kind: "supervisor-reset" },
      {
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "native-request",
        id: "n1",
        request: { operation: "open-thread", payload: { threadId: "t" } },
      },
      {
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "native-event",
        event: { type: "database-projection-changed" },
      },
      { version: BACKEND_HOST_PROTOCOL_VERSION, kind: "error", message: "boom" },
    ];
    for (const message of kept) {
      expect(policy.isSheddable(message)).toBe(false);
    }
  });

  it("announces the shed range and merges into a queued earlier signal", () => {
    const signal = policy.createRecoverySignal([bulk(7), bulk(4), bulk(9)], null);
    expect(signal).toEqual(gap(4, 9));

    const merged = policy.createRecoverySignal([bulk(12)], signal);
    expect(merged).toEqual(gap(4, 12));
  });

  it("recognizes only its own gap envelopes as mergeable signals", () => {
    expect(policy.isRecoverySignal(gap(3, 5))).toBe(true);
    // A targeted recovery barrier is someone else's signal: shedding must
    // never merge into or replace it (it would silently untarget the loss).
    expect(
      policy.isRecoverySignal({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "renderer-stream-recovery",
        windowId: 7,
        generation: 1,
        fromSequence: 1,
        toSequence: 3,
      }),
    ).toBe(false);
    expect(policy.isRecoverySignal(bulk(3))).toBe(false);
  });
});

type SendCallback = (error: Error | null) => void;

/**
 * Integration: the host's real sender and shed policy under a stalled desktop
 * consumer, flooded with the host's real traffic mix. Bulk renderer content
 * sheds oldest-first while every main-only envelope survives, the gap signal
 * lands ahead of the surviving post-gap traffic, and a sustained stall stays
 * bounded without failing the host.
 */
describe("backend host shed policy under a stalled IPC consumer", () => {
  function stalledSender(maxQueuedMessages: number): {
    sender: SupervisorIpcSender<BackendHostOutboundMessage>;
    sent: Array<SupervisorEvent | SupervisorReply | BackendHostOutboundMessage>;
    callbacks: SendCallback[];
    onFatalError: ReturnType<typeof vi.fn<(error: Error) => void>>;
    drainAll(): void;
  } {
    const callbacks: SendCallback[] = [];
    const sent: Array<SupervisorEvent | SupervisorReply | BackendHostOutboundMessage> = [];
    const onFatalError = vi.fn<(error: Error) => void>();
    const sender = new SupervisorIpcSender<BackendHostOutboundMessage>({
      send: (message, callback) => {
        sent.push(message);
        callbacks.push(callback);
        return false;
      },
      onError: vi.fn<(error: Error) => void>(),
      onFatalError,
      maxQueuedMessages,
      shedPolicy: createBackendHostShedPolicy(),
    });
    return {
      sender,
      sent,
      onFatalError,
      callbacks,
      drainAll: (): void => {
        while (callbacks.length > 0) callbacks.shift()!(null);
      },
    };
  }

  it("preserves main-only events and orders the gap signal before post-gap traffic", () => {
    const { sender, sent, onFatalError, drainAll } = stalledSender(6);
    const threadState = sequenced(
      {
        type: "thread-state",
        threadId: "thread-1",
        status: "working",
        attention: "none",
        canResumeWithConfig: false,
      },
      1,
    );

    sender.sendMessage(bulk(2));
    sender.sendMessage(threadState);
    for (let sequence = 3; sequence <= 9; sequence += 1) sender.sendMessage(bulk(sequence));

    expect(onFatalError).not.toHaveBeenCalled();
    drainAll();

    // The critical event keeps its queue position; the gap replaces the shed
    // bulk ranges (the second batch merges into the adjacent marker) and
    // precedes every surviving post-gap event.
    expect(sent[0]).toEqual(bulk(2));
    expect(sent[1]).toEqual(threadState);
    expect(sent[2]).toEqual(gap(3, 5));
    expect(sent.slice(3)).toEqual([bulk(6), bulk(7), bulk(8), bulk(9)]);
  });

  it("keeps a recovery barrier non-sheddable and ordered ahead of later fallback copies", () => {
    const { sender, sent, onFatalError, drainAll } = stalledSender(4);
    const barrier: BackendHostOutboundMessage = {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "renderer-stream-recovery",
      windowId: 7,
      generation: 1,
      fromSequence: 1,
      toSequence: 3,
    };

    sender.sendMessage(barrier);
    sender.sendMessage(bulk(4));
    for (let sequence = 5; sequence <= 12; sequence += 1) sender.sendMessage(bulk(sequence));

    expect(onFatalError).not.toHaveBeenCalled();
    drainAll();

    // The barrier survives every shed intact; the gap marker sheds only the
    // rebuildable bulk range and stays ahead of the surviving traffic, and
    // the barrier is never replaced by or merged into that marker.
    expect(sent[0]).toEqual(barrier);
    expect(sent[1]).toEqual(gap(4, 9));
    expect(sent.slice(2)).toEqual([bulk(10), bulk(11), bulk(12)]);
  });

  it("keeps a permanently stalled queue bounded without failing the host", () => {
    const { sender, sent, onFatalError, drainAll } = stalledSender(3);
    const critical = sequenced(
      {
        type: "thread-state",
        threadId: "thread-1",
        status: "idle",
        attention: "none",
        canResumeWithConfig: false,
      },
      1,
    );

    sender.sendMessage(bulk(2));
    sender.sendMessage(critical);
    for (let sequence = 3; sequence <= 40; sequence += 1) sender.sendMessage(bulk(sequence));

    expect(onFatalError).not.toHaveBeenCalled();
    expect(sender.queueDepth.messages).toBeLessThanOrEqual(3);
    drainAll();

    expect(sent.slice(0, 2)).toEqual([bulk(2), critical]);
    expect(sent[2]).toEqual(gap(3, 39));
    expect(sent[3]).toEqual(bulk(40));
    expect(sent).toHaveLength(4);
  });
});
