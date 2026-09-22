import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProcessStagingExecutor } from "./executor";
import type {
  WslStagingExecuteOptions,
  WslStagingExecutor,
  WslStagingProcessSpec,
} from "./executor";
import type { WslStagingRequest } from "./protocol";
import { WslStagingService } from "./service";

const fixturePath = fileURLToPath(
  new URL("./__fixtures__/stagingWorkerFixture.mjs", import.meta.url),
);

function fixtureSpec(mode: string): WslStagingProcessSpec {
  return {
    command: process.execPath,
    args: [fixturePath],
    env: { ...process.env, FIXTURE_MODE: mode },
    readyTimeoutMs: 5_000,
  };
}

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "poracode-staging-service-"));
  roots.push(root);
  return root;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class FakeExecutor implements WslStagingExecutor {
  readonly requests: WslStagingRequest[] = [];
  readonly signals: AbortSignal[] = [];
  disposed = false;

  constructor(
    private readonly handler?: (
      request: WslStagingRequest,
      options: WslStagingExecuteOptions,
    ) => Promise<unknown>,
  ) {}

  async execute<T = unknown>(
    request: WslStagingRequest,
    options: WslStagingExecuteOptions,
  ): Promise<T> {
    this.requests.push(request);
    if (options.signal) this.signals.push(options.signal);
    const result = this.handler ? await this.handler(request, options) : { filesWritten: 0 };
    return result as T;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function sourceFile(root: string, name: string, content: string): string {
  const path = join(root, name);
  writeFileSync(path, content);
  return path;
}

describe("WslStagingService content-addressed deploys", () => {
  it("shares one worker request among concurrent same-content callers", async () => {
    const root = makeRoot();
    const source = sourceFile(root, "bridge.mjs", "bridge-v1");
    const gate = deferred<void>();
    const executor = new FakeExecutor(async () => {
      await gate.promise;
      return { filesWritten: 1 };
    });
    const service = new WslStagingService({ createExecutor: () => executor });
    const files = [{ src: source, relDest: "bridge/bridge.mjs" }];

    const first = service.deployTemp("Ubuntu", { baseName: "poracode-bridge-42", files });
    const second = service.deployTemp("Ubuntu", { baseName: "poracode-bridge-42", files });
    await vi.waitFor(() => expect(executor.requests).toHaveLength(1));
    gate.resolve();
    const [a, b] = await Promise.all([first, second]);

    expect(a.linuxBaseDir).toBe(b.linuxBaseDir);
    expect(a.linuxBaseDir).toMatch(/^\/tmp\/poracode-bridge-42-[0-9a-f]{12}$/u);
    expect(executor.requests[0]).toMatchObject({
      op: "deploy",
      freshness: "content",
    });
  });

  it("separates different content and sanitizes the base name", async () => {
    const root = makeRoot();
    const source = sourceFile(root, "helper.mjs", "one");
    const executor = new FakeExecutor();
    const service = new WslStagingService({ createExecutor: () => executor });

    const first = await service.deployTemp("Ubuntu", {
      baseName: "poracode brîdge",
      files: [{ src: source, relDest: "helper.mjs" }],
    });
    writeFileSync(source, "two");
    const second = await service.deployTemp("Ubuntu", {
      baseName: "poracode brîdge",
      files: [{ src: source, relDest: "helper.mjs" }],
    });

    expect(first.linuxBaseDir).not.toBe(second.linuxBaseDir);
    expect(first.linuxBaseDir).toMatch(/^\/tmp\/[A-Za-z0-9._-]+-[0-9a-f]{12}$/u);
    expect(executor.requests).toHaveLength(2);
  });

  it("deploys home files under <home>/.poracode", async () => {
    const root = makeRoot();
    const source = sourceFile(root, "plugin.mjs", "plugin");
    const executor = new FakeExecutor();
    const service = new WslStagingService({ createExecutor: () => executor });

    await service.deployHome("Ubuntu", {
      home: "/home/user",
      files: [{ src: source, relDest: "agent-plugins/x/plugin.mjs" }],
    });

    expect(executor.requests[0]).toMatchObject({
      op: "deploy",
      base: "\\\\wsl.localhost\\Ubuntu\\home\\user\\.poracode",
      freshness: "content",
    });
  });
});

describe("WslStagingService cancellation", () => {
  it("does not let one caller's abort sabotage a joined caller", async () => {
    const root = makeRoot();
    const source = sourceFile(root, "helper.mjs", "helper");
    const gate = deferred<void>();
    const executor = new FakeExecutor(async () => {
      await gate.promise;
      return { filesWritten: 1 };
    });
    const service = new WslStagingService({ createExecutor: () => executor });
    const files = [{ src: source, relDest: "helper.mjs" }];
    const controller = new AbortController();

    const aborting = service.deployTemp(
      "Ubuntu",
      { baseName: "poracode-helper", files },
      { signal: controller.signal },
    );
    const joined = service.deployTemp("Ubuntu", { baseName: "poracode-helper", files });
    await vi.waitFor(() => expect(executor.requests).toHaveLength(1));
    controller.abort(new Error("caller cancelled"));
    await expect(aborting).rejects.toThrow("caller cancelled");
    gate.resolve();

    await expect(joined).resolves.toMatchObject({
      linuxBaseDir: expect.stringContaining("/tmp/poracode-helper-"),
    });
    expect(executor.requests).toHaveLength(1);
    expect(executor.signals[0]?.aborted).toBe(false);
  });

  it("aborts the shared task when every caller goes away", async () => {
    const root = makeRoot();
    const source = sourceFile(root, "helper.mjs", "helper");
    const executor = new FakeExecutor(() => new Promise(() => undefined));
    const service = new WslStagingService({ createExecutor: () => executor });
    const controller = new AbortController();

    const pending = service.deployTemp(
      "Ubuntu",
      { baseName: "poracode-helper", files: [{ src: source, relDest: "helper.mjs" }] },
      { signal: controller.signal },
    );
    await vi.waitFor(() => expect(executor.requests).toHaveLength(1));
    controller.abort(new Error("no callers left"));
    await expect(pending).rejects.toThrow("no callers left");

    await vi.waitFor(() => expect(executor.signals[0]?.aborted).toBe(true));
    await service.dispose();
    expect(executor.disposed).toBe(true);
  });

  it("keeps other distros flowing while one distro's executor is stalled", async () => {
    const root = makeRoot();
    const source = sourceFile(root, "helper.mjs", "helper");
    const ubuntuGate = deferred<void>();
    const executors = new Map<string, FakeExecutor>();
    const service = new WslStagingService({
      createExecutor: (distro) => {
        const executor = new FakeExecutor(
          distro === "Ubuntu"
            ? async () => {
                await ubuntuGate.promise;
                return { filesWritten: 1 };
              }
            : undefined,
        );
        executors.set(distro, executor);
        return executor;
      },
    });
    const files = [{ src: source, relDest: "helper.mjs" }];

    const ubuntu = service.deployTemp("Ubuntu", { baseName: "poracode-helper", files });
    const debian = await service.deployTemp("Debian", { baseName: "poracode-helper", files });

    expect(debian.linuxBaseDir).toMatch(/^\/tmp\/poracode-helper-[0-9a-f]{12}$/u);
    await vi.waitFor(() => expect(executors.get("Ubuntu")?.requests).toHaveLength(1));
    expect(executors.get("Debian")?.requests).toHaveLength(1);
    ubuntuGate.resolve();
    await expect(ubuntu).resolves.toMatchObject({
      linuxBaseDir: expect.stringContaining("/tmp/poracode-helper-"),
    });
  });
});

describe("WslStagingService executor reacquisition under eviction pressure", () => {
  class EvictionExecutor implements WslStagingExecutor {
    disposed = false;

    constructor(readonly distro: string) {}

    async execute<T = unknown>(
      _request: WslStagingRequest,
      options: WslStagingExecuteOptions,
    ): Promise<T> {
      if (options.signal?.aborted) throw options.signal.reason ?? new Error("aborted");
      return true as T;
    }

    async dispose(): Promise<void> {
      this.disposed = true;
    }
  }

  it("creates exactly one executor when concurrent requests acquire a new distro while eviction is pending", async () => {
    const created: EvictionExecutor[] = [];
    const service = new WslStagingService({
      maxExecutors: 1,
      createExecutor: (distro) => {
        const executor = new EvictionExecutor(distro);
        created.push(executor);
        return executor;
      },
    });

    await service.pathExists("Alpha", "\\\\wsl.localhost\\Alpha\\tmp\\a");
    const results = await Promise.all([
      service.pathExists("Beta", "\\\\wsl.localhost\\Beta\\tmp\\b1"),
      service.pathExists("Beta", "\\\\wsl.localhost\\Beta\\tmp\\b2"),
    ]);
    expect(results).toEqual([true, true]);

    await service.dispose();

    const beta = created.filter((entry) => entry.distro === "Beta");
    expect(beta).toHaveLength(1);
    expect(beta.every((entry) => entry.disposed)).toBe(true);
  });

  it("never lets a predecessor's idle timer fail a live successor request", async () => {
    const created: EvictionExecutor[] = [];
    const service = new WslStagingService({
      maxExecutors: 1,
      idleTimeoutMs: 20,
      createExecutor: (distro) => {
        const executor = new EvictionExecutor(distro);
        created.push(executor);
        return executor;
      },
    });

    await service.pathExists("Alpha", "\\\\wsl.localhost\\Alpha\\tmp\\a");
    const results = await Promise.all([
      service.pathExists("Beta", "\\\\wsl.localhost\\Beta\\tmp\\b1"),
      service.pathExists("Beta", "\\\\wsl.localhost\\Beta\\tmp\\b2"),
    ]);
    expect(results).toEqual([true, true]);
    expect(created.filter((entry) => entry.distro === "Beta")).toHaveLength(1);

    // The idle timer fires while nothing is active; the next request must get
    // a fresh live executor instead of a retired one.
    await new Promise((resolve) => setTimeout(resolve, 60));
    await expect(service.pathExists("Beta", "\\\\wsl.localhost\\Beta\\tmp\\b3")).resolves.toBe(
      true,
    );

    await service.dispose();
    expect(created.every((entry) => entry.disposed)).toBe(true);
  });
});

describe("WslStagingService home resolution", () => {
  it("single-flights a cold home resolve", async () => {
    const gate = deferred<void>();
    let calls = 0;
    const service = new WslStagingService({
      resolveHome: async () => {
        calls += 1;
        await gate.promise;
        return "/home/user";
      },
    });

    const first = service.resolveHome("Ubuntu");
    const second = service.resolveHome("Ubuntu");
    await vi.waitFor(() => expect(calls).toBe(1));
    gate.resolve();

    await expect(first).resolves.toBe("/home/user");
    await expect(second).resolves.toBe("/home/user");
    expect(calls).toBe(1);
  });

  it("prefers the cached home without resolving", async () => {
    const resolveHome = vi.fn<() => Promise<string>>(async () => "/home/resolved");
    const service = new WslStagingService({
      cachedHome: () => "/home/cached",
      resolveHome,
    });

    await expect(service.resolveHome("Ubuntu")).resolves.toBe("/home/cached");
    expect(resolveHome).not.toHaveBeenCalled();
  });

  it("returns undefined when home resolution fails", async () => {
    const service = new WslStagingService({
      resolveHome: async () => {
        throw new Error("probe failed");
      },
    });

    await expect(service.resolveHome("Ubuntu")).resolves.toBeUndefined();
  });

  it("reports a failed existence probe as absent", async () => {
    const executor = new FakeExecutor(async () => {
      throw new Error("UNC stalled");
    });
    const service = new WslStagingService({ createExecutor: () => executor });

    await expect(service.pathExists("Ubuntu", "\\\\wsl.localhost\\Ubuntu\\x")).resolves.toBe(false);
  });
});

describe("WslStagingService text file verbs", () => {
  it("writes atomically and reads back through the worker", async () => {
    const executor = new FakeExecutor(async (request) => {
      if (request.op === "read-file") {
        return { exists: true, contentBase64: Buffer.from("héllo wörld").toString("base64") };
      }
      return undefined;
    });
    const service = new WslStagingService({ createExecutor: () => executor });
    const path = "\\\\wsl.localhost\\Ubuntu\\home\\user\\.cursor\\hooks.json";

    await service.writeTextFile("Ubuntu", path, "héllo wörld");
    expect(executor.requests[0]).toEqual({
      op: "write-file",
      path,
      contentBase64: Buffer.from("héllo wörld").toString("base64"),
    });

    await expect(service.readTextFile("Ubuntu", path)).resolves.toBe("héllo wörld");
    expect(executor.requests[1]).toEqual({ op: "read-file", path });
  });

  it("returns null for a missing file instead of throwing", async () => {
    const executor = new FakeExecutor(async () => ({ exists: false }));
    const service = new WslStagingService({ createExecutor: () => executor });

    await expect(
      service.readTextFile("Ubuntu", "\\\\wsl.localhost\\Ubuntu\\missing"),
    ).resolves.toBeNull();
  });
});

describe("WslStagingService responsiveness", () => {
  it("keeps the control loop, a local task, and a second distro advancing while one worker stalls", async () => {
    const root = makeRoot();
    const source = sourceFile(root, "bridge.mjs", "bridge-v1");
    const service = new WslStagingService({
      createExecutor: (distro) =>
        createProcessStagingExecutor(
          distro === "Ubuntu" ? fixtureSpec("stall") : fixtureSpec("echo"),
        ),
      requestTimeoutMs: 500,
    });
    const controlTicks: number[] = [];
    const interval = setInterval(() => controlTicks.push(Date.now()), 5);
    let localTaskAdvanced = false;
    try {
      const stalled = service.pathExists("Ubuntu", "\\\\wsl.localhost\\Ubuntu\\tmp\\x");

      // A real supervisor control callback and an unrelated local task both
      // advance while the Ubuntu worker is stalled in an isolated process.
      await new Promise<void>((resolve) => setImmediate(resolve));
      localTaskAdvanced = true;

      const debian = await service.deployTemp("Debian", {
        baseName: "poracode-bridge",
        files: [{ src: source, relDest: "bridge.mjs" }],
      });

      expect(localTaskAdvanced).toBe(true);
      expect(controlTicks.length).toBeGreaterThan(0);
      expect(debian.linuxBaseDir).toMatch(/^\/tmp\/poracode-bridge-[0-9a-f]{12}$/u);
      await expect(stalled).resolves.toBe(false);
    } finally {
      clearInterval(interval);
      await service.dispose();
    }
  });

  it("shutdown joins the real worker process before resolving", async () => {
    const root = makeRoot();
    const pidFile = join(root, "worker.pid");
    const service = new WslStagingService({
      createExecutor: () =>
        createProcessStagingExecutor({
          ...fixtureSpec("echo"),
          env: { ...process.env, FIXTURE_MODE: "echo", FIXTURE_PID_FILE: pidFile },
        }),
      requestTimeoutMs: 5_000,
    });
    await service.pathExists("Ubuntu", "\\\\wsl.localhost\\Ubuntu\\tmp\\x");
    const { readFileSync } = await import("node:fs");
    const pid = Number(readFileSync(pidFile, "utf8"));
    expect(() => process.kill(pid, 0)).not.toThrow();

    await service.dispose();

    expect(() => process.kill(pid, 0)).toThrow(/ESRCH|no such process/u);
  });

  it("dispose awaits executor teardown before resolving", async () => {
    const executor = new FakeExecutor(async () => true);
    let releaseTeardown: (() => void) | undefined;
    executor.dispose = () =>
      new Promise<void>((resolve) => {
        releaseTeardown = resolve;
      });
    const service = new WslStagingService({ createExecutor: () => executor });
    await service.pathExists("Ubuntu", "\\\\wsl.localhost\\Ubuntu\\tmp\\x");

    let settled = false;
    const disposing = service.dispose().then(() => {
      settled = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);

    releaseTeardown?.();
    await disposing;
    expect(settled).toBe(true);
  });

  it("waits for the previous worker's teardown before spawning a successor", async () => {
    const executors: FakeExecutor[] = [];
    let teardownStarted = false;
    let releaseTeardown: (() => void) | undefined;
    let blockTeardown = true;
    const service = new WslStagingService({
      idleTimeoutMs: 5,
      createExecutor: () => {
        const executor = new FakeExecutor(async () => true);
        executor.dispose = () => {
          if (!blockTeardown) {
            executor.disposed = true;
            return Promise.resolve();
          }
          blockTeardown = false;
          teardownStarted = true;
          return new Promise<void>((resolve) => {
            releaseTeardown = resolve;
          });
        };
        executors.push(executor);
        return executor;
      },
    });

    await service.pathExists("Ubuntu", "\\\\wsl.localhost\\Ubuntu\\tmp\\x");
    await vi.waitFor(() => expect(teardownStarted).toBe(true));

    const successor = service.pathExists("Ubuntu", "\\\\wsl.localhost\\Ubuntu\\tmp\\y");
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(executors).toHaveLength(1);

    releaseTeardown?.();
    await expect(successor).resolves.toBe(true);
    expect(executors).toHaveLength(2);
    await service.dispose();
  });
});

describe("WslStagingService inline fallback diagnostics", () => {
  it("warns once when the worker bundle is unavailable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const service = new WslStagingService();
      await service.pathExists("Ubuntu", "\\\\wsl.localhost\\Ubuntu\\tmp\\x");
      await service.pathExists("Ubuntu", "\\\\wsl.localhost\\Ubuntu\\tmp\\y");

      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain("in-process async fallback");
      await service.dispose();
    } finally {
      warn.mockRestore();
    }
  });

  it("routes the fallback warning through onDebug when the caller wires it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const onDebug = vi.fn<(message: string, details?: Record<string, unknown>) => void>();
    try {
      const service = new WslStagingService({ onDebug });
      await service.pathExists("Ubuntu", "\\\\wsl.localhost\\Ubuntu\\tmp\\x");

      expect(onDebug).toHaveBeenCalledWith(expect.stringContaining("in-process async fallback"));
      expect(warn).not.toHaveBeenCalled();
      await service.dispose();
    } finally {
      warn.mockRestore();
    }
  });
});
