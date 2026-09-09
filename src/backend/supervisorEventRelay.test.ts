import {
  BACKEND_HOST_PROTOCOL_VERSION,
  type BackendHostOutboundMessage,
} from "@/shared/backendHostProtocol";
import type { SupervisorEvent, SupervisorReply } from "@/shared/ipc";
import { describe, expect, it, vi } from "vitest";
import { SupervisorIpcSender } from "@/supervisor/supervisorIpcSender";
import {
  createBackendHostShedPolicy,
  createSupervisorEventRelay,
  type RendererStreamDelivery,
} from "./supervisorEventRelay";

const BULK_EVENT: SupervisorEvent = {
  type: "thread-output",
  threadId: "thread-1",
  data: "bytes",
  outputLength: 5,
  terminalInstanceId: "gen-1",
};

function sequenced(event: SupervisorEvent, sequence: number): BackendHostOutboundMessage {
  return {
    version: BACKEND_HOST_PROTOCOL_VERSION,
    kind: "supervisor-event",
    event,
    rendererSequence: sequence,
  };
}

function bulk(sequence: number): BackendHostOutboundMessage {
  return sequenced(BULK_EVENT, sequence);
}

function gap(fromSequence: number, toSequence: number): BackendHostOutboundMessage {
  return {
    version: BACKEND_HOST_PROTOCOL_VERSION,
    kind: "supervisor-event-gap",
    fromSequence,
    toSequence,
  };
}

function makeDeps(overrides?: {
  filtered?: SupervisorEvent | null;
  delivery?: RendererStreamDelivery;
}) {
  const sent: BackendHostOutboundMessage[] = [];
  const deps = {
    publishToRendererStream: vi.fn<(event: SupervisorEvent) => RendererStreamDelivery | undefined>(
      () => overrides?.delivery,
    ),
    observeEvent: vi.fn<(event: SupervisorEvent) => void>(),
    filterForIpcConsumers: vi.fn<(event: SupervisorEvent) => SupervisorEvent | null>(() =>
      overrides?.filtered !== undefined ? overrides.filtered : BULK_EVENT,
    ),
    sendToMain: vi.fn<(message: BackendHostOutboundMessage) => void>((message) =>
      sent.push(message),
    ),
  };
  return { deps, sent };
}

describe("createSupervisorEventRelay", () => {
  it("relays bulk events over IPC even when the direct stream delivered them", () => {
    // Regression (MC-1): a ready WS client receiving the event must not
    // suppress the desktop-IPC fallback — a sibling window whose socket is
    // down depends on it and has no other way to observe the gap.
    const { deps, sent } = makeDeps({ delivery: { delivered: true, sequence: 7 } });
    const relay = createSupervisorEventRelay(deps);

    relay(BULK_EVENT);

    expect(sent).toEqual([sequenced(BULK_EVENT, 7)]);
  });

  it("publishes to the stream before observing and relaying, once per event", () => {
    const { deps } = makeDeps({ delivery: { delivered: false, sequence: 1 } });
    const relay = createSupervisorEventRelay(deps);

    relay(BULK_EVENT);

    expect(deps.publishToRendererStream).toHaveBeenCalledBefore(deps.observeEvent);
    expect(deps.observeEvent).toHaveBeenCalledBefore(deps.filterForIpcConsumers);
    expect(deps.publishToRendererStream).toHaveBeenCalledExactlyOnceWith(BULK_EVENT);
  });

  it("drops events no IPC consumer wants, without losing the stream sequence", () => {
    const { deps, sent } = makeDeps({ filtered: null, delivery: { delivered: true, sequence: 9 } });
    const relay = createSupervisorEventRelay(deps);

    relay(BULK_EVENT);

    expect(sent).toEqual([]);
  });

  it("omits rendererSequence when the renderer stream is unavailable", () => {
    const { deps, sent } = makeDeps();
    const relay = createSupervisorEventRelay(deps);

    relay(BULK_EVENT);

    expect(sent[0]).toEqual({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "supervisor-event",
      event: BULK_EVENT,
    });
  });
});

describe("createBackendHostShedPolicy", () => {
  const policy = createBackendHostShedPolicy();

  it("sheds only sequenced bulk renderer content", () => {
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
      sequenced(
        {
          type: "thread-runtime-events",
          threadId: "thread-1",
          events: [
            {
              type: "item.started",
              threadId: "thread-1",
              itemId: "i1",
              itemType: "assistant_message",
            },
            { type: "item.completed", threadId: "thread-1", itemId: "i1" },
          ],
        },
        6,
      ),
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

  it("recognizes its own signals so sustained stalls merge instead of accumulating", () => {
    expect(policy.isRecoverySignal(gap(3, 5))).toBe(true);
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
