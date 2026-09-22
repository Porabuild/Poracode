import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { AgentAdapter } from "../agents/base";
import type { SessionRuntime } from "./sessionTypes";

// This suite exercises canonical-event backpressure, not spawning. Stubbing the
// spawn pipeline keeps the focused test independent of provider launch wiring
// (and of unrelated in-flight edits in that module).
vi.mock("./threadSession/spawnPipeline", () => ({
  SpawnPipeline: class {},
}));
vi.mock("./threadSession/invalidSessionRecovery", () => ({
  InvalidSessionRecoveryCoordinator: class {},
}));

import { ThreadSessionManager } from "./threadSessionManager";
import { SupervisorIpcSender } from "../supervisorIpcSender";

/**
 * B1 producer control: when host persistence backpressure pauses canonical
 * runtime events, the supervisor buffer is bounded. A session whose buffer
 * reaches the cap stops explicitly (typed error state + error event) and no
 * unrelated session is touched.
 */

function makeManager() {
  const emit = vi.fn<(event: SupervisorEvent) => void>();
  const manager = new ThreadSessionManager({
    emit,
    isDev: false,
    logsDir: "",
    settingsPath: "",
    readDisableCliHookPlugin: () => false,
    adapters: new Map(),
    resolveWindowsShell: () => ({ shell: "cmd", kind: "cmd", args: [] }),
  });
  return { manager, emit };
}

function enqueue(manager: ThreadSessionManager, threadId: string, event: RuntimeEvent): void {
  const enq = (
    manager as unknown as { enqueueRuntimeEvent: (threadId: string, event: RuntimeEvent) => void }
  ).enqueueRuntimeEvent;
  enq.call(manager, threadId, event);
}

function delta(threadId: string, text: string): RuntimeEvent {
  return {
    type: "content.delta",
    threadId,
    itemId: "item-1",
    stream: "command_output",
    delta: text,
  } as RuntimeEvent;
}

/** Distinct items so a flush cannot coalesce these into one envelope. */
function deltaItem(threadId: string, itemId: string, text: string): RuntimeEvent {
  return {
    type: "content.delta",
    threadId,
    itemId,
    stream: "command_output",
    delta: text,
  } as RuntimeEvent;
}

function addSession(
  manager: ThreadSessionManager,
  threadId: string,
  dispose: () => Promise<void>,
): void {
  manager.sessions.set(threadId, {
    threadId,
    agentKind: "codex",
    adapter: { capabilities: {} } as unknown as AgentAdapter,
    config: {},
    status: "working",
    attention: "working",
    canResumeWithConfig: false,
    presentationMode: "gui",
    structuredSession: { dispose },
  } as unknown as SessionRuntime);
}

function errorStates(emit: ReturnType<typeof vi.fn<(event: SupervisorEvent) => void>>) {
  return emit.mock.calls
    .map(([event]) => event)
    .filter(
      (event): event is Extract<SupervisorEvent, { type: "thread-state" }> =>
        event.type === "thread-state" && event.status === "error",
    );
}

