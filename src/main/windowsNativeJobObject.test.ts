import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());
const readPtyJobOwnerArtifactMock = vi.hoisted(() =>
  vi.fn<(root: string, target: string) => { path: string }>(),
);

vi.mock("node:child_process", async (importActual) => {
  const actual = await importActual<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: spawnMock,
  };
});

vi.mock("@/shared/ptyJobOwnerArtifact", () => ({
  readPtyJobOwnerArtifact: readPtyJobOwnerArtifactMock,
}));

import {
  NativeWindowsJobObjectManager,
  createWindowsJobObjectOwner,
} from "./windowsNativeJobObject";
import { WindowsJobObjectManager } from "./windowsJobObject";

type MockChild = ReturnType<typeof createMockChild>;

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

function watchWrites(child: MockChild): string[] {
  const writes: string[] = [];
  child.stdin.on("data", (chunk) => {
    writes.push(String(chunk));
  });
  return writes;
}

function nonceOf(callIndex: number): string {
  return (spawnMock.mock.calls[callIndex]![1] as string[])[1]!;
}

async function completeHandshake(child: MockChild, nonce: string, pid: number, writes: string[]) {
  child.stdout.write(`ready-v1 ${nonce}\n`);
  await vi.waitFor(() => expect(writes.join("")).toContain(`bind-v1 ${nonce}\n`));
  child.stdout.write(`bound-v1 ${nonce}\n`);
  await vi.waitFor(() => expect(writes.join("")).toContain(`prepare-v1 ${nonce} 1 ${pid}\n`));
  child.stdout.write(`prepared-v1 ${nonce} 1 ${pid} 123456789\n`);
  await vi.waitFor(() => expect(writes.join("")).toContain(`assign-v1 ${nonce} 1\n`));
  child.stdout.write(`assigned-v1 ${nonce} 1 ${pid}\n`);
}

