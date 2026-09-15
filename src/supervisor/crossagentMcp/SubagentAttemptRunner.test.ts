import { describe, expect, it, vi } from "vitest";
import type { AgentAdapter, StructuredSessionHandle } from "@/supervisor/agents/base";
import { SubagentAttemptRunner, type AttemptExecutionState } from "./SubagentAttemptRunner";
import type { ResolvedSpawnAttempt } from "./spawnPlan";

vi.mock("@/supervisor/agents/base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/supervisor/agents/base")>()),
  resolveAgentProjectLocation: async (_adapter: unknown, location: unknown) => location,
}));

function setup() {
  const runner = new SubagentAttemptRunner({
    getParentContext: () => undefined,
    appendRuntimeEvent: () => {},
  });
  const state: AttemptExecutionState = {
    parentThreadId: "parent",
    childThreadId: "child",
    label: "Worker",
    plan: {
      prompt: "Review parsing",
      projectLocation: { kind: "posix", path: "/tmp/project" },
      background: false,
      retryMode: "startup",
      attempts: [],
    },
    handle: undefined,
    oneShot: undefined,
    cancelRequested: false,
    turnStarted: false,
    turnDispatched: false,
    steerReady: false,
  };
  const handle = {
    launchOptions: {},
    setListener: vi.fn<() => void>(),
    interruptTurn: vi.fn<() => Promise<void>>(async () => {}),
    dispose: vi.fn<() => Promise<void>>(async () => {}),
    startTurn: vi.fn<() => Promise<void>>(async () => {}),
  } satisfies StructuredSessionHandle;
  const start = (createStructuredSession: () => Promise<StructuredSessionHandle>) => {
    const attempt: ResolvedSpawnAttempt = {
      adapter: { createStructuredSession } as unknown as AgentAdapter,
      config: { model: "worker-model" },
      provider: "worker",
      model: "worker-model",
      label: "Worker",
      execution: "structured",
    };
    runner.run(state, 0, attempt, {
      isActive: () => !state.cancelRequested,
      onWorking: vi.fn<() => void>(),
      onRuntimeEvent: vi.fn<() => void>(),
      onSettle: vi.fn<() => void>(),
    });
  };
  return { runner, state, handle, start };
}

