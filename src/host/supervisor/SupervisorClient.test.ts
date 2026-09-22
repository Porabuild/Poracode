import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";
import { isHostResourceBusyError } from "@/shared/hostResourceAdmission";
import {
  GIT_ADMISSION_QUEUE_FULL_CODE,
  isGitProcessAdmissionRefusal,
} from "@/shared/gitProcessAdmission";

const forkMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());
const setPriorityMock = vi.hoisted(() => vi.fn<(pid: number, priority: number) => void>());
const terminateChildProcessTreeMock = vi.hoisted(() => vi.fn<() => void>());

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, fork: forkMock };
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, setPriority: setPriorityMock };
});

vi.mock("@/shared/processTree", () => ({
  terminateChildProcessTree: terminateChildProcessTreeMock,
}));

import {
  SupervisorClient,
  SupervisorUnavailableError,
  type SupervisorClientOptions,
} from "./SupervisorClient";

type SendCallback = (error?: Error | null) => void;

interface FakeChild extends EventEmitter {
  connected: boolean;
  pid?: number;
  stdout: null;
  stderr: null;
  send: ReturnType<typeof vi.fn<(message: unknown, callback?: SendCallback) => boolean>>;
  kill: ReturnType<typeof vi.fn<() => boolean>>;
}

function makeFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.connected = true;
  child.stdout = null;
  child.stderr = null;
  child.send = vi.fn<(message: unknown, callback?: SendCallback) => boolean>();
  child.kill = vi.fn<() => boolean>();
  return child;
}

function makeClient(options: Pick<SupervisorClientOptions, "prepareStartThread"> = {}) {
  const child = makeFakeChild();
  forkMock.mockReturnValue(child);
  const client = new SupervisorClient({
    appVersion: "test",
    isDev: true,
    supervisorPath: "/fake/supervisor.cjs",
    wslHelpersDir: "/fake/wsl",
    secretStorageKey: "key",
    baseDir: "/base",
    onEvent: vi.fn<(event: SupervisorEvent) => void>(),
    onReset: vi.fn<() => void>(),
    ...options,
  });
  void client.start();
  return { client, child };
}

const epipe = () => Object.assign(new Error("write EPIPE"), { code: "EPIPE" });

/** Direct read of the private request ledger for cleanup assertions. */
function pendingRequestCount(client: SupervisorClient): number {
  return (client as unknown as { pendingRequests: Map<string, unknown> }).pendingRequests.size;
}

function admissionStatusFixture() {
  return {
    resolution: { kind: "configured" },
    policy: {
      maxActiveAgentSessions: 1,
      maxActiveTerminalShells: 0,
      maxActiveGenerationHelpers: 0,
      overloadRetryAfterMs: 1_000,
    },
    usage: {
      agentSessions: { active: 1, pending: 0, retiring: 0 },
      terminalShells: { active: 0, pending: 0, retiring: 0 },
      generationHelpers: { active: 0, pending: 0, retiring: 0 },
      total: 1,
      refusals: 0,
    },
  };
}

/** Capture the request id passed to `send`, replying via the provided callback. */
function captureSentId(child: FakeChild): () => string {
  let id = "";
  child.send.mockImplementation((message, callback) => {
    id = (message as { id: string }).id;
    callback?.();
    return true;
  });
  return () => id;
}

describe("SupervisorClient.start idempotency", () => {
  beforeEach(() => {
    forkMock.mockReset();
    setPriorityMock.mockReset();
    terminateChildProcessTreeMock.mockReset();
  });

  it("does not restart a healthy supervisor when called again (P1-3)", () => {
    const { client, child } = makeClient();

    // A duplicate boot path must be a no-op, never kill the running child.
    void client.start();
    void client.start();

    expect(forkMock).toHaveBeenCalledTimes(1);
    expect(child.connected).toBe(true);
    expect(terminateChildProcessTreeMock).not.toHaveBeenCalled();
  });

  it("restart() explicitly replaces a running supervisor after it closes", async () => {
    const { client, child } = makeClient();
    const replacement = makeFakeChild();
    forkMock.mockReturnValue(replacement);

    const restarting = client.restart();

    expect(terminateChildProcessTreeMock).toHaveBeenCalledTimes(1);
    child.emit("close", 0);
    await restarting;
    expect(forkMock).toHaveBeenCalledTimes(2);
    void child;
  });
});

