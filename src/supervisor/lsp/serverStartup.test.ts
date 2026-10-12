import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import type { MessageConnection } from "vscode-jsonrpc/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LspSessionStatus } from "@/shared/lsp";

const hooks = vi.hoisted(() => ({
  spawn: vi.fn<typeof import("node:child_process").spawn>(),
  connection: vi.fn<typeof import("vscode-jsonrpc/node").createMessageConnection>(),
  prime: vi.fn<typeof import("../agents/base").primeProjectShellEnv>(),
  prepare: vi.fn<typeof import("../agents/base").prepareAgentLocationEnvironment>(),
  command: vi.fn<typeof import("../agents/base").buildAgentCommand>(),
  terminate: vi.fn<typeof import("@/shared/processTree").terminateChildProcessTree>(),
  capture: vi.fn<(error: unknown, tags?: Record<string, string>) => void>(),
}));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: hooks.spawn,
}));
vi.mock("vscode-jsonrpc/node", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vscode-jsonrpc/node")>()),
  createMessageConnection: hooks.connection,
}));
vi.mock("../agents/base", () => ({
  primeProjectShellEnv: hooks.prime,
  prepareAgentLocationEnvironment: hooks.prepare,
  buildAgentCommand: hooks.command,
}));
vi.mock("@/shared/processTree", () => ({ terminateChildProcessTree: hooks.terminate }));
vi.mock("../diagnostics/sentry", () => ({ captureSupervisorException: hooks.capture }));

import { ServerInstance } from "./serverInstance";

function deferred<T>() {
  return Promise.withResolvers<T>();
}
function fakeProcess() {
  const events = new EventEmitter();
  const process = Object.assign(events, {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
  }) as unknown as ChildProcess;
  return { process, events };
}
function fakeConnection() {
  let notification: ((method: string, params: unknown) => void) | null = null;
  let closed: (() => void) | null = null;
  let errored: ((event: [Error]) => void) | null = null;
  const dispose = vi.fn<() => void>();
  const sendRequest = vi.fn<(method: string, params?: unknown) => Promise<unknown>>(async () => ({
    capabilities: {},
  }));
  const sendNotification = vi.fn<(method: string, params?: unknown) => Promise<void>>(
    async () => {},
  );
  const value = {
    onNotification: (callback: typeof notification) => {
      notification = callback;
    },
    onRequest: () => {},
    onClose: (callback: typeof closed) => {
      closed = callback;
    },
    onError: (callback: typeof errored) => {
      errored = callback;
    },
    listen: () => {},
    sendRequest,
    sendNotification,
    dispose,
  } as unknown as MessageConnection;
  return {
    value,
    dispose,
    sendRequest,
    sendNotification,
    notify: () => notification?.("test/notification", {}),
    close: () => closed?.(),
    error: () => errored?.([new Error("late connection error")]),
  };
}
const instances: ServerInstance[] = [];
let children: ReturnType<typeof fakeProcess>[];
let connection: ReturnType<typeof fakeConnection>;
beforeEach(() => {
  vi.useFakeTimers();
  for (const hook of Object.values(hooks)) hook.mockReset();
  children = [];
  connection = fakeConnection();
  hooks.prime.mockResolvedValue(undefined);
  hooks.prepare.mockResolvedValue(undefined);
  hooks.command.mockImplementation((_location, command, args) => ({ command, args }));
  hooks.spawn.mockImplementation(() => {
    const child = fakeProcess();
    children.push(child);
    return child.process;
  });
  hooks.connection.mockReturnValue(connection.value);
});
afterEach(() => {
  for (const instance of instances.splice(0)) instance.dispose();
  vi.useRealTimers();
});
function fixture(commands = ["first-server"]) {
  const statuses: LspSessionStatus[] = [];
  const messages: unknown[] = [];
  const instance = new ServerInstance(
    "startup:test",
    {
      languageId: "test",
      commands: commands.map((command) => ({ command, args: [] })),
      fileExtensions: [],
    },
    { kind: "posix", path: "/repo" },
    (message) => messages.push(message),
    (status) => statuses.push(status),
  );
  instances.push(instance);
  return { instance, statuses, messages };
}
function observe(promise: Promise<void>) {
  return promise.then(
    () => ({ resolved: true }),
    (error: unknown) => ({ resolved: false, error }),
  );
}

