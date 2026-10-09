import { WorkspaceLaunchUnavailableError } from "@/shared/threadWorkspaceRefusal";
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StartThreadPayload } from "@/shared/contracts";
import type { WorkspaceLaunchSelection } from "./WorkspaceLaunchBridge";
import { THREAD_WORKSPACE_RUNTIME_REQUEST } from "@/shared/threadWorkspaceRuntimeProtocol";

const forkMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  fork: forkMock,
}));
vi.mock("@/shared/processTree", () => ({ terminateChildProcessTree: vi.fn<() => void>() }));
import { SupervisorClient } from "./SupervisorClient";

const launch: StartThreadPayload = {
  threadId: "thread",
  agentKind: "neutral",
  projectLocation: { kind: "posix", path: "/primary" },
  config: { model: "model" },
  prompt: "",
  presentationMode: "gui",
  initialSize: { cols: 120, rows: 40 },
};
const selection = (): WorkspaceLaunchSelection => ({
  owner: "owner",
  scope: {
    primaryLocation: launch.projectLocation,
    additionalDirectories: [{ kind: "posix", path: "/extra" }],
    revision: 2,
  },
});
type Request = { id: string; type: string; payload: Record<string, unknown> };
function fixture(reader = vi.fn<() => WorkspaceLaunchSelection | undefined>(() => selection())) {
  const child = Object.assign(new EventEmitter(), {
    connected: true,
    stdout: null,
    stderr: null,
    send: vi.fn<(message: unknown, callback?: (error?: Error) => void) => boolean>(
      (_message, callback) => {
        callback?.();
        return true;
      },
    ),
  });
  forkMock.mockReturnValue(child);
  const client = new SupervisorClient({
    baseDir: "/fake",
    appVersion: "test",
    isDev: true,
    supervisorPath: "/fake/supervisor.cjs",
    wslHelpersDir: "/fake",
    secretStorageKey: "test",
    onEvent: vi.fn<() => void>(),
    onReset: vi.fn<() => void>(),
    prepareWorkspaceLaunch: reader,
  });
  void client.start();
  const requests = () =>
    child.send.mock.calls
      .map(([message]) => message as Request)
      .filter((request) => typeof request.id === "string");
  const reply = (request: Request, data: unknown) =>
    child.emit("message", { replyTo: request.id, ok: true, data });
  return { child, client, reader, requests, reply };
}
const support = { version: 1, incarnation: "b36805a3-1c39-49af-af5c-3fe205ad45ef" };
beforeEach(() => forkMock.mockReset());
describe("SupervisorClient committed workspace launches", () => {
  it.each(
    (["restartPromise", "stopPromise"] as const).flatMap((field) =>
      (["startThread", "ensureThreadRunning"] as const).flatMap((procedure) =>
        (["closeThread", "closeThreadConfirmed", "interruptThread"] as const).map((control) => ({
          field,
          procedure,
          control,
        })),
      ),
    ),
  )(
    "keeps $control cancellation of $procedure while awaiting $field",
    async ({ field, procedure, control }) => {
      const f = fixture();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const transition = f.client as unknown as {
        restartPromise: Promise<void> | null;
        stopPromise: Promise<void> | null;
      };
      transition[field] = gate;
      f.child.send.mockImplementation((message, callback) => {
        callback?.();
        const request = message as Request;
        if (request.id)
          queueMicrotask(() =>
            f.reply(
              request,
              request.payload.action === "support" ? support : { threadId: "thread" },
            ),
          );
        return true;
      });
      const run = f.client.call(procedure, launch).catch((error: unknown) => error);
      const close = f.client.call(control, { threadId: "thread" });
      transition[field] = null;
      release();
      await close;
      await expect(run).resolves.toBeInstanceOf(WorkspaceLaunchUnavailableError);
      expect(f.requests().filter((request) => request.payload.action === "launch")).toHaveLength(0);
    },
  );
  it.each(["restartPromise", "stopPromise"] as const)(
    "allows an unchanged control epoch after %s",
    async (field) => {
      const f = fixture();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const transition = f.client as unknown as {
        restartPromise: Promise<void> | null;
        stopPromise: Promise<void> | null;
      };
      transition[field] = gate;
      f.child.send.mockImplementation((message, callback) => {
        callback?.();
        const request = message as Request;
        if (request.id)
          queueMicrotask(() =>
            f.reply(
              request,
              request.payload.action === "support" ? support : { threadId: "thread" },
            ),
          );
        return true;
      });
      const run = f.client.call("startThread", launch);
      transition[field] = null;
      release();
      await expect(run).resolves.toEqual({ threadId: "thread" });
      expect(f.requests().map((r) => r.payload.action)).toEqual(["support", "launch"]);
    },
  );
  it.each(["startThread", "ensureThreadRunning"] as const)(
    "negotiates before sending %s with complete private scope",
    async (procedure) => {
      const f = fixture();
      const run = f.client.call(procedure, launch);
      await vi.waitFor(() => expect(f.requests()).toHaveLength(1));
      expect(f.requests()[0]).toMatchObject({
        type: THREAD_WORKSPACE_RUNTIME_REQUEST,
        payload: { action: "support", version: 1 },
      });
      f.reply(f.requests()[0]!, support);
      await vi.waitFor(() => expect(f.requests()).toHaveLength(2));
      expect(f.requests()[1]).toMatchObject({
        type: THREAD_WORKSPACE_RUNTIME_REQUEST,
        payload: {
          action: "launch",
          incarnation: support.incarnation,
          procedure,
          scope: selection().scope,
        },
      });
      expect(
        f.requests().some((r) => r.type === "startThread" || r.type === "ensureThreadRunning"),
      ).toBe(false);
      f.reply(f.requests()[1]!, { threadId: "thread" });
      await expect(run).resolves.toEqual({ threadId: "thread" });
    },
  );
  it("keeps legacy empty launches on the existing public request", async () => {
    const f = fixture(vi.fn<() => undefined>(() => undefined));
    const run = f.client.call("startThread", launch);
    await vi.waitFor(() => expect(f.requests()).toHaveLength(1));
    expect(f.requests()[0]!.type).toBe("startThread");
    f.reply(f.requests()[0]!, { threadId: "thread" });
    await expect(run).resolves.toEqual({ threadId: "thread" });
  });
  it("refuses an older peer before any scoped or legacy launch", async () => {
    const f = fixture();
    const run = f.client.call("startThread", launch);
    const rejected = run.catch((error: unknown) => error);
    await vi.waitFor(() => expect(f.requests()).toHaveLength(1));
    f.child.emit("message", { replyTo: f.requests()[0]!.id, ok: false, error: "Unknown request" });
    await expect(rejected).resolves.toBeInstanceOf(WorkspaceLaunchUnavailableError);
    expect(f.requests()).toHaveLength(1);
  });
  it.each(["closeThread", "interruptThread"] as const)(
    "does not launch after %s during support wait",
    async (control) => {
      const f = fixture();
      const run = f.client.call("startThread", launch);
      const rejected = run.catch((error: unknown) => error);
      await vi.waitFor(() => expect(f.requests()).toHaveLength(1));
      const supportRequest = f.requests()[0]!;
      const close = f.client.call(control, { threadId: "thread" });
      await vi.waitFor(() => expect(f.requests()).toHaveLength(2));
      f.reply(f.requests()[1]!, undefined);
      await close;
      f.reply(supportRequest, support);
      await expect(rejected).resolves.toBeInstanceOf(WorkspaceLaunchUnavailableError);
      expect(f.requests().filter((r) => r.payload.action === "launch")).toHaveLength(0);
    },
  );
  it("refuses unresolved/changed SQL custody after support", async () => {
    const f = fixture();
    const run = f.client.call("ensureThreadRunning", launch);
    const rejected = run.catch((error: unknown) => error);
    await vi.waitFor(() => expect(f.requests()).toHaveLength(1));
    f.reader.mockImplementation(() => {
      throw new WorkspaceLaunchUnavailableError("reconciliation");
    });
    f.reply(f.requests()[0]!, support);
    await expect(rejected).resolves.toBeInstanceOf(WorkspaceLaunchUnavailableError);
    expect(f.requests()).toHaveLength(1);
  });
  it("rechecks authority in the send continuation after the bridge settles", async () => {
    const f = fixture();
    f.reader
      .mockImplementationOnce(() => selection())
      .mockImplementationOnce(() => selection())
      .mockImplementationOnce(() => ({ ...selection(), owner: "replacement" }));
    const run = f.client.call("startThread", launch);
    const rejected = run.catch((error: unknown) => error);
    await vi.waitFor(() => expect(f.requests()).toHaveLength(1));
    f.reply(f.requests()[0]!, support);
    await expect(rejected).resolves.toBeInstanceOf(WorkspaceLaunchUnavailableError);
    expect(f.requests()).toHaveLength(1);
  });
});