describe("SupervisorClient positive absence proof (H2)", () => {
  beforeEach(() => {
    forkMock.mockReset();
    setPriorityMock.mockReset();
    terminateChildProcessTreeMock.mockReset();
  });

  function makeBareClient(): SupervisorClient {
    return new SupervisorClient({
      appVersion: "test",
      isDev: true,
      supervisorPath: "/fake/supervisor.cjs",
      wslHelpersDir: "/fake/wsl",
      secretStorageKey: "key",
      baseDir: "/base",
      onEvent: vi.fn<(event: SupervisorEvent) => void>(),
      onReset: vi.fn<() => void>(),
    });
  }

  it("proves absence only when no child and no transition exists", () => {
    const client = makeBareClient();
    expect(client.isSupervisorProvenAbsent()).toBe(true);
  });

  it("does not prove absence for a live or merely disconnected child", async () => {
    const { client, child } = makeClient();
    expect(client.isSupervisorProvenAbsent()).toBe(false);
    child.connected = false;
    expect(client.isSupervisorProvenAbsent()).toBe(false);
  });

  it("does not prove absence while a stop or restart transition is in flight", async () => {
    const { client, child } = makeClient();
    const stopping = client.stop(new Error("shutdown"));
    expect(client.isSupervisorProvenAbsent()).toBe(false);
    child.emit("close", 0);
    await stopping;
    expect(client.isSupervisorProvenAbsent()).toBe(true);
  });

  it("does not prove absence while a crash restart is scheduled", async () => {
    const { client, child } = makeClient();
    child.emit("exit", 1);
    child.emit("close", 1);
    expect(client.isSupervisorProvenAbsent()).toBe(false);
    // Disposal cancels the scheduled restart; absence is proven afterwards.
    await client.dispose();
    expect(client.isSupervisorProvenAbsent()).toBe(true);
  });
});

