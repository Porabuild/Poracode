import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThreadConfig } from "@/shared/contracts";
import { CursorSdkSession, DEFAULT_CURSOR_SDK_WORKER_IDLE_TIMEOUT_MS } from "./sdkSession";
import type {
  CursorSdkWorkerAgentMessage,
  CursorSdkWorkerInitializeResult,
} from "./sdkWorkerProtocol";
import {
  baseConfig,
  createSession,
  createSessionWithWorkers,
  deferred,
  FakeWorker,
  input,
  recordingListener,
  resultEvent,
} from "./sdkSession.testFixtures";
import { createCursorSdkWorkerHarness } from "./sdkWorkerTestHarness";

vi.mock("./sdkInstallPin", () => ({ readCursorSdkInstallPin: () => undefined }));

afterEach(() => {
  vi.useRealTimers();
});

describe("CursorSdkSession idle worker reaper", () => {
  it("reaps an idle worker after the timeout and wakes with updated config in one spawn", async () => {
    vi.useFakeTimers();
    const firstWorker = new FakeWorker();
    const secondWorker = new FakeWorker();
    secondWorker.start.mockResolvedValue({ runId: "run-woken" });
    const { session, spawnWorker } = await createSessionWithWorkers([firstWorker, secondWorker]);
    const recorded = recordingListener();
    session.setListener(recorded.listener);

    await session.activate();
    await session.openThread(baseConfig);
    const staleListeners = firstWorker.snapshotListeners();

    await vi.advanceTimersByTimeAsync(DEFAULT_CURSOR_SDK_WORKER_IDLE_TIMEOUT_MS - 1);
    expect(firstWorker.dispose).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(firstWorker.dispose).toHaveBeenCalledOnce();
    expect(recorded.errors).toEqual([]);
    expect(recorded.closes).toBe(0);
    expect(recorded.updates.at(-1)).toMatchObject({
      status: "idle",
      attention: "none",
      sessionRef: { providerSessionId: "sdk:agent-1" },
    });

    staleListeners.crash(new Error("reaped worker exited"));
    staleListeners.emit(resultEvent());
    await Promise.resolve();
    expect(recorded.errors).toEqual([]);
    expect(recorded.closes).toBe(0);

    const nextConfig: ThreadConfig = {
      ...baseConfig,
      approvalPolicy: "never",
    };
    const turn = session.startTurn("wake and run", nextConfig);
    await vi.waitFor(() => expect(secondWorker.start).toHaveBeenCalledOnce());

    expect(spawnWorker).toHaveBeenCalledTimes(2);
    expect(secondWorker.listModels).not.toHaveBeenCalled();
    expect(secondWorker.initialize).toHaveBeenCalledExactlyOnceWith({
      resumeAgentId: "agent-1",
      createOptions: expect.objectContaining({
        local: {
          cwd: "/repo",
          settingSources: ["all"],
          autoReview: false,
          sandboxOptions: { enabled: true },
        },
      }),
    });
    expect(secondWorker.initialize.mock.calls[0]?.[0].createOptions).not.toHaveProperty("agentId");
    expect(secondWorker.reload).toHaveBeenCalledOnce();
    expect(secondWorker.start.mock.calls[0]?.[0].options?.local).toEqual({ force: true });

    secondWorker.emit(resultEvent("finished", "run-woken"));
    await turn;
    expect(recorded.updates.at(-1)?.status).toBe("idle");

    await vi.advanceTimersByTimeAsync(DEFAULT_CURSOR_SDK_WORKER_IDLE_TIMEOUT_MS);
    expect(secondWorker.dispose).toHaveBeenCalledOnce();

    await session.dispose();
    expect(recorded.closes).toBe(1);
  });

  it("never reaps during an active turn or readThread and resets the idle timer afterward", async () => {
    vi.useFakeTimers();
    const idleTimeoutMs = 5_000;
    const worker = new FakeWorker();
    const { session } = await createSession(worker, {}, { idleTimeoutMs });

    await session.activate();
    await session.openThread(baseConfig);
    await vi.advanceTimersByTimeAsync(idleTimeoutMs - 1_000);

    const turn = session.startTurn("long running turn", baseConfig);
    await vi.waitFor(() => expect(worker.start).toHaveBeenCalledOnce());

    await vi.advanceTimersByTimeAsync(idleTimeoutMs * 3);
    expect(worker.dispose).not.toHaveBeenCalled();

    worker.emit(resultEvent());
    await turn;

    await vi.advanceTimersByTimeAsync(idleTimeoutMs - 1);
    expect(worker.dispose).not.toHaveBeenCalled();

    const pendingRead = deferred<CursorSdkWorkerAgentMessage[]>();
    worker.listMessages.mockReturnValueOnce(pendingRead.promise);
    const reading = session.readThread();

    await vi.advanceTimersByTimeAsync(idleTimeoutMs * 3);
    expect(worker.dispose).not.toHaveBeenCalled();

    pendingRead.resolve([]);
    await reading;

    await vi.advanceTimersByTimeAsync(idleTimeoutMs - 1);
    expect(worker.dispose).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(worker.dispose).toHaveBeenCalledOnce();

    await session.dispose();
  });

  it("wakes cleanly for offline readThread and idle steerTurn after reaping", async () => {
    vi.useFakeTimers();
    const idleTimeoutMs = 1_000;
    const firstWorker = new FakeWorker();
    firstWorker.listModels.mockRejectedValue(new Error("catalog temporarily offline"));
    firstWorker.initialize.mockResolvedValue({
      agentId: "existing-agent",
      supportsSummarize: true,
    });
    const secondWorker = new FakeWorker();
    secondWorker.initialize.mockResolvedValue({ agentId: "existing-agent" });
    const thirdWorker = new FakeWorker();
    thirdWorker.initialize.mockResolvedValue({ agentId: "existing-agent" });
    thirdWorker.summarize.mockResolvedValue({ runId: "run-summary" });

    const { session, spawnWorker } = await createSessionWithWorkers(
      [firstWorker, secondWorker, thirdWorker],
      {},
      { idleTimeoutMs },
    );
    await session.activate();
    await session.openThread(baseConfig, {
      providerSessionId: "sdk:existing-agent",
      discoveredAt: "2026-01-01T00:00:00.000Z",
    });

    await vi.advanceTimersByTimeAsync(idleTimeoutMs);
    expect(firstWorker.dispose).toHaveBeenCalledOnce();

    const history = await session.readThread();
    expect(history.providerSessionId).toBe("sdk:existing-agent");
    expect(secondWorker.initialize).toHaveBeenCalledOnce();
    expect(secondWorker.initialize.mock.calls[0]?.[0].createOptions.model).toBeUndefined();

    await vi.advanceTimersByTimeAsync(idleTimeoutMs);
    expect(secondWorker.dispose).toHaveBeenCalledOnce();

    const summarize = session.steerTurn("/summarize", baseConfig);
    await vi.waitFor(() => expect(thirdWorker.summarize).toHaveBeenCalledOnce());
    expect(spawnWorker).toHaveBeenCalledTimes(3);
    thirdWorker.emit(resultEvent("finished", "run-summary"));
    await summarize;

    await session.dispose();
  });

  it("waits for an in-flight idle reap to finish before spawning a replacement worker", async () => {
    vi.useFakeTimers();
    const idleTimeoutMs = 1_000;
    const firstWorker = new FakeWorker();
    const reapCleanup = deferred<void>();
    firstWorker.dispose.mockReturnValueOnce(reapCleanup.promise);
    const secondWorker = new FakeWorker();
    secondWorker.start.mockResolvedValue({ runId: "run-2" });

    const { session, spawnWorker } = await createSessionWithWorkers(
      [firstWorker, secondWorker],
      {},
      { idleTimeoutMs },
    );
    await session.activate();
    await session.openThread(baseConfig);

    await vi.advanceTimersByTimeAsync(idleTimeoutMs);
    expect(firstWorker.dispose).toHaveBeenCalledOnce();

    const turn = session.startTurn("wake while reaping", baseConfig);
    await Promise.resolve();
    expect(spawnWorker).toHaveBeenCalledTimes(1);
    expect(secondWorker.initialize).not.toHaveBeenCalled();

    reapCleanup.resolve();
    await vi.waitFor(() => expect(secondWorker.start).toHaveBeenCalledOnce());
    expect(spawnWorker).toHaveBeenCalledTimes(2);
    secondWorker.emit(resultEvent("finished", "run-2"));
    await turn;

    await session.dispose();
  });

  it("retains a failed idle-reap worker and awaits wake cancellation during session.dispose", async () => {
    vi.useFakeTimers();
    const idleTimeoutMs = 1_000;
    const firstWorker = new FakeWorker();
    firstWorker.dispose.mockRejectedValueOnce(new Error("Idle worker still alive"));
    const secondWorker = new FakeWorker();
    const wakeInitialize = deferred<CursorSdkWorkerInitializeResult>();
    const wakeCleanup = deferred<void>();
    secondWorker.initialize.mockReturnValueOnce(wakeInitialize.promise);
    secondWorker.dispose.mockReturnValueOnce(wakeCleanup.promise);

    const { session } = await createSessionWithWorkers(
      [firstWorker, secondWorker],
      {},
      { idleTimeoutMs },
    );
    const recorded = recordingListener();
    session.setListener(recorded.listener);
    await session.activate();
    await session.openThread(baseConfig);

    await vi.advanceTimersByTimeAsync(idleTimeoutMs);
    expect(firstWorker.dispose).toHaveBeenCalledOnce();

    const turn = session.startTurn("wake after failed reap", baseConfig);
    await vi.waitFor(() => expect(secondWorker.initialize).toHaveBeenCalledOnce());

    firstWorker.dispose.mockRejectedValueOnce(new Error("Idle worker still alive on dispose"));
    const firstDisposal = session.dispose();
    await vi.waitFor(() => expect(secondWorker.dispose).toHaveBeenCalledOnce());
    expect(recorded.closes).toBe(0);

    wakeCleanup.resolve();
    await expect(firstDisposal).rejects.toThrow("Cursor SDK session shutdown failed");
    await turn;
    expect(recorded.closes).toBe(0);

    firstWorker.dispose.mockResolvedValueOnce(undefined);
    await session.dispose();
    expect(firstWorker.dispose).toHaveBeenCalledTimes(3);
    expect(recorded.closes).toBe(1);
    wakeInitialize.resolve({ agentId: "agent-1" });
  });

  it("terminates a real cursorSdkWorker child process when idle and respawns on the next turn", async () => {
    const spawnedChildren: ChildProcess[] = [];
    const session = await CursorSdkSession.create(input(), {
      idleTimeoutMs: 75,
      spawnWorker: async () => {
        const harness = await createCursorSdkWorkerHarness(REAL_WORKER_SDK_FIXTURE);
        spawnedChildren.push(harness.child);
        return harness.client;
      },
    });
    const recorded = recordingListener();
    session.setListener(recorded.listener);

    await session.activate();
    await session.openThread(baseConfig);
    expect(spawnedChildren).toHaveLength(1);
    const firstChild = spawnedChildren[0]!;
    expect(firstChild.exitCode).toBeNull();

    await vi.waitFor(() => expect(firstChild.exitCode).not.toBeNull(), { timeout: 5_000 });
    expect(recorded.errors).toEqual([]);
    expect(recorded.closes).toBe(0);

    await session.startTurn("hello after idle reap", baseConfig);
    expect(spawnedChildren).toHaveLength(2);
    const secondChild = spawnedChildren[1]!;
    expect(secondChild.pid).not.toBe(firstChild.pid);
    expect(recorded.errors).toEqual([]);
    expect(JSON.stringify(recorded.events)).toContain(
      "resumed:agent-persisted:hello after idle reap",
    );

    await session.dispose();
    expect(secondChild.exitCode).not.toBeNull();
    expect(recorded.closes).toBe(1);
  });
});

