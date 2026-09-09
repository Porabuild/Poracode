import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKEND_HOST_PROTOCOL_VERSION,
  type BackendNativeEvent,
  type BackendNativeRequest,
  type BackendHostRequest,
} from "@/shared/backendHostProtocol";
import type { SupervisorEvent } from "@/shared/ipc";

const forkMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());
const setPriorityMock = vi.hoisted(() => vi.fn<(pid: number, priority: number) => void>());
const terminateMock = vi.hoisted(() => vi.fn<() => void>());

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, fork: forkMock };
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, setPriority: setPriorityMock };
});

vi.mock("@/shared/processTree", () => ({ terminateChildProcessTree: terminateMock }));

import { BACKEND_HOST_INITIALIZATION_DEADLINE_MS, BackendHostClient } from "./BackendHostClient";

type SendCallback = (error: Error | null) => void;

interface FakeChild extends EventEmitter {
  connected: boolean;
  pid?: number;
  stdout: null;
  stderr: null;
  send: ReturnType<typeof vi.fn<(message: unknown, callback?: SendCallback) => boolean>>;
}

function makeFakeChild(pid = 42): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.connected = true;
  child.pid = pid;
  child.stdout = null;
  child.stderr = null;
  child.send = vi.fn<(message: unknown, callback?: SendCallback) => boolean>(
    (_message: unknown, callback?: SendCallback) => {
      callback?.(null);
      return true;
    },
  );
  return child;
}

function requests(child: FakeChild): BackendHostRequest[] {
  return child.send.mock.calls.map(([message]) => message as BackendHostRequest);
}

function requestFor(
  child: FakeChild,
  operation: BackendHostRequest["operation"],
): BackendHostRequest {
  const request = requests(child).find((candidate) => candidate.operation === operation);
  if (!request) throw new Error(`Missing ${operation} request.`);
  return request;
}

function reply(child: FakeChild, request: BackendHostRequest, data: unknown = null): void {
  child.emit("message", {
    version: BACKEND_HOST_PROTOCOL_VERSION,
    kind: "reply",
    replyTo: request.id,
    ok: true,
    data,
  });
}

function replyFailure(child: FakeChild, request: BackendHostRequest, error: string): void {
  child.emit("message", {
    version: BACKEND_HOST_PROTOCOL_VERSION,
    kind: "reply",
    replyTo: request.id,
    ok: false,
    error,
  });
}

function createClient(
  assignPid = vi.fn<(pid: number) => Promise<void>>(async () => undefined),
  options: { initWaitTimeoutMs?: number } = {},
) {
  const onEvent =
    vi.fn<
      (event: SupervisorEvent, rendererDeliveredDirect: boolean, rendererSequence?: number) => void
    >();
  const onReset = vi.fn<() => void>();
  const reportError = vi.fn<(error: unknown, tags?: Record<string, string>) => void>();
  const handleNativeRequest = vi.fn<(request: BackendNativeRequest) => Promise<unknown>>(
    async () => ({ delivered: true }),
  );
  const onNativeEvent = vi.fn<(event: BackendNativeEvent) => void>();
  const onRendererStreamInfo = vi.fn<(info: { version: 2; url: string; token: string }) => void>();
  const client = new BackendHostClient({
    backendHostPath: "/dist/backendHost.cjs",
    initialize: {
      baseDir: "/data",
      dbPath: "/data/state.sqlite",
      supervisor: {
        appVersion: "test",
        isDev: true,
        supervisorPath: "/dist/supervisor.cjs",
        wslHelpersDir: "/wsl",
        secretStorageKey: "secret",
        preferUiResponsiveness: true,
      },
    },
    resolveExtraEnv: () => ({ PORACODE_BROWSER_MCP_URL: "http://127.0.0.1" }),
    assignPid,
    ...(options.initWaitTimeoutMs !== undefined
      ? { initWaitTimeoutMs: options.initWaitTimeoutMs }
      : {}),
    reportError,
    handleNativeRequest,
    onNativeEvent,
    onRendererStreamInfo,
    onEvent,
    onReset,
  });
  return {
    client,
    onEvent,
    onReset,
    reportError,
    handleNativeRequest,
    onNativeEvent,
    onRendererStreamInfo,
    assignPid,
  };
}

