import { afterEach, describe, expect, it, vi } from "vitest";
import type { StructuredSessionHandle, StructuredSessionListener } from "@/supervisor/agents/base";
import {
  HostResourceAdmissionOwner,
  UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY,
} from "@/supervisor/runtime/hostResourceAdmission";
import { SubagentAttemptRunner, type AttemptExecutionState } from "./SubagentAttemptRunner";
import { runOneShotChild, type OneShotChildHandle } from "./oneShotChild";
import type { ResolvedSpawnAttempt } from "./spawnPlan";

vi.mock("@/supervisor/agents/base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/supervisor/agents/base")>()),
  resolveAgentProjectLocation: async (location: unknown) => location,
}));
vi.mock("./oneShotChild", () => ({ runOneShotChild: vi.fn<typeof runOneShotChild>() }));

const flush = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};

function observe(promise: Promise<void>) {
  let result = "pending";
  void promise.then(
    () => {
      result = "confirmed";
    },
    (error: unknown) => {
      result = String(error);
    },
  );
  return () => result;
}

function setup() {
  const owner = new HostResourceAdmissionOwner(() => UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY);
  const retired = vi.fn<(parentThreadId: string) => void>();
  const runner = new SubagentAttemptRunner(
    { getParentContext: () => undefined, appendRuntimeEvent: () => {} },
    owner,
    10,
    retired,
  );
  const state: AttemptExecutionState = {
    parentThreadId: "parent",
    childThreadId: "child-1",
    label: "Worker",
    plan: {
      prompt: "Work",
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
  let listener: StructuredSessionListener | undefined;
  const handle = {
    launchOptions: {},
    setListener: vi.fn<(value: StructuredSessionListener) => void>((value) => {
      listener = value;
    }),
    activate: vi.fn<() => Promise<void>>(async () => {}),
    openThread: vi.fn<() => Promise<string>>(async () => "worker-session"),
    startTurn: vi.fn<() => Promise<void>>(async () => {}),
    interruptTurn: vi.fn<() => Promise<void>>(async () => {}),
    dispose: vi.fn<() => Promise<void>>(async () => {}),
  } satisfies StructuredSessionHandle;
  const settled = vi.fn<(status: string, error?: string) => void>();
  const callbacks = {
    isActive: () => !state.cancelRequested,
    onWorking: vi.fn<() => void>(),
    onRuntimeEvent: vi.fn<() => void>(),
    onSettle: settled,
  };
  const attempt: ResolvedSpawnAttempt = {
    adapter: {
      createStructuredSession: vi.fn<() => Promise<StructuredSessionHandle>>(async () => handle),
    } as unknown as ResolvedSpawnAttempt["adapter"],
    config: { model: "worker-model" },
    provider: "worker",
    model: "worker-model",
    label: "Worker",
    execution: "structured",
  };
  return {
    owner,
    runner,
    state,
    handle,
    retired,
    callbacks,
    attempt,
    close: () => listener?.onClose(),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("SubagentAttemptRunner eventual retirement", () => {
  it.each(["create", "activate", "openThread"] as const)(
    "bounds the whole %s join and keeps a single retryable late-acquisition cleanup",
    async (phase) => {
      vi.useFakeTimers();
      const h = setup();
      const gate = Promise.withResolvers<void>();
      let acquired = false;
      if (phase === "create") {
        h.attempt.adapter.createStructuredSession = vi.fn<() => Promise<StructuredSessionHandle>>(
          async () => {
            await gate.promise;
            acquired = true;
            return h.handle;
          },
        );
      } else if (phase === "activate") {
        h.handle.activate.mockImplementation(async () => {
          await gate.promise;
          acquired = true;
        });
      } else {
        h.handle.openThread.mockImplementation(async () => {
          await gate.promise;
          acquired = true;
          return "worker-session";
        });
      }
      h.handle.dispose.mockImplementation(async () => {
        acquired = false;
      });
      h.runner.run(h.state, 0, h.attempt, h.callbacks);
      await flush();
      h.state.cancelRequested = true;
      const first = observe(h.runner.teardown(h.state));
      // Shutdown retry must enumerate custody even before the first join times out.
      const retry = observe(h.runner.retryRetirements());
      try {
        await vi.advanceTimersByTimeAsync(10);
        expect(first()).toContain("did not confirm");
        expect(retry()).toContain("did not confirm");
        expect(h.owner.usage().total).toBe(1);
        expect(h.handle.dispose).not.toHaveBeenCalled();
        const second = observe(h.runner.retryRetirements());
        await vi.advanceTimersByTimeAsync(10);
        expect(second()).toContain("did not confirm");
        gate.resolve();
        await flush();
        expect(h.handle.dispose).toHaveBeenCalledOnce();
        expect(h.handle.startTurn).not.toHaveBeenCalled();
        expect(acquired).toBe(false);
        expect(h.owner.usage().total).toBe(0);
        expect(h.runner.hasLiveResources(h.state)).toBe(false);
        expect(h.retired).toHaveBeenCalledExactlyOnceWith("parent");
        await h.runner.retryRetirements();
        expect(h.handle.dispose).toHaveBeenCalledOnce();
      } finally {
        gate.resolve();
        await flush();
      }
    },
  );

  it("bounds a held interrupt before real disposal without cancelling or duplicating it", async () => {
    vi.useFakeTimers();
    const h = setup();
    const interrupt = Promise.withResolvers<void>();
    const disposal = Promise.withResolvers<void>();
    h.handle.interruptTurn.mockImplementation(() => interrupt.promise);
    h.handle.dispose.mockImplementation(() => disposal.promise);
    h.runner.run(h.state, 0, h.attempt, h.callbacks);
    await flush();
    h.state.cancelRequested = true;
    const join = observe(h.runner.teardown(h.state));
    try {
      await vi.advanceTimersByTimeAsync(10);
      expect(join()).toContain("did not confirm");
      await flush();
      expect(h.handle.dispose).toHaveBeenCalledOnce();
      expect(h.owner.usage().total).toBe(1);
      expect(h.retired).not.toHaveBeenCalled();
      disposal.resolve();
      await flush();
      expect(h.owner.usage().total).toBe(0);
      expect(h.retired).toHaveBeenCalledExactlyOnceWith("parent");
      interrupt.resolve();
      await flush();
      await h.runner.retryRetirements();
      expect(h.handle.interruptTurn).toHaveBeenCalledOnce();
      expect(h.handle.dispose).toHaveBeenCalledOnce();
    } finally {
      interrupt.resolve();
      disposal.resolve();
      await flush();
    }
  });

  it("releases a late one-shot close without a retry after logical cancellation", async () => {
    vi.useFakeTimers();
    const h = setup();
    const closed = Promise.withResolvers<void>();
    const oneShot: OneShotChildHandle = { cancel: vi.fn<() => void>(), closed: closed.promise };
    vi.mocked(runOneShotChild).mockResolvedValueOnce(oneShot);
    h.runner.run(h.state, 0, { ...h.attempt, execution: "one-shot" }, h.callbacks);
    await flush();
    h.state.cancelRequested = true;
    const join = observe(h.runner.teardown(h.state));
    await vi.advanceTimersByTimeAsync(10);
    expect(join()).toContain("did not confirm");
    expect(h.owner.usage().total).toBe(1);
    closed.resolve();
    await flush();
    expect(h.state.oneShot).toBeUndefined();
    expect(h.owner.usage().total).toBe(0);
    expect(h.runner.hasLiveResources(h.state)).toBe(false);
    expect(h.retired).toHaveBeenCalledExactlyOnceWith("parent");
    await h.runner.retryRetirements();
    expect(oneShot.cancel).toHaveBeenCalledOnce();
  });

  it("uses one elapsed deadline across interrupt, held startup and disposal", async () => {
    vi.useFakeTimers();
    const h = setup();
    const interrupt = Promise.withResolvers<void>();
    const startup = Promise.withResolvers<void>();
    const disposal = Promise.withResolvers<void>();
    h.handle.activate.mockImplementation(() => startup.promise);
    h.handle.interruptTurn.mockImplementation(() => interrupt.promise);
    h.handle.dispose.mockImplementation(() => disposal.promise);
    h.runner.run(h.state, 0, h.attempt, h.callbacks);
    await flush();
    h.state.cancelRequested = true;
    const join = observe(h.runner.teardown(h.state));
    try {
      await vi.advanceTimersByTimeAsync(6);
      expect(join()).toBe("pending");
      // Wall-clock correction must not extend the elapsed cleanup budget.
      vi.setSystemTime(Date.now() - 1_000);
      interrupt.resolve();
      await flush();
      expect(h.handle.dispose).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2);
      startup.resolve();
      await flush();
      expect(h.handle.dispose).toHaveBeenCalledOnce();
      expect(join()).toBe("pending");
      await vi.advanceTimersByTimeAsync(2);
      expect(join()).toContain("did not confirm");
      expect(h.owner.usage().total).toBe(1);
      disposal.resolve();
      await flush();
      expect(h.owner.usage().total).toBe(0);
      expect(h.retired).toHaveBeenCalledExactlyOnceWith("parent");
      expect(h.handle.startTurn).not.toHaveBeenCalled();
    } finally {
      interrupt.resolve();
      startup.resolve();
      disposal.resolve();
      await flush();
    }
  });

  it.each(["dispose", "close"] as const)(
    "notifies once for late structured %s confirmation",
    async (proof) => {
      vi.useFakeTimers();
      const h = setup();
      const disposed = Promise.withResolvers<void>();
      h.handle.dispose.mockImplementation(() => disposed.promise);
      h.runner.run(h.state, 0, h.attempt, h.callbacks);
      await flush();
      h.state.cancelRequested = true;
      const join = observe(h.runner.teardown(h.state));
      await vi.advanceTimersByTimeAsync(10);
      expect(join()).toContain("did not confirm");
      expect(h.retired).not.toHaveBeenCalled();
      if (proof === "close") h.close();
      else disposed.resolve();
      await flush();
      expect(h.owner.usage().total).toBe(0);
      expect(h.runner.hasLiveResources(h.state)).toBe(false);
      expect(h.retired).toHaveBeenCalledExactlyOnceWith("parent");
      h.close();
      disposed.resolve();
      await flush();
      expect(h.retired).toHaveBeenCalledOnce();
      expect(h.handle.dispose).toHaveBeenCalledOnce();
    },
  );

  it.each(["create", "activate", "openThread"] as const)(
    "retires safely after late %s rejection",
    async (phase) => {
      vi.useFakeTimers();
      const h = setup();
      const gate = Promise.withResolvers<never>();
      if (phase === "create")
        h.attempt.adapter.createStructuredSession = vi.fn<() => Promise<StructuredSessionHandle>>(
          () => gate.promise,
        );
      else h.handle[phase].mockImplementation(() => gate.promise);
      h.runner.run(h.state, 0, h.attempt, h.callbacks);
      await flush();
      const lease = h.state.resourceLease!;
      const cancel = vi.spyOn(lease, "cancel");
      const exit = vi.spyOn(lease, "confirmExit");
      h.state.cancelRequested = true;
      const join = observe(h.runner.teardown(h.state));
      await vi.advanceTimersByTimeAsync(10);
      expect(join()).toContain("did not confirm");
      gate.reject(new Error("late acquisition rejected"));
      await flush();
      expect(h.owner.usage().total).toBe(0);
      expect(h.handle.dispose).toHaveBeenCalledTimes(phase === "create" ? 0 : 1);
      expect(cancel).toHaveBeenCalledTimes(phase === "create" ? 1 : 0);
      expect(exit).toHaveBeenCalledTimes(phase === "create" ? 0 : 1);
      expect(h.callbacks.onSettle).not.toHaveBeenCalled();
      expect(h.retired).toHaveBeenCalledExactlyOnceWith("parent");
      await h.runner.retryRetirements();
    },
  );

  it("keeps late one-shot acquisition fenced and observes its eventual exit", async () => {
    vi.useFakeTimers();
    const h = setup();
    const acquisition = Promise.withResolvers<OneShotChildHandle>();
    const closed = Promise.withResolvers<void>();
    const oneShot: OneShotChildHandle = { cancel: vi.fn<() => void>(), closed: closed.promise };
    vi.mocked(runOneShotChild).mockReturnValueOnce(acquisition.promise);
    h.runner.run(h.state, 0, { ...h.attempt, execution: "one-shot" }, h.callbacks);
    await flush();
    h.state.cancelRequested = true;
    const join = observe(h.runner.teardown(h.state));
    const retry = observe(h.runner.retryRetirements());
    await vi.advanceTimersByTimeAsync(10);
    expect(join()).toContain("did not confirm");
    expect(retry()).toContain("did not confirm");
    expect(h.owner.usage().total).toBe(1);
    expect(oneShot.cancel).not.toHaveBeenCalled();
    acquisition.resolve(oneShot);
    await flush();
    expect(oneShot.cancel).toHaveBeenCalledOnce();
    expect(h.owner.usage().total).toBe(1);
    const options = vi.mocked(runOneShotChild).mock.calls[0]![0];
    options.onTextDelta("late ignored output");
    options.onSettle({ status: "completed" });
    expect(h.callbacks.onRuntimeEvent).not.toHaveBeenCalled();
    expect(h.callbacks.onSettle).not.toHaveBeenCalled();
    closed.resolve();
    await flush();
    expect(h.owner.usage().total).toBe(0);
    expect(h.state.oneShot).toBeUndefined();
    expect(h.retired).toHaveBeenCalledExactlyOnceWith("parent");
  });

  it("does not use a close during held startup as proof against later acquisition", async () => {
    vi.useFakeTimers();
    const h = setup();
    const startup = Promise.withResolvers<void>();
    const interrupt = Promise.withResolvers<void>();
    let acquired = false;
    h.handle.activate.mockImplementation(async () => {
      await startup.promise;
      acquired = true;
    });
    h.handle.interruptTurn.mockImplementation(() => interrupt.promise);
    h.handle.dispose.mockImplementation(async () => {
      acquired = false;
    });
    h.runner.run(h.state, 0, h.attempt, h.callbacks);
    await flush();
    h.state.cancelRequested = true;
    const join = observe(h.runner.teardown(h.state));
    await vi.advanceTimersByTimeAsync(10);
    expect(join()).toContain("did not confirm");
    h.close();
    expect(h.owner.usage().total).toBe(1);
    expect(h.retired).not.toHaveBeenCalled();
    expect(h.handle.dispose).not.toHaveBeenCalled();
    startup.resolve();
    await flush();
    expect(h.handle.dispose).toHaveBeenCalledOnce();
    expect(acquired).toBe(false);
    expect(h.owner.usage().total).toBe(0);
    expect(h.retired).toHaveBeenCalledExactlyOnceWith("parent");
    interrupt.resolve();
    await flush();
    expect(h.handle.interruptTurn).toHaveBeenCalledOnce();
  });

  it("isolates a late one-shot observer from a successor handle, lease and disposal", async () => {
    vi.useFakeTimers();
    const h = setup();
    const closed = Promise.withResolvers<void>();
    vi.mocked(runOneShotChild).mockResolvedValueOnce({
      cancel: vi.fn<() => void>(),
      closed: closed.promise,
    });
    h.runner.run(h.state, 0, { ...h.attempt, execution: "one-shot" }, h.callbacks);
    await flush();
    const oldLease = h.state.resourceLease!;
    const oldExit = vi.spyOn(oldLease, "confirmExit");
    h.state.cancelRequested = true;
    observe(h.runner.teardown(h.state));
    await vi.advanceTimersByTimeAsync(10);

    h.state.parentThreadId = "successor-parent";
    h.state.childThreadId = "child-2";
    h.state.cancelRequested = false;
    h.state.oneShot = undefined;
    const disposal = Promise.withResolvers<void>();
    h.handle.dispose.mockImplementation(() => disposal.promise);
    h.runner.run(h.state, 1, h.attempt, h.callbacks);
    await flush();
    const successorLease = h.state.resourceLease!;
    const successorExit = vi.spyOn(successorLease, "confirmExit");
    h.state.cancelRequested = true;
    observe(h.runner.teardown(h.state));
    await vi.advanceTimersByTimeAsync(10);
    const successorDisposal = h.state.pendingDisposal;
    closed.resolve();
    await flush();
    expect(oldExit).toHaveBeenCalledOnce();
    expect(successorExit).not.toHaveBeenCalled();
    expect(successorLease.state).toBe("retiring");
    expect(h.state.handle).toBe(h.handle);
    expect(h.state.pendingDisposal).toBe(successorDisposal);
    expect(h.owner.usage().total).toBe(1);
    expect(h.retired).toHaveBeenCalledExactlyOnceWith("parent");
    disposal.resolve();
    await flush();
    expect(successorExit).toHaveBeenCalledOnce();
    expect(h.retired.mock.calls).toEqual([["parent"], ["successor-parent"]]);
    expect(h.owner.usage().total).toBe(0);
  });

  it("isolates stale structured close, disposal and turn observers even when the child key is reused", async () => {
    vi.useFakeTimers();
    const h = setup();
    const oldTurn = Promise.withResolvers<void>();
    const oldDisposal = Promise.withResolvers<void>();
    h.handle.startTurn.mockImplementation(() => oldTurn.promise);
    h.handle.dispose.mockImplementation(() => oldDisposal.promise);
    h.runner.run(h.state, 0, h.attempt, h.callbacks);
    await flush();
    const oldListener = h.handle.setListener.mock.calls[0]![0];
    const oldLease = h.state.resourceLease!;
    const oldExit = vi.spyOn(oldLease, "confirmExit");
    h.state.cancelRequested = true;
    observe(h.runner.teardown(h.state));
    await vi.advanceTimersByTimeAsync(10);
    oldListener.onClose();
    expect(oldExit).toHaveBeenCalledOnce();

    h.state.cancelRequested = false;
    h.state.steerReady = false;
    const successorTurn = Promise.withResolvers<void>();
    const successorDisposal = Promise.withResolvers<void>();
    const successor = {
      ...h.handle,
      startTurn: vi.fn<() => Promise<void>>(() => successorTurn.promise),
      dispose: vi.fn<() => Promise<void>>(() => successorDisposal.promise),
    };
    const attempt = {
      ...h.attempt,
      adapter: {
        createStructuredSession: async () => successor,
      } as unknown as ResolvedSpawnAttempt["adapter"],
    };
    h.runner.run(h.state, 1, attempt, h.callbacks);
    await flush();
    const successorLease = h.state.resourceLease!;
    const successorExit = vi.spyOn(successorLease, "confirmExit");
    oldTurn.resolve();
    oldListener.onUpdate({
      status: "idle",
      attention: "none",
      sessionRef: { providerSessionId: "old", discoveredAt: "old" },
    });
    oldListener.onRuntimeEvent?.({
      type: "content.delta",
      threadId: "child-1",
      itemId: "old",
      stream: "assistant_text",
      delta: "stale",
    });
    await flush();
    expect(h.state.steerReady).toBe(false);
    expect(h.state.sessionRef?.providerSessionId).not.toBe("old");
    expect(h.callbacks.onSettle).not.toHaveBeenCalled();
    expect(h.callbacks.onRuntimeEvent).not.toHaveBeenCalled();
    h.state.cancelRequested = true;
    observe(h.runner.teardown(h.state));
    await vi.advanceTimersByTimeAsync(10);
    const pending = h.state.pendingDisposal;
    oldDisposal.resolve();
    oldListener.onClose();
    await flush();
    expect(oldExit).toHaveBeenCalledOnce();
    expect(successorExit).not.toHaveBeenCalled();
    expect(h.state.handle).toBe(successor);
    expect(h.state.pendingDisposal).toBe(pending);
    expect(h.owner.usage().total).toBe(1);
    expect(h.retired).toHaveBeenCalledOnce();
    const retry = h.runner.retryRetirements();
    successorDisposal.resolve();
    successorTurn.resolve();
    await retry;
    expect(successorExit).toHaveBeenCalledOnce();
    expect(h.owner.usage().total).toBe(0);
    expect(h.retired).toHaveBeenCalledTimes(2);
  });
});
