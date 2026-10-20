import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { rm, stat } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceHubRuntime, deviceHubChildEnvironment } from "./DeviceHubRuntime";
import { readDeviceHubArtifact } from "./deviceHubArtifact";

vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn: vi.fn<typeof spawn>(),
}));
vi.mock("./deviceHubArtifact", () => ({
  readDeviceHubArtifact: vi.fn<typeof readDeviceHubArtifact>(),
}));
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, rm: vi.fn<typeof rm>(actual.rm) };
});

const runtimes: DeviceHubRuntime[] = [];
const target = { clientDeviceId: "emulator-5554", bootId: "13455f6b-3b94-40c8-8913-a6839f2dfd1b" };
beforeEach(() => vi.mocked(spawn).mockReset());
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
  vi.clearAllMocks();
});

function childFixture(ready = true) {
  const token = "f".repeat(43);
  const child = Object.assign(new EventEmitter(), {
    pid: 1234,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    connected: true,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn<() => boolean>(() => {
      close();
      return true;
    }),
    send: vi.fn<(_message: unknown, callback?: (error: Error | null) => void) => boolean>(
      (_message, callback) => {
        close();
        callback?.(null);
        return true;
      },
    ),
  });
  function close() {
    if (child.exitCode === null) {
      child.exitCode = 0;
      child.emit("exit", 0, null);
    }
    child.stdout.end();
    child.stderr.end();
    child.stdout.destroy();
    child.stderr.destroy();
    child.emit("close", 0, null);
  }
  if (ready)
    queueMicrotask(() => {
      child.stdout.write(
        `Expo Device Hub ready\n  Local: http://localhost:43210/?token=${token}\n`,
      );
    });
  return { child, close, token };
}

function runtimeFixture() {
  vi.mocked(readDeviceHubArtifact).mockResolvedValue({
    root: "/fixture/hub",
    entry: "/fixture/hub/node_modules/expo-device-hub/dist/server/cli.mjs",
    manifest: { qualifiedPlatforms: ["android"] },
  } as Awaited<ReturnType<typeof readDeviceHubArtifact>>);
  const runtime = new DeviceHubRuntime("/fixture/resources");
  runtimes.push(runtime);
  return runtime;
}

