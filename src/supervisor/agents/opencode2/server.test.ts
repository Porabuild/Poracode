import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>(() => undefined));

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: spawnMock as unknown as typeof import("node:child_process").spawn,
}));

import {
  disposeSpawnedOpenCode2ServerHandles,
  OpenCode2ReadinessTimeoutError,
  spawnOpenCode2Server,
  type OpenCode2ServerHandle,
} from "./server";

type FakeStream = EventEmitter & { setEncoding(encoding: string): void };

interface FakeChild extends EventEmitter {
  pid: number;
  stdout: FakeStream;
  stderr: FakeStream;
  exitCode: number | null;
  killed: boolean;
}

function fakeStream(): FakeStream {
  const stream = new EventEmitter() as FakeStream;
  stream.setEncoding = () => undefined;
  return stream;
}

function fakeChild(pid = 4242): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.pid = pid;
  child.stdout = fakeStream();
  child.stderr = fakeStream();
  child.exitCode = null;
  child.killed = false;
  return child;
}

function emitLine(stream: FakeStream, line: string): void {
  stream.emit("data", `${line}\n`);
}

describe("spawnOpenCode2Server", () => {
  let child: FakeChild;
  let handles: OpenCode2ServerHandle[];
  let kill: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spawnMock.mockReset();
    child = fakeChild();
    spawnMock.mockReturnValue(child);
    // Never deliver a real signal from a test: the fake pids belong to nobody.
    kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    handles = [];
  });

  afterEach(async () => {
    vi.useRealTimers();
    for (const handle of handles) await handle.dispose();
    disposeSpawnedOpenCode2ServerHandles();
    vi.restoreAllMocks();
  });

  function spawn(): OpenCode2ServerHandle {
    const handle = spawnOpenCode2Server({ command: "opencode2", args: ["serve"] });
    handles.push(handle);
    return handle;
  }

  it("spawns the server detached with piped stdio", () => {
    spawn();

    expect(spawnMock).toHaveBeenCalledWith(
      "opencode2",
      ["serve"],
      expect.objectContaining({ shell: false, windowsHide: true, detached: true }),
    );
  });

  it("resolves both the URL and the server-generated password from stdout", async () => {
    const handle = spawn();
    emitLine(child.stdout, "server listening on http://127.0.0.1:50208");
    emitLine(child.stdout, "server password KSjBZJSs9rF9bK8MaWaxxj5kSYAZmOatbIuRs2obo7o");

    await expect(handle.baseUrl).resolves.toBe("http://127.0.0.1:50208");
    await expect(handle.password).resolves.toBe("KSjBZJSs9rF9bK8MaWaxxj5kSYAZmOatbIuRs2obo7o");
  });

  it("does not resolve until both markers arrive, in either order", async () => {
    const passwordFirst = spawn();
    emitLine(child.stdout, "server password second-first");
    await expect(Promise.race([passwordFirst.baseUrl, Promise.resolve("pending")])).resolves.toBe(
      "pending",
    );

    emitLine(child.stdout, "server listening on http://127.0.0.1:50209");
    await expect(passwordFirst.baseUrl).resolves.toBe("http://127.0.0.1:50209");
    await expect(passwordFirst.password).resolves.toBe("second-first");

    child = fakeChild();
    spawnMock.mockReturnValue(child);
    const urlFirst = spawn();
    emitLine(child.stdout, "server listening on http://127.0.0.1:50210");
    emitLine(child.stdout, "server password url-first");
    await expect(urlFirst.baseUrl).resolves.toBe("http://127.0.0.1:50210");
    await expect(urlFirst.password).resolves.toBe("url-first");
  });

  it("ignores partial lines until a newline arrives", async () => {
    const handle = spawn();
    child.stdout.emit("data", "server listening on http://127.0.0.1:50");
    await expect(Promise.race([handle.baseUrl, Promise.resolve("pending")])).resolves.toBe(
      "pending",
    );

    child.stdout.emit("data", "211\r\n");
    emitLine(child.stdout, "server password split-across-chunks");
    await expect(handle.baseUrl).resolves.toBe("http://127.0.0.1:50211");
    await expect(handle.password).resolves.toBe("split-across-chunks");
  });

  it("rejects with the readiness error once the budget expires", async () => {
    vi.useFakeTimers();
    const handle = spawn();
    const failure = handle.baseUrl.then(
      () => undefined,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(failure).resolves.toBeInstanceOf(OpenCode2ReadinessTimeoutError);
    await expect(handle.password).rejects.toBeInstanceOf(OpenCode2ReadinessTimeoutError);
  });

  it("classifies an early exit using the captured output", async () => {
    const handle = spawn();
    emitLine(child.stderr, "dyld: Library not loaded: /usr/lib/libz.1.dylib");
    child.exitCode = 1;
    child.emit("exit", 1, null);

    await expect(handle.baseUrl).rejects.toThrow(/exited before ready/);
    await expect(handle.baseUrl).rejects.toThrow(/Library not loaded/);
  });

  it("classifies a spawn error as a missing binary", async () => {
    const handle = spawn();
    child.emit("error", new Error("spawn opencode2 ENOENT"));

    await expect(handle.baseUrl).rejects.toThrow(/not installed or not on PATH/);
  });

  it("bounds the stderr diagnostic buffer", () => {
    const handle = spawn();
    child.stderr.emit("data", "x".repeat(70_000));

    expect(handle.formatOutput().length).toBeLessThan(70_000);
    expect(handle.formatOutput()).toContain("--- opencode2 stderr ---");
  });

  it("keeps split readiness credentials out of bounded diagnostics", async () => {
    const handle = spawn();
    child.stdout.emit("data", "server password private-");
    expect(handle.formatOutput()).not.toContain("private-");
    child.stdout.emit("data", "credential\n");
    emitLine(child.stdout, "server listening on http://127.0.0.1:50212");
    await expect(handle.password).resolves.toBe("private-credential");
    emitLine(child.stderr, "failed with private-credential");
    emitLine(child.stdout, "x".repeat(70_000));
    expect(handle.formatOutput()).not.toContain("private-credential");
    expect(handle.formatOutput().length).toBeLessThan(65_000);
  });

  it("does not expose a password when the server exits before its URL", async () => {
    const handle = spawn();
    emitLine(child.stdout, "server password early-exit-secret");
    emitLine(child.stderr, "startup failed");
    child.exitCode = 1;
    child.emit("exit", 1, null);
    await expect(handle.baseUrl).rejects.toThrow("startup failed");
    await expect(handle.password).rejects.not.toThrow("early-exit-secret");
  });

  it("escorts the whole process group down through SIGTERM then SIGKILL", async () => {
    const handle = spawn();
    emitLine(child.stdout, "server listening on http://127.0.0.1:50212");
    emitLine(child.stdout, "server password dispose-me");
    await handle.baseUrl;

    vi.useFakeTimers();
    const disposed = handle.dispose();
    await vi.advanceTimersByTimeAsync(1_000);
    await disposed;

    expect(kill).toHaveBeenCalledWith(-child.pid, "SIGTERM");
    expect(kill).toHaveBeenCalledWith(-child.pid, "SIGKILL");
  });

  it("stops at SIGTERM when the child exits inside the grace window", async () => {
    kill.mockImplementation((_pid: number, signal?: string | number) => {
      if (signal === "SIGTERM") {
        child.exitCode = 0;
        child.emit("exit", 0, null);
      }
      return true;
    });
    const handle = spawn();
    vi.useFakeTimers();
    const disposed = handle.dispose();
    await vi.advanceTimersByTimeAsync(1_000);
    await disposed;

    expect(kill).toHaveBeenCalledWith(-child.pid, "SIGTERM");
    expect(kill).not.toHaveBeenCalledWith(-child.pid, "SIGKILL");
  });
});

describe("disposeSpawnedOpenCode2ServerHandles", () => {
  it("kills every tracked child exactly once", async () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    const firstChild = fakeChild(4242);
    const secondChild = fakeChild(5151);
    spawnMock.mockReset().mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild);
    const first = spawnOpenCode2Server({ command: "opencode2", args: ["serve"] });
    const second = spawnOpenCode2Server({ command: "opencode2", args: ["serve"] });

    disposeSpawnedOpenCode2ServerHandles();
    disposeSpawnedOpenCode2ServerHandles();

    const killedPids = kill.mock.calls.map(([pid, signal]) => [pid, signal]);
    expect(killedPids).toContainEqual([-firstChild.pid, "SIGKILL"]);
    expect(killedPids).toContainEqual([-secondChild.pid, "SIGKILL"]);

    await first.dispose();
    await second.dispose();
  });
});
