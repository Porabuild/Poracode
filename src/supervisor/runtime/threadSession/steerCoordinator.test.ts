// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type {
  AgentAdapter,
  StructuredSessionHandle,
  StructuredTurnResult,
} from "../../agents/base";
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
    startTurn: vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(async () => undefined),
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
  const startStructuredTurn = vi.fn<
    (
      session: SessionRuntime,
      turn: QueuedStructuredTurn,
    ) => Promise<void | StructuredTurnResult> | undefined
  >(() => {
    order.push("start");
    return undefined;
  });
  const emitOptimisticUserMessage = vi.fn<() => string>(() => "user-optimistic");
  const noteDirectSteerCompletedWithoutTurn = vi.fn<() => void>();
  const coordinator = new SteerCoordinator({
    emit: (event) => events.push(event),
    sessions,
    interruptStructuredTurn,
    startStructuredTurn,
    emitOptimisticUserMessage,
    failStructuredSession: vi.fn<(session: SessionRuntime, error: unknown) => void>(),
    noteDirectSteerCompletedWithoutTurn,
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
    emitOptimisticUserMessage,
    noteDirectSteerCompletedWithoutTurn,
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
    void harness.coordinator.maybeDrainPendingSteer(harness.session);

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
    void harness.coordinator.maybeDrainPendingSteer(harness.session);
    harness.session.status = "working";
    finishPreparation?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.startStructuredTurn).toHaveBeenCalledTimes(1);
    expect(harness.order).toEqual(["prepare", "start"]);
    expect(harness.interruptStructuredTurn).not.toHaveBeenCalled();
  });

  it("keeps ordinary steer provider options unchanged", () => {
    const harness = createHarness();
    const steerTurn = vi.fn<NonNullable<StructuredSessionHandle["steerTurn"]>>(
      async () => undefined,
    );
    harness.session.structuredSession!.steerTurn = steerTurn;

    void harness.coordinator.steerStructuredTurn(harness.session, {
      prompt: "ordinary steer",
      config: { model: "model-2" },
    });

    expect(harness.emitOptimisticUserMessage).not.toHaveBeenCalled();
    expect(steerTurn).toHaveBeenCalledWith(
      "ordinary steer",
      { model: "model-2" },
      undefined,
      undefined,
    );
  });

  it("releases the direct barrier when native steer completes without a turn", async () => {
    const harness = createHarness();
    const steerTurn = vi.fn<NonNullable<StructuredSessionHandle["steerTurn"]>>(async () => ({
      outcome: "completed-without-turn",
    }));
    harness.session.structuredSession!.steerTurn = steerTurn;

    await harness.coordinator.steerStructuredTurn(harness.session, {
      prompt: "run command",
      config: { model: "model-2" },
    });

    expect(harness.noteDirectSteerCompletedWithoutTurn).toHaveBeenCalledOnce();
  });

  it("keeps a queued fallback steer owned until replacement admission settles", async () => {
    const harness = createHarness();
    const providerCompletion = Promise.withResolvers<void>();
    harness.startStructuredTurn.mockReturnValueOnce(providerCompletion.promise);

    const queued = harness.coordinator.setPendingSteer(
      harness.session,
      {
        threadId: harness.session.threadId,
        prompt: "queued fallback",
        config: { model: "model-2" },
      },
      {
        awaitReplacement: true,
        awaitCanonicalStart: true,
        userMessageItemId: "user-queued",
      },
    );
    await vi.waitFor(() => expect(harness.interruptStructuredTurn).toHaveBeenCalledTimes(1));

    harness.session.status = "idle";
    void harness.coordinator.maybeDrainPendingSteer(harness.session);
    expect(harness.startStructuredTurn).toHaveBeenCalledWith(
      harness.session,
      expect.objectContaining({ prompt: "queued fallback", userMessageItemId: "user-queued" }),
    );

    let settled = false;
    void queued.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    providerCompletion.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    harness.coordinator.noteSteerTurnStarted(harness.session);
    await queued;
    expect(harness.session.pendingSteer).toBeUndefined();
  });

  it("settles a fallback command that completes without opening a turn", async () => {
    const harness = createHarness();
    harness.startStructuredTurn.mockResolvedValueOnce({ outcome: "completed-without-turn" });

    const queued = harness.coordinator.setPendingSteer(
      harness.session,
      {
        threadId: harness.session.threadId,
        prompt: "/goal pause",
        config: { model: "model-2" },
      },
      { awaitReplacement: true, awaitCanonicalStart: true, userMessageItemId: "user-queued" },
    );
    await vi.waitFor(() => expect(harness.interruptStructuredTurn).toHaveBeenCalledTimes(1));

    harness.session.status = "idle";
    void harness.coordinator.maybeDrainPendingSteer(harness.session);
    await queued;
    expect(harness.session.pendingSteer).toBeUndefined();
  });

  it("settles native admission after the old turn becomes idle", async () => {
    const harness = createHarness();
    const providerCompletion = Promise.withResolvers<void>();
    const steerTurn = vi.fn<NonNullable<StructuredSessionHandle["steerTurn"]>>(
      () => providerCompletion.promise,
    );
    harness.session.structuredSession!.steerTurn = steerTurn;

    const queued = harness.coordinator.setPendingSteer(
      harness.session,
      {
        threadId: harness.session.threadId,
        prompt: "native queued steer",
        config: { model: "model-2" },
      },
      { awaitReplacement: true, awaitCanonicalStart: true, userMessageItemId: "user-queued" },
    );
    await Promise.resolve();
    harness.session.status = "idle";
    providerCompletion.resolve();
    await queued;
    expect(steerTurn).toHaveBeenCalledOnce();
  });

  it.each(["needs_approval", "inactive"] as const)(
    "rejects a queued steer instead of stranding it in %s",
    async (status) => {
      const harness = createHarness();
      harness.session.status = status;

      await expect(
        harness.coordinator.setPendingSteer(
          harness.session,
          {
            threadId: harness.session.threadId,
            prompt: "must not strand",
            config: { model: "model-2" },
          },
          { awaitReplacement: true, userMessageItemId: "user-queued" },
        ),
      ).rejects.toThrow("not ready");
      expect(harness.session.pendingSteer).toBeUndefined();
      expect(harness.interruptStructuredTurn).not.toHaveBeenCalled();
      expect(harness.startStructuredTurn).not.toHaveBeenCalled();
    },
  );

  it("paints a thread mention from display segments without adding a turn boundary", () => {
    const harness = createHarness();
    const steerTurn = vi.fn<NonNullable<StructuredSessionHandle["steerTurn"]>>(
      async () => undefined,
    );
    harness.session.structuredSession!.steerTurn = steerTurn;
    const displaySegments = [{ kind: "thread", threadId: "source", title: "Source" }] as const;
    const effectiveSegments = [{ kind: "text", content: "[thread mention] Source" }] as const;

    void harness.coordinator.steerStructuredTurn(harness.session, {
      prompt: "[thread mention] Source",
      config: { model: "model-2" },
      segments: [...effectiveSegments],
      displaySegments: [...displaySegments],
    });

    expect(harness.emitOptimisticUserMessage).toHaveBeenCalledWith(
      harness.session.threadId,
      "[thread mention] Source",
      [...displaySegments],
      undefined,
      { includeTurn: false },
    );
    expect(steerTurn).toHaveBeenCalledWith(
      "[thread mention] Source",
      { model: "model-2" },
      [...effectiveSegments],
      { userMessageItemId: "user-optimistic" },
    );
  });

  it("paints queued native steer with its stable queue item identity", () => {
    const harness = createHarness();
    const steerTurn = vi.fn<NonNullable<StructuredSessionHandle["steerTurn"]>>(
      async () => undefined,
    );
    harness.session.structuredSession!.steerTurn = steerTurn;
    harness.emitOptimisticUserMessage.mockReturnValue("user-queued");

    void harness.coordinator.steerStructuredTurn(harness.session, {
      prompt: "queued native steer",
      config: { model: "model-2" },
      userMessageItemId: "user-queued",
    });

    expect(harness.emitOptimisticUserMessage).toHaveBeenCalledWith(
      harness.session.threadId,
      "queued native steer",
      undefined,
      "user-queued",
      { includeTurn: false },
    );
    expect(steerTurn).toHaveBeenCalledWith("queued native steer", { model: "model-2" }, undefined, {
      userMessageItemId: "user-queued",
    });
  });
});
