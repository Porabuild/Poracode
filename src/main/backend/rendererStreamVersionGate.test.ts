import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKEND_RENDERER_STREAM_VERSION,
  type BackendRendererStreamInfo,
} from "@/shared/backendHostProtocol";

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

interface FakeChild extends EventEmitter {
  connected: boolean;
  pid?: number;
  stdout: null;
  stderr: null;
  send: ReturnType<
    typeof vi.fn<(message: unknown, callback?: (error: Error | null) => void) => boolean>
  >;
}

function makeFakeChild(pid = 42): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.connected = true;
  child.pid = pid;
  child.stdout = null;
  child.stderr = null;
  child.send = vi.fn<(message: unknown, callback?: (error: Error | null) => void) => boolean>(
    (message: unknown, callback?: (error: Error | null) => void) => {
      callback?.(null);
      return true;
    },
  );
  return child;
}

function requests(child: FakeChild): Array<{ operation: string; id: string }> {
  return child.send.mock.calls.map(([message]) => message as { operation: string; id: string });
}

async function startWithStream(
  child: FakeChild,
  rendererStream: unknown,
): Promise<{ infoCalls: unknown[]; client: BackendHostClient }> {
  const onRendererStreamInfo = vi.fn<(info: BackendRendererStreamInfo) => void>();
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
      },
    },
    resolveExtraEnv: () => ({}),
    assignPid: async () => undefined,
    reportError: () => {},
    handleNativeRequest: async () => ({}),
    onNativeEvent: () => {},
    onRendererStreamInfo,
    onEvent: () => {},
    onRendererStreamRecovery: () => {},
    onReset: () => {},
  });
  const starting = client.startSupervisor();
  await vi.waitFor(() => expect(requests(child).length).toBeGreaterThan(0));
  const init = requests(child).find((request) => request.operation === "initialize")!;
  child.emit("message", {
    version: 13,
    kind: "reply",
    replyTo: init.id,
    ok: true,
    data: { rendererStream },
  });
  await vi.waitFor(() =>
    expect(requests(child).some((request) => request.operation === "start-supervisor")).toBe(true),
  );
  const startReq = requests(child).find((request) => request.operation === "start-supervisor")!;
  child.emit("message", { version: 13, kind: "reply", replyTo: startReq.id, ok: true, data: null });
  await starting;
  return { infoCalls: onRendererStreamInfo.mock.calls, client };
}

beforeEach(() => {
  vi.useFakeTimers();
  forkMock.mockReset();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("renderer stream version gate (main/host)", () => {
  it("accepts v6 stream info and ignores stale v5 (fallback, no silent connect)", async () => {
    expect(BACKEND_RENDERER_STREAM_VERSION).toBe(6);
    const v6Child = makeFakeChild(1);
    forkMock.mockReturnValueOnce(v6Child);
    const v6 = await startWithStream(v6Child, {
      version: 6,
      url: "ws://127.0.0.1:1001/events",
      token: "new",
    });
    expect(v6.infoCalls).toHaveLength(1);
    expect(v6.infoCalls[0]).toEqual([
      { version: 6, url: "ws://127.0.0.1:1001/events", token: "new" },
    ]);
    expect(await v6.client.getRendererStreamInfo()).toEqual({
      version: 6,
      url: "ws://127.0.0.1:1001/events",
      token: "new",
    });
    v6.client.dispose();

    const v5Child = makeFakeChild(2);
    forkMock.mockReturnValueOnce(v5Child);
    const v5 = await startWithStream(v5Child, {
      version: 5,
      url: "ws://127.0.0.1:1002/events",
      token: "old",
    });
    // Stale host info never reaches the renderer: it keeps the IPC fallback.
    expect(v5.infoCalls).toHaveLength(0);
    await expect(v5.client.getRendererStreamInfo()).rejects.toThrow(/unavailable/);
    v5.client.dispose();
  });
});
