import { expect, it, vi } from "vitest";
import type { AgentAdapter, StructuredSessionHandle } from "../agents/base";
import type { SessionRuntime } from "./sessionTypes";
import type { SupervisorEvent } from "@/shared/ipc";
import { ThreadSessionManager } from "./threadSessionManager";

vi.mock("node-pty", () => ({ spawn: vi.fn<() => never>() }));

function createHarness() {
  const emit = vi.fn<(event: SupervisorEvent) => void>();
  const adapter = {
    kind: "test-agent",
    label: "Test agent",
    capabilities: { liveInputMode: "server" },
  } as unknown as AgentAdapter;
  const manager = new ThreadSessionManager({
    emit,
    isDev: false,
    logsDir: "tmp/queue-tests/logs",
    settingsPath: "tmp/queue-tests/settings.json",
    readDisableCliHookPlugin: () => false,
    adapters: new Map([[adapter.kind, adapter]]),
    resolveWindowsShell: () => ({ shell: "powershell.exe", kind: "powershell", args: [] }),
  });
  let finish!: () => void;
  const completion = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(() => {
    session.status = "working";
    return completion;
  });
  const steerTurn = vi.fn<NonNullable<StructuredSessionHandle["steerTurn"]>>(async () => {});
  const session = {
    threadId: "queue-config",
    instanceId: "queue-instance",
    agentKind: adapter.kind,
    adapter,
    projectLocation: { kind: "windows", path: "C:\\queue-fixture" },
    config: { model: "initial" },
    status: "idle",
    attention: "none",
    presentationMode: "gui",
    outputLength: 0,
    prevChunk: "",
    lastStrippedPtyChunk: "",
    ptyOscCarry: "",
    structuredSession: { startTurn, steerTurn, dispose: async () => {} },
  } as unknown as SessionRuntime;
  manager.sessions.set(session.threadId, session);
  return { manager, session, startTurn, steerTurn, finish, completion };
}

it("keeps a newer steer config when a queued provider turn resolves late", async () => {
  const { manager, session, startTurn, steerTurn, finish, completion } = createHarness();
  try {
    await manager.queueThreadFollowUp({
      threadId: session.threadId,
      prompt: "queued",
      config: { model: "queued-model" },
    });
    await vi.waitFor(() => expect(startTurn).toHaveBeenCalledTimes(1));
    expect(session.config.model).toBe("queued-model");
    await manager.sendThreadInput({
      threadId: session.threadId,
      prompt: "steer",
      config: { model: "newer-model" },
    });
    expect(steerTurn).toHaveBeenCalledTimes(1);
    finish();
    await completion;
    expect(session.config.model).toBe("newer-model");
  } finally {
    finish();
    await manager.dispose();
  }
});

it("applies home-scope permission preparation before a direct steer", async () => {
  const { manager, session, finish } = createHarness();
  session.status = "working";
  session.projectLocation = { kind: "windows", path: "C:\\Users\\demo" };
  session.adapter.capabilities = {
    ...session.adapter.capabilities,
    approvalPolicies: [{ id: "yolo", label: "Auto approve" }],
    sandboxModes: [{ id: "danger-full-access", label: "Full access" }],
    bypassPermissions: {
      approvalPolicy: "yolo",
      sandboxMode: "danger-full-access",
    },
  };
  try {
    await manager.setPendingSteer({
      threadId: session.threadId,
      prompt: "home steer",
      config: { model: "queued-model" },
    });

    expect(session.structuredSession?.steerTurn).toHaveBeenCalledWith(
      "home steer",
      {
        model: "queued-model",
        approvalPolicy: "yolo",
        sandboxMode: "danger-full-access",
      },
      undefined,
      undefined,
    );
  } finally {
    finish();
    await manager.dispose();
  }
});

it("binds a pending steer to the replacement session, not the stale one", async () => {
  const { manager, session, finish } = createHarness();
  session.status = "working";
  const replacementSteer = vi.fn<NonNullable<StructuredSessionHandle["steerTurn"]>>(
    async () => undefined,
  );
  const replacement = {
    ...session,
    instanceId: "queue-replacement",
    structuredSession: {
      ...session.structuredSession,
      steerTurn: replacementSteer,
    },
  } as unknown as SessionRuntime;
  let releaseStart!: () => void;
  const pendingStart = new Promise<void>((resolve) => {
    releaseStart = resolve;
  });
  const starts = (manager as unknown as { startLocks: Map<string, Promise<void>> }).startLocks;
  starts.set(session.threadId, pendingStart);

  try {
    const steering = manager.setPendingSteer({
      threadId: session.threadId,
      prompt: "replacement steer",
      config: session.config,
    });
    await Promise.resolve();
    expect(session.structuredSession?.steerTurn).not.toHaveBeenCalled();

    manager.sessions.set(session.threadId, replacement);
    starts.delete(session.threadId);
    releaseStart();
    await steering;

    expect(session.structuredSession?.steerTurn).not.toHaveBeenCalled();
    expect(replacementSteer).toHaveBeenCalledOnce();
  } finally {
    starts.delete(session.threadId);
    finish();
    await manager.dispose();
  }
});

