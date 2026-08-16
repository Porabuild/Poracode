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

import { BackendHostClient } from "./BackendHostClient";

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

  it("terminates a recovered child whose initialization fails instead of hanging calls", async () => {
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
    replyFailure(second, requestFor(second, "initialize"), "schema validation failed");

    await expect(call).rejects.toThrow("schema validation failed");
    expect(terminateMock).toHaveBeenCalledExactlyOnceWith(second);
  });

  it("rejects waiters when a recovery spawn fails instead of hanging", async () => {
    const first = makeFakeChild(1);
    forkMock.mockReturnValueOnce(first).mockReturnValue(null);
    const { client, reportError } = createClient();
    await startClient(client, first);

    first.emit("exit", 1);
    const call = client.callDatabase("dbGetProjects", {});

    await expect(call).rejects.toThrow("Failed to spawn backend host.");
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Failed to spawn backend host." }),
      expect.objectContaining({ "poracode.feature_area": "backend-host" }),
    );
    await client.disposeAsync();
  });

  it("rejects start when the initial fork fails", async () => {
    forkMock.mockReturnValue(null);
    const { client } = createClient();

    await expect(client.startSupervisor()).rejects.toThrow("Failed to spawn backend host.");
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
