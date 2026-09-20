import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import type { SupervisorEvent } from "@/shared/ipc";
import { ElectronBackendTransport } from "./hostTransport";

/**
 * V6 B.6: preload IPC is no longer a live event data plane. Sequenced
 * supervisor-event / thread-output envelopes from main are ignored; loopback
 * dispatch is the only live path. Bootstrap still publishes interests.
 */

type SupervisorListener = (event: SupervisorEvent, rendererSequence?: number) => void;

function makeHost() {
  const supervisorListeners = new Set<SupervisorListener>();
  const resetListeners = new Set<() => void>();
  const invoked: Array<{ name: string; args: unknown[] }> = [];
  const host = {
    onSupervisorEvent: (listener: SupervisorListener) => {
      supervisorListeners.add(listener);
      return () => supervisorListeners.delete(listener);
    },
    onSupervisorEventGap: () => () => {},
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

describe("ElectronBackendTransport (loopback-only data plane)", () => {
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

  it("does not relay live IPC supervisor events", () => {
    const { host, emit } = makeHost();
    const transport = new ElectronBackendTransport(host);
    subscribe(transport);

    emit(output("t-1", "a"), 3);
    emit(output("t-1", "b"), 4);
    expect(received).toEqual([]);
  });

  it("delivers sequenced loopback events and duplicates only below the cursor", () => {
    const { host } = makeHost();
    const transport = new ElectronBackendTransport(host);
    subscribe(transport);

    transport.dispatchLoopbackEvent(output("t-1", "a"), 3);
    transport.dispatchLoopbackEvent(output("t-1", "dup"), 3);
    transport.dispatchLoopbackEvent(output("t-1", "b"), 4);

    expect(received.map((event) => event.type === "thread-output" && event.data)).toEqual([
      "a",
      "b",
    ]);
  });

  it("applies unsequenced loopback envelopes ungated (bootstrap and recovery events)", () => {
    const { host } = makeHost();
    const transport = new ElectronBackendTransport(host);
    subscribe(transport);

    transport.dispatchLoopbackEvent({ type: "thread-scrollback-resync", threadId: "t-1" });
    transport.dispatchLoopbackEvent(output("t-1", "a"), 1);

    expect(received).toHaveLength(2);
    expect(received[0]!.type).toBe("thread-scrollback-resync");
  });

  it("rebuilds every subscribed thread on a backend reset and restarts the loopback cursor", () => {
    const { host, emitReset } = makeHost();
    const transport = new ElectronBackendTransport(host);
    subscribe(transport);
    void transport.setEventInterests({
      terminalThreadIds: ["s-1"],
      runtimeThreadIds: ["r-1"],
    });
    transport.dispatchLoopbackEvent(output("s-1", "a"), 10);
    received.length = 0;

    emitReset();

    expect(received).toEqual([
      { type: "thread-scrollback-resync", threadId: "s-1" },
      { type: "thread-reset", threadId: "r-1" },
    ]);

    transport.dispatchLoopbackEvent(output("s-1", "b"), 1);
    expect(received.at(-1)).toMatchObject({ type: "thread-output", data: "b" });
  });

  it("keeps two windows' loopback sequence spaces independent (multi-window)", () => {
    const first = makeHost();
    const second = makeHost();
    const left = new ElectronBackendTransport(first.host);
    const right = new ElectronBackendTransport(second.host);
    const leftEvents: string[] = [];
    const rightEvents: string[] = [];
    left.subscribe((event) => {
      if (event.type === "thread-output") leftEvents.push(event.data);
    });
    right.subscribe((event) => {
      if (event.type === "thread-output") rightEvents.push(event.data);
    });

    left.dispatchLoopbackEvent(output("t-1", "L1"), 1);
    right.dispatchLoopbackEvent(output("t-1", "R1"), 1);
    first.emit(output("t-1", "ipc-left"), 9);
    second.emit(output("t-1", "ipc-right"), 9);
    left.dispatchLoopbackEvent(output("t-1", "L2"), 2);
    right.dispatchLoopbackEvent(output("t-1", "R2"), 2);

    expect(leftEvents).toEqual(["L1", "L2"]);
    expect(rightEvents).toEqual(["R1", "R2"]);
  });

  it("keeps interleaved seqs across a mid-stream leg flip (V6 B.4)", () => {
    const { host } = makeHost();
    const transport = new ElectronBackendTransport(host);
    const flipped: Array<{ data: string; space?: string; seq?: number }> = [];
    unsubscribe = transport.subscribe((event, seq, space) => {
      if (event.type === "thread-output") {
        flipped.push({
          data: event.data,
          ...(space !== undefined ? { space } : {}),
          ...(seq !== undefined ? { seq } : {}),
        });
      }
    });

    transport.dispatchSequencedEvent(output("t-1", "ipc-1"), 1, "ipc");
    transport.dispatchSequencedEvent(output("t-1", "ipc-2"), 2, "ipc");
    transport.setLoopbackActive(true);
    transport.dispatchSequencedEvent(output("t-1", "lb-1"), 1, "loopback");
    transport.dispatchSequencedEvent(output("t-1", "ipc-3"), 3, "ipc");
    transport.dispatchSequencedEvent(output("t-1", "lb-2"), 2, "loopback");

    expect(flipped.map((entry) => entry.data)).toEqual(["ipc-1", "ipc-2", "lb-1", "ipc-3", "lb-2"]);
  });

  it("accepts both server counters restarting when the loopback server reconnects", () => {
    const { host } = makeHost();
    const transport = new ElectronBackendTransport(host);
    const events: string[] = [];
    unsubscribe = transport.subscribe((event) => {
      if (event.type === "thread-output") events.push(event.data);
    });
    transport.setLoopbackActive(true);
    transport.dispatchSequencedEvent(output("t-1", "old-desktop"), 50, "ipc");
    transport.dispatchSequencedEvent(output("t-1", "old-shared"), 100, "loopback");
    transport.setLoopbackActive(false);
    transport.setLoopbackActive(true);
    transport.dispatchSequencedEvent(output("t-1", "new-desktop"), 1, "ipc");
    transport.dispatchSequencedEvent(output("t-1", "new-shared"), 1, "loopback");
    expect(events).toEqual(["old-desktop", "old-shared", "new-desktop", "new-shared"]);
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

  it("refuses non-shell remote-routable requests over IPC", async () => {
    const { host } = makeHost();
    const transport = new ElectronBackendTransport(host);
    await expect(transport.request("readProjectFile", [{ path: "/x" }])).rejects.toThrow(
      /IPC data plane removed/,
    );
  });
});