it("retains queued content when native steer admission rejects asynchronously", async () => {
  const { manager, session, steerTurn, finish } = createHarness();
  session.status = "working";
  const admission = Promise.withResolvers<void>();
  steerTurn.mockReturnValueOnce(admission.promise);
  try {
    await manager.queueThreadFollowUp({
      threadId: session.threadId,
      prompt: "keep this",
      config: session.config,
    });
    const item = manager.getThreadFollowUpQueue(session.threadId)!.items[0]!;
    const steering = manager.steerQueuedThreadFollowUp({ threadId: session.threadId, id: item.id });
    const result = steering.then(
      () => "accepted",
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    await vi.waitFor(() => expect(steerTurn).toHaveBeenCalledTimes(1));
    admission.reject(new Error("Steer admission rejected"));
    expect(await result).toBe("Steer admission rejected");
    expect(manager.getThreadFollowUpQueue(session.threadId)).toMatchObject({
      paused: true,
      items: [{ id: item.id, prompt: "keep this" }],
    });
  } finally {
    admission.resolve();
    finish();
    await manager.dispose();
  }
});

it("removes a queued native steer after control acceptance even if the old turn is idle", async () => {
  const { manager, session, steerTurn, finish } = createHarness();
  session.status = "working";
  const acceptance = Promise.withResolvers<void>();
  steerTurn.mockReturnValueOnce(acceptance.promise);
  try {
    await manager.queueThreadFollowUp({
      threadId: session.threadId,
      prompt: "native queued steer",
      config: session.config,
    });
    const item = manager.getThreadFollowUpQueue(session.threadId)!.items[0]!;
    const steering = manager.steerQueuedThreadFollowUp({ threadId: session.threadId, id: item.id });
    await vi.waitFor(() => expect(steerTurn).toHaveBeenCalledTimes(1));

    // The old turn can settle before the provider control request returns.
    session.status = "idle";
    acceptance.resolve();
    await steering;
    expect(manager.getThreadFollowUpQueue(session.threadId)).toBeNull();
  } finally {
    acceptance.resolve();
    finish();
    await manager.dispose();
  }
});

it("removes a queued command-only steer without requiring a turn start", async () => {
  const { manager, session, steerTurn, finish } = createHarness();
  session.status = "working";
  steerTurn.mockResolvedValueOnce({ outcome: "completed-without-turn" });
  try {
    await manager.queueThreadFollowUp({
      threadId: session.threadId,
      prompt: "/goal pause",
      config: session.config,
    });
    const item = manager.getThreadFollowUpQueue(session.threadId)!.items[0]!;
    const steering = manager.steerQueuedThreadFollowUp({ threadId: session.threadId, id: item.id });
    await steering;
    expect(manager.getThreadFollowUpQueue(session.threadId)).toBeNull();
  } finally {
    finish();
    await manager.dispose();
  }
});

it("retains queued steer content when a direct submit replaces it before fallback admission", async () => {
  const { manager, session, finish } = createHarness();
  session.status = "working";
  delete session.structuredSession!.steerTurn;
  try {
    await manager.queueThreadFollowUp({
      threadId: session.threadId,
      prompt: "queued fallback",
      config: session.config,
    });
    const item = manager.getThreadFollowUpQueue(session.threadId)!.items[0]!;
    const steering = manager.steerQueuedThreadFollowUp({ threadId: session.threadId, id: item.id });
    await vi.waitFor(() => expect(session.pendingSteer).toBeDefined());

    await manager.sendThreadInput({
      threadId: session.threadId,
      prompt: "direct replacement",
      config: session.config,
    });

    await expect(steering).rejects.toThrow("Steer was replaced by a newer message.");
    expect(manager.getThreadFollowUpQueue(session.threadId)).toMatchObject({
      items: [{ id: item.id, prompt: "queued fallback" }],
    });
  } finally {
    finish();
    await manager.dispose();
  }
});

it("waits direct input while a fallback start is awaiting canonical admission", async () => {
  const { manager, session, startTurn, finish } = createHarness();
  session.status = "working";
  delete session.structuredSession!.steerTurn;
  const fallbackCompletion = Promise.withResolvers<void>();
  startTurn.mockImplementationOnce(() => fallbackCompletion.promise);
  const steerCoordinator = (
    manager as unknown as {
      steerCoordinator: {
        maybeDrainPendingSteer(current: SessionRuntime): Promise<void> | undefined;
        noteSteerTurnStarted(current: SessionRuntime): void;
      };
    }
  ).steerCoordinator;
  try {
    await manager.queueThreadFollowUp({
      threadId: session.threadId,
      prompt: "queued fallback",
      config: session.config,
    });
    const item = manager.getThreadFollowUpQueue(session.threadId)!.items[0]!;
    const steering = manager.steerQueuedThreadFollowUp({ threadId: session.threadId, id: item.id });
    await vi.waitFor(() => expect(session.pendingSteer).toBeDefined());

    session.status = "idle";
    void steerCoordinator.maybeDrainPendingSteer(session);
    await vi.waitFor(() => expect(startTurn).toHaveBeenCalledTimes(1));

    const direct = manager.sendThreadInput({
      threadId: session.threadId,
      prompt: "direct after queued steer",
      config: session.config,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(startTurn).toHaveBeenCalledTimes(1);

    steerCoordinator.noteSteerTurnStarted(session);
    await steering;
    await direct;
    expect(startTurn).toHaveBeenCalledTimes(2);
  } finally {
    fallbackCompletion.resolve();
    finish();
    await manager.dispose();
  }
});

it("releases a direct barrier when a command completes without a canonical turn", async () => {
  const { manager, session, startTurn, finish } = createHarness();
  session.status = "error";
  try {
    await manager.queueThreadFollowUp({
      threadId: session.threadId,
      prompt: "next",
      config: session.config,
    });
    session.status = "idle";
    startTurn.mockResolvedValueOnce({ outcome: "completed-without-turn" } as never);

    await manager.sendThreadInput({
      threadId: session.threadId,
      prompt: "/goal pause",
      config: session.config,
    });
    await vi.waitFor(() => expect(startTurn).toHaveBeenCalledTimes(1));

    await manager.resumeThreadFollowUps(session.threadId);
    await vi.waitFor(() => expect(startTurn).toHaveBeenCalledTimes(2));
    expect(startTurn.mock.calls[1]?.[0]).toBe("next");
  } finally {
    finish();
    await manager.dispose();
  }
});

it("delivers a queued command that completes without a canonical turn before the next item", async () => {
  const { manager, session, startTurn, finish } = createHarness();
  session.status = "error";
  try {
    await manager.queueThreadFollowUp({
      threadId: session.threadId,
      prompt: "/goal pause",
      config: session.config,
    });
    await manager.queueThreadFollowUp({
      threadId: session.threadId,
      prompt: "next",
      config: session.config,
    });
    session.status = "idle";
    startTurn.mockResolvedValueOnce({ outcome: "completed-without-turn" } as never);

    await manager.resumeThreadFollowUps(session.threadId);
    await vi.waitFor(() => expect(startTurn).toHaveBeenCalledTimes(2));
    expect(startTurn.mock.calls[0]?.[0]).toBe("/goal pause");
    expect(startTurn.mock.calls[1]?.[0]).toBe("next");
  } finally {
    finish();
    await manager.dispose();
  }
});

it("settles and removes a queued steer only after forced restart admission", async () => {
  const { manager, session, finish } = createHarness();
  session.status = "working";
  delete session.structuredSession!.steerTurn;
  const restart = Promise.withResolvers<void>();
  const restartThread = vi.spyOn(
    (
      manager as unknown as {
        spawnPipeline: { restartThread: (...args: never[]) => Promise<void> };
      }
    ).spawnPipeline,
    "restartThread",
  );
  restartThread.mockReturnValueOnce(restart.promise);
  try {
    await manager.queueThreadFollowUp({
      threadId: session.threadId,
      prompt: "survive force stop",
      config: session.config,
    });
    const item = manager.getThreadFollowUpQueue(session.threadId)!.items[0]!;
    const steering = manager.steerQueuedThreadFollowUp({
      threadId: session.threadId,
      id: item.id,
    });
    const outcome = steering.then(
      () => "resolved",
      () => "rejected",
    );
    await vi.waitFor(() => expect(session.pendingSteer).toBeDefined());

    (
      manager as unknown as {
        completeForcedStructuredInterrupt(current: SessionRuntime): void;
      }
    ).completeForcedStructuredInterrupt(session);
    await vi.waitFor(() => expect(restartThread).toHaveBeenCalledTimes(1));
    expect(await Promise.race([outcome, Promise.resolve("pending")])).toBe("pending");
    expect(manager.getThreadFollowUpQueue(session.threadId)).toMatchObject({
      items: [{ id: item.id, prompt: "survive force stop" }],
    });

    restart.resolve();
    expect(await outcome).toBe("resolved");
    await steering;
    expect(manager.getThreadFollowUpQueue(session.threadId)).toBeNull();
  } finally {
    restart.resolve();
    restartThread.mockRestore();
    finish();
    await manager.dispose();
  }
});
