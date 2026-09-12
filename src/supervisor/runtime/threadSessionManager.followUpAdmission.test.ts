import { expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import type { SessionRuntime } from "./sessionTypes";
import type { ThreadSessionManager } from "./threadSessionManager";
import type { FollowUpQueueCoordinator } from "./threadSession/followUpQueueCoordinator";
import { createFollowUpQueueHarness as createHarness } from "./threadSessionManager.followUpQueueTestHarness";

vi.mock("node-pty", () => ({ spawn: vi.fn<() => never>() }));

function followUpQueueFor(manager: ThreadSessionManager): FollowUpQueueCoordinator {
  return (manager as unknown as { followUpQueue: FollowUpQueueCoordinator }).followUpQueue;
}

function steerCoordinatorFor(manager: ThreadSessionManager) {
  return (
    manager as unknown as {
      steerCoordinator: {
        maybeDrainPendingSteer(session: SessionRuntime): Promise<void> | undefined;
        noteSteerTurnStarted(session: SessionRuntime): void;
      };
    }
  ).steerCoordinator;
}

function runtimeTurnEvent(
  queue: FollowUpQueueCoordinator,
  session: SessionRuntime,
  event: RuntimeEvent,
): void {
  queue.onStructuredRuntimeEvent(session, event);
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

it("waits for an accepted native follow-up while the provider remains busy between turns", async () => {
  const { manager, session, startTurn, steerTurn, finish } = createHarness();
  const queue = followUpQueueFor(manager);
  const turnEvent = (
    event:
      | Omit<Extract<RuntimeEvent, { type: "turn.started" }>, "threadId">
      | Omit<Extract<RuntimeEvent, { type: "turn.completed" }>, "threadId">,
  ) => queue.onStructuredRuntimeEvent(session, { ...event, threadId: session.threadId });
  session.status = "working";
  turnEvent({ type: "turn.started", turnId: "initial-turn" });

  try {
    await manager.queueThreadFollowUp({
      threadId: session.threadId,
      prompt: "FIFO follow-up",
      config: session.config,
    });
    await manager.setPendingSteer({
      threadId: session.threadId,
      prompt: "provider-queued follow-up",
      config: session.config,
    });
    expect(steerTurn).toHaveBeenCalledOnce();

    // Acceptance has settled, but the provider still owns work for its next
    // turn. It keeps working status while closing the preceding canonical turn.
    turnEvent({ type: "turn.completed", turnId: "initial-turn", state: "completed" });
    await flushMicrotasks();
    expect(startTurn).not.toHaveBeenCalled();

    turnEvent({ type: "turn.started", turnId: "native-follow-up" });
    await flushMicrotasks();
    expect(startTurn).not.toHaveBeenCalled();
    turnEvent({ type: "turn.completed", turnId: "native-follow-up", state: "completed" });
    session.status = "idle";
    queue.onStructuredUpdate(session, "idle");
    await vi.waitFor(() => expect(startTurn).toHaveBeenCalledOnce());
    expect(startTurn.mock.calls[0]?.[0]).toBe("FIFO follow-up");
  } finally {
    finish();
    await manager.dispose();
  }
});

it("waits for queued turn admission before steering another prompt", async () => {
  const { manager, session, startTurn, steerTurn, finish } = createHarness();
  const queuedAdmission = Promise.withResolvers<void>();
  const queue = followUpQueueFor(manager);
  startTurn.mockImplementationOnce(() => queuedAdmission.promise);

  try {
    await manager.queueThreadFollowUp({
      threadId: session.threadId,
      prompt: "queued first",
      config: session.config,
    });
    await vi.waitFor(() => expect(startTurn).toHaveBeenCalledTimes(1));
    // The provider has accepted the call but has not emitted its admission
    // edge yet, so the runtime still reports idle.
    expect(session.status).toBe("idle");

    const steering = manager.setPendingSteer({
      threadId: session.threadId,
      prompt: "direct steer",
      config: session.config,
    });
    await flushMicrotasks();
    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(steerTurn).not.toHaveBeenCalled();

    session.status = "working";
    runtimeTurnEvent(queue, session, {
      type: "turn.started",
      threadId: session.threadId,
      turnId: "queued-first-turn",
    });
    await vi.waitFor(() => expect(steerTurn).toHaveBeenCalledOnce());
    await steering;
    expect(startTurn).toHaveBeenCalledTimes(1);

    queuedAdmission.resolve();
  } finally {
    queuedAdmission.resolve();
    finish();
    await manager.dispose();
  }
});

it("waits for a pending replacement admission before steering again", async () => {
  const { manager, session, startTurn, steerTurn, finish } = createHarness();
  const queue = followUpQueueFor(manager);
  const steerCoordinator = steerCoordinatorFor(manager);
  delete session.structuredSession!.steerTurn;
  session.status = "working";
  const first = manager.setPendingSteer(
    {
      threadId: session.threadId,
      prompt: "first replacement",
      config: session.config,
    },
    { awaitReplacement: true, awaitCanonicalStart: true },
  );

  try {
    await vi.waitFor(() => expect(session.pendingSteer).toBeDefined());
    session.status = "idle";
    void steerCoordinator.maybeDrainPendingSteer(session);
    await vi.waitFor(() => expect(startTurn).toHaveBeenCalledTimes(1));

    // A second composer steer is submitted after the first replacement has
    // invoked startTurn, but before its canonical turn.started edge.
    session.structuredSession!.steerTurn = steerTurn;
    const second = manager.setPendingSteer({
      threadId: session.threadId,
      prompt: "second steer",
      config: session.config,
    });
    await flushMicrotasks();
    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(steerTurn).not.toHaveBeenCalled();

    session.status = "working";
    runtimeTurnEvent(queue, session, {
      type: "turn.started",
      threadId: session.threadId,
      turnId: "first-replacement-turn",
    });
    steerCoordinator.noteSteerTurnStarted(session);

    await first;
    await second;
    expect(steerTurn).toHaveBeenCalledOnce();
  } finally {
    finish();
    await manager.dispose();
  }
});

it("keeps the FIFO behind steer preparation that crosses the old turn boundary", async () => {
  const { manager, session, startTurn, steerTurn, finish } = createHarness();
  const queue = followUpQueueFor(manager);
  const preparation = Promise.withResolvers<string | undefined>();
  const prepareSkill = vi.spyOn(
    manager as unknown as {
      resolveSkillTurnInjection: (...args: never[]) => Promise<string | undefined>;
    },
    "resolveSkillTurnInjection",
  );
  prepareSkill.mockReturnValueOnce(preparation.promise);
  session.status = "working";
  runtimeTurnEvent(queue, session, {
    type: "turn.started",
    threadId: session.threadId,
    turnId: "old-turn",
  });
  await manager.queueThreadFollowUp({
    threadId: session.threadId,
    prompt: "fifo item",
    config: session.config,
  });

  try {
    const steering = manager.setPendingSteer({
      threadId: session.threadId,
      prompt: "prepared steer",
      config: session.config,
    });
    await flushMicrotasks();
    expect(prepareSkill).toHaveBeenCalledOnce();
    expect(steerTurn).not.toHaveBeenCalled();

    runtimeTurnEvent(queue, session, {
      type: "turn.completed",
      threadId: session.threadId,
      turnId: "old-turn",
      state: "completed",
    });
    session.status = "idle";
    queue.onStructuredUpdate(session, "idle");
    await flushMicrotasks();
    expect(startTurn).not.toHaveBeenCalled();

    preparation.resolve(undefined);
    await vi.waitFor(() => expect(startTurn).toHaveBeenCalledTimes(1));
    expect(startTurn.mock.calls[0]?.[0]).toBe("prepared steer");
    await steering;

    runtimeTurnEvent(queue, session, {
      type: "turn.started",
      threadId: session.threadId,
      turnId: "replacement-turn",
    });
    session.status = "working";
    runtimeTurnEvent(queue, session, {
      type: "turn.completed",
      threadId: session.threadId,
      turnId: "replacement-turn",
      state: "completed",
    });
    session.status = "idle";
    queue.onStructuredUpdate(session, "idle");
    await vi.waitFor(() => expect(startTurn).toHaveBeenCalledTimes(2));
    expect(startTurn.mock.calls[1]?.[0]).toBe("fifo item");
  } finally {
    prepareSkill.mockRestore();
    preparation.resolve(undefined);
    finish();
    await manager.dispose();
  }
});

it("holds the FIFO behind asynchronous native steer admission", async () => {
  const { manager, session, startTurn, steerTurn, finish } = createHarness();
  const queue = followUpQueueFor(manager);
  const providerAdmission = Promise.withResolvers<void>();
  steerTurn.mockReturnValueOnce(providerAdmission.promise);
  session.status = "working";
  runtimeTurnEvent(queue, session, {
    type: "turn.started",
    threadId: session.threadId,
    turnId: "old-turn",
  });
  await manager.queueThreadFollowUp({
    threadId: session.threadId,
    prompt: "fifo item",
    config: session.config,
  });

  try {
    const steering = manager.setPendingSteer({
      threadId: session.threadId,
      prompt: "native steer",
      config: session.config,
    });
    await vi.waitFor(() => expect(steerTurn).toHaveBeenCalledOnce());
    let settled = false;
    void steering.then(() => {
      settled = true;
    });
    await flushMicrotasks();
    expect(settled).toBe(false);

    runtimeTurnEvent(queue, session, {
      type: "turn.completed",
      threadId: session.threadId,
      turnId: "old-turn",
      state: "completed",
    });
    session.status = "idle";
    queue.onStructuredUpdate(session, "idle");
    await flushMicrotasks();
    expect(startTurn).not.toHaveBeenCalled();

    providerAdmission.resolve();
    await steering;
    await vi.waitFor(() => expect(startTurn).toHaveBeenCalledTimes(1));
    expect(startTurn.mock.calls[0]?.[0]).toBe("fifo item");
  } finally {
    providerAdmission.resolve();
    finish();
    await manager.dispose();
  }
});

it("keeps the FIFO behind a fallback start while canonical admission is delayed", async () => {
  const { manager, session, startTurn, finish } = createHarness();
  const queue = followUpQueueFor(manager);
  const preparation = Promise.withResolvers<string | undefined>();
  const replacementAdmission = Promise.withResolvers<void>();
  const prepareSkill = vi.spyOn(
    manager as unknown as {
      resolveSkillTurnInjection: (...args: never[]) => Promise<string | undefined>;
    },
    "resolveSkillTurnInjection",
  );
  prepareSkill.mockReturnValueOnce(preparation.promise);
  startTurn.mockImplementationOnce(async () => {
    await replacementAdmission.promise;
    session.status = "working";
  });
  session.status = "working";
  runtimeTurnEvent(queue, session, {
    type: "turn.started",
    threadId: session.threadId,
    turnId: "old-turn",
  });
  await manager.queueThreadFollowUp({
    threadId: session.threadId,
    prompt: "fifo item",
    config: session.config,
  });

  try {
    const steering = manager.setPendingSteer({
      threadId: session.threadId,
      prompt: "fallback steer",
      config: session.config,
    });
    await flushMicrotasks();
    expect(prepareSkill).toHaveBeenCalledOnce();

    runtimeTurnEvent(queue, session, {
      type: "turn.completed",
      threadId: session.threadId,
      turnId: "old-turn",
      state: "completed",
    });
    session.status = "idle";
    queue.onStructuredUpdate(session, "idle");
    await flushMicrotasks();
    expect(startTurn).not.toHaveBeenCalled();

    preparation.resolve(undefined);
    await vi.waitFor(() => expect(startTurn).toHaveBeenCalledTimes(1));
    expect(startTurn.mock.calls[0]?.[0]).toBe("fallback steer");
    await steering;
    await flushMicrotasks();
    expect(startTurn).toHaveBeenCalledTimes(1);

    replacementAdmission.resolve();
    await flushMicrotasks();
    runtimeTurnEvent(queue, session, {
      type: "turn.started",
      threadId: session.threadId,
      turnId: "replacement-turn",
    });
    runtimeTurnEvent(queue, session, {
      type: "turn.completed",
      threadId: session.threadId,
      turnId: "replacement-turn",
      state: "completed",
    });
    session.status = "idle";
    queue.onStructuredUpdate(session, "idle");
    await vi.waitFor(() => expect(startTurn).toHaveBeenCalledTimes(2));
    expect(startTurn.mock.calls[1]?.[0]).toBe("fifo item");
  } finally {
    prepareSkill.mockRestore();
    preparation.resolve(undefined);
    replacementAdmission.resolve();
    finish();
    await manager.dispose();
  }
});
