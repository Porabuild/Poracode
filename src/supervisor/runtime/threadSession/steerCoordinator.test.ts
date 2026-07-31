// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { AgentAdapter, StructuredSessionHandle } from "../../agents/base";
import type { SupervisorEvent } from "@/shared/ipc";
import type { QueuedStructuredTurn, SessionRuntime } from "../sessionTypes";
import { SteerCoordinator } from "./steerCoordinator";

function createHarness(
  options: {
    preparationFails?: boolean;
    preparationHangs?: boolean;
    preparationPromise?: Promise<void>;
  } = {},
) {
  const order: string[] = [];
  const events: SupervisorEvent[] = [];
  const prepareSteerInterrupt = vi.fn<
    NonNullable<StructuredSessionHandle["prepareSteerInterrupt"]>
  >(async () => {
    order.push("prepare");
    if (options.preparationHangs) {
      await new Promise<void>(() => undefined);
    }
    if (options.preparationPromise) {
      await options.preparationPromise;
    }
    if (options.preparationFails) {
      throw new Error("background control unavailable");
    }
  });
  const interruptTurn = vi.fn<NonNullable<StructuredSessionHandle["interruptTurn"]>>(
    async () => undefined,
  );
  const structuredSession = {
    launchOptions: {},
    prepareSteerInterrupt,
    interruptTurn,
    setListener: vi.fn<StructuredSessionHandle["setListener"]>(),
    dispose: vi.fn<StructuredSessionHandle["dispose"]>(async () => undefined),
  } as StructuredSessionHandle;
  const adapter = {
    kind: "test-agent",
    label: "Test Agent",
    capabilities: {
      liveInputMode: "server",
      presentationMode: "gui",
    },
  } as unknown as AgentAdapter;
  const session = {
    instanceId: "instance-1",
    threadId: "thread-1",
    agentKind: adapter.kind,
    adapter,
    projectLocation: { kind: "posix", path: "/repo" },
    config: { model: "model-1" },
    status: "working",
    attention: "working",
    presentationMode: "gui",
    structuredSession,
  } as unknown as SessionRuntime;
  const sessions = new Map([[session.threadId, session]]);
  const interruptStructuredTurn = vi.fn<(session: SessionRuntime) => Promise<void>>(async () => {
    order.push("interrupt");
    await structuredSession.interruptTurn?.();
  });
  const startStructuredTurn = vi.fn<(session: SessionRuntime, turn: QueuedStructuredTurn) => void>(
    () => {
      order.push("start");
    },
  );
  const coordinator = new SteerCoordinator({
    emit: (event) => events.push(event),
    sessions,
    interruptStructuredTurn,
    startStructuredTurn,
    failStructuredSession: vi.fn<(session: SessionRuntime, error: unknown) => void>(),
    resolveSkillTurnInjection: vi.fn<
      (
        session: SessionRuntime,
        segments: readonly import("@/shared/contracts").PromptSegment[] | undefined,
      ) => Promise<string | undefined>
    >(async () => undefined),
  });
  const turn: QueuedStructuredTurn = {
    prompt: "replacement",
    config: { model: "model-2" },
    userMessageItemId: "user-replacement",
  };

  return {
    coordinator,
    events,
    interruptStructuredTurn,
    order,
    prepareSteerInterrupt,
    session,
    startStructuredTurn,
    turn,
  };
}

describe("SteerCoordinator interrupt-backed steering", () => {
  it("prepares, interrupts, then drains the replacement as a fresh turn", async () => {
    const harness = createHarness();

    harness.coordinator.stagePendingSteer(harness.session, harness.turn);
    harness.coordinator.fireSteerInterrupt(harness.session);

    await vi.waitFor(() => {
      expect(harness.interruptStructuredTurn).toHaveBeenCalledTimes(1);
    });
    expect(harness.order).toEqual(["prepare", "interrupt"]);
    expect(harness.startStructuredTurn).not.toHaveBeenCalled();

    harness.session.status = "idle";
    harness.coordinator.maybeDrainPendingSteer(harness.session);

    expect(harness.order).toEqual(["prepare", "interrupt", "start"]);
    expect(harness.startStructuredTurn).toHaveBeenCalledExactlyOnceWith(
      harness.session,
      harness.turn,
    );
    expect(harness.session.pendingSteer).toBeUndefined();
    expect(harness.events.at(-1)).toMatchObject({
      type: "thread-pending-steer",
      threadId: harness.session.threadId,
      pending: null,
    });
  });

  it("still interrupts when optional provider preparation fails", async () => {
    const harness = createHarness({ preparationFails: true });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    harness.coordinator.stagePendingSteer(harness.session, harness.turn);
    harness.coordinator.fireSteerInterrupt(harness.session);

    await vi.waitFor(() => {
      expect(harness.interruptStructuredTurn).toHaveBeenCalledTimes(1);
    });
    expect(harness.order).toEqual(["prepare", "interrupt"]);
    expect(harness.session.pendingSteer).toBeDefined();

    consoleError.mockRestore();
  });

  it("bounds provider preparation so steering cannot hang", async () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const harness = createHarness({ preparationHangs: true });

      harness.coordinator.stagePendingSteer(harness.session, harness.turn);
      harness.coordinator.fireSteerInterrupt(harness.session);
      await vi.advanceTimersByTimeAsync(1_000);

      expect(harness.order).toEqual(["prepare", "interrupt"]);
      expect(harness.interruptStructuredTurn).toHaveBeenCalledTimes(1);
    } finally {
      consoleError.mockRestore();
      vi.useRealTimers();
    }
  });

  it("does not interrupt a replacement that starts while preparation settles", async () => {
    let finishPreparation: (() => void) | undefined;
    const preparationPromise = new Promise<void>((resolve) => {
      finishPreparation = resolve;
    });
    const harness = createHarness({ preparationPromise });

    harness.coordinator.stagePendingSteer(harness.session, harness.turn);
    harness.coordinator.fireSteerInterrupt(harness.session);
    await vi.waitFor(() => {
      expect(harness.prepareSteerInterrupt).toHaveBeenCalledTimes(1);
    });

    harness.session.status = "idle";
    harness.coordinator.maybeDrainPendingSteer(harness.session);
    harness.session.status = "working";
    finishPreparation?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.startStructuredTurn).toHaveBeenCalledTimes(1);
    expect(harness.order).toEqual(["prepare", "start"]);
    expect(harness.interruptStructuredTurn).not.toHaveBeenCalled();
  });
});
