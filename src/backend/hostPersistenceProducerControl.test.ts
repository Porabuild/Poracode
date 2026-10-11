import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";
import type { RuntimeProducerSignal } from "@/host/db";
import type { SupervisorClient } from "@/host/supervisor/SupervisorClient";

const listenerRef = vi.hoisted(() => ({
  onSignal: null as ((signal: unknown) => void) | null,
  setInFlightWindow: vi.fn<(bytes: number | null) => void>(),
}));

vi.mock("@/host/db", () => ({
  setRuntimePersistenceInFlightWindowBytes: listenerRef.setInFlightWindow,
  addRuntimePersistenceHealthListener: (listener: { onSignal?: (signal: unknown) => void }) => {
    listenerRef.onSignal = listener.onSignal ?? null;
    return () => {
      listenerRef.onSignal = null;
    };
  },
}));

import { HostPersistenceProducerControl } from "./hostPersistenceProducerControl";

/**
 * B1 producer plane: persistence health must reach the supervisor as a scoped
 * control (threadIds stop only the refused threads), carry the host credit
 * window, and ack canonical flow only after the Core persist outcome.
 */
describe("HostPersistenceProducerControl", () => {
  function makeControl() {
    const setEventBackpressured = vi.fn<
      (
        paused: boolean,
        reason?: string,
        options?: {
          threadIds?: readonly string[];
          canonicalCreditBytes?: number;
          canonicalAckSeq?: number;
        },
      ) => void
    >();
    const acknowledgeCanonicalFlow = vi.fn<(flowSeq: number) => void>();
    const getPeerCanonicalCapabilities = vi.fn<SupervisorClient["getPeerCanonicalCapabilities"]>(
      () => ({ supportsCanonicalCredit: false, generation: null }),
    );
    const client = {
      setEventBackpressured,
      acknowledgeCanonicalFlow,
      getPeerCanonicalCapabilities,
    } as unknown as SupervisorClient;
    const control = new HostPersistenceProducerControl(client);
    return {
      control,
      setEventBackpressured,
      acknowledgeCanonicalFlow,
      getPeerCanonicalCapabilities,
    };
  }

  beforeEach(() => {
    listenerRef.onSignal = null;
    listenerRef.setInFlightWindow.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards a thread-scoped stop with only the refused thread ids", () => {
    const { control, setEventBackpressured } = makeControl();
    const signal: RuntimeProducerSignal = {
      kind: "stop",
      reason: "hard-cap",
      threadIds: ["t1"],
    };

    listenerRef.onSignal?.(signal);

    expect(setEventBackpressured).toHaveBeenCalledExactlyOnceWith(
      true,
      "host-persistence-refusing",
      {
        threadIds: ["t1"],
      },
    );
    expect(control.getLastSignal()).toEqual(signal);
  });

  it("keeps a global stop global and a pause/degraded signal unscoped", () => {
    const { control, setEventBackpressured } = makeControl();

    listenerRef.onSignal?.({ kind: "stop", reason: "fatal" });
    expect(setEventBackpressured).toHaveBeenLastCalledWith(true, "host-persistence-refusing", {});

    listenerRef.onSignal?.({ kind: "pause", reason: "watermark" });
    expect(setEventBackpressured).toHaveBeenLastCalledWith(true, "host-persistence-degraded", {});

    listenerRef.onSignal?.({ kind: "resume", reason: "recovered" });
    expect(setEventBackpressured).toHaveBeenLastCalledWith(false, undefined, {});
    expect(control.getLastSignal()).toEqual({ kind: "resume", reason: "recovered" });
  });

  it("carries the granted credit window on every raise and re-raises it after a restart", () => {
    const { control, setEventBackpressured } = makeControl();

    control.setCanonicalCreditWindow(5_000);
    expect(control.getCanonicalCreditWindow()).toBe(5_000);
    expect(setEventBackpressured).toHaveBeenLastCalledWith(false, undefined, {
      canonicalCreditBytes: 5_000,
    });

    listenerRef.onSignal?.({ kind: "stop", reason: "hard-cap", threadIds: ["t2"] });
    expect(setEventBackpressured).toHaveBeenLastCalledWith(true, "host-persistence-refusing", {
      threadIds: ["t2"],
      canonicalCreditBytes: 5_000,
    });

    setEventBackpressured.mockClear();
    control.resend();
    expect(setEventBackpressured).toHaveBeenCalledExactlyOnceWith(
      true,
      "host-persistence-refusing",
      { threadIds: ["t2"], canonicalCreditBytes: 5_000 },
    );
  });

  it("reserves the peer window before granting credit and preserves storage pressure", () => {
    const { control, setEventBackpressured, getPeerCanonicalCapabilities } = makeControl();
    getPeerCanonicalCapabilities.mockReturnValue({
      supportsCanonicalCredit: true,
      generation: "boot-1",
      maxInFlightBytes: 17 * 1024 * 1024,
      maxEnvelopeBytes: 8 * 1024 * 1024,
    });
    listenerRef.onSignal?.({ kind: "pause", reason: "storage" });
    setEventBackpressured.mockClear();
    control.refreshPeerCapabilities();
    expect(listenerRef.setInFlightWindow).toHaveBeenCalledExactlyOnceWith(17 * 1024 * 1024);
    expect(setEventBackpressured).toHaveBeenCalledExactlyOnceWith(
      true,
      "host-persistence-degraded",
      { canonicalCreditBytes: 17 * 1024 * 1024 },
    );
    expect(listenerRef.setInFlightWindow.mock.invocationCallOrder[0]).toBeLessThan(
      setEventBackpressured.mock.invocationCallOrder[0]!,
    );

    getPeerCanonicalCapabilities.mockReturnValue({
      supportsCanonicalCredit: false,
      generation: null,
    });
    control.refreshPeerCapabilities();
    expect(listenerRef.setInFlightWindow).toHaveBeenLastCalledWith(null);
    expect(control.getCanonicalCreditWindow()).toBeNull();
    expect(setEventBackpressured).toHaveBeenLastCalledWith(true, "host-persistence-degraded", {});
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 1.5])(
    "does not install a malformed advertised window %s",
    (maxInFlightBytes) => {
      const { control, getPeerCanonicalCapabilities } = makeControl();
      getPeerCanonicalCapabilities.mockReturnValue({
        supportsCanonicalCredit: true,
        generation: "boot",
        maxInFlightBytes,
        maxEnvelopeBytes: 1,
      });
      control.refreshPeerCapabilities();
      expect(listenerRef.setInFlightWindow).toHaveBeenCalledExactlyOnceWith(null);
      expect(control.getCanonicalCreditWindow()).toBeNull();
    },
  );

  it("uses the new credit when installing headroom synchronously raises storage pressure", () => {
    const { control, setEventBackpressured, getPeerCanonicalCapabilities } = makeControl();
    control.setCanonicalCreditWindow(17 * 1024 * 1024);
    setEventBackpressured.mockClear();
    getPeerCanonicalCapabilities.mockReturnValue({
      supportsCanonicalCredit: true,
      generation: "smaller-successor",
      maxInFlightBytes: 9 * 1024 * 1024,
      maxEnvelopeBytes: 8 * 1024 * 1024,
    });
    listenerRef.setInFlightWindow.mockImplementation(() => {
      listenerRef.onSignal?.({ kind: "pause", reason: "watermark" });
    });
    control.refreshPeerCapabilities();
    expect(setEventBackpressured.mock.calls).toHaveLength(2);
    for (const call of setEventBackpressured.mock.calls) {
      expect(call).toEqual([
        true,
        "host-persistence-degraded",
        { canonicalCreditBytes: 9 * 1024 * 1024 },
      ]);
    }
  });

  it("acks the exact canonical flow identity after the persist outcome and ignores other events", () => {
    const { control, acknowledgeCanonicalFlow } = makeControl();
    const admitted: SupervisorEvent = {
      type: "thread-runtime-events",
      threadId: "t1",
      events: [],
      flowSeq: 12,
      flowBytes: 900,
    };

    control.acknowledgeCanonicalFlow(admitted);
    expect(acknowledgeCanonicalFlow).toHaveBeenCalledExactlyOnceWith(12);

    acknowledgeCanonicalFlow.mockClear();
    control.acknowledgeCanonicalFlow({ type: "thread-state", threadId: "t1" } as SupervisorEvent);
    control.acknowledgeCanonicalFlow({
      type: "git-changed",
      projectId: "p1",
    } as SupervisorEvent);
    expect(acknowledgeCanonicalFlow).not.toHaveBeenCalled();
  });

  it("stops forwarding after dispose", () => {
    const { control, setEventBackpressured } = makeControl();
    control.dispose();
    listenerRef.onSignal?.({ kind: "pause", reason: "storage" });

    expect(setEventBackpressured).not.toHaveBeenCalled();
    expect(control.getLastSignal()).toBeNull();
  });
});
