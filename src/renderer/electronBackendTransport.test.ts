import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import type { SupervisorEvent } from "@/shared/ipc";
import { ElectronBackendTransport } from "./electronBackendTransport";

/**
 * Collapsed single-path transport tests (V5 plan 2.5): the renderer-direct
 * stream, its grants, and its recovery barriers are gone. Events cross the
 * sequenced desktop-IPC relay only; the transport gates them by sequence,
 * rebuilds on gap and backend-reset signals, and publishes this window's
 * interests to main.
 */

type SupervisorListener = (event: SupervisorEvent, rendererSequence?: number) => void;

function makeHost() {
  const supervisorListeners = new Set<SupervisorListener>();
  const gapListeners = new Set<() => void>();
  const resetListeners = new Set<() => void>();
  const invoked: Array<{ name: string; args: unknown[] }> = [];
  const host = {
    onSupervisorEvent: (listener: SupervisorListener) => {
      supervisorListeners.add(listener);
      return () => supervisorListeners.delete(listener);
    },
    onSupervisorEventGap: (listener: () => void) => {
      gapListeners.add(listener);
      return () => gapListeners.delete(listener);
    },
    onBackendSupervisorReset: (listener: () => void) => {
      resetListeners.add(listener);
      return () => resetListeners.delete(listener);
    },
    invokeProcedure: async (name: string, args: unknown[]) => {
      invoked.push({ name, args });
      return null;
    },
  } as unknown as ElectronHostBridge & {
    onSupervisorEvent: (listener: SupervisorListener) => () => void;
  };
  return {
    host: host as ElectronHostBridge,
    emit: (event: SupervisorEvent, rendererSequence?: number) => {
      for (const listener of [...supervisorListeners]) listener(event, rendererSequence);
    },
    emitGap: () => {
      for (const listener of [...gapListeners]) listener();
    },
    emitReset: () => {
      for (const listener of [...resetListeners]) listener();
    },
    invoked,
  };
}

const output = (threadId: string, data: string): SupervisorEvent => ({
  type: "thread-output",
  threadId,
  data,
  outputLength: data.length,
  terminalInstanceId: "gen-1",
});

describe("ElectronBackendTransport (collapsed single path)", () => {
  let received: SupervisorEvent[];
  let unsubscribe: (() => void) | null = null;

  beforeEach(() => {
    received = [];
    unsubscribe = null;
  });

  afterEach(() => {
    unsubscribe?.();
    vi.restoreAllMocks();
  });

  function subscribe(transport: ElectronBackendTransport): void {
    unsubscribe = transport.subscribe((event) => received.push(event));
  }

  it("delivers sequenced events and duplicates only below the cursor", () => {
    const { host, emit } = makeHost();
    const transport = new ElectronBackendTransport(host);
    subscribe(transport);

    emit(output("t-1", "a"), 3);
    // A replayed/retreated sequence is dropped by the cursor gate.
    emit(output("t-1", "dup"), 3);
    emit(output("t-1", "b"), 4);

    expect(received.map((event) => event.type === "thread-output" && event.data)).toEqual([
      "a",
      "b",
    ]);
  });

  it("applies unsequenced envelopes ungated (bootstrap and recovery events)", () => {
    const { host, emit } = makeHost();
    const transport = new ElectronBackendTransport(host);
    subscribe(transport);

    emit({ type: "thread-scrollback-resync", threadId: "t-1" });
    emit(output("t-1", "a"), 1);

    expect(received).toHaveLength(2);
    expect(received[0]!.type).toBe("thread-scrollback-resync");
  });

  it("rebuilds only the subscribed threads a gap scope names, without advancing the cursor", () => {
    const { host, emit, emitGap } = makeHost();
    const transport = new ElectronBackendTransport(host);
    subscribe(transport);
    void transport.setEventInterests({
      terminalThreadIds: ["shell-1", "shell-2"],
      runtimeThreadIds: ["thread-1"],
    });

    emit(output("shell-1", "x"), 5);
    emitGap();

    // The pre-gap cursor survives so a later replay still carries the gap.
    emit(output("shell-1", "post-gap"), 4);
    expect(received.filter((event) => event.type === "thread-output")).toHaveLength(1);

    const rebuilds = received.filter(
      (event) => event.type === "thread-scrollback-resync" || event.type === "thread-reset",
    );
    expect(rebuilds).toEqual([
      { type: "thread-scrollback-resync", threadId: "shell-1" },
      { type: "thread-scrollback-resync", threadId: "shell-2" },
      { type: "thread-reset", threadId: "thread-1" },
    ]);

    // Retained events inside the merged loss range still deliver.
    emit(output("shell-2", "retained"), 6);
    expect(received.at(-1)).toMatchObject({ type: "thread-output", threadId: "shell-2" });
  });

  it("rebuilds a trailing shed event without waiting for more traffic", () => {
    const { host, emitGap } = makeHost();
    const transport = new ElectronBackendTransport(host);
    subscribe(transport);
    void transport.setEventInterests({ terminalThreadIds: ["s-1"], runtimeThreadIds: [] });
    received.length = 0;

    emitGap();

    expect(received).toEqual([{ type: "thread-scrollback-resync", threadId: "s-1" }]);
  });

  it("rebuilds every subscribed thread on a backend reset and restarts the cursor", () => {
    const { host, emit, emitReset } = makeHost();
    const transport = new ElectronBackendTransport(host);
    subscribe(transport);
    void transport.setEventInterests({
      terminalThreadIds: ["s-1"],
      runtimeThreadIds: ["r-1"],
    });
    emit(output("s-1", "a"), 10);
    received.length = 0;

    emitReset();

    expect(received).toEqual([
      { type: "thread-scrollback-resync", threadId: "s-1" },
      { type: "thread-reset", threadId: "r-1" },
    ]);

    // The new backend child's sequence space starts near zero again: the
    // cursor must have been dropped, or these events would gate out.
    emit(output("s-1", "b"), 1);
    expect(received.at(-1)).toMatchObject({ type: "thread-output", data: "b" });
  });

  it("publishes deduplicated interests to main through the procedure invoke", async () => {
    const { host, invoked } = makeHost();
    const transport = new ElectronBackendTransport(host);

    await transport.setEventInterests({
      terminalThreadIds: ["s-1", "s-1", "s-2"],
      runtimeThreadIds: [],
    });
    expect(invoked).toEqual([
      {
        name: "setRendererEventInterests",
        args: [{ terminalThreadIds: ["s-1", "s-2"], runtimeThreadIds: [] }],
      },
    ]);
  });
});