async function startClient(
  client: BackendHostClient,
  child: FakeChild,
  initializeResult: unknown = null,
): Promise<void> {
  const start = client.startSupervisor();
  await vi.waitFor(() => expect(requests(child)).toHaveLength(1));
  reply(child, requestFor(child, "initialize"), initializeResult);
  await vi.waitFor(() => expect(requests(child)).toHaveLength(2));
  reply(child, requestFor(child, "start-supervisor"));
  await start;
}

describe("BackendHostClient", () => {
  beforeEach(() => {
    forkMock.mockReset();
    setPriorityMock.mockReset();
    terminateMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("initializes the worker, lowers its priority, and starts with current MCP env", async () => {
    const child = makeFakeChild();
    forkMock.mockReturnValue(child);
    const { client, assignPid } = createClient();

    await startClient(client, child);

    expect(forkMock).toHaveBeenCalledWith(
      "/dist/backendHost.cjs",
      [],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe", "ipc"] }),
    );
    expect(setPriorityMock).toHaveBeenCalledExactlyOnceWith(42, expect.any(Number));
    expect(assignPid).toHaveBeenCalledExactlyOnceWith(42);
    expect(requestFor(child, "initialize")).toMatchObject({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      payload: { baseDir: "/data", dbPath: "/data/state.sqlite" },
    });
    expect(requestFor(child, "start-supervisor")).toMatchObject({
      payload: { extraEnv: { PORACODE_BROWSER_MCP_URL: "http://127.0.0.1" } },
    });
  });

  it("assigns the backend to the job object before it can spawn the supervisor", async () => {
    let releaseAssignment: (() => void) | undefined;
    const assignPid = vi.fn<(pid: number) => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          releaseAssignment = resolve;
        }),
    );
    const child = makeFakeChild();
    forkMock.mockReturnValue(child);
    const { client } = createClient(assignPid);

    const start = client.startSupervisor();
    await vi.waitFor(() => expect(requests(child)).toHaveLength(1));
    reply(child, requestFor(child, "initialize"));
    await Promise.resolve();
    expect(requests(child)).toHaveLength(1);

    releaseAssignment?.();
    await vi.waitFor(() => expect(requests(child)).toHaveLength(2));
    reply(child, requestFor(child, "start-supervisor"));
    await start;
  });

  it("forwards supervisor calls and lifecycle messages", async () => {
    const child = makeFakeChild();
    forkMock.mockReturnValue(child);
    const { client, onEvent, onReset, reportError } = createClient();
    await startClient(client, child);

    const call = client.call("getAgentStatuses", { wslDistros: [] });
    await vi.waitFor(() => expect(requests(child)).toHaveLength(3));
    const callRequest = requestFor(child, "call-supervisor");
    reply(child, callRequest, { statuses: [] });
    await expect(call).resolves.toEqual({ statuses: [] });

    const databaseCall = client.callDatabase("dbGetProjects", {});
    await vi.waitFor(() => expect(requests(child)).toHaveLength(4));
    const databaseRequest = requestFor(child, "call-database");
    reply(child, databaseRequest, [{ id: "project" }]);
    await expect(databaseCall).resolves.toEqual([{ id: "project" }]);

    const event: SupervisorEvent = { type: "git-changed", projectId: "project" };
    child.emit("message", {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "supervisor-event",
      event,
    });
    child.emit("message", {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "supervisor-reset",
    });
    child.emit("message", {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "error",
      message: "worker warning",
    });

    expect(onEvent).toHaveBeenCalledExactlyOnceWith(event, false);
    expect(onReset).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "worker warning" }),
      undefined,
    );
  });

  it("forwards renderer sequence metadata with fallback events", async () => {
    const child = makeFakeChild();
    forkMock.mockReturnValue(child);
    const { client, onEvent } = createClient();
    await startClient(client, child);
    const event: SupervisorEvent = { type: "git-changed", projectId: "project" };

    child.emit("message", {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "supervisor-event",
      event,
      rendererSequence: 42,
    });

    expect(onEvent).toHaveBeenCalledExactlyOnceWith(event, false, 42);
  });

  it("routes typed services and native callbacks across the backend boundary", async () => {
    const child = makeFakeChild();
    forkMock.mockReturnValue(child);
    const { client, handleNativeRequest, onNativeEvent } = createClient();
    await startClient(client, child, {
      rendererStream: {
        version: 2,
        url: "ws://127.0.0.1:4567/events",
        token: "secret",
      },
    });

    await expect(client.getRendererStreamInfo()).resolves.toEqual({
      version: 2,
      url: "ws://127.0.0.1:4567/events",
      token: "secret",
    });
    const service = client.callService("getRemoteAccessPairing", {});
    await vi.waitFor(() => expect(requestFor(child, "call-service")).toBeDefined());
    const serviceRequest = requestFor(child, "call-service");
    reply(child, serviceRequest, { status: "disabled" });
    await expect(service).resolves.toEqual({ status: "disabled" });

    child.emit("message", {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "native-event",
      event: { type: "database-projection-changed" },
    });
    child.emit("message", {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "native-request",
      id: "native-1",
      request: { operation: "check-for-update", payload: {} },
    });
    expect(onNativeEvent).toHaveBeenCalledWith({ type: "database-projection-changed" });
    await vi.waitFor(() =>
      expect(requestFor(child, "resolve-native-request")).toMatchObject({
        payload: { requestId: "native-1", ok: true, data: { delivered: true } },
      }),
    );
    expect(handleNativeRequest).toHaveBeenCalledWith({
      operation: "check-for-update",
      payload: {},
    });
  });

  it("sends deduplicated live-event interests to the backend", async () => {
    const child = makeFakeChild();
    forkMock.mockReturnValue(child);
    const { client } = createClient();
    await startClient(client, child);

    const update = client.setEventInterests({
      terminalThreadIds: ["terminal-1", "terminal-1"],
      runtimeThreadIds: ["chat-1"],
      allRuntimeEvents: false,
    });
    await vi.waitFor(() => expect(requests(child)).toHaveLength(3));
    const request = requestFor(child, "set-event-interests");
    expect(request.payload).toEqual({
      terminalThreadIds: ["terminal-1"],
      runtimeThreadIds: ["chat-1"],
      allRuntimeEvents: false,
    });
    reply(child, request);
    await update;

    const clear = client.setEventInterests({
      terminalThreadIds: [],
      runtimeThreadIds: [],
      allRuntimeEvents: false,
    });
    await vi.waitFor(() => expect(requests(child)).toHaveLength(4));
    const clearRequest = requests(child)[3]!;
    expect(clearRequest).toMatchObject({
      operation: "set-event-interests",
      payload: {
        terminalThreadIds: [],
        runtimeThreadIds: [],
        allRuntimeEvents: false,
      },
    });
    reply(child, clearRequest);
    await clear;
  });

  it("restores event interests before restarting the supervisor after a crash", async () => {
    vi.useFakeTimers();
    const first = makeFakeChild(1);
    const second = makeFakeChild(2);
    forkMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const { client } = createClient();
    await startClient(client, first);

    const update = client.setEventInterests({
      terminalThreadIds: ["terminal-1"],
      runtimeThreadIds: ["chat-1"],
      allRuntimeEvents: false,
    });
    await vi.waitFor(() => expect(requests(first)).toHaveLength(3));
    reply(first, requests(first)[2]!);
    await update;

    first.emit("exit", 1);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(requests(second)).toHaveLength(1));
    reply(second, requestFor(second, "initialize"));
    await vi.waitFor(() => expect(requests(second)).toHaveLength(2));
    expect(requests(second)[1]).toMatchObject({
      operation: "set-event-interests",
      payload: {
        terminalThreadIds: ["terminal-1"],
        runtimeThreadIds: ["chat-1"],
      },
    });
    reply(second, requests(second)[1]!);
    await vi.waitFor(() => expect(requests(second)).toHaveLength(3));
    expect(requests(second)[2]).toMatchObject({ operation: "start-supervisor" });
  });

  it("recreates and restarts the backend after a crash", async () => {
    vi.useFakeTimers();
    const first = makeFakeChild(1);
    const second = makeFakeChild(2);
    forkMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const { client, onReset } = createClient();
    await startClient(client, first);

    first.emit("exit", 1);
    expect(onReset).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(requests(second)).toHaveLength(1));
    reply(second, requestFor(second, "initialize"));
    await vi.waitFor(() => expect(requests(second)).toHaveLength(2));
    expect(requestFor(second, "start-supervisor")).toMatchObject({
      payload: { extraEnv: { PORACODE_BROWSER_MCP_URL: "http://127.0.0.1" } },
    });
  });

  it("publishes replacement renderer stream credentials after backend recovery", async () => {
    vi.useFakeTimers();
    const first = makeFakeChild(1);
    const second = makeFakeChild(2);
    forkMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const { client, onRendererStreamInfo } = createClient();
    await startClient(client, first, {
      rendererStream: { version: 2, url: "ws://127.0.0.1:1001/events", token: "first" },
    });
    expect(onRendererStreamInfo).toHaveBeenLastCalledWith({
      version: 2,
      url: "ws://127.0.0.1:1001/events",
      token: "first",
    });

    first.emit("exit", 1);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(requests(second)).toHaveLength(1));
    reply(second, requestFor(second, "initialize"), {
      rendererStream: { version: 2, url: "ws://127.0.0.1:1002/events", token: "second" },
    });

    await vi.waitFor(() => expect(onRendererStreamInfo).toHaveBeenCalledTimes(2));
    expect(onRendererStreamInfo).toHaveBeenLastCalledWith({
      version: 2,
      url: "ws://127.0.0.1:1002/events",
      token: "second",
    });
  });

  it("queues new calls while the backend is recovering", async () => {
    vi.useFakeTimers();
    const first = makeFakeChild(1);
    const second = makeFakeChild(2);
    forkMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const { client } = createClient();
    await startClient(client, first);

    first.emit("exit", 1);
    const call = client.callDatabase("dbGetProjects", {});
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(requests(second)).toHaveLength(1));
    reply(second, requestFor(second, "initialize"));
    await vi.waitFor(() => expect(requests(second)).toHaveLength(3));
    const databaseRequest = requestFor(second, "call-database");
    reply(second, databaseRequest, [{ id: "project" }]);

    await expect(call).resolves.toEqual([{ id: "project" }]);
  });

  it("ignores initialization from an exited child whose process assignment settles late", async () => {
    vi.useFakeTimers();
    const first = makeFakeChild(1);
    const second = makeFakeChild(2);
    forkMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const assignment = Promise.withResolvers<void>();
    const assignPid = vi.fn<(pid: number) => Promise<void>>((pid) =>
      pid === 1 ? assignment.promise : Promise.resolve(),
    );
    const { client, onRendererStreamInfo } = createClient(assignPid);
    const call = client.callDatabase("dbGetProjects", {});
    reply(first, requestFor(first, "initialize"), {
      rendererStream: { version: 2, url: "ws://127.0.0.1:1001/events", token: "old" },
    });
    first.emit("exit", 1);
    await vi.advanceTimersByTimeAsync(1_000);
    assignment.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(onRendererStreamInfo).not.toHaveBeenCalled();
    expect(requests(second).map((request) => request.operation)).toEqual(["initialize"]);

    reply(second, requestFor(second, "initialize"), {
      rendererStream: { version: 2, url: "ws://127.0.0.1:1002/events", token: "new" },
    });
    await vi.advanceTimersByTimeAsync(0);
    reply(second, requestFor(second, "call-database"), [{ id: "project" }]);
    await expect(call).resolves.toEqual([{ id: "project" }]);
    expect(onRendererStreamInfo).toHaveBeenCalledExactlyOnceWith({
      version: 2,
      url: "ws://127.0.0.1:1002/events",
      token: "new",
    });
  });

  it("replaces a child whose initialize never settles and completes the parked caller", async () => {
    vi.useFakeTimers();
    const first = makeFakeChild(1);
    const second = makeFakeChild(2);
    const third = makeFakeChild(3);
    forkMock.mockReturnValueOnce(first).mockReturnValueOnce(second).mockReturnValueOnce(third);
    const { client, reportError } = createClient();
    await startClient(client, first);

    first.emit("exit", 1);
    const call = client.callDatabase("dbGetProjects", {});
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(requests(second)).toHaveLength(1));
    // The child accepts the initialize request but never replies. The caller's
    // default budget spans the initialization deadline, so it stays parked
    // instead of failing before the hung attempt can recover.
    await vi.advanceTimersByTimeAsync(BACKEND_HOST_INITIALIZATION_DEADLINE_MS);
    expect(terminateMock).toHaveBeenCalledExactlyOnceWith(second);
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("did not complete within") }),
      expect.objectContaining({ "poracode.feature_area": "backend-host" }),
    );

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(requests(third)).toHaveLength(1));
    reply(third, requestFor(third, "initialize"));
    await vi.waitFor(() => expect(requests(third)).toHaveLength(3));
    expect(requests(third).filter((r) => r.operation === "start-supervisor")).toHaveLength(1);
    reply(third, requestFor(third, "start-supervisor"));
    reply(third, requestFor(third, "call-database"), [{ id: "project" }]);

    await expect(call).resolves.toEqual([{ id: "project" }]);
    const disposal = client.disposeAsync();
    await vi.advanceTimersByTimeAsync(1_000);
    await disposal;
  });

  it("bounds initialization when the pid assignment hangs after the initialize reply", async () => {
    vi.useFakeTimers();
    const first = makeFakeChild(1);
    const second = makeFakeChild(2);
    forkMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const pendingAssignment = Promise.withResolvers<void>();
    const assignPid = vi.fn<(pid: number) => Promise<void>>((pid) =>
      pid === 1 ? pendingAssignment.promise : Promise.resolve(),
    );
    const { client, onRendererStreamInfo } = createClient(assignPid);
    const start = client.startSupervisor();

    await vi.waitFor(() => expect(requests(first)).toHaveLength(1));
    reply(first, requestFor(first, "initialize"), {
      rendererStream: { version: 2, url: "ws://127.0.0.1:1001/events", token: "stale" },
    });
    // The initialize reply settled, but the whole initialization is bounded:
    // a hung assignment must not wedge the child past the deadline.
    await vi.advanceTimersByTimeAsync(BACKEND_HOST_INITIALIZATION_DEADLINE_MS - 1_000);
    expect(terminateMock).not.toHaveBeenCalled();
    expect(requests(first)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(terminateMock).toHaveBeenCalledExactlyOnceWith(first);
    expect(onRendererStreamInfo).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(requests(second)).toHaveLength(1));
    reply(second, requestFor(second, "initialize"));
    await vi.waitFor(() => expect(requests(second)).toHaveLength(2));
    // The respawn hook and the parked startSupervisor share one start flight.
    expect(requests(second).map((r) => r.operation)).toEqual(["initialize", "start-supervisor"]);
    reply(second, requests(second)[1]!);
    await start;

    // The late assignment settlement must not alter the replacement child.
    pendingAssignment.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests(second).filter((r) => r.operation === "start-supervisor")).toHaveLength(1);
    expect(onRendererStreamInfo).not.toHaveBeenCalled();

    const disposal = client.disposeAsync();
    await vi.advanceTimersByTimeAsync(1_000);
    await disposal;
  });

  it("does not complete an expired interests sync before the child exits", async () => {
    vi.useFakeTimers();
    const first = makeFakeChild(1);
    const second = makeFakeChild(2);
    forkMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const { client } = createClient();
    const interests = client.setEventInterests({
      terminalThreadIds: ["shell"],
      runtimeThreadIds: [],
      allRuntimeEvents: false,
    });
    const call = client.callDatabase("dbGetProjects", {});
    reply(first, requestFor(first, "initialize"));
    await vi.advanceTimersByTimeAsync(0);
    const sync = requestFor(first, "set-event-interests");

    await vi.advanceTimersByTimeAsync(BACKEND_HOST_INITIALIZATION_DEADLINE_MS);
    expect(terminateMock).toHaveBeenCalledExactlyOnceWith(first);
    // The process has not emitted exit yet; its late reply must remain inert.
    reply(first, sync);
    await vi.advanceTimersByTimeAsync(0);
    expect(requests(first).map((request) => request.operation)).toEqual([
      "initialize",
      "set-event-interests",
    ]);

    await vi.advanceTimersByTimeAsync(1_000);
    reply(second, requestFor(second, "initialize"));
    await vi.advanceTimersByTimeAsync(0);
    expect(requests(second).map((request) => request.operation)).toEqual([
      "initialize",
      "set-event-interests",
    ]);
    reply(second, requestFor(second, "set-event-interests"));
    await vi.advanceTimersByTimeAsync(0);
    reply(second, requestFor(second, "call-database"), [{ id: "project" }]);
    await expect(call).resolves.toEqual([{ id: "project" }]);
    await interests;

    const disposal = client.disposeAsync();
    await vi.advanceTimersByTimeAsync(1_000);
    await disposal;
  });

  it("stops the initialization deadline on disposal", async () => {
    vi.useFakeTimers();
    const first = makeFakeChild(1);
    forkMock.mockReturnValueOnce(first);
    const { client, onRendererStreamInfo } = createClient();
    const start = client.startSupervisor();
    void start.catch(() => undefined);
    await vi.waitFor(() => expect(requests(first)).toHaveLength(1));

    // The initialize request never settles; disposal must clean up the
    // deadline so no late kill or respawn follows the terminated child.
    const disposal = client.disposeAsync();
    await vi.advanceTimersByTimeAsync(1_000);
    await disposal;
    await expect(start).rejects.toThrow("Backend host disposed.");
    expect(terminateMock).toHaveBeenCalledExactlyOnceWith(first);

    await vi.advanceTimersByTimeAsync(BACKEND_HOST_INITIALIZATION_DEADLINE_MS + 10 * 60_000);
    expect(forkMock).toHaveBeenCalledTimes(1);
    expect(terminateMock).toHaveBeenCalledExactlyOnceWith(first);
    expect(onRendererStreamInfo).not.toHaveBeenCalled();
  });

  it("rejects an in-flight request when the backend exits", async () => {
    vi.useFakeTimers();
    const child = makeFakeChild(1);
    forkMock.mockReturnValue(child);
    const { client } = createClient();
    await startClient(client, child);

    const call = client.callDatabase("dbGetProjects", {});
    await vi.waitFor(() => expect(requests(child)).toHaveLength(3));
    child.emit("exit", 1);

    await expect(call).rejects.toThrow("Backend host exited");
  });

  it("keeps recovery waiters alive across a failed initialization and completes on the next spawn", async () => {
    vi.useFakeTimers();
    const first = makeFakeChild(1);
    const second = makeFakeChild(2);
    const third = makeFakeChild(3);
    forkMock.mockReturnValueOnce(first).mockReturnValueOnce(second).mockReturnValueOnce(third);
    const { client } = createClient();
    await startClient(client, first);

    first.emit("exit", 1);
    const call = client.callDatabase("dbGetProjects", {});
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(requests(second)).toHaveLength(1));
    replyFailure(second, requestFor(second, "initialize"), "schema validation failed");
    await vi.waitFor(() => expect(terminateMock).toHaveBeenCalledExactlyOnceWith(second));

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(requests(third)).toHaveLength(1));
    reply(third, requestFor(third, "initialize"));
    await vi.waitFor(() => expect(requests(third)).toHaveLength(3));
    expect(requestFor(third, "start-supervisor")).toBeDefined();
    reply(third, requestFor(third, "start-supervisor"));
    reply(third, requestFor(third, "call-database"), [{ id: "project" }]);

    await expect(call).resolves.toEqual([{ id: "project" }]);
  });

  it("lets the first caller survive a failed first initialization and complete on the retried spawn", async () => {
    vi.useFakeTimers();
    const first = makeFakeChild(1);
    const second = makeFakeChild(2);
    forkMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const { client } = createClient();
    const start = client.startSupervisor();
    const call = client.callDatabase("dbGetProjects", {});

    await vi.waitFor(() => expect(requests(first)).toHaveLength(1));
    replyFailure(first, requestFor(first, "initialize"), "database is locked");
    await vi.waitFor(() => expect(terminateMock).toHaveBeenCalledExactlyOnceWith(first));

    first.emit("exit", 1);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(requests(second)).toHaveLength(1));
    reply(second, requestFor(second, "initialize"));
    await vi.waitFor(() => expect(requests(second)).toHaveLength(3));
    // The respawn hook and the parked caller share one start flight: the
    // requested supervisor start is neither dropped nor duplicated.
    expect(requests(second).filter((r) => r.operation === "start-supervisor")).toHaveLength(1);
    expect(requestFor(second, "start-supervisor")).toMatchObject({
      payload: { extraEnv: { PORACODE_BROWSER_MCP_URL: "http://127.0.0.1" } },
    });
    for (const request of requests(second)) {
      if (request.operation === "start-supervisor") reply(second, request);
      if (request.operation === "call-database") reply(second, request, [{ id: "project" }]);
    }

    await start;
    await expect(call).resolves.toEqual([{ id: "project" }]);
    expect(requests(second).filter((r) => r.operation === "start-supervisor")).toHaveLength(1);
  });

  it("bounds respawn attempts after repeated initialization failures", async () => {
    vi.useFakeTimers();
    const children = [
      makeFakeChild(1),
      makeFakeChild(2),
      makeFakeChild(3),
      makeFakeChild(4),
      makeFakeChild(5),
    ];
    forkMock.mockImplementation(() => children[forkMock.mock.calls.length - 1]!);
    // A long waiter budget proves waiters survive every transient failure and
    // are then rejected by the bounded give-up instead of their own timeout.
    const { client, reportError } = createClient(undefined, { initWaitTimeoutMs: 60_000 });
    const call = client.callDatabase("dbGetProjects", {});
    // Attach a quiet handler early so the give-up rejection is not flagged as
    // unhandled while the retry loop is still running.
    void call.catch(() => undefined);

    for (const [index, child] of children.entries()) {
      if (index > 0) await vi.advanceTimersByTimeAsync(2 ** (index - 1) * 1_000);
      await vi.waitFor(() => expect(requests(child)).toHaveLength(1));
      replyFailure(child, requestFor(child, "initialize"), `failure ${index + 1}`);
      await vi.waitFor(() => expect(terminateMock).toHaveBeenCalledWith(child));
    }

    await expect(call).rejects.toThrow("failed to initialize after 5 consecutive attempts");
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("failed to initialize after 5") }),
      expect.objectContaining({ "poracode.feature_area": "backend-host" }),
    );
    expect(forkMock).toHaveBeenCalledTimes(5);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(forkMock).toHaveBeenCalledTimes(5);
    await client.disposeAsync();
  });

  it("resets the respawn backoff after a successful initialization", async () => {
    vi.useFakeTimers();
    const children = [makeFakeChild(1), makeFakeChild(2), makeFakeChild(3), makeFakeChild(4)];
    forkMock.mockImplementation(() => children[forkMock.mock.calls.length - 1]!);
    const { client } = createClient();
    await startClient(client, children[0]!);

    children[0]!.emit("exit", 1);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(requests(children[1]!)).toHaveLength(1));
    replyFailure(children[1]!, requestFor(children[1]!, "initialize"), "transient");
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(requests(children[2]!)).toHaveLength(1));
    reply(children[2]!, requestFor(children[2]!, "initialize"));

    children[2]!.emit("exit", 1);
    await vi.advanceTimersByTimeAsync(999);
    expect(forkMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(forkMock).toHaveBeenCalledTimes(4);

    const disposal = client.disposeAsync();
    await vi.advanceTimersByTimeAsync(1_000);
    await disposal;
  });

  it("stops recovery on disposal and ignores stale messages from a replaced child", async () => {
    vi.useFakeTimers();
    const first = makeFakeChild(1);
    const second = makeFakeChild(2);
    forkMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const { client, onEvent, onRendererStreamInfo } = createClient();
    await startClient(client, first);

    first.emit("exit", 1);
    const call = client.callDatabase("dbGetProjects", {});
    // Attach a quiet handler early so the disposal rejection is not flagged as
    // unhandled before its assertion runs.
    void call.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(requests(second)).toHaveLength(1));

    reply(first, requestFor(first, "initialize"), {
      rendererStream: { version: 2, url: "ws://127.0.0.1:9999/events", token: "stale" },
    });
    first.emit("message", {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "supervisor-event",
      event: { type: "git-changed", projectId: "stale" } satisfies SupervisorEvent,
    });
    expect(onEvent).not.toHaveBeenCalled();
    expect(onRendererStreamInfo).not.toHaveBeenCalled();

    const disposal = client.disposeAsync();
    await vi.advanceTimersByTimeAsync(1_000);
    await disposal;

    await expect(call).rejects.toThrow("Backend host disposed.");
    expect(forkMock).toHaveBeenCalledTimes(2);
    expect(terminateMock).toHaveBeenLastCalledWith(second);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(forkMock).toHaveBeenCalledTimes(2);
  });

  it("keeps waiters parked when a recovery spawn fails and completes on the next spawn", async () => {
    vi.useFakeTimers();
    const first = makeFakeChild(1);
    const third = makeFakeChild(3);
    forkMock.mockReturnValueOnce(first).mockReturnValueOnce(null).mockReturnValueOnce(third);
    const { client, reportError } = createClient();
    await startClient(client, first);

    first.emit("exit", 1);
    const call = client.callDatabase("dbGetProjects", {});
    await vi.advanceTimersByTimeAsync(1_000);
    expect(forkMock).toHaveBeenCalledTimes(2);
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Failed to spawn backend host." }),
      expect.objectContaining({ "poracode.feature_area": "backend-host" }),
    );

    // The parked caller survives the failed spawn and completes on the next
    // one instead of being rejected by it.
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(requests(third)).toHaveLength(1));
    reply(third, requestFor(third, "initialize"));
    await vi.waitFor(() => expect(requests(third)).toHaveLength(3));
    reply(third, requestFor(third, "start-supervisor"));
    reply(third, requestFor(third, "call-database"), [{ id: "project" }]);

    await expect(call).resolves.toEqual([{ id: "project" }]);
    const disposal = client.disposeAsync();
    await vi.advanceTimersByTimeAsync(1_000);
    await disposal;
  });

  it("rejects start with the bounded fatal error when every fork fails", async () => {
    vi.useFakeTimers();
    forkMock.mockReturnValue(null);
    const { client, reportError } = createClient();

    const start = client.startSupervisor();
    void start.catch(() => undefined);
    // Five failed forks with 1+2+4+8s of backoff between them.
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(start).rejects.toThrow(
      "Backend host failed to initialize after 5 consecutive attempts: Failed to spawn backend host.",
    );
    expect(forkMock).toHaveBeenCalledTimes(5);
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Failed to spawn backend host."),
      }),
      expect.objectContaining({ "poracode.feature_area": "backend-host" }),
    );

    await vi.advanceTimersByTimeAsync(60_000);
    expect(forkMock).toHaveBeenCalledTimes(5);
    await client.disposeAsync();
  });

  it("times out waiters if backend recovery never initializes", async () => {
    const first = makeFakeChild(1);
    const second = makeFakeChild(2);
    forkMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const { client } = createClient(undefined, { initWaitTimeoutMs: 20 });
    await startClient(client, first);

    first.emit("exit", 1);
    const call = client.callDatabase("dbGetProjects", {});

    await expect(call).rejects.toThrow("Backend host initialization timed out.");
    await client.disposeAsync();
  });
});
