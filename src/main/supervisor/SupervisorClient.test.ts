import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";

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

import { SupervisorClient, type SupervisorClientOptions } from "./SupervisorClient";

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
  client.start();
  return { client, child };
}

const epipe = () => Object.assign(new Error("write EPIPE"), { code: "EPIPE" });

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
    client.start();
    client.start();

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

    client.start();

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

    client.dispose();

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
    client.start();
    child.emit("exit", 1);
    child.emit("close", 1);

    client.dispose();
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

    client.dispose();
    child.emit("exit", 1);
    child.emit("close", 1);
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