describe("SupervisorClient.call", () => {
  beforeEach(() => {
    forkMock.mockReset();
    setPriorityMock.mockReset();
    terminateChildProcessTreeMock.mockReset();
  });

  it("lowers the desktop supervisor priority before agents are started", () => {
    const child = makeFakeChild();
    child.pid = 42;
    forkMock.mockReturnValue(child);
    const client = new SupervisorClient({
      appVersion: "test",
      isDev: true,
      supervisorPath: "/fake/supervisor.cjs",
      wslHelpersDir: "/fake/wsl",
      secretStorageKey: "key",
      baseDir: "/base",
      preferUiResponsiveness: true,
      onEvent: vi.fn<(event: SupervisorEvent) => void>(),
      onReset: vi.fn<() => void>(),
    });

    void client.start();

    expect(setPriorityMock).toHaveBeenCalledExactlyOnceWith(42, expect.any(Number));
  });

  it("forwards downstream output backpressure to the supervisor", () => {
    const { client, child } = makeClient();

    client.setOutputBackpressured(true);
    client.setOutputBackpressured(false);

    expect(child.send).toHaveBeenNthCalledWith(
      1,
      { control: "set-output-backpressure", paused: true },
      expect.any(Function),
    );
    expect(child.send).toHaveBeenNthCalledWith(
      2,
      { control: "set-output-backpressure", paused: false },
      expect.any(Function),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not fork until the first supervisor call", async () => {
    const child = makeFakeChild();
    forkMock.mockReturnValue(child);
    const client = new SupervisorClient({
      appVersion: "test",
      isDev: false,
      supervisorPath: "/fake/supervisor.cjs",
      wslHelpersDir: "/fake/wsl",
      secretStorageKey: "key",
      baseDir: "/lazy-base",
      onEvent: vi.fn<(event: SupervisorEvent) => void>(),
      onReset: vi.fn<() => void>(),
    });
    const getId = captureSentId(child);

    expect(forkMock).not.toHaveBeenCalled();
    const promise = client.call("any" as never, undefined as never);

    expect(forkMock).toHaveBeenCalledExactlyOnceWith(
      "/fake/supervisor.cjs",
      [],
      expect.objectContaining({
        env: expect.objectContaining({ PORACODE_DATA_DIR: "/lazy-base" }),
      }),
    );
    child.emit("message", { replyTo: getId(), ok: true, data: "started-lazily" });
    await expect(promise).resolves.toBe("started-lazily");
  });

  it("forks exactly once for concurrent first calls", async () => {
    const child = makeFakeChild();
    forkMock.mockReturnValue(child);
    const client = new SupervisorClient({
      appVersion: "test",
      isDev: false,
      supervisorPath: "/fake/supervisor.cjs",
      wslHelpersDir: "/fake/wsl",
      secretStorageKey: "key",
      baseDir: "/base",
      onEvent: vi.fn<(event: SupervisorEvent) => void>(),
      onReset: vi.fn<() => void>(),
    });
    const ids: string[] = [];
    child.send.mockImplementation((message, callback) => {
      ids.push((message as { id: string }).id);
      callback?.();
      return true;
    });

    const first = client.call("first" as never, undefined as never);
    const second = client.call("second" as never, undefined as never);

    expect(forkMock).toHaveBeenCalledTimes(1);
    expect(ids).toHaveLength(2);
    child.emit("message", { replyTo: ids[0], ok: true, data: "first" });
    child.emit("message", { replyTo: ids[1], ok: true, data: "second" });
    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
  });

  it("serializes thread mutations while keeping unrelated threads concurrent", async () => {
    const { client, child } = makeClient();
    const ids: string[] = [];
    child.send.mockImplementation((message, callback) => {
      ids.push((message as { id: string }).id);
      callback?.();
      return true;
    });

    const first = client.call("startThread", { threadId: "thread-a" } as never);
    const second = client.call("sendThreadInput", { threadId: "thread-a" } as never);
    const unrelated = client.call("startThread", { threadId: "thread-b" } as never);
    await vi.waitFor(() => expect(ids).toHaveLength(2));

    child.emit("message", { replyTo: ids[0], ok: true, data: "a-started" });
    await vi.waitFor(() => expect(ids).toHaveLength(3));
    child.emit("message", { replyTo: ids[1], ok: true, data: "b-started" });
    child.emit("message", { replyTo: ids[2], ok: true, data: "a-input" });

    await expect(Promise.all([first, second, unrelated])).resolves.toEqual([
      "a-started",
      "a-input",
      "b-started",
    ]);
  });

  it("lets interrupt and server-request replies bypass a queued mutation", async () => {
    const { client, child } = makeClient();
    const requests: Array<{ id: string; type: string }> = [];
    child.send.mockImplementation((message, callback) => {
      const request = message as { id: string; type: string };
      requests.push({ id: request.id, type: request.type });
      callback?.();
      return true;
    });

    const mutation = client.call("startThread", { threadId: "thread-a" } as never);
    const interrupt = client.call("interruptThread", { threadId: "thread-a" } as never);
    const answer = client.call("resolveThreadServerRequest", { threadId: "thread-a" } as never);
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[0]?.type).toBe("startThread");

    const requestByType = (type: string): string => {
      const request = requests.find((entry) => entry.type === type);
      if (!request) throw new Error(`Missing ${type} request.`);
      return request.id;
    };
    child.emit("message", {
      replyTo: requestByType("interruptThread"),
      ok: true,
      data: "interrupted",
    });
    child.emit("message", {
      replyTo: requestByType("resolveThreadServerRequest"),
      ok: true,
      data: "answered",
    });
    child.emit("message", { replyTo: requestByType("startThread"), ok: true, data: "started" });

    await expect(Promise.all([mutation, interrupt, answer])).resolves.toEqual([
      "started",
      "interrupted",
      "answered",
    ]);
  });

  it("cancels a queued mutation when a thread control call arrives", async () => {
    const { client, child } = makeClient();
    const requests: Array<{ id: string; type: string }> = [];
    child.send.mockImplementation((message, callback) => {
      const request = message as { id: string; type: string };
      requests.push({ id: request.id, type: request.type });
      callback?.();
      return true;
    });

    const first = client.call("startThread", { threadId: "thread-a" } as never);
    const queued = client.call("sendThreadInput", { threadId: "thread-a" } as never);
    const interrupt = client.call("interruptThread", { threadId: "thread-a" } as never);
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(requests.map((request) => request.type)).toEqual(["startThread", "interruptThread"]);

    child.emit("message", { replyTo: requests[1]!.id, ok: true, data: "interrupted" });
    child.emit("message", { replyTo: requests[0]!.id, ok: true, data: "started" });

    await expect(first).resolves.toBe("started");
    await expect(interrupt).resolves.toBe("interrupted");
    await expect(queued).rejects.toThrow("cancelled by a control operation");
  });

  it("does not cancel queued input when answering a server request", async () => {
    const { client, child } = makeClient();
    const requests: Array<{ id: string; type: string }> = [];
    child.send.mockImplementation((message, callback) => {
      const request = message as { id: string; type: string };
      requests.push({ id: request.id, type: request.type });
      callback?.();
      return true;
    });

    const start = client.call("startThread", { threadId: "thread-a" } as never);
    const input = client.call("sendThreadInput", { threadId: "thread-a" } as never);
    const answer = client.call("resolveThreadServerRequest", { threadId: "thread-a" } as never);
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(requests.map((request) => request.type)).toEqual([
      "startThread",
      "resolveThreadServerRequest",
    ]);

    child.emit("message", { replyTo: requests[1]!.id, ok: true, data: "answered" });
    child.emit("message", { replyTo: requests[0]!.id, ok: true, data: "started" });
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2]?.type).toBe("sendThreadInput");
    child.emit("message", { replyTo: requests[2]!.id, ok: true, data: "sent" });

    await expect(Promise.all([start, input, answer])).resolves.toEqual([
      "started",
      "sent",
      "answered",
    ]);
  });

  it("starts again on demand after a clean supervisor exit", async () => {
    const firstChild = makeFakeChild();
    const secondChild = makeFakeChild();
    forkMock.mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild);
    const client = new SupervisorClient({
      appVersion: "test",
      isDev: false,
      supervisorPath: "/fake/supervisor.cjs",
      wslHelpersDir: "/fake/wsl",
      secretStorageKey: "key",
      baseDir: "/base",
      onEvent: vi.fn<(event: SupervisorEvent) => void>(),
      onReset: vi.fn<() => void>(),
    });
    const firstId = captureSentId(firstChild);
    const first = client.call("first" as never, undefined as never);
    firstChild.emit("message", { replyTo: firstId(), ok: true, data: null });
    await first;
    firstChild.emit("exit", 0);
    firstChild.emit("close", 0);
    const secondId = captureSentId(secondChild);

    const second = client.call("second" as never, undefined as never);

    expect(forkMock).toHaveBeenCalledTimes(2);
    secondChild.emit("message", { replyTo: secondId(), ok: true, data: "restarted" });
    await expect(second).resolves.toBe("restarted");
  });

  it("does not fork after disposal", async () => {
    const client = new SupervisorClient({
      appVersion: "test",
      isDev: false,
      supervisorPath: "/fake/supervisor.cjs",
      wslHelpersDir: "/fake/wsl",
      secretStorageKey: "key",
      baseDir: "/base",
      onEvent: vi.fn<(event: SupervisorEvent) => void>(),
      onReset: vi.fn<() => void>(),
    });

    await client.dispose();

    await expect(client.call("any" as never, undefined as never)).rejects.toThrow("disposed");
    expect(forkMock).not.toHaveBeenCalled();
  });

  it("does not run a scheduled crash restart after disposal", async () => {
    vi.useFakeTimers();
    const child = makeFakeChild();
    forkMock.mockReturnValue(child);
    const client = new SupervisorClient({
      appVersion: "test",
      isDev: false,
      supervisorPath: "/fake/supervisor.cjs",
      wslHelpersDir: "/fake/wsl",
      secretStorageKey: "key",
      baseDir: "/base",
      onEvent: vi.fn<(event: SupervisorEvent) => void>(),
      onReset: vi.fn<() => void>(),
    });
    void client.start();
    child.emit("exit", 1);
    child.emit("close", 1);

    await client.dispose();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(forkMock).toHaveBeenCalledTimes(1);
  });

  it("rejects (does not orphan the caller) when send fails with EPIPE", async () => {
    const { client, child } = makeClient();
    child.send.mockImplementation((_message, callback) => {
      callback?.(epipe());
      return true;
    });
    await expect(client.call("any" as never, undefined as never)).rejects.toThrow("EPIPE");
  });

  it("rejects when send throws synchronously with EPIPE", async () => {
    const { client, child } = makeClient();
    child.send.mockImplementation(() => {
      throw epipe();
    });
    await expect(client.call("any" as never, undefined as never)).rejects.toThrow("EPIPE");
  });

  it("rejects on a non-EPIPE send error", async () => {
    const { client, child } = makeClient();
    child.send.mockImplementation((_message, callback) => {
      callback?.(new Error("boom"));
      return true;
    });
    await expect(client.call("any" as never, undefined as never)).rejects.toThrow("boom");
  });

  it("resolves when a matching reply arrives", async () => {
    const { client, child } = makeClient();
    const getId = captureSentId(child);
    const promise = client.call("any" as never, undefined as never);
    await vi.waitFor(() => expect(child.send).toHaveBeenCalled());
    child.emit("message", { replyTo: getId(), ok: true, data: "result-value" });
    await expect(promise).resolves.toBe("result-value");
  });

  it.each(["startThread", "ensureThreadRunning"] as const)(
    "applies main-process start invariants to %s",
    async (procedure) => {
      const { client, child } = makeClient({
        prepareStartThread: (payload) => ({
          ...payload,
          invariantDisabledBuiltInMcpServerIds: ["crossagents"],
        }),
      });
      let request: { id: string; payload: unknown } | undefined;
      child.send.mockImplementation((message, callback) => {
        request = message as { id: string; payload: unknown };
        callback?.();
        return true;
      });
      const promise = client.call(procedure, {
        threadId: "child-thread",
        projectLocation: { kind: "windows", path: "C:\\repo" },
        agentKind: "codex",
        config: { model: "test" },
        prompt: "Inspect this.",
        initialSize: { cols: 120, rows: 40 },
      });
      await vi.waitFor(() => expect(request).toBeDefined());
      expect(request?.payload).toMatchObject({
        invariantDisabledBuiltInMcpServerIds: ["crossagents"],
      });
      child.emit("message", { replyTo: request!.id, ok: true, data: { threadId: "child-thread" } });
      await expect(promise).resolves.toEqual({ threadId: "child-thread" });
    },
  );

  it("rejects when the reply reports failure", async () => {
    const { client, child } = makeClient();
    const getId = captureSentId(child);
    const promise = client.call("any" as never, undefined as never);
    await vi.waitFor(() => expect(child.send).toHaveBeenCalled());
    child.emit("message", { replyTo: getId(), ok: false, error: "handler failed" });
    await expect(promise).rejects.toThrow("handler failed");
  });

  it("times out a request whose reply never arrives", async () => {
    vi.useFakeTimers();
    const { client, child } = makeClient();
    captureSentId(child);
    const promise = client.call("slow" as never, undefined as never);
    // Capture the eventual rejection now so it is never an unhandled rejection.
    const guarded = promise.catch((error: unknown) => error);
    // Flush the `await startedGate` continuation so the request + timer register…
    await vi.advanceTimersByTimeAsync(0);
    expect(child.send).toHaveBeenCalled();
    // …then advance past the timeout window.
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 1);
    const error = await guarded;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/timed out/);
  });

  it("clears the timeout once resolved (no late rejection)", async () => {
    vi.useFakeTimers();
    const { client, child } = makeClient();
    const getId = captureSentId(child);
    const promise = client.call("any" as never, undefined as never);
    await vi.advanceTimersByTimeAsync(0);
    expect(child.send).toHaveBeenCalled();
    child.emit("message", { replyTo: getId(), ok: true, data: "ok" });
    await expect(promise).resolves.toBe("ok");
    // Advancing past the timeout window must not produce a late rejection.
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 1);
  });
});