const REAL_WORKER_SDK_FIXTURE = `
let runSeq = 0;

class FakeRun {
  constructor(agentId, text) {
    this.id = "run-" + (++runSeq);
    this.agentId = agentId;
    this.text = text;
  }

  async *stream() {
    yield {
      type: "assistant",
      agent_id: this.agentId,
      run_id: this.id,
      message: {
        role: "assistant",
        content: [{ type: "text", text: "resumed:" + this.agentId + ":" + this.text }],
      },
    };
    yield {
      type: "status",
      agent_id: this.agentId,
      run_id: this.id,
      status: "FINISHED",
    };
  }

  async wait() {
    return {
      id: this.id,
      status: "finished",
      result: "done",
      model: { id: "composer-2" },
    };
  }

  async cancel() {}
}

export class Agent {
  constructor(agentId) {
    this.agentId = agentId;
  }

  static async create() {
    return new Agent("agent-persisted");
  }

  static async resume(agentId, options = {}) {
    if (options.agentId !== undefined) {
      throw new Error("create-only agentId leaked into Agent.resume");
    }
    return new Agent(agentId);
  }

  static messages = {
    async list() {
      return [];
    },
  };

  send(message) {
    return new FakeRun(this.agentId, typeof message === "string" ? message : message.text);
  }

  async reload() {}
}

export class Cursor {
  static models = {
    async list() {
      return [{ id: "composer-2", displayName: "Composer 2", parameters: [] }];
    },
  };
}
`;