describe("ThreadSessionManager canonical backpressure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds canonical events while paused and flushes them in order on resume", () => {
    const { manager, emit } = makeManager();
    manager.setCanonicalEventBackpressure(true);
    enqueue(manager, "t1", delta("t1", "one "));
    enqueue(manager, "t1", delta("t1", "two"));
    vi.runAllTimers();
    expect(
      emit.mock.calls.filter(([event]) => event.type.startsWith("thread-runtime")),
    ).toHaveLength(0);

    manager.setCanonicalEventBackpressure(false);
    const runtimeEvents = emit.mock.calls
      .map(([event]) => event)
      .filter(
        (event) => event.type === "thread-runtime-event" || event.type === "thread-runtime-events",
      );
    expect(runtimeEvents).toHaveLength(1);
    const payload = runtimeEvents[0] as { events?: RuntimeEvent[]; event?: RuntimeEvent };
    const events = payload.events ?? (payload.event ? [payload.event] : []);
    expect((events[0] as { delta: string }).delta).toBe("one two");
  });

  it("stops only the affected session at its buffer cap and reports truthfully", async () => {
    const { manager, emit } = makeManager();
    const disposeAffected = vi.fn<() => Promise<void>>(async () => undefined);
    const disposeOther = vi.fn<() => Promise<void>>(async () => undefined);
    addSession(manager, "t1", disposeAffected);
    addSession(manager, "t2", disposeOther);

    manager.setCanonicalEventBackpressure(true);
    // Default per-thread cap is 2,000 events; exceed it with small deltas.
    for (let index = 0; index < 2_100; index += 1) {
      enqueue(manager, "t1", delta("t1", "x"));
    }
    enqueue(manager, "t2", delta("t2", "y"));

    const states = errorStates(emit);
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({
      type: "thread-state",
      threadId: "t1",
      status: "error",
      attention: "error",
    });
    expect(states[0]!.errorMessage).toContain("host persistence backpressure");
    expect(disposeAffected).toHaveBeenCalledOnce();
    expect(disposeOther).not.toHaveBeenCalled();

    // The explicit stop is also a canonical error event on the control path.
    const errorEvents = emit.mock.calls
      .map(([event]) => event)
      .filter(
        (event): event is Extract<SupervisorEvent, { type: "thread-runtime-event" }> =>
          event.type === "thread-runtime-event" && event.event.type === "error",
      );
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0]!.threadId).toBe("t1");

    // The bounded batch is retained and flushed on resume; the stopped session
    // is not stopped again.
    manager.setCanonicalEventBackpressure(false);
    expect(manager.getCanonicalEventBufferStats().events).toBe(0);
    expect(errorStates(emit)).toHaveLength(1);
  });

  it("stops the affected sessions on an IPC-sender canonical overflow", async () => {
    const { manager, emit } = makeManager();
    const dispose = vi.fn<() => Promise<void>>(async () => undefined);
    addSession(manager, "t1", dispose);

    manager.handleCanonicalSenderOverflow({
      type: "thread-runtime-events-multi",
      batches: [
        { threadId: "t1", events: [delta("t1", "x")] },
        { threadId: "t9", events: [delta("t9", "x")] },
      ],
    });

    expect(dispose).toHaveBeenCalledOnce();
    expect(errorStates(emit)).toHaveLength(1);
    expect(errorStates(emit)[0]!.threadId).toBe("t1");
    expect(errorStates(emit)[0]!.errorMessage).toContain("IPC queue overflow");
  });
});

/**
 * Real manager + real sender: the production stop path must never re-enter a
 * saturated sender synchronously (F3), must keep unrelated sessions alive
 * (F4), and must never publish a stop marker ahead of the content it
 * supersedes (F9). Timers are real here so the sender's deferred hook and the
 * buffer tick run through their actual scheduling.
 */
