import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());
const terminateChildProcessTreeMock = vi.hoisted(() => vi.fn<(child: unknown) => void>());

vi.mock("node:child_process", async (importActual) => {
  const actual = await importActual<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: spawnMock,
  };
});

vi.mock("../shared/processTree", () => ({
  terminateChildProcessTree: terminateChildProcessTreeMock,
}));

import { WindowsJobObjectManager } from "./windowsJobObject";

function createMockChild() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  const child = {
    pid: 4242,
    stdin,
    stdout,
    stderr,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    killed: false,
    on(event: string, handler: (...args: unknown[]) => void) {
      const next = listeners.get(event) ?? [];
      next.push(handler);
      listeners.set(event, next);
      return this;
    },
    once(event: string, handler: (...args: unknown[]) => void) {
      const wrapped = (...args: unknown[]) => {
        this.removeListener(event, wrapped);
        handler(...args);
      };
      return this.on(event, wrapped);
    },
    removeListener(event: string, handler: (...args: unknown[]) => void) {
      const next = (listeners.get(event) ?? []).filter((candidate) => candidate !== handler);
      listeners.set(event, next);
      return this;
    },
    emit(event: string, ...args: unknown[]) {
      if (event === "exit") {
        child.exitCode = (args[0] as number | null) ?? null;
        child.signalCode = (args[1] as NodeJS.Signals | null) ?? null;
      }
      for (const handler of listeners.get(event) ?? []) {
        handler(...args);
      }
      return true;
    },
    kill: vi.fn<() => boolean>(() => {
      child.killed = true;
      child.emit("exit", null, "SIGTERM");
      return true;
    }),
  };

  return child;
}

describe("WindowsJobObjectManager", () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

  beforeEach(() => {
    spawnMock.mockReset();
    terminateChildProcessTreeMock.mockReset();
    vi.useRealTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (platformDescriptor) {
      Object.defineProperty(process, "platform", platformDescriptor);
    }
  });

  it("starts the helper and assigns a pid once ready", async () => {
    const child = createMockChild();
    const writes: string[] = [];
    child.stdin.on("data", (chunk) => {
      writes.push(String(chunk));
    });
    spawnMock.mockReturnValue(child);

    const manager = new WindowsJobObjectManager();
    const pending = manager.assignPid(4242);

    child.stdout.write('{"type":"ready"}\n');
    await Promise.resolve();

    expect(spawnMock).toHaveBeenCalledWith(
      "powershell.exe",
      expect.arrayContaining(["-EncodedCommand"]),
      expect.objectContaining({
        env: expect.objectContaining({
          LIGHTCODE_PARENT_PID: String(process.pid),
        }),
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      }),
    );
    await vi.waitFor(() => {
      expect(writes.join("")).toContain('"type":"assign"');
      expect(writes.join("")).toContain('"pid":4242');
    });

    child.stdout.write('{"type":"assigned","id":1,"pid":4242}\n');

    await expect(pending).resolves.toBeUndefined();
  });

  it("rejects startup when the helper exits before becoming ready", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const manager = new WindowsJobObjectManager();
    const pending = manager.start();

    child.emit("exit", 1, null);

    await expect(pending).rejects.toThrow(/failed to start/i);
  });

  it("allows slow helper startup beyond the old five second watchdog", async () => {
    vi.useFakeTimers();
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const manager = new WindowsJobObjectManager();
    const pending = manager.start();

    await vi.advanceTimersByTimeAsync(5_000);
    child.stdout.write('{"type":"ready"}\n');

    await expect(pending).resolves.toBeUndefined();
  });

  it("rejects startup when the helper never becomes ready", async () => {
    vi.useFakeTimers();
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const manager = new WindowsJobObjectManager();
    const pending = manager.start();
    let startupError: unknown;
    const handledPending = pending.catch((error: unknown) => {
      startupError = error;
    });

    await vi.advanceTimersByTimeAsync(30_000);

    await handledPending;
    expect(startupError).toBeInstanceOf(Error);
    expect((startupError as Error).message).toMatch(/timed out after 30000ms/i);
  });

  it("sends an exit command and ends stdin on dispose", async () => {
    const child = createMockChild();
    const writes: string[] = [];
    child.stdin.on("data", (chunk) => {
      writes.push(String(chunk));
    });
    spawnMock.mockReturnValue(child);

    const manager = new WindowsJobObjectManager();
    const pending = manager.start();
    child.stdout.write('{"type":"ready"}\n');
    await pending;

    manager.dispose();

    expect(writes.join("")).toContain('"type":"exit"');
    expect(child.stdin.writableEnded).toBe(true);
  });
});