describe("SupervisorClient typed refusal rehydration", () => {
  beforeEach(() => {
    forkMock.mockReset();
    terminateChildProcessTreeMock.mockReset();
  });

  it("rehydrates errorCode and retryAfterMs onto the rejected error", async () => {
    const { client, child } = makeClient();
    const getId = captureSentId(child);
    const promise = client.call("startThread", { threadId: "thread-a" } as never);
    child.emit("message", {
      replyTo: getId(),
      ok: false,
      error: "Host agent-session capacity is full.",
      errorCode: "host_resource_busy",
      retryAfterMs: 250,
    });

    const error = await promise.then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(isHostResourceBusyError(error)).toBe(true);
    expect(error).toMatchObject({ code: "host_resource_busy", retryAfterMs: 250 });
  });

  it("rehydrates a Git admission refusal without classifying it as host admission", async () => {
    const { client, child } = makeClient();
    const getId = captureSentId(child);
    const promise = client.call("getGitStatus", { projectLocation: {} } as never);
    child.emit("message", {
      replyTo: getId(),
      ok: false,
      error: "Git short admission queue is full.",
      errorCode: GIT_ADMISSION_QUEUE_FULL_CODE,
      retryAfterMs: 500,
    });

    const error = await promise.then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(isGitProcessAdmissionRefusal(error)).toBe(true);
    expect(isHostResourceBusyError(error)).toBe(false);
    expect(error).toMatchObject({ code: GIT_ADMISSION_QUEUE_FULL_CODE, retryAfterMs: 500 });
  });

  it("keeps an old message-only failure reply graceful", async () => {
    const { client, child } = makeClient();
    const getId = captureSentId(child);
    const promise = client.call("startThread", { threadId: "thread-a" } as never);
    child.emit("message", { replyTo: getId(), ok: false, error: "Unknown thread session." });

    const error = (await promise.then(
      () => undefined,
      (reason: unknown) => reason,
    )) as Error;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Unknown thread session.");
    expect(isHostResourceBusyError(error)).toBe(false);
    expect((error as { code?: unknown }).code).toBeUndefined();
  });

  it("rejects typed without forking when startIfNeeded is false and nothing is running", async () => {
    const client = new SupervisorClient({
      appVersion: "test",
      isDev: true,
      supervisorPath: "/fake/supervisor.cjs",
      wslHelpersDir: "/fake/wsl",
      secretStorageKey: "key",
      baseDir: "/lazy-base",
      onEvent: vi.fn<(event: SupervisorEvent) => void>(),
      onReset: vi.fn<() => void>(),
    });

    await expect(
      client.call("getResourceAdmissionStatus", {}, { startIfNeeded: false }),
    ).rejects.toBeInstanceOf(SupervisorUnavailableError);
    expect(forkMock).not.toHaveBeenCalled();
  });

  it("peeks as unavailable without forking a lazy supervisor", async () => {
    const client = new SupervisorClient({
      appVersion: "test",
      isDev: true,
      supervisorPath: "/fake/supervisor.cjs",
      wslHelpersDir: "/fake/wsl",
      secretStorageKey: "key",
      baseDir: "/lazy-base",
      onEvent: vi.fn<(event: SupervisorEvent) => void>(),
      onReset: vi.fn<() => void>(),
    });

    await expect(client.peekResourceAdmissionStatus()).resolves.toEqual({
      kind: "unavailable",
      reason: "supervisor-not-running",
    });
    expect(forkMock).not.toHaveBeenCalled();
  });

  it("returns the on-demand status and degrades safely on an old supervisor failure", async () => {
    const { client, child } = makeClient();
    const requests: string[] = [];
    child.send.mockImplementation((message, callback) => {
      requests.push((message as { id: string }).id);
      callback?.();
      return true;
    });
    const status = {
      resolution: { kind: "configured" },
      policy: {
        maxActiveAgentSessions: 1,
        maxActiveTerminalShells: 0,
        maxActiveGenerationHelpers: 0,
        overloadRetryAfterMs: 1_000,
      },
      usage: {
        agentSessions: { active: 1, pending: 0, retiring: 0 },
        terminalShells: { active: 0, pending: 0, retiring: 0 },
        generationHelpers: { active: 0, pending: 0, retiring: 0 },
        total: 1,
        refusals: 0,
      },
    };

    const peek = client.peekResourceAdmissionStatus();
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    child.emit("message", { replyTo: requests[0], ok: true, data: status });
    await expect(peek).resolves.toEqual({ kind: "available", status });

    // An older supervisor loud-rejects the unknown procedure with a failure
    // reply; diagnostics degrade to unavailable instead of inventing zeroes.
    const failing = client.peekResourceAdmissionStatus();
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    child.emit("message", {
      replyTo: requests[1],
      ok: false,
      error: "Supervisor request handler is not a function",
    });
    await expect(failing).resolves.toEqual({ kind: "unavailable", reason: "supervisor-error" });
  });
});