describe("SubagentAttemptRunner teardown", () => {
  it("shares concurrent and synchronous reentrant teardown until disposal completes", async () => {
    const { runner, state, handle } = setup();
    const disposed = Promise.withResolvers<void>();
    let reentrant: Promise<void> | undefined;
    handle.interruptTurn.mockImplementation(async () => {
      reentrant = runner.teardown(state);
    });
    handle.dispose.mockImplementation(() => disposed.promise);
    state.handle = handle;
    const pending = runner.teardown(state);
    expect(runner.teardown(state)).toBe(pending);
    expect(handle.interruptTurn).not.toHaveBeenCalled();
    let finished = false;
    void pending.then(() => {
      finished = true;
    });
    await vi.waitFor(() => expect(handle.dispose).toHaveBeenCalledOnce());
    expect(reentrant).toBe(pending);
    expect(finished).toBe(false);
    expect(state.handle).toBe(handle);
    disposed.resolve();
    await pending;
    expect(state.handle).toBeUndefined();
    expect(runner.hasLiveResources(state)).toBe(false);
    expect(handle.interruptTurn).toHaveBeenCalledOnce();
  });

  it("retains a failed disposal for retry and tolerates interrupt failure when disposal succeeds", async () => {
    const { runner, state, handle } = setup();
    state.handle = handle;
    handle.interruptTurn.mockRejectedValue(new Error("No active turn"));
    handle.dispose.mockRejectedValueOnce(new Error("Process still running"));
    await expect(runner.teardown(state)).rejects.toThrow("Process still running");
    expect(state.handle).toBe(handle);
    expect(runner.hasLiveResources(state)).toBe(true);
    await runner.teardown(state);
    expect(state.handle).toBeUndefined();
    expect(runner.hasLiveResources(state)).toBe(false);
    expect(handle.dispose).toHaveBeenCalledTimes(2);
  });

  it("waits for a cancelled one-shot process to close before releasing its handle", async () => {
    const { runner, state } = setup();
    const closed = Promise.withResolvers<void>();
    const oneShot = { cancel: vi.fn<() => void>(), closed: closed.promise };
    state.oneShot = oneShot;
    const pending = runner.teardown(state);
    expect(runner.teardown(state)).toBe(pending);
    await vi.waitFor(() => expect(oneShot.cancel).toHaveBeenCalledOnce());
    expect(state.oneShot).toBe(oneShot);
    expect(runner.hasLiveResources(state)).toBe(true);
    closed.resolve();
    await pending;
    expect(state.oneShot).toBeUndefined();
    expect(runner.hasLiveResources(state)).toBe(false);
  });

  it("waits for pending creation and disposes the late handle without dispatching a turn", async () => {
    const { runner, state, handle, start } = setup();
    const creation = Promise.withResolvers<StructuredSessionHandle>();
    const disposed = Promise.withResolvers<void>();
    handle.dispose.mockImplementation(() => disposed.promise);
    const createStructuredSession = vi.fn<() => Promise<StructuredSessionHandle>>(
      () => creation.promise,
    );
    start(createStructuredSession);
    await vi.waitFor(() => expect(createStructuredSession).toHaveBeenCalledOnce());
    expect(state.handle).toBeUndefined();
    expect(runner.hasLiveResources(state)).toBe(true);
    state.cancelRequested = true;
    let finished = false;
    const pending = runner.teardown(state);
    void pending.then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    creation.resolve(handle);
    await vi.waitFor(() => expect(handle.dispose).toHaveBeenCalledOnce());
    expect(finished).toBe(false);
    expect(handle.startTurn).not.toHaveBeenCalled();
    expect(handle.setListener).not.toHaveBeenCalled();
    disposed.resolve();
    await pending;
    expect(state.handle).toBeUndefined();
    expect(runner.hasLiveResources(state)).toBe(false);
  });

  it.each(["activate", "openThread"] as const)(
    "waits for %s to acquire its resource before final disposal",
    async (phase) => {
      const { runner, state, handle, start } = setup();
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      let resourceAcquired = false;
      const acquire = async () => {
        entered.resolve();
        await release.promise;
        resourceAcquired = true;
      };
      const session: StructuredSessionHandle = {
        ...handle,
        activate: async () => {
          if (phase === "activate") await acquire();
        },
        openThread: async () => {
          if (phase === "openThread") await acquire();
          return "worker-session";
        },
      };
      handle.dispose.mockImplementation(async () => {
        resourceAcquired = false;
      });
      start(async () => session);
      await entered.promise;
      state.cancelRequested = true;
      const pending = runner.teardown(state);
      await vi.waitFor(() => expect(handle.interruptTurn).toHaveBeenCalledOnce());
      expect(handle.dispose).not.toHaveBeenCalled();
      expect(runner.hasLiveResources(state)).toBe(true);
      release.resolve();
      await pending;
      expect(handle.dispose).toHaveBeenCalledOnce();
      expect(handle.startTurn).not.toHaveBeenCalled();
      expect(resourceAcquired).toBe(false);
      expect(state.handle).toBeUndefined();
      expect(runner.hasLiveResources(state)).toBe(false);
    },
  );

  it("does not wait for the turn lifetime before disposal", async () => {
    const { runner, state, handle, start } = setup();
    const turn = Promise.withResolvers<void>();
    handle.startTurn.mockImplementation(() => turn.promise);
    start(async () => handle);
    await vi.waitFor(() => expect(handle.startTurn).toHaveBeenCalledOnce());
    state.cancelRequested = true;
    await runner.teardown(state);
    expect(handle.dispose).toHaveBeenCalledOnce();
    expect(runner.hasLiveResources(state)).toBe(false);
    turn.resolve();
  });

  it("counts a pending teardown even without a handle", async () => {
    const { runner, state } = setup();
    expect(runner.hasLiveResources(state)).toBe(false);
    const pending = runner.teardown(state);
    expect(runner.hasLiveResources(state)).toBe(true);
    await pending;
    expect(runner.hasLiveResources(state)).toBe(false);
  });
});