describe("NativeWindowsJobObjectManager", () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

  beforeEach(() => {
    spawnMock.mockReset();
    readPtyJobOwnerArtifactMock.mockReset();
    vi.useRealTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
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

  it("runs the v1 handshake and resolves once the helper assigns the pid", async () => {
    const child = createMockChild();
    const writes = watchWrites(child);
    spawnMock.mockReturnValue(child);

    const manager = new NativeWindowsJobObjectManager("helper.exe");
    const pending = manager.assignPid(4242);

    const nonce = nonceOf(0);
    expect(nonce).toMatch(/^[a-f0-9]{48}$/);
    expect(spawnMock).toHaveBeenCalledWith(
      "helper.exe",
      ["--pty-job-v1", nonce, String(process.pid)],
      expect.objectContaining({
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );

    await completeHandshake(child, nonce, 4242, writes);

    await expect(pending).resolves.toBeUndefined();
    expect(writes.join("")).toBe(
      `bind-v1 ${nonce}\nprepare-v1 ${nonce} 1 4242\nassign-v1 ${nonce} 1\n`,
    );
  });

  it("spawns the helper with only the allowlisted environment", () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const manager = new NativeWindowsJobObjectManager("helper.exe");
    const pending = manager.assignPid(4242);
    pending.catch(() => undefined);

    const options = spawnMock.mock.calls[0]![2] as { env: Record<string, string> };
    const expectedEnv: Record<string, string> = {};
    for (const key of ["SystemRoot", "windir"]) {
      const value = process.env[key];
      if (value !== undefined) expectedEnv[key] = value;
    }
    expect(options.env).toEqual(expectedEnv);

    manager.dispose();
  });

  it("rejects when the helper reports a protocol error", async () => {
    const child = createMockChild();
    const writes = watchWrites(child);
    spawnMock.mockReturnValue(child);

    const manager = new NativeWindowsJobObjectManager("helper.exe");
    const pending = manager.assignPid(4242);
    const nonce = nonceOf(0);

    child.stdout.write(`ready-v1 ${nonce}\n`);
    await vi.waitFor(() => expect(writes.join("")).toContain(`bind-v1 ${nonce}`));
    child.stdout.write(`error-v1 ${nonce} protocol\n`);

    await expect(pending).rejects.toThrow(/refused: protocol/);
  });

  it("rejects when the helper exits before assignment", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const manager = new NativeWindowsJobObjectManager("helper.exe");
    const pending = manager.assignPid(4242);

    child.emit("exit", 1, null);

    await expect(pending).rejects.toThrow(/exited with code 1 before assignment/);
  });

  it("rejects a reply carrying a foreign nonce", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const manager = new NativeWindowsJobObjectManager("helper.exe");
    const pending = manager.assignPid(4242);

    child.stdout.write(`ready-v1 ${"f".repeat(48)}\n`);

    await expect(pending).rejects.toThrow(/identity or protocol/);
  });

  it("rejects and kills the helper when the assignment times out", async () => {
    vi.useFakeTimers();
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const manager = new NativeWindowsJobObjectManager("helper.exe", { assignTimeoutMs: 50 });
    let failure: unknown;
    const pending = manager.assignPid(4242).catch((error: unknown) => {
      failure = error;
    });

    await vi.advanceTimersByTimeAsync(50);
    await pending;

    expect((failure as Error).message).toMatch(/timed out after 50ms/);
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("rejects without killing the helper once assign-v1 was written (timeout)", async () => {
    const child = createMockChild();
    const writes = watchWrites(child);
    spawnMock.mockReturnValue(child);

    const manager = new NativeWindowsJobObjectManager("helper.exe", { assignTimeoutMs: 250 });
    const pending = manager.assignPid(4242);
    const nonce = nonceOf(0);

    // Drive the handshake to just after `assign-v1` is written, then let the
    // real timeout fire: the helper must be rejected but never killed.
    child.stdout.write(`ready-v1 ${nonce}\n`);
    await vi.waitFor(() => expect(writes.join("")).toContain(`bind-v1 ${nonce}\n`));
    child.stdout.write(`bound-v1 ${nonce}\n`);
    await vi.waitFor(() => expect(writes.join("")).toContain(`prepare-v1 ${nonce} 1 4242\n`));
    child.stdout.write(`prepared-v1 ${nonce} 1 4242 123456789\n`);
    await vi.waitFor(() => expect(writes.join("")).toContain(`assign-v1 ${nonce} 1\n`));

    await expect(pending).rejects.toThrow(/timed out after 250ms/);
    expect(child.kill).not.toHaveBeenCalled();

    // The retained helper is still closed cleanly on dispose.
    manager.dispose();
    expect(writes.join("")).toContain(`close-v1 ${nonce}\n`);
    expect(child.stdin.writableEnded).toBe(true);
  });

  it("rejects without killing the helper once assign-v1 was written (foreign nonce)", async () => {
    const child = createMockChild();
    const writes = watchWrites(child);
    spawnMock.mockReturnValue(child);

    const manager = new NativeWindowsJobObjectManager("helper.exe");
    const pending = manager.assignPid(4242);
    const nonce = nonceOf(0);

    child.stdout.write(`ready-v1 ${nonce}\n`);
    await vi.waitFor(() => expect(writes.join("")).toContain(`bind-v1 ${nonce}\n`));
    child.stdout.write(`bound-v1 ${nonce}\n`);
    await vi.waitFor(() => expect(writes.join("")).toContain(`prepare-v1 ${nonce} 1 4242\n`));
    child.stdout.write(`prepared-v1 ${nonce} 1 4242 123456789\n`);
    await vi.waitFor(() => expect(writes.join("")).toContain(`assign-v1 ${nonce} 1\n`));

    child.stdout.write(`assigned-v1 ${"f".repeat(48)} 1 4242\n`);

    await expect(pending).rejects.toThrow(/identity or protocol/);
    expect(child.kill).not.toHaveBeenCalled();

    manager.dispose();
    expect(writes.join("")).toContain(`close-v1 ${nonce}\n`);
    expect(child.stdin.writableEnded).toBe(true);
  });

  it("rejects the assignment when a control pipe errors before assignment", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const manager = new NativeWindowsJobObjectManager("helper.exe");
    const pending = manager.assignPid(4242);

    child.stdin.emit("error", new Error("EPIPE"));

    await expect(pending).rejects.toThrow(/control pipe failed/);
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("rejects the returned promise when the helper cannot be spawned", async () => {
    spawnMock.mockImplementation(() => {
      throw new Error("spawn failed");
    });

    const manager = new NativeWindowsJobObjectManager("helper.exe");

    await expect(manager.assignPid(4242)).rejects.toThrow("spawn failed");
  });

  it("spawns one helper per assignment and closes every helper on dispose", async () => {
    const first = createMockChild();
    const second = createMockChild();
    const firstWrites = watchWrites(first);
    const secondWrites = watchWrites(second);
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const manager = new NativeWindowsJobObjectManager("helper.exe");
    const firstPending = manager.assignPid(11);
    const secondPending = manager.assignPid(22);
    expect(spawnMock).toHaveBeenCalledTimes(2);

    const firstNonce = nonceOf(0);
    const secondNonce = nonceOf(1);
    await completeHandshake(first, firstNonce, 11, firstWrites);
    await completeHandshake(second, secondNonce, 22, secondWrites);
    await firstPending;
    await secondPending;

    manager.dispose();

    expect(firstWrites.join("")).toContain(`close-v1 ${firstNonce}\n`);
    expect(secondWrites.join("")).toContain(`close-v1 ${secondNonce}\n`);
    expect(first.stdin.writableEnded).toBe(true);
    expect(second.stdin.writableEnded).toBe(true);
  });

  it("rejects new assignments after dispose", async () => {
    const manager = new NativeWindowsJobObjectManager("helper.exe");
    manager.dispose();

    await expect(manager.assignPid(1)).rejects.toThrow(/disposed/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("resolves start without spawning a helper", async () => {
    const manager = new NativeWindowsJobObjectManager("helper.exe");

    await expect(manager.start()).resolves.toBeUndefined();
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe("createWindowsJobObjectOwner", () => {
  beforeEach(() => {
    readPtyJobOwnerArtifactMock.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the bundled native helper for each supported architecture", () => {
    readPtyJobOwnerArtifactMock.mockReturnValue({ path: "C:/helpers/pty-job-owner-v1.exe" });

    const x64 = createWindowsJobObjectOwner("resource-root", "x64");
    expect(x64).toBeInstanceOf(NativeWindowsJobObjectManager);
    expect(readPtyJobOwnerArtifactMock).toHaveBeenLastCalledWith("resource-root", "win32-x64");

    const arm64 = createWindowsJobObjectOwner("resource-root", "arm64");
    expect(arm64).toBeInstanceOf(NativeWindowsJobObjectManager);
    expect(readPtyJobOwnerArtifactMock).toHaveBeenLastCalledWith("resource-root", "win32-arm64");
  });

  it("falls back to the PowerShell manager when the artifact read fails or the arch has none", () => {
    readPtyJobOwnerArtifactMock.mockImplementation(() => {
      throw new Error("No staged PTY job owner.");
    });

    expect(createWindowsJobObjectOwner("resource-root", "x64")).toBeInstanceOf(
      WindowsJobObjectManager,
    );
    expect(readPtyJobOwnerArtifactMock).toHaveBeenCalledTimes(1);

    expect(createWindowsJobObjectOwner("resource-root", "ia32")).toBeInstanceOf(
      WindowsJobObjectManager,
    );
    expect(readPtyJobOwnerArtifactMock).toHaveBeenCalledTimes(1);
  });
});