describe("ThreadSessionManager + SupervisorIpcSender integration (B1)", () => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  function makeWiredManager(
    options: {
      maxQueuedMessages?: number;
      controlReserveMessages?: number;
      windowBytes?: number;
    } = {},
  ) {
    const sent: SupervisorEvent[] = [];
    const callbacks: Array<(error: Error | null) => void> = [];
    const onFatalError = vi.fn<(error: Error) => void>();
    let managerRef: ThreadSessionManager | undefined;
    const sender = new SupervisorIpcSender({
      send: (message, callback) => {
        sent.push(message as SupervisorEvent);
        callbacks.push(callback);
        return false;
      },
      onError: vi.fn<(error: Error) => void>(),
      onFatalError,
      maxQueuedMessages: options.maxQueuedMessages ?? 1,
      maxQueuedBytes: 10_000_000,
      ...(options.controlReserveMessages !== undefined
        ? { controlReserveMessages: options.controlReserveMessages }
        : {}),
      onCanonicalOverflow: (_error, message) => {
        managerRef?.handleCanonicalSenderOverflow(message);
      },
      onCanonicalCapacityChange: (remainingBytes) => {
        managerRef?.setCanonicalCreditCapacity(remainingBytes);
      },
    });
    if (options.windowBytes !== undefined) {
      sender.setCanonicalCredit({
        windowBytes: options.windowBytes,
        generation: sender.getCanonicalFlowGeneration(),
      });
    }
    const emit = vi.fn<(event: SupervisorEvent) => void>();
    const manager = new ThreadSessionManager({
      emit: (event, meta) => {
        emit(event);
        sender.emit(event, meta);
      },
      isDev: false,
      logsDir: "",
      settingsPath: "",
      readDisableCliHookPlugin: () => false,
      adapters: new Map(),
      resolveWindowsShell: () => ({ shell: "cmd", kind: "cmd", args: [] }),
      canonicalCapacity: () => sender.canonicalCreditRemaining(),
    });
    managerRef = manager;
    return { manager, sender, sent, callbacks, emit, onFatalError };
  }

  it("stops only the overflowing thread, delivers its stop marker after the drain, and keeps another thread serving", async () => {
    const { manager, sent, callbacks, emit, onFatalError } = makeWiredManager();
    const disposeAffected = vi.fn<() => Promise<void>>(async () => undefined);
    const disposeOther = vi.fn<() => Promise<void>>(async () => undefined);
    addSession(manager, "t1", disposeAffected);
    addSession(manager, "t2", disposeOther);

    // Fill the sender: one envelope in flight, one queued, the third overflows
    // and invokes the deferred producer-stop hook. Deltas stay well under the
    // per-thread envelope chunk bound but above it in aggregate, so each item
    // is its own envelope.
    enqueue(manager, "t1", deltaItem("t1", "item-1", "x".repeat(700_000)));
    enqueue(manager, "t1", deltaItem("t1", "item-2", "x".repeat(700_000)));
    enqueue(manager, "t1", deltaItem("t1", "item-3", "x".repeat(700_000)));
    await sleep(30);
    await new Promise((resolve) => setImmediate(resolve));
    await sleep(0);

    // No fatal, and only the affected session stopped.
    expect(onFatalError).not.toHaveBeenCalled();
    const stopped = errorStates(emit).filter((event) => event.threadId === "t1");
    expect(stopped).toHaveLength(1);
    expect(disposeAffected).toHaveBeenCalledOnce();
    expect(disposeOther).not.toHaveBeenCalled();

    // While the channel is still stalled, the stop marker has not been handed
    // to the transport ahead of the content it supersedes.
    expect(
      sent.filter((event) => event.type === "thread-runtime-event" && event.event.type === "error"),
    ).toHaveLength(0);

    // Drain: the resident canonical envelopes are delivered, then the marker.
    while (callbacks.length > 0) callbacks.shift()!(null);
    const errorIndex = sent.findIndex(
      (event) => event.type === "thread-runtime-event" && event.event.type === "error",
    );
    expect(errorIndex).toBeGreaterThan(0);
    const canonicalBefore = sent
      .slice(0, errorIndex)
      .filter(
        (event) =>
          (event.type === "thread-runtime-event" || event.type === "thread-runtime-events") &&
          event.threadId === "t1",
      );
    expect(canonicalBefore.length).toBeGreaterThanOrEqual(1);
    const canonicalAfter = sent
      .slice(errorIndex + 1)
      .filter(
        (event) =>
          (event.type === "thread-runtime-event" || event.type === "thread-runtime-events") &&
          event.threadId === "t1",
      );
    expect(canonicalAfter).toHaveLength(0);

    // A healthy thread beside the stopped one still produces to the host.
    enqueue(manager, "t2", delta("t2", "still-alive"));
    await sleep(30);
    while (callbacks.length > 0) callbacks.shift()!(null);
    expect(
      sent.some(
        (event) =>
          (event.type === "thread-runtime-event" || event.type === "thread-runtime-events") &&
          event.threadId === "t2",
      ),
    ).toBe(true);
    expect(errorStates(emit).filter((event) => event.threadId === "t2")).toHaveLength(0);
  });

  it("drains the retained batch before the stop marker when a credit window holds it", async () => {
    const { manager, sender, sent, callbacks, emit, onFatalError } = makeWiredManager({
      maxQueuedMessages: 16,
      windowBytes: 1,
    });
    const disposeAffected = vi.fn<() => Promise<void>>(async () => undefined);
    addSession(manager, "t1", disposeAffected);

    manager.setCanonicalEventBackpressure(true);
    // Pause-time overflow: the thread's bounded batch exceeds its cap while no
    // credit is available, so the session stops and the batch is retained.
    for (let index = 0; index < 2_100; index += 1) {
      enqueue(manager, "t1", deltaItem("t1", `item-${index}`, "x"));
    }
    await sleep(5);
    expect(errorStates(emit).filter((event) => event.threadId === "t1")).toHaveLength(1);
    // No canonical content and no stop marker is published while the batch is
    // retained.
    expect(
      sent.filter(
        (event) => event.type === "thread-runtime-event" || event.type === "thread-runtime-events",
      ),
    ).toHaveLength(0);

    manager.setCanonicalEventBackpressure(false);
    // The window is the only reason the batch is held: granting capacity
    // releases the retained content first, then the stop marker.
    sender.setCanonicalCredit({
      windowBytes: 100_000_000,
      generation: sender.getCanonicalFlowGeneration(),
    });
    await sleep(30);
    while (callbacks.length > 0) callbacks.shift()!(null);

    // Content precedes the marker: the last thread-runtime envelope for t1 is
    // the error event.
    const t1Envelopes = sent.filter(
      (event) =>
        (event.type === "thread-runtime-event" || event.type === "thread-runtime-events") &&
        event.threadId === "t1",
    );
    expect(t1Envelopes.length).toBeGreaterThan(1);
    const last = t1Envelopes[t1Envelopes.length - 1]!;
    expect(last).toMatchObject({ type: "thread-runtime-event" });
    expect((last as Extract<SupervisorEvent, { type: "thread-runtime-event" }>).event.type).toBe(
      "error",
    );
    expect(onFatalError).not.toHaveBeenCalled();
  });
});
