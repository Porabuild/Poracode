import {
  BACKEND_HOST_PROTOCOL_VERSION,
  type BackendHostOutboundMessage,
} from "@/shared/backendHostProtocol";
import type { SupervisorEvent, SupervisorReply } from "@/shared/ipc";
import { SupervisorIpcSender } from "@/supervisor/supervisorIpcSender";
import { describe, expect, it, vi } from "vitest";
import { createBackendHostShedPolicy, createSupervisorEventRelay } from "./supervisorEventRelay";

const BULK_EVENT: SupervisorEvent = {
  type: "thread-output",
  threadId: "thread-1",
  data: "bulk bytes",
  outputLength: 10,
  terminalInstanceId: "gen-1",
};

const MIXED_BATCH_EVENT: SupervisorEvent = {
  type: "thread-runtime-events",
  threadId: "thread-1",
  events: [
    { kind: "content.delta.append", threadId: "thread-1", itemId: "item-1", text: "delta" },
    { kind: "state", threadId: "thread-1", itemId: "item-1", state: "running" },
  ],
} as unknown as SupervisorEvent;

const CONTROL_EVENT: SupervisorEvent = {
  type: "thread-state",
  threadId: "thread-1",
  status: "working",
  attention: "none",
  canResumeWithConfig: false,
};

interface SupervisorEnvelope {
  event: SupervisorEvent;
  rendererSequence?: number | undefined;
}

interface RelayHarness {
  relay(event: SupervisorEvent): void;
  supervisorEvents(): SupervisorEnvelope[];
  sequences(): number[];
}

/**
 * Wires the collapsed single-path relay (V5 plan 2.5): every event crosses
 * the desktop-IPC channel once, sequenced, filtered by the union-interest
 * router stand-in.
 */
function buildRelay(options: {
  filter?: (event: SupervisorEvent) => SupervisorEvent | null;
  observe?: (event: SupervisorEvent) => boolean | void;
}): RelayHarness {
  const sent: BackendHostOutboundMessage[] = [];
  let sequence = 0;
  const relay = createSupervisorEventRelay({
    nextSequence: () => ++sequence,
    observeEvent: options.observe ?? (() => undefined),
    filterEventForRelay: options.filter ?? ((event: SupervisorEvent) => event),
    sendToMain: (message) => sent.push(message),
  });
  return {
    relay: (event) => relay(event),
    supervisorEvents: () =>
      sent.flatMap((message) =>
        message.kind === "supervisor-event"
          ? [
              {
                event: message.event,
                ...(message.rendererSequence === undefined
                  ? {}
                  : { rendererSequence: message.rendererSequence }),
              },
            ]
          : [],
      ),
    sequences: () =>
      sent.flatMap((message) =>
        message.kind === "supervisor-event" && message.rendererSequence !== undefined
          ? [message.rendererSequence]
          : [],
      ),
  };
}

describe("supervisor event relay (collapsed single-path)", () => {
  it("crosses every event once, sequenced, in legacy full-relay shape", () => {
    const harness = buildRelay({});
    harness.relay(BULK_EVENT);
    harness.relay(CONTROL_EVENT);
    const events = harness.supervisorEvents();
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ event: BULK_EVENT, rendererSequence: 1 });
    expect(events[1]).toEqual({ event: CONTROL_EVENT, rendererSequence: 2 });
    for (const envelope of harness.supervisorEvents()) {
      expect(envelope).not.toHaveProperty("target");
    }
  });

  it("hands the event to the composition observer first and stops when consumed", () => {
    const observe = vi.fn<() => boolean>(() => true);
    const harness = buildRelay({ observe });
    harness.relay(CONTROL_EVENT);
    expect(observe).toHaveBeenCalledWith(CONTROL_EVENT);
    expect(harness.supervisorEvents()).toHaveLength(0);
    // An unconsumed event continues across the channel.
    const pass = buildRelay({ observe: () => false });
    pass.relay(CONTROL_EVENT);
    expect(pass.supervisorEvents()).toHaveLength(1);
  });

  it("drops events the interests router filters out", () => {
    const harness = buildRelay({
      filter: (event) => (event.type === "thread-output" ? null : event),
    });
    harness.relay(BULK_EVENT);
    expect(harness.supervisorEvents()).toHaveLength(0);
    // No sequence is consumed for a filtered event.
    harness.relay(CONTROL_EVENT);
    expect(harness.sequences()).toEqual([1]);
  });

  it("keeps sequence assignment monotonic across mixed bulk batches", () => {
    const harness = buildRelay({});
    harness.relay(MIXED_BATCH_EVENT);
    harness.relay(BULK_EVENT);
    const sequences = harness.sequences();
    expect(sequences).toEqual([1, 2]);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
  });
});

/** Builds one sequenced (or unsequenced) `supervisor-event` envelope. */
const envelope = (
  event: SupervisorEvent,
  rendererSequence?: number,
): Extract<BackendHostOutboundMessage, { kind: "supervisor-event" }> => ({
  version: BACKEND_HOST_PROTOCOL_VERSION,
  kind: "supervisor-event",
  event,
  ...(rendererSequence === undefined ? {} : { rendererSequence }),
});

describe("backend-host shed policy (collapsed single-path)", () => {
  const policy = createBackendHostShedPolicy();

  it("sheds only sequenced rebuildable bulk content", () => {
    expect(policy.isSheddable(envelope(BULK_EVENT, 4))).toBe(true);
    expect(policy.isSheddable(envelope(BULK_EVENT))).toBe(false);
    expect(policy.isSheddable(envelope(CONTROL_EVENT, 5))).toBe(false);
    const replyLike = {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "reply" as const,
      replyTo: "r",
      ok: true as const,
      data: null,
    };
    expect(policy.isSheddable(replyLike)).toBe(false);
  });

  it("merges shedded messages into one bounded gap signal", () => {
    const gap = policy.createRecoverySignal(
      [envelope(BULK_EVENT, 4), envelope(BULK_EVENT, 5), envelope(CONTROL_EVENT, 6)],
      null,
    );
    expect(gap).toEqual({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "supervisor-event-gap",
      fromSequence: 4,
      toSequence: 6,
    });
  });

  it("widens a previous gap instead of replacing it", () => {
    const previous = {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "supervisor-event-gap" as const,
      fromSequence: 2,
      toSequence: 3,
    };
    const gap = policy.createRecoverySignal([envelope(BULK_EVENT, 9)], previous);
    expect(gap).toEqual({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "supervisor-event-gap",
      fromSequence: 2,
      toSequence: 9,
    });
  });

  it("classifies the gap signal itself as a non-sheddable recovery signal", () => {
    const gap = {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "supervisor-event-gap" as const,
      fromSequence: 1,
      toSequence: 2,
    };
    expect(policy.isRecoverySignal(gap)).toBe(true);
    expect(policy.isSheddable(gap)).toBe(false);
  });
});

describe("shed policy sender integration", () => {
  it("keeps replies and native traffic fail-closed while bulk sheds", async () => {
    const sent: (SupervisorEvent | SupervisorReply | BackendHostOutboundMessage)[] = [];
    const sender = new SupervisorIpcSender<BackendHostOutboundMessage>({
      send: (message, callback) => {
        sent.push(message);
        callback(null);
        return true;
      },
      onError: () => undefined,
      shedPolicy: createBackendHostShedPolicy(),
    });
    sender.sendMessage(envelope(BULK_EVENT, 1));
    sender.sendMessage({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "native-event",
      event: { type: "database-projection-changed" },
    });
    await sender.flushAndWait(1_000);
    expect(sent).toHaveLength(2);
  });
});
