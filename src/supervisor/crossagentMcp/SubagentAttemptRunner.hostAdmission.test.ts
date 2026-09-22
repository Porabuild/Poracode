import { describe, expect, it, vi } from "vitest";
import type { StructuredSessionHandle, StructuredSessionListener } from "@/supervisor/agents/base";
import {
  HostResourceAdmissionOwner,
  type HostResourceAdmissionPolicy,
} from "@/supervisor/runtime/hostResourceAdmission";
import { SubagentAttemptRunner, type AttemptExecutionState } from "./SubagentAttemptRunner";
import type { ResolvedSpawnAttempt } from "./spawnPlan";

vi.mock("@/supervisor/agents/base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/supervisor/agents/base")>()),
  resolveAgentProjectLocation: async (location: unknown) => location,
}));

vi.mock("./oneShotChild", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./oneShotChild")>()),
  runOneShotChild: vi.fn<() => Promise<OneShotChildHandle>>(),
}));

import { runOneShotChild, type OneShotChildHandle } from "./oneShotChild";

function policy(overrides: Partial<HostResourceAdmissionPolicy> = {}): HostResourceAdmissionPolicy {
  return {
    maxActiveAgentSessions: 0,
    maxActiveTerminalShells: 0,
    maxActiveGenerationHelpers: 0,
    overloadRetryAfterMs: 1_000,
    ...overrides,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeState(childThreadId: string): AttemptExecutionState {
  return {
    parentThreadId: "parent",
    childThreadId,
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
}

function structuredAttempt(handle: StructuredSessionHandle): ResolvedSpawnAttempt {
  return {
    adapter: {
      createStructuredSession: async () => handle,
    } as unknown as ResolvedSpawnAttempt["adapter"],
    config: { model: "worker-model" },
    provider: "worker",
    model: "worker-model",
    label: "Worker",
    execution: "structured",
  };
}

function oneShotAttempt(): ResolvedSpawnAttempt {
  return {
    adapter: {
      buildSubagentOneShotCommand: () => undefined,
    } as unknown as ResolvedSpawnAttempt["adapter"],
    config: { model: "worker-model" },
    provider: "worker",
    model: "worker-model",
    label: "Worker",
    execution: "one-shot",
  };
}

type FakeHandle = StructuredSessionHandle & { listener: StructuredSessionListener | undefined };

function makeHandle(): FakeHandle {
  const handle = {
    launchOptions: {},
    listener: undefined as StructuredSessionListener | undefined,
    setListener: (listener: StructuredSessionListener) => {
      handle.listener = listener;
    },
    activate: vi.fn<NonNullable<StructuredSessionHandle["activate"]>>(async () => undefined),
    openThread: vi.fn<NonNullable<StructuredSessionHandle["openThread"]>>(
      async () => "child-session",
    ),
    startTurn: vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(async () => undefined),
    interruptTurn: vi.fn<NonNullable<StructuredSessionHandle["interruptTurn"]>>(
      async () => undefined,
    ),
    dispose: vi.fn<StructuredSessionHandle["dispose"]>(async () => undefined),
  };
  return handle as unknown as FakeHandle;
}

describe("SubagentAttemptRunner host admission", () => {
  it("holds a structured child's slot and refuses a concurrent child promptly", async () => {
    const owner = new HostResourceAdmissionOwner(() => policy({ maxActiveAgentSessions: 1 }));
    const runner = new SubagentAttemptRunner(
      { getParentContext: () => undefined, appendRuntimeEvent: () => {} },
      owner,
    );
    const first = makeState("child-1");
    const started = deferred<void>();
    const handle = makeHandle();
    vi.mocked(handle.startTurn!).mockImplementation(() => started.promise);
    const firstSettle = vi.fn<() => void>();
    runner.run(first, 0, structuredAttempt(handle), {
      isActive: () => !first.cancelRequested,
      onWorking: vi.fn<() => void>(),
      onRuntimeEvent: vi.fn<() => void>(),
      onSettle: firstSettle,
    });
    await vi.waitFor(() => expect(handle.startTurn).toHaveBeenCalledOnce());
    expect(owner.usage()).toMatchObject({
      agentSessions: { active: 1, pending: 0, retiring: 0 },
      total: 1,
    });

    const second = makeState("child-2");
    const secondSettle = vi.fn<(status: string, message?: string) => void>();
    runner.run(second, 0, structuredAttempt(makeHandle()), {
      isActive: () => true,
      onWorking: vi.fn<() => void>(),
      onRuntimeEvent: vi.fn<() => void>(),
      onSettle: (status, message) => secondSettle(status, message),
    });
    await vi.waitFor(() => expect(secondSettle).toHaveBeenCalled());
    expect(secondSettle.mock.calls[0]?.[0]).toBe("failed");
    expect(secondSettle.mock.calls[0]?.[1]).toContain("capacity is full");
    expect(owner.usage().refusals).toBe(1);
    expect(owner.usage().total).toBe(1);

    started.resolve();
    await runner.teardown(first);
    expect(owner.usage().total).toBe(0);
  });

  it("releases a one-shot child's slot only after its process closed", async () => {
    const owner = new HostResourceAdmissionOwner(() => policy({ maxActiveAgentSessions: 1 }));
    const runner = new SubagentAttemptRunner(
      { getParentContext: () => undefined, appendRuntimeEvent: () => {} },
      owner,
    );
    const closed = deferred<void>();
    const cancel = vi.fn<() => void>();
    vi.mocked(runOneShotChild).mockResolvedValueOnce({ closed: closed.promise, cancel });
    const state = makeState("child-oneshot");
    runner.run(state, 0, oneShotAttempt(), {
      isActive: () => !state.cancelRequested,
      onWorking: vi.fn<() => void>(),
      onRuntimeEvent: vi.fn<() => void>(),
      onSettle: vi.fn<() => void>(),
    });
    await vi.waitFor(() => expect(runOneShotChild).toHaveBeenCalledOnce());
    expect(owner.usage()).toMatchObject({ total: 1, agentSessions: { active: 1 } });

    const pending = runner.teardown(state);
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    // A cancelled child is not a retired child: the slot stays until exit.
    expect(owner.usage().total).toBe(1);
    closed.resolve();
    await pending;
    expect(owner.usage().total).toBe(0);
  });

  it("releases a refused child attempt without spawning anything", async () => {
    const owner = new HostResourceAdmissionOwner(() => policy({ maxActiveAgentSessions: 1 }));
    const runner = new SubagentAttemptRunner(
      { getParentContext: () => undefined, appendRuntimeEvent: () => {} },
      owner,
    );
    const held = makeState("child-held");
    const handle = makeHandle();
    const turn = deferred<void>();
    vi.mocked(handle.startTurn!).mockImplementation(() => turn.promise);
    runner.run(held, 0, structuredAttempt(handle), {
      isActive: () => true,
      onWorking: vi.fn<() => void>(),
      onRuntimeEvent: vi.fn<() => void>(),
      onSettle: vi.fn<() => void>(),
    });
    await vi.waitFor(() => expect(handle.startTurn).toHaveBeenCalledOnce());
    vi.mocked(runOneShotChild).mockClear();

    const refused = makeState("child-refused");
    const onSettle = vi.fn<(status: string, message?: string) => void>();
    runner.run(refused, 0, oneShotAttempt(), {
      isActive: () => true,
      onWorking: vi.fn<() => void>(),
      onRuntimeEvent: vi.fn<() => void>(),
      onSettle: (status, message) => onSettle(status, message),
    });
    await vi.waitFor(() => expect(onSettle).toHaveBeenCalled());
    expect(onSettle.mock.calls[0]?.[0]).toBe("failed");
    expect(onSettle.mock.calls[0]?.[1]).toContain("capacity is full");
    expect(runOneShotChild).not.toHaveBeenCalled();
    expect(refused.resourceLease).toBeUndefined();
    expect(owner.usage().total).toBe(1);

    turn.resolve();
    await runner.teardown(held);
    expect(owner.usage().total).toBe(0);
  });

  it("cancels a pending admission when its handle never materializes", async () => {
    const owner = new HostResourceAdmissionOwner(() => policy({ maxActiveAgentSessions: 1 }));
    const runner = new SubagentAttemptRunner(
      { getParentContext: () => undefined, appendRuntimeEvent: () => {} },
      owner,
    );
    const state = makeState("child-pending");
    const creation = deferred<StructuredSessionHandle | undefined>();
    const adapter = {
      createStructuredSession: () => creation.promise,
    } as unknown as ResolvedSpawnAttempt["adapter"];
    runner.run(
      state,
      0,
      { ...structuredAttempt(makeHandle()), adapter },
      {
        isActive: () => true,
        onWorking: vi.fn<() => void>(),
        onRuntimeEvent: vi.fn<() => void>(),
        onSettle: vi.fn<() => void>(),
      },
    );
    await vi.waitFor(() => expect(owner.usage().total).toBe(1));
    const pending = runner.teardown(state);
    creation.resolve(undefined);
    await pending;
    expect(owner.usage().total).toBe(0);
  });

  it("releases a structured child's slot on transport close", async () => {
    const owner = new HostResourceAdmissionOwner(() => policy({ maxActiveAgentSessions: 1 }));
    const runner = new SubagentAttemptRunner(
      { getParentContext: () => undefined, appendRuntimeEvent: () => {} },
      owner,
    );
    const state = makeState("child-close");
    const handle = makeHandle();
    runner.run(state, 0, structuredAttempt(handle), {
      isActive: () => !state.cancelRequested,
      onWorking: vi.fn<() => void>(),
      onRuntimeEvent: vi.fn<() => void>(),
      onSettle: vi.fn<() => void>(),
    });
    await vi.waitFor(() => expect(state.resourceLease?.state).toBe("active"));
    handle.listener?.onClose();
    expect(owner.usage().total).toBe(0);
    await runner.teardown(state);
  });

  it("retains a rejected structured disposal and releases when the retry confirms", async () => {
    const owner = new HostResourceAdmissionOwner(() => policy({ maxActiveAgentSessions: 1 }));
    const runner = new SubagentAttemptRunner(
      { getParentContext: () => undefined, appendRuntimeEvent: () => {} },
      owner,
      25,
    );
    const state = makeState("child-retry");
    const handle = makeHandle();
    let disposeFails = true;
    vi.mocked(handle.dispose!).mockImplementation(() =>
      disposeFails ? Promise.reject(new Error("dispose rejected")) : Promise.resolve(),
    );
    runner.run(state, 0, structuredAttempt(handle), {
      isActive: () => !state.cancelRequested,
      onWorking: vi.fn<() => void>(),
      onRuntimeEvent: vi.fn<() => void>(),
      onSettle: vi.fn<() => void>(),
    });
    await vi.waitFor(() => expect(state.resourceLease?.state).toBe("active"));

    await expect(runner.teardown(state)).rejects.toThrow("dispose rejected");
    expect(owner.usage().total).toBe(1);
    expect(state.handle).toBe(handle);

    // A later retry joins the retained handle and releases exactly once.
    disposeFails = false;
    await runner.retryRetirements();
    expect(owner.usage().total).toBe(0);
    expect(state.handle).toBeUndefined();
  });

  it("bounds a hanging disposal, holds capacity, and releases on later completion", async () => {
    const owner = new HostResourceAdmissionOwner(() => policy({ maxActiveAgentSessions: 1 }));
    const runner = new SubagentAttemptRunner(
      { getParentContext: () => undefined, appendRuntimeEvent: () => {} },
      owner,
      20,
    );
    const state = makeState("child-hanging");
    const handle = makeHandle();
    const disposal = deferred<void>();
    vi.mocked(handle.dispose!).mockImplementation(() => disposal.promise);
    runner.run(state, 0, structuredAttempt(handle), {
      isActive: () => !state.cancelRequested,
      onWorking: vi.fn<() => void>(),
      onRuntimeEvent: vi.fn<() => void>(),
      onSettle: vi.fn<() => void>(),
    });
    await vi.waitFor(() => expect(state.resourceLease?.state).toBe("active"));

    await expect(runner.teardown(state)).rejects.toThrow("did not confirm");
    expect(owner.usage().total).toBe(1);

    // The operation was never cancelled: its completion releases the slot.
    disposal.resolve();
    await vi.waitFor(() => expect(owner.usage().total).toBe(0));
    expect(state.handle).toBeUndefined();
  });

  it("drops retained custody when a late transport close releases the slot", async () => {
    const owner = new HostResourceAdmissionOwner(() => policy({ maxActiveAgentSessions: 1 }));
    const runner = new SubagentAttemptRunner(
      { getParentContext: () => undefined, appendRuntimeEvent: () => {} },
      owner,
      25,
    );
    const state = makeState("child-late-close");
    const handle = makeHandle();
    vi.mocked(handle.dispose!).mockImplementation(() =>
      Promise.reject(new Error("dispose rejected")),
    );
    runner.run(state, 0, structuredAttempt(handle), {
      isActive: () => !state.cancelRequested,
      onWorking: vi.fn<() => void>(),
      onRuntimeEvent: vi.fn<() => void>(),
      onSettle: vi.fn<() => void>(),
    });
    await vi.waitFor(() => expect(state.resourceLease?.state).toBe("active"));

    await expect(runner.teardown(state)).rejects.toThrow("dispose rejected");
    expect(owner.usage().total).toBe(1);

    handle.listener?.onClose();
    expect(owner.usage().total).toBe(0);
    expect(state.handle).toBeUndefined();
    await expect(runner.retryRetirements()).resolves.toBeUndefined();
    expect(owner.usage().total).toBe(0);
  });
});