describe("SupervisorClient admission diagnostics budget", () => {
  beforeEach(() => {
    forkMock.mockReset();
    setPriorityMock.mockReset();
    terminateChildProcessTreeMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retires a hung diagnostics request at the short deadline and ignores a late reply", async () => {
    vi.useFakeTimers();
    const { client, child } = makeClient();
    const ids: string[] = [];
    child.send.mockImplementation((message, callback) => {
      ids.push((message as { id: string }).id);
      callback?.();
      return true;
    });

    const peek = client.peekResourceAdmissionStatus();
    let outcome: unknown = "pending";
    void peek.then((value) => {
      outcome = value;
    });
    expect(ids).toHaveLength(1);
    expect(pendingRequestCount(client)).toBe(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(outcome).toEqual({ kind: "unavailable", reason: "supervisor-error" });
    // The deadline retired the actual request bookkeeping and its timer.
    expect(pendingRequestCount(client)).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    // A late reply for the retired request is ignored, and the expired peek
    // sends no follow-up request of its own.
    child.emit("message", { replyTo: ids[0], ok: true, data: admissionStatusFixture() });
    expect(pendingRequestCount(client)).toBe(0);
    expect(ids).toHaveLength(1);

    // The next peek is a fresh read, not a cached result.
    const after = client.peekResourceAdmissionStatus();
    expect(ids).toHaveLength(2);
    child.emit("message", { replyTo: ids[1], ok: true, data: admissionStatusFixture() });
    await expect(after).resolves.toEqual({
      kind: "available",
      status: admissionStatusFixture(),
    });
  });

  it("coalesces concurrent diagnostics peeks and reads fresh after they settle", async () => {
    const { client, child } = makeClient();
    const ids: string[] = [];
    child.send.mockImplementation((message, callback) => {
      ids.push((message as { id: string }).id);
      callback?.();
      return true;
    });

    const first = client.peekResourceAdmissionStatus();
    const second = client.peekResourceAdmissionStatus();
    const third = client.peekResourceAdmissionStatus();
    expect(ids).toHaveLength(1);

    child.emit("message", { replyTo: ids[0], ok: true, data: admissionStatusFixture() });
    const available = { kind: "available", status: admissionStatusFixture() } as const;
    await expect(Promise.all([first, second, third])).resolves.toEqual([
      available,
      available,
      available,
    ]);

    // Coalescing is not caching: the next peek issues a new request.
    const fourth = client.peekResourceAdmissionStatus();
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(ids[0]);
    child.emit("message", { replyTo: ids[1], ok: true, data: admissionStatusFixture() });
    await expect(fourth).resolves.toEqual({
      kind: "available",
      status: admissionStatusFixture(),
    });
  });

  it("answers unavailable at once during a stop transition while ordinary calls still wait", async () => {
    const { client, child } = makeClient();
    const ids: string[] = [];
    child.send.mockImplementation((message, callback) => {
      ids.push((message as { id: string }).id);
      callback?.();
      return true;
    });

    const stopping = client.stop(new Error("stopping"));
    const peek = client.peekResourceAdmissionStatus();
    let peekOutcome: unknown = "pending";
    void peek.then((value) => {
      peekOutcome = value;
    });
    await vi.waitFor(() => expect(peekOutcome).not.toBe("pending"), { timeout: 250 });
    expect(peekOutcome).toEqual({
      kind: "unavailable",
      reason: "supervisor-not-running",
    });
    expect(child.send).not.toHaveBeenCalled();

    // Ordinary callers keep the historical semantics: an RPC parks on the
    // transition and proceeds once the supervisor is replaced.
    const call = client.call("any" as never, undefined as never);
    expect(child.send).not.toHaveBeenCalled();
    child.emit("close", 0);
    await stopping;
    await vi.waitFor(() => expect(ids).toHaveLength(1));
    child.emit("message", { replyTo: ids[0], ok: true, data: "proceeded" });
    await expect(call).resolves.toBe("proceeded");
  });
});

describe("SupervisorClient lifecycle", () => {
  beforeEach(() => {
    forkMock.mockReset();
    terminateChildProcessTreeMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("terminates the supervisor tree without restarting it when disposed", async () => {
    vi.useFakeTimers();
    const { client, child } = makeClient();

    const disposing = client.dispose();
    child.emit("exit", 1);
    child.emit("close", 1);
    await disposing;
    await vi.advanceTimersByTimeAsync(1_000);

    expect(terminateChildProcessTreeMock).toHaveBeenCalledExactlyOnceWith(child);
    expect(forkMock).toHaveBeenCalledOnce();
  });

  it("joins queued thread mutations before disposal resolves", async () => {
    const { client, child } = makeClient();
    const first = client.call("startThread", { threadId: "thread-a" } as never);
    const queued = client.call("sendThreadInput", { threadId: "thread-a" } as never);

    const disposal = client.dispose();
    child.emit("close", 0);
    await disposal;

    await expect(first).rejects.toThrow("Supervisor exited");
    await expect(queued).rejects.toThrow("cancelled by a control operation");
  });
});

describe("SupervisorClient event-flow-control negotiation", () => {
  beforeEach(() => {
    forkMock.mockReset();
    setPriorityMock.mockReset();
    terminateChildProcessTreeMock.mockReset();
  });

  it("never sends set-event-backpressure to a legacy peer without the capability", () => {
    const { client, child } = makeClient();

    client.setEventBackpressured(true, "host-persistence-degraded");
    client.setEventBackpressured(false);

    expect(client.getPeerFlowControlVersions()).toEqual([]);
    expect(child.send).not.toHaveBeenCalled();
  });
  it("sends set-event-backpressure only after the peer advertises version 1", () => {
    const onFlowControlReady = vi.fn<() => void>();
    const { client, child } = makeClient({ onFlowControlReady } as never);

    child.emit("message", { kind: "supervisor-flow-control-capabilities", versions: [1] });
    client.setEventBackpressured(true, "host-persistence-refusing");
    client.setEventBackpressured(false);

    expect(onFlowControlReady).toHaveBeenCalledOnce();
    expect(client.getPeerFlowControlVersions()).toEqual([1]);
    expect(child.send).toHaveBeenNthCalledWith(
      1,
      {
        control: "set-event-backpressure",
        paused: true,
        reason: "host-persistence-refusing",
      },
      expect.any(Function),
    );
    expect(child.send).toHaveBeenNthCalledWith(
      2,
      { control: "set-event-backpressure", paused: false },
      expect.any(Function),
    );
  });

  it("keeps the output-pressure plane independent of the capability", () => {
    const { client, child } = makeClient();

    client.setOutputBackpressured(true);

    expect(child.send).toHaveBeenCalledWith(
      { control: "set-output-backpressure", paused: true },
      expect.any(Function),
    );
  });

  it("catches a consumer throw instead of letting it escape the IPC handler", () => {
    const reportError = vi.fn<(error: unknown) => void>();
    const { child } = makeClient({
      onEvent: () => {
        throw new Error("consumer boom");
      },
      reportError,
    } as never);

    expect(() => child.emit("message", { type: "thread-reset", threadId: "t1" })).not.toThrow();
    expect(reportError).toHaveBeenCalledOnce();
  });
});

describe("SupervisorClient canonical credit negotiation (B1)", () => {
  beforeEach(() => {
    forkMock.mockReset();
    setPriorityMock.mockReset();
    terminateChildProcessTreeMock.mockReset();
  });

  function advertise(
    child: FakeChild,
    capabilities: {
      supportsCanonicalCredit?: boolean;
      canonicalFlowGeneration?: string;
    } = {},
  ): void {
    child.emit("message", {
      kind: "supervisor-flow-control-capabilities",
      versions: [1],
      ...capabilities,
    });
  }

  it("grants a credit window only to a credit-capable peer, echoing its boot generation", () => {
    const { client, child } = makeClient();
    advertise(child);

    client.setEventBackpressured(true, "host-persistence-degraded", {
      canonicalCreditBytes: 5_000,
      threadIds: ["t1"],
    });
    expect(child.send).toHaveBeenLastCalledWith(
      {
        control: "set-event-backpressure",
        paused: true,
        reason: "host-persistence-degraded",
        threadIds: ["t1"],
      },
      expect.any(Function),
    );

    advertise(child, { supportsCanonicalCredit: true, canonicalFlowGeneration: "boot-1" });
    client.setEventBackpressured(false, undefined, {
      canonicalCreditBytes: 5_000,
      canonicalAckSeq: 0,
    });
    expect(child.send).toHaveBeenLastCalledWith(
      {
        control: "set-event-backpressure",
        paused: false,
        canonicalCreditBytes: 5_000,
        canonicalFlowGeneration: "boot-1",
        canonicalAckSeq: 0,
      },
      expect.any(Function),
    );
    expect(client.getPeerCanonicalCapabilities()).toMatchObject({
      supportsCanonicalCredit: true,
      generation: "boot-1",
    });
  });

  it("coalesces acks and never sends one to a legacy peer", async () => {
    const { client, child } = makeClient();

    client.acknowledgeCanonicalFlow(3);
    expect(child.send).not.toHaveBeenCalled();

    advertise(child, { supportsCanonicalCredit: true, canonicalFlowGeneration: "boot-1" });
    expect(client.getPeerCanonicalCapabilities().supportsCanonicalCredit).toBe(true);

    client.acknowledgeCanonicalFlow(3);
    client.acknowledgeCanonicalFlow(5);
    client.acknowledgeCanonicalFlow(4);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(child.send).toHaveBeenCalledExactlyOnceWith(
      { control: "ack-canonical-flow", ackSeq: 5, generation: "boot-1" },
      expect.any(Function),
    );

    // Re-acking an already-acked sequence is a no-op.
    child.send.mockClear();
    client.acknowledgeCanonicalFlow(5);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(child.send).not.toHaveBeenCalled();
  });

  it("drops an ack scheduled for a replaced supervisor generation", async () => {
    const { client, child } = makeClient();
    advertise(child, { supportsCanonicalCredit: true, canonicalFlowGeneration: "boot-1" });

    client.acknowledgeCanonicalFlow(4);
    // The replacement advertises a new generation before the coalesced ack
    // fires: the old sequence must never be sent against the new ledger.
    advertise(child, { supportsCanonicalCredit: true, canonicalFlowGeneration: "boot-2" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(child.send).not.toHaveBeenCalled();

    client.acknowledgeCanonicalFlow(1);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(child.send).toHaveBeenCalledExactlyOnceWith(
      { control: "ack-canonical-flow", ackSeq: 1, generation: "boot-2" },
      expect.any(Function),
    );
  });
});