describe("owned Expo Hub generation", () => {
  it("allows reacquire after a confirmed child close even if owned temp cleanup fails", async () => {
    const runtime = runtimeFixture();
    const old = childFixture();
    vi.mocked(spawn).mockReturnValueOnce(old.child as unknown as ChildProcess);
    const handle = await runtime.acquire(new AbortController().signal, "android", target);
    const root = (vi.mocked(spawn).mock.calls[0]![2] as { env: NodeJS.ProcessEnv }).env.TEMP!;
    vi.mocked(rm).mockRejectedValueOnce(new Error("fixture temp lock after close"));
    try {
      await expect(handle.release()).rejects.toThrow("fixture temp lock after close");
      expect(old.child.exitCode).toBe(0);
      expect(old.child.stdout.closed).toBe(true);
      expect((await stat(root)).isDirectory()).toBe(true);
      vi.mocked(spawn).mockReturnValueOnce(childFixture().child as unknown as ChildProcess);
      const next = await runtime.acquire(new AbortController().signal, "android", target);
      expect(spawn).toHaveBeenCalledTimes(2);
      await handle.release();
      expect(next.signal.aborted).toBe(false);
      await next.release();
    } finally {
      const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
      await actual.rm(root, { recursive: true, force: true });
    }
  });

  it.each(["acquire", "dispose"] as const)(
    "retries an unconfirmed child join through %s without releasing custody early",
    async (operation) => {
      const runtime = runtimeFixture();
      const old = childFixture();
      vi.mocked(spawn).mockReturnValueOnce(old.child as unknown as ChildProcess);
      const handle = await runtime.acquire(new AbortController().signal, "android", target);
      old.child.send.mockImplementation((_message, callback) => {
        callback?.(null);
        return true;
      });
      old.child.kill.mockImplementation(() => true);
      vi.useFakeTimers();
      try {
        const failed = handle.release().catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(18_001);
        expect(await failed).toMatchObject({
          message: "Owned child exit and pipe closure remain unconfirmed.",
        });
        expect(old.child.stdout.closed).toBe(false);
        vi.mocked(spawn).mockReturnValueOnce(childFixture().child as unknown as ChildProcess);
        const retry = (
          operation === "acquire"
            ? runtime.acquire(new AbortController().signal, "android", target)
            : runtime.dispose()
        ).then(
          () => true,
          () => false,
        );
        await vi.advanceTimersByTimeAsync(1);
        expect(spawn).toHaveBeenCalledTimes(1);
        expect(old.child.stdout.closed).toBe(false);
        old.close();
        expect(await retry).toBe(true);
        expect(spawn).toHaveBeenCalledTimes(operation === "acquire" ? 2 : 1);
        await handle.release();
      } finally {
        old.close();
        vi.useRealTimers();
      }
    },
  );

  it("retains a failed startup's stop closure until the owned child joins", async () => {
    const runtime = runtimeFixture();
    const old = childFixture(false);
    old.child.send.mockImplementation((_message, callback) => {
      callback?.(null);
      return true;
    });
    old.child.kill
      .mockImplementationOnce(() => {
        throw new Error("fixture signal refused");
      })
      .mockImplementation(() => true);
    vi.mocked(spawn).mockReturnValueOnce(old.child as unknown as ChildProcess);
    const controller = new AbortController();
    const pending = runtime
      .acquire(controller.signal, "android", target)
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    try {
      controller.abort();
      await vi.advanceTimersByTimeAsync(15_001);
      vi.mocked(spawn).mockReturnValueOnce(childFixture().child as unknown as ChildProcess);
      const replacement = runtime.acquire(new AbortController().signal, "android", target);
      await vi.advanceTimersByTimeAsync(1);
      expect(old.child.stdout.closed).toBe(false);
      expect(spawn).toHaveBeenCalledTimes(1);
      old.close();
      expect(await pending).toBeInstanceOf(Error);
      const next = await replacement;
      expect(spawn).toHaveBeenCalledTimes(2);
      await next.release();
    } finally {
      old.close();
      vi.useRealTimers();
    }
  });

  it("loads the generated bootstrap import argument in a real child on Windows and POSIX", async () => {
    const runtime = runtimeFixture();
    const artifactRoot = fileURLToPath(new URL("../../../resources/device-hub/", import.meta.url));
    vi.mocked(readDeviceHubArtifact).mockResolvedValue({
      root: artifactRoot,
      entry: "unused-fixture-entry.mjs",
      manifest: { qualifiedPlatforms: ["android"] },
    } as Awaited<ReturnType<typeof readDeviceHubArtifact>>);
    vi.mocked(spawn).mockReturnValue(childFixture().child as unknown as ChildProcess);
    const handle = await runtime.acquire(new AbortController().signal, "android", target);
    const args = vi.mocked(spawn).mock.calls[0]![1]!;
    const child = spawnSync(
      process.execPath,
      [args[0]!, args[1]!, "--eval", "process.stdout.write('bootstrap-ok')"],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: 5000,
      },
    );
    expect({ status: child.status, stderr: child.stderr }).toEqual({ status: 0, stderr: "" });
    expect(child.stdout).toBe("bootstrap-ok");
    expect(new URL(args[1]!).protocol).toBe("file:");
    await handle.release();
  });

  it("shares the child and gracefully joins only the last holder's owned resources", async () => {
    const runtime = runtimeFixture();
    const f = childFixture();
    vi.mocked(spawn).mockReturnValue(f.child as unknown as ChildProcess);
    const first = await runtime.acquire(new AbortController().signal, "android", target);
    const second = await runtime.acquire(new AbortController().signal, "android", target);
    expect(spawn).toHaveBeenCalledTimes(1);
    const [command, args, options] = vi.mocked(spawn).mock.calls[0]!;
    expect(command).toBe(process.execPath);
    expect(args).toContain("--require-token");
    expect(args).toContain("scrcpy");
    expect(options).toMatchObject({ shell: false, windowsHide: true });
    const root = (options as { env: NodeJS.ProcessEnv }).env.TEMP!;
    expect(first.origin).toBe("http://127.0.0.1:43210");
    await first.release();
    expect(f.child.send).not.toHaveBeenCalled();
    expect((await stat(root)).isDirectory()).toBe(true);
    await second.release();
    expect(f.child.send).toHaveBeenCalledWith(
      { type: "device-hub-stop", version: 1 },
      expect.any(Function),
    );
    expect(f.child.kill).not.toHaveBeenCalled();
    await expect(stat(root)).rejects.toMatchObject({ code: "ENOENT" });
    expect(first.signal.aborted).toBe(true);
  });

  it("joins an exited child's held pipes before creating a replacement generation", async () => {
    const runtime = runtimeFixture();
    const old = childFixture();
    vi.mocked(spawn).mockReturnValueOnce(old.child as unknown as ChildProcess);
    const first = await runtime.acquire(new AbortController().signal, "android", target);
    old.child.exitCode = 7;
    old.child.emit("exit", 7, null);
    expect(first.signal.aborted).toBe(true);
    let restarted = false;
    vi.mocked(spawn).mockImplementationOnce(() => {
      restarted = true;
      return childFixture().child as unknown as ChildProcess;
    });
    const pending = runtime.acquire(new AbortController().signal, "android", target);
    await Promise.resolve();
    expect(restarted).toBe(false);
    expect(old.child.kill).not.toHaveBeenCalled();
    old.close();
    const replacement = await pending;
    expect(restarted).toBe(true);
    await first.release();
    expect(replacement.signal.aborted).toBe(false);
    await replacement.release();
  });

  it("retires a cancelled startup without retaining a helper or its token", async () => {
    const runtime = runtimeFixture();
    const f = childFixture(false);
    vi.mocked(spawn).mockReturnValueOnce(f.child as unknown as ChildProcess);
    const abort = new AbortController();
    const pending = runtime.acquire(abort.signal, "android", target);
    const rejection = pending.catch((error: unknown) => error);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1));
    abort.abort();
    expect(await rejection).toMatchObject({ name: "AbortError" });
    expect(f.child.send).toHaveBeenCalledTimes(1);
    expect(f.child.kill).not.toHaveBeenCalled();
  });

  it("refuses an unqualified artifact without spawning and bounds startup output", async () => {
    const runtime = runtimeFixture();
    vi.mocked(readDeviceHubArtifact).mockResolvedValueOnce(null);
    await expect(
      runtime.acquire(new AbortController().signal, "android", target),
    ).rejects.toMatchObject({ status: 501 });
    expect(spawn).not.toHaveBeenCalled();
    const other = runtimeFixture();
    const f = childFixture(false);
    vi.mocked(spawn).mockImplementationOnce(() => {
      queueMicrotask(() => f.child.stdout.write("x".repeat(16_385)));
      return f.child as unknown as ChildProcess;
    });
    await expect(
      other.acquire(new AbortController().signal, "android", target),
    ).rejects.toMatchObject({
      code: "device_preview_unavailable",
      status: 503,
    });
    expect(f.child.send).toHaveBeenCalledTimes(1);
  });

  it("retires the last selected-device child without retaining its capture or stopping another device", async () => {
    const runtime = runtimeFixture();
    const firstChild = childFixture();
    const secondChild = childFixture();
    vi.mocked(spawn)
      .mockReturnValueOnce(firstChild.child as unknown as ChildProcess)
      .mockReturnValueOnce(secondChild.child as unknown as ChildProcess);
    const first = await runtime.acquire(new AbortController().signal, "android", target);
    const other = await runtime.acquire(new AbortController().signal, "android", {
      ...target,
      clientDeviceId: "emulator-5556",
    });
    expect(spawn).toHaveBeenCalledTimes(2);
    await first.release();
    expect(firstChild.child.send).toHaveBeenCalledTimes(1);
    expect(secondChild.child.send).not.toHaveBeenCalled();
    expect(other.signal.aborted).toBe(false);
    await other.release();
  });

  it("does not let an after-ready lease abort bypass its channel owner's cleanup join", async () => {
    const runtime = runtimeFixture();
    const child = childFixture();
    vi.mocked(spawn).mockReturnValueOnce(child.child as unknown as ChildProcess);
    const lease = new AbortController();
    const handle = await runtime.acquire(lease.signal, "android", target);
    lease.abort();
    expect(child.child.send).not.toHaveBeenCalled();
    expect(handle.signal.aborted).toBe(false);
    await handle.release();
    expect(child.child.send).toHaveBeenCalledTimes(1);
  });

  it("joins last-holder retirement before reacquiring the same device while another device stays live", async () => {
    const runtime = runtimeFixture();
    const old = childFixture();
    const other = childFixture();
    vi.mocked(spawn)
      .mockReturnValueOnce(old.child as unknown as ChildProcess)
      .mockReturnValueOnce(other.child as unknown as ChildProcess);
    const first = await runtime.acquire(new AbortController().signal, "android", target);
    const shared = await runtime.acquire(new AbortController().signal, "android", target);
    const secondDevice = await runtime.acquire(new AbortController().signal, "android", {
      ...target,
      clientDeviceId: "emulator-5556",
    });
    await first.release();
    expect(old.child.send).not.toHaveBeenCalled();
    old.child.send.mockImplementation((_message, callback) => {
      callback?.(null);
      return true;
    });
    const retirement = shared.release();
    let replacing = false;
    vi.mocked(spawn).mockImplementationOnce(() => {
      replacing = true;
      return childFixture().child as unknown as ChildProcess;
    });
    const replacement = runtime.acquire(new AbortController().signal, "android", target);
    await vi.waitFor(() => expect(old.child.send).toHaveBeenCalledTimes(1));
    expect(replacing).toBe(false);
    expect(other.child.send).not.toHaveBeenCalled();
    expect(secondDevice.signal.aborted).toBe(false);
    old.close();
    await retirement;
    const next = await replacement;
    expect(replacing).toBe(true);
    await shared.release();
    expect(next.signal.aborted).toBe(false);
    await next.release();
    await secondDevice.release();
  });

  it("bounds active plus retiring child generations and separates a reused device's new boot", async () => {
    const runtime = runtimeFixture();
    const children: ReturnType<typeof childFixture>[] = [];
    vi.mocked(spawn).mockImplementation(() => {
      const child = childFixture();
      children.push(child);
      return child.child as unknown as ChildProcess;
    });
    const handles = [];
    for (let index = 0; index < 4; index++)
      handles.push(
        await runtime.acquire(new AbortController().signal, "android", {
          ...target,
          bootId: `boot-${index}`,
        }),
      );
    expect(spawn).toHaveBeenCalledTimes(4);
    children[0]!.child.send.mockImplementation((_message, callback) => {
      callback?.(null);
      return true;
    });
    const retiring = handles[0]!.release();
    await expect(
      runtime.acquire(new AbortController().signal, "android", { ...target, bootId: "boot-5" }),
    ).rejects.toMatchObject({ status: 429 });
    const shared = await runtime.acquire(new AbortController().signal, "android", {
      ...target,
      bootId: "boot-1",
    });
    expect(spawn).toHaveBeenCalledTimes(4);
    children[0]!.close();
    await retiring;
    expect(handles[1]!.signal.aborted).toBe(false);
    await shared.release();
    await Promise.all(handles.map((handle) => handle.release()));
  });

  it("never forwards signing keys, proofs, provider/plugin secrets or Node injection to the helper", () => {
    const env = deviceHubChildEnvironment(
      {
        PATH: "/sdk/bin",
        ANDROID_HOME: "/sdk",
        SystemRoot: "C:/Windows",
        PORACODE_DEVICE_WORKSPACE_AGENT_KEY: "fixture-key",
        PORACODE_DEVICE_PROOF: "fixture-proof",
        ANTHROPIC_API_KEY: "fixture-provider-key",
        PLUGIN_ACCESS_TOKEN: "fixture-plugin-token",
        NODE_OPTIONS: "--import=untrusted.mjs",
        NODE_PATH: "/untrusted",
        ELECTRON_RUN_AS_NODE: "wrong",
        TMPDIR: "/foreign",
      },
      "/owned",
      true,
    );
    expect(env).toEqual({
      PATH: "/sdk/bin",
      ANDROID_HOME: "/sdk",
      SystemRoot: "C:/Windows",
      TMPDIR: "/owned",
      TMP: "/owned",
      TEMP: "/owned",
      ELECTRON_RUN_AS_NODE: "1",
    });
    expect(JSON.stringify(env)).not.toMatch(
      /fixture-key|fixture-proof|fixture-provider|fixture-plugin|untrusted/u,
    );
  });
});