describe("ServerInstance startup ownership", () => {
  it.each(["priming", "environment"] as const)(
    "does not spawn after disposal during %s",
    async (phase) => {
      const prime = deferred<Record<string, string> | undefined>();
      const environment = deferred<void>();
      if (phase === "priming") hooks.prime.mockReturnValueOnce(prime.promise);
      else hooks.prepare.mockReturnValueOnce(environment.promise);
      const { instance, statuses } = fixture();
      const pending = observe(instance.start());
      await vi.waitFor(() =>
        expect(phase === "priming" ? hooks.prime : hooks.prepare).toHaveBeenCalledOnce(),
      );
      instance.dispose();
      prime.resolve(undefined);
      environment.resolve();
      await vi.runAllTimersAsync();
      const result = await pending;
      instance.dispose();
      expect(hooks.spawn).not.toHaveBeenCalled();
      expect(result).toEqual({ resolved: true });
      expect(statuses).toEqual(["starting", "stopped"]);
    },
  );

  it("owns the spawned candidate before its readiness window", async () => {
    const { instance, statuses } = fixture();
    const pending = observe(instance.start());
    await vi.waitFor(() => expect(hooks.spawn).toHaveBeenCalledOnce());
    const child = children[0]!;
    instance.dispose();
    const terminatedAtStop = hooks.terminate.mock.calls.filter(
      ([process]) => process === child.process,
    ).length;
    await vi.runAllTimersAsync();
    const result = await pending;
    instance.dispose();
    expect(terminatedAtStop).toBe(1);
    expect(hooks.connection).not.toHaveBeenCalled();
    expect(result).toEqual({ resolved: true });
    expect(statuses).toEqual(["starting", "stopped"]);
    expect(child.events.listenerCount("error")).toBe(0);
    expect(child.events.listenerCount("exit")).toBe(0);
  });

  it.each(["initialize-success", "initialize-error", "initialized"] as const)(
    "ignores late %s completion after disposal",
    async (phase) => {
      const response = deferred<unknown>();
      const initialized = deferred<void>();
      if (phase === "initialized")
        connection.sendNotification.mockReturnValueOnce(initialized.promise);
      else connection.sendRequest.mockReturnValueOnce(response.promise);
      const { instance, statuses, messages } = fixture();
      const pending = observe(instance.start());
      await vi.advanceTimersByTimeAsync(200);
      expect(
        phase === "initialized" ? connection.sendNotification : connection.sendRequest,
      ).toHaveBeenCalled();
      instance.dispose();
      const statusCount = statuses.length;
      if (phase === "initialize-error") response.reject(new Error("late startup error"));
      else response.resolve({ capabilities: {} });
      initialized.resolve();
      const result = await pending;
      connection.notify();
      connection.close();
      connection.error();
      expect(result).toEqual({ resolved: true });
      expect(statuses).toHaveLength(statusCount);
      expect(messages).toHaveLength(0);
      expect(connection.dispose).toHaveBeenCalledOnce();
      expect(hooks.terminate).toHaveBeenCalledOnce();
      expect(hooks.capture).not.toHaveBeenCalled();
      expect(connection.sendNotification).toHaveBeenCalledTimes(phase === "initialized" ? 1 : 0);
    },
  );

  it("shares concurrent startup and reuses the ready instance without another candidate", async () => {
    const priming = deferred<Record<string, string> | undefined>();
    hooks.prime.mockReturnValueOnce(priming.promise);
    const { instance, statuses } = fixture();
    const first = instance.start();
    const second = instance.start();
    expect(second).toBe(first);
    await vi.waitFor(() => expect(hooks.prime).toHaveBeenCalledOnce());
    priming.resolve(undefined);
    await vi.advanceTimersByTimeAsync(200);
    await Promise.all([first, second]);
    expect(instance.start()).toBe(first);
    expect(hooks.spawn).toHaveBeenCalledOnce();
    expect(hooks.connection).toHaveBeenCalledOnce();
    expect(statuses).toEqual(["starting", "ready"]);
  });

  it("suppresses a late priming rejection after retirement", async () => {
    const priming = deferred<Record<string, string> | undefined>();
    hooks.prime.mockReturnValueOnce(priming.promise);
    const { instance, statuses } = fixture();
    const pending = observe(instance.start());
    await vi.waitFor(() => expect(hooks.prime).toHaveBeenCalledOnce());
    instance.dispose();
    priming.reject(new Error("late environment failure"));
    expect(await pending).toEqual({ resolved: true });
    expect(hooks.spawn).not.toHaveBeenCalled();
    expect(statuses).toEqual(["starting", "stopped"]);
  });

  it("preserves candidate fallback order and releases readiness listeners", async () => {
    const { instance, statuses } = fixture(["first-server", "fallback-server"]);
    const pending = instance.start();
    await vi.waitFor(() => expect(hooks.spawn).toHaveBeenCalledOnce());
    const first = children[0]!;
    first.events.emit("error", new Error("candidate failed"));
    await vi.advanceTimersByTimeAsync(200);
    await pending;

    expect(hooks.spawn.mock.calls.map(([command]) => command)).toEqual([
      "first-server",
      "fallback-server",
    ]);
    expect(hooks.terminate).toHaveBeenCalledExactlyOnceWith(first.process);
    expect(first.events.listenerCount("error")).toBe(0);
    expect(first.events.listenerCount("exit")).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    first.events.emit("exit", 1);
    expect(statuses).toEqual(["starting", "ready"]);
    instance.dispose();
    expect(children[1]!.events.listenerCount("exit")).toBe(0);
    expect(hooks.terminate).toHaveBeenCalledTimes(2);
  });

  it("cancels the queued crash restart on disposal", async () => {
    const { instance, statuses } = fixture();
    const pending = instance.start();
    await vi.advanceTimersByTimeAsync(200);
    await pending;
    children[0]!.events.emit("exit", 1);
    expect(vi.getTimerCount()).toBe(1);
    instance.dispose();
    const countAtStop = statuses.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(hooks.spawn).toHaveBeenCalledOnce();
    expect(statuses).toHaveLength(countAtStop);
    expect(connection.dispose).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves the bounded crash retries while stale callbacks cannot affect the successor", async () => {
    const firstConnection = connection;
    const nextConnection = fakeConnection();
    hooks.connection
      .mockReturnValueOnce(firstConnection.value)
      .mockReturnValue(nextConnection.value);
    const { instance, statuses, messages } = fixture();
    const pending = instance.start();
    await vi.advanceTimersByTimeAsync(200);
    await pending;
    children[0]!.events.emit("exit", 1);
    await vi.advanceTimersByTimeAsync(2200);
    const beforeLate = statuses.length;
    firstConnection.notify();
    firstConnection.close();
    firstConnection.error();
    expect(messages).toHaveLength(0);
    expect(statuses).toHaveLength(beforeLate);
    await expect(instance.sendMessage({ id: 7, method: "test/live" })).resolves.toEqual({
      capabilities: {},
    });
    expect(firstConnection.dispose).toHaveBeenCalledOnce();

    children[1]!.events.emit("exit", 1);
    await vi.advanceTimersByTimeAsync(4200);
    children[2]!.events.emit("exit", 1);
    await vi.advanceTimersByTimeAsync(8200);
    children[3]!.events.emit("exit", 1);
    await vi.advanceTimersByTimeAsync(20000);
    expect(hooks.spawn).toHaveBeenCalledTimes(4);
    // Initial startup plus immediate backoff and actual restart for three retries.
    expect(statuses.filter((status) => status === "starting")).toHaveLength(7);
    expect(statuses.filter((status) => status === "ready")).toHaveLength(4);
    expect(statuses.at(-1)).toBe("error");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves live request failures and discards a successful reply after disposal", async () => {
    const { instance } = fixture();
    const pending = instance.start();
    await vi.advanceTimersByTimeAsync(200);
    await pending;
    const liveError = new Error("live request failure");
    connection.sendRequest.mockRejectedValueOnce(liveError);
    await expect(instance.sendMessage({ id: 1, method: "test/error" })).rejects.toBe(liveError);
    const reply = deferred<unknown>();
    connection.sendRequest.mockReturnValueOnce(reply.promise);
    const request = instance.sendMessage({ id: 2, method: "test/late" });
    instance.dispose();
    reply.resolve({ stale: true });
    await expect(request).resolves.toBeUndefined();
  });

  it("keeps a live initialization rejection private and releases its exact candidate", async () => {
    connection.sendRequest.mockRejectedValueOnce(new Error("initialize rejected at /private/repo"));
    const { instance, statuses } = fixture();
    const pending = observe(instance.start());
    await vi.advanceTimersByTimeAsync(200);
    const result = await pending;
    expect(result).toEqual({
      resolved: false,
      error: new Error("Language server failed to initialize."),
    });
    expect(statuses).toEqual(["starting", "error"]);
    expect(connection.sendNotification).not.toHaveBeenCalled();
    expect(connection.dispose).toHaveBeenCalledOnce();
    expect(hooks.terminate).toHaveBeenCalledExactlyOnceWith(children[0]!.process);
    expect(children[0]!.events.listenerCount("exit")).toBe(0);
    expect(hooks.capture).not.toHaveBeenCalled();
    instance.dispose();
    expect(connection.dispose).toHaveBeenCalledOnce();
    expect(hooks.terminate).toHaveBeenCalledOnce();
  });
});
