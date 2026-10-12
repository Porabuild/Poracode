import { fork, spawn, type ChildProcess } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SshConnectionConfig } from "@/shared/ssh";
import {
  SSH_ENVIRONMENT_PROTOCOL_VERSION,
  SSH_ENVIRONMENT_WORKER_CONFIG_ENV,
} from "@/host/ssh/sshEnvironmentProtocol";
import {
  SshEnvironmentSupervisor,
  type SshEnvironmentSupervisorOptions,
  type SshEnvironmentUtilityProcessLike,
} from "./sshEnvironmentSupervisor";
import { SshUtilityChildLiveness, type SshUtilityProcessHandle } from "./sshUtilityProcessLiveness";

class FakeUtilityProcess extends EventEmitter {
  pid: number | undefined = 4242;
  exitCode: number | null = null;
  readonly posted: unknown[] = [];
  killCalls = 0;

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  kill(): boolean {
    this.killCalls += 1;
    this.exitCode = 0;
    queueMicrotask(() => this.emit("exit", 0));
    return true;
  }
}

/** Kill reports success but the real exit only lands after a delay. */
class DelayedExitUtilityProcess extends FakeUtilityProcess {
  constructor(private readonly exitDelayMs: number) {
    super();
  }

  override kill(): boolean {
    this.killCalls += 1;
    setTimeout(() => {
      this.exitCode = 0;
      this.emit("exit", 0);
    }, this.exitDelayMs);
    return true;
  }
}

/** Kill refuses and no exit ever lands: a bounded failure must stay truthful. */
class UnkillableUtilityProcess extends FakeUtilityProcess {
  override kill(): boolean {
    this.killCalls += 1;
    return false;
  }
}

/** Never spawns and never exits: the spawn deadline is the only bounded signal. */
class HungBeforeSpawnUtilityProcess extends FakeUtilityProcess {
  override pid: number | undefined = undefined;

  override kill(): boolean {
    this.killCalls += 1;
    return false;
  }
}

const tempDirs: string[] = [];
const realChildren: ChildProcess[] = [];

afterEach(async () => {
  for (const child of realChildren.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
  }
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function connection(): SshConnectionConfig {
  return {
    id: "1a2f655a-e274-4213-9a2b-029f29062fd7",
    label: "Build host",
    target: "dev@example.com",
    port: 2222,
  };
}

function createSupervisor(
  overrides: Partial<SshEnvironmentSupervisorOptions> = {},
  createChild: () => FakeUtilityProcess = () => new FakeUtilityProcess(),
): { supervisor: SshEnvironmentSupervisor; children: FakeUtilityProcess[] } {
  const children: FakeUtilityProcess[] = [];
  const supervisor = new SshEnvironmentSupervisor({
    utilityPath: "/tmp/sshEnvironmentWorker.cjs",
    config: {
      mainBundleDir: "/tmp/main",
      agentPluginsDir: "/tmp/agent-plugins",
      wslHelpersDir: "/tmp/wsl-helpers",
      cacheDir: "/tmp/cache",
    },
    forkUtility: () => {
      const child = createChild();
      children.push(child);
      return child as unknown as SshEnvironmentUtilityProcessLike;
    },
    spawnTimeoutMs: 50,
    readyTimeoutMs: 50,
    exitTimeoutMs: 100,
    killTimeoutMs: 100,
    ...overrides,
  });
  return { supervisor, children };
}

async function readyChild(children: FakeUtilityProcess[]): Promise<FakeUtilityProcess> {
  const child = await vi.waitFor(() => {
    expect(children).toHaveLength(1);
    return children[0]!;
  });
  child.emit("message", { v: SSH_ENVIRONMENT_PROTOCOL_VERSION, kind: "ready" });
  return child;
}

function requestFrame(
  child: FakeUtilityProcess,
  kind: string,
): { generation: number; requestId: string } {
  const frame = child.posted.find(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      (message as { request?: { kind?: string } }).request?.kind === kind,
  ) as { generation: number; requestId: string } | undefined;
  if (!frame) throw new Error(`No ${kind} frame was posted.`);
  return frame;
}

async function waitForFrame(child: FakeUtilityProcess, kind: string) {
  return vi.waitFor(() => requestFrame(child, kind));
}

function connectResult() {
  return {
    connectionId: connection().id,
    endpoint: "http://127.0.0.1:49152/",
    remotePort: 49153,
  };
}

function trackUnhandledRejections(): { seen: unknown[]; stop: () => void } {
  const seen: unknown[] = [];
  const listener = (reason: unknown) => {
    seen.push(reason);
  };
  process.on("unhandledRejection", listener);
  return { seen, stop: () => process.off("unhandledRejection", listener) };
}

async function drainRejectionQueue(): Promise<void> {
  await new Promise((resolveDrain) => setImmediate(resolveDrain));
  await new Promise((resolveDrain) => setImmediate(resolveDrain));
}

function realUtilityHandle(child: ChildProcess): SshUtilityProcessHandle {
  return {
    get exitCode() {
      return child.exitCode;
    },
    kill: () => child.kill(),
    on: (event, listener) =>
      child.on(event as "exit", listener as unknown as (code: number | null) => void),
    off: (event, listener) =>
      child.off(event as "exit", listener as unknown as (code: number | null) => void),
  };
}

function adaptUtilityChild(child: ChildProcess): SshEnvironmentUtilityProcessLike {
  const adapter = {
    get pid() {
      return child.pid;
    },
    get exitCode() {
      return child.exitCode;
    },
    postMessage: (message: unknown) => {
      child.send(message as Parameters<ChildProcess["send"]>[0]);
    },
    kill: () => child.kill(),
    once: (event: string, listener: (...args: never[]) => void) =>
      child.once(event as "exit", listener as unknown as (code: number | null) => void),
    on: (event: string, listener: (...args: never[]) => void) =>
      child.on(event as "exit", listener as unknown as (code: number | null) => void),
    off: (event: string, listener: (...args: never[]) => void) =>
      child.off(event as "exit", listener as unknown as (code: number | null) => void),
  };
  return adapter as unknown as SshEnvironmentUtilityProcessLike;
}

describe("SSH environment supervisor", () => {
  it("forks one utility, forwards a versioned request, and parses the result", async () => {
    const { supervisor, children } = createSupervisor();
    const connecting = supervisor.connect({ connection: connection() });
    const child = await readyChild(children);
    const frame = await waitForFrame(child, "connect");

    expect(frame.generation).toBe(1);
    expect(supervisor.localStats()).toMatchObject({ utilityStarts: 1, activeRequests: 1 });
    child.emit("message", {
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      kind: "result",
      generation: frame.generation,
      requestId: frame.requestId,
      ok: true,
      result: connectResult(),
    });

    await expect(connecting).resolves.toEqual(connectResult());
    expect(supervisor.localStats()).toMatchObject({ utilityStarts: 1, activeRequests: 0 });
    await supervisor.dispose();
  });

  it("rejects startup when the utility speaks another protocol generation", async () => {
    const { supervisor, children } = createSupervisor();
    const connecting = supervisor.connect({ connection: connection() });
    void connecting.catch(() => undefined);
    const child = await vi.waitFor(() => {
      expect(children).toHaveLength(1);
      return children[0]!;
    });
    child.emit("message", { v: SSH_ENVIRONMENT_PROTOCOL_VERSION + 1, kind: "ready" });

    await expect(connecting).rejects.toThrow(/did not become ready/);
    expect(child.killCalls).toBeGreaterThan(0);
    await supervisor.dispose();
  });

  it("rejects pending requests when the utility crashes, then retries on a new generation", async () => {
    const { supervisor, children } = createSupervisor();
    const crashed = supervisor.connect({ connection: connection() });
    void crashed.catch(() => undefined);
    const first = await readyChild(children);
    await waitForFrame(first, "connect");
    first.exitCode = 1;
    first.emit("exit", 1);
    await expect(crashed).rejects.toThrow(/utility exited/i);
    expect(supervisor.localStats().generation).toBe(0);

    const retried = supervisor.connect({ connection: connection() });
    const second = await vi.waitFor(() => {
      expect(children).toHaveLength(2);
      return children[1]!;
    });
    second.emit("message", { v: SSH_ENVIRONMENT_PROTOCOL_VERSION, kind: "ready" });
    const frame = await waitForFrame(second, "connect");
    expect(frame.generation).toBe(2);
    second.emit("message", {
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      kind: "result",
      generation: frame.generation,
      requestId: frame.requestId,
      ok: true,
      result: connectResult(),
    });
    await expect(retried).resolves.toEqual(connectResult());
    expect(supervisor.localStats()).toMatchObject({ utilityStarts: 2 });
    await supervisor.dispose();
  });

  it("cancels only the aborting caller's utility request", async () => {
    const { supervisor, children } = createSupervisor();
    const controller = new AbortController();
    const first = supervisor.connect({ connection: connection() }, { signal: controller.signal });
    void first.catch(() => undefined);
    const second = supervisor.connect({ connection: connection() });
    const child = await readyChild(children);

    const frames = await vi.waitFor(() => {
      const posted = child.posted.filter(
        (message) => (message as { request?: { kind?: string } }).request?.kind === "connect",
      ) as { generation: number; requestId: string }[];
      expect(posted).toHaveLength(2);
      return posted;
    });
    const [firstFrame, secondFrame] = frames;

    controller.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    const cancel = await vi.waitFor(() => {
      const frame = child.posted.find(
        (message) => (message as { request?: { kind?: string } }).request?.kind === "cancel",
      ) as { request: { requestId: string } } | undefined;
      expect(frame).toBeDefined();
      return frame!;
    });
    expect(cancel.request.requestId).toBe(firstFrame!.requestId);

    // The cancelled request's late result is dropped; the other caller resolves.
    child.emit("message", {
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      kind: "result",
      generation: firstFrame!.generation,
      requestId: firstFrame!.requestId,
      ok: true,
      result: connectResult(),
    });
    child.emit("message", {
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      kind: "result",
      generation: secondFrame!.generation,
      requestId: secondFrame!.requestId,
      ok: true,
      result: connectResult(),
    });
    await expect(second).resolves.toEqual(connectResult());
    await supervisor.dispose();
  });

  it("disconnect cancels a pending connect and joins through the utility", async () => {
    const { supervisor, children } = createSupervisor();
    const connecting = supervisor.connect({ connection: connection() });
    void connecting.catch(() => undefined);
    const child = await readyChild(children);
    const connectFrame = await waitForFrame(child, "connect");

    const disconnecting = supervisor.disconnect(connection().id);
    await expect(connecting).rejects.toMatchObject({ name: "AbortError" });
    await waitForFrame(child, "cancel");
    const disconnectFrame = await waitForFrame(child, "disconnect");

    // A late result for the cancelled connect is dropped, not published.
    child.emit("message", {
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      kind: "result",
      generation: connectFrame.generation,
      requestId: connectFrame.requestId,
      ok: true,
      result: connectResult(),
    });
    child.emit("message", {
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      kind: "result",
      generation: disconnectFrame.generation,
      requestId: disconnectFrame.requestId,
      ok: true,
      result: undefined,
    });
    await expect(disconnecting).resolves.toBeUndefined();
    await supervisor.dispose();
  });

  it("propagates a typed bootstrap refusal across the utility boundary", async () => {
    const { supervisor, children } = createSupervisor();
    const connecting = supervisor.connect({ connection: connection() });
    const child = await readyChild(children);
    const frame = await waitForFrame(child, "connect");
    child.emit("message", {
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      kind: "result",
      generation: frame.generation,
      requestId: frame.requestId,
      ok: false,
      error: {
        name: "SshBootstrapRefusedError",
        message: "owner incompatible",
        code: "owner-incompatible",
        ownerAppVersion: "0.0.1",
        ownerProtocolVersion: 99,
      },
    });

    await expect(connecting).rejects.toMatchObject({
      name: "SshBootstrapRefusedError",
      code: "owner-incompatible",
      ownerAppVersion: "0.0.1",
    });
    await supervisor.dispose();
  });

  it("ignores malformed frames and wrong generations without disturbing live requests", async () => {
    const { supervisor, children } = createSupervisor();
    const connecting = supervisor.connect({ connection: connection() });
    const child = await readyChild(children);
    const frame = await waitForFrame(child, "connect");

    child.emit("message", null);
    child.emit("message", { v: SSH_ENVIRONMENT_PROTOCOL_VERSION, kind: "result" });
    child.emit("message", {
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      kind: "result",
      generation: frame.generation + 7,
      requestId: frame.requestId,
      ok: true,
      result: connectResult(),
    });
    child.emit("message", {
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      kind: "result",
      generation: frame.generation,
      requestId: frame.requestId,
      ok: true,
      result: { connectionId: "not-a-uuid", endpoint: "not-a-url", remotePort: 0 },
    });

    await expect(connecting).rejects.toThrow(/invalid/i);
    await supervisor.dispose();
  });

  it("dispose rejects in-flight callers, asks the utility to shut down, and joins its exit", async () => {
    const { supervisor, children } = createSupervisor();
    const connecting = supervisor.connect({ connection: connection() });
    void connecting.catch(() => undefined);
    const child = await readyChild(children);
    const frame = await waitForFrame(child, "connect");

    let disposed = false;
    const disposing = supervisor.dispose().then(() => {
      disposed = true;
    });
    await expect(connecting).rejects.toMatchObject({ name: "AbortError" });
    await waitForFrame(child, "shutdown");
    expect(disposed).toBe(false);

    // A late result after dispose must not revive the request or throw.
    child.emit("message", {
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      kind: "result",
      generation: frame.generation,
      requestId: frame.requestId,
      ok: true,
      result: connectResult(),
    });
    child.exitCode = 0;
    child.emit("exit", 0);
    await disposing;
    expect(supervisor.localStats()).toMatchObject({ disposed: true, activeRequests: 0 });
    await supervisor.dispose();
  });

  it("kills a utility that does not exit after shutdown", async () => {
    const { supervisor, children } = createSupervisor({ exitTimeoutMs: 20 });
    const connecting = supervisor.connect({ connection: connection() });
    void connecting.catch(() => undefined);
    const child = await readyChild(children);
    await waitForFrame(child, "connect");
    // Never emit exit: the bounded join must escalate to a kill.
    const disposing = supervisor.dispose();
    await expect(connecting).rejects.toMatchObject({ name: "AbortError" });
    await disposing;
    expect(child.killCalls).toBeGreaterThan(0);
  });

  it("starts no utility for a manager that never receives a request", async () => {
    const { supervisor, children } = createSupervisor();
    await supervisor.dispose();
    expect(children).toHaveLength(0);
  });

  it("waits for the observed exit after a delayed kill instead of trusting kill()", async () => {
    const child = new DelayedExitUtilityProcess(80);
    const { supervisor, children } = createSupervisor(
      { exitTimeoutMs: 10, killTimeoutMs: 1_000 },
      () => child,
    );
    const connecting = supervisor.connect({ connection: connection() });
    void connecting.catch(() => undefined);
    await readyChild(children);
    await waitForFrame(child, "connect");

    const disposing = supervisor.dispose();
    await expect(connecting).rejects.toMatchObject({ name: "AbortError" });
    let settled = false;
    void disposing.then(() => {
      settled = true;
    });
    await new Promise((resolveWait) => setTimeout(resolveWait, 40));
    expect(child.killCalls).toBe(1);
    expect(settled).toBe(false);
    await disposing;
    expect(settled).toBe(true);
  });

  it("rejects dispose truthfully when kill never terminates, retains custody, and reaps a later exit", async () => {
    const child = new UnkillableUtilityProcess();
    const { supervisor, children } = createSupervisor(
      { exitTimeoutMs: 5, killTimeoutMs: 25 },
      () => child,
    );
    const connecting = supervisor.connect({ connection: connection() });
    void connecting.catch(() => undefined);
    await readyChild(children);
    await waitForFrame(child, "connect");

    const firstDispose = supervisor.dispose();
    await expect(connecting).rejects.toMatchObject({ name: "AbortError" });
    await expect(firstDispose).rejects.toThrow(/did not exit/i);
    expect(child.killCalls).toBeGreaterThan(0);
    expect(children).toHaveLength(1);
    // No false restart: the supervisor is disposed and the child is still live.
    await expect(supervisor.connect({ connection: connection() })).rejects.toMatchObject({
      name: "AbortError",
    });

    // The real exit eventually arrives; the retained custody is reaped by a retry.
    child.exitCode = 0;
    child.emit("exit", 0);
    await expect(supervisor.dispose()).resolves.toBeUndefined();
  });

  it("refuses a successor while a failed start's process has not exited", async () => {
    const hung = new HungBeforeSpawnUtilityProcess();
    let forks = 0;
    const { supervisor, children } = createSupervisor(
      { spawnTimeoutMs: 20, killTimeoutMs: 15 },
      () => {
        forks += 1;
        return forks === 1 ? hung : new FakeUtilityProcess();
      },
    );
    const first = supervisor.connect({ connection: connection() });
    void first.catch(() => undefined);
    await expect(first).rejects.toThrow(/did not (start|exit)/i);
    expect(hung.killCalls).toBeGreaterThan(0);

    const second = supervisor.connect({ connection: connection() });
    void second.catch(() => undefined);
    await expect(second).rejects.toThrow(/has not exited|refusing/i);
    expect(children).toHaveLength(1);

    hung.exitCode = 1;
    hung.emit("exit", 1);
    const third = supervisor.connect({ connection: connection() });
    void third.catch(() => undefined);
    const next = await vi.waitFor(() => {
      expect(children).toHaveLength(2);
      return children[1]!;
    });
    next.emit("message", { v: SSH_ENVIRONMENT_PROTOCOL_VERSION, kind: "ready" });
    const frame = await waitForFrame(next, "connect");
    next.emit("message", {
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      kind: "result",
      generation: frame.generation,
      requestId: frame.requestId,
      ok: true,
      result: connectResult(),
    });
    await expect(third).resolves.toEqual(connectResult());
    await supervisor.dispose();
  });

  it("settles the ready latch on an exit-before-spawn without an unhandled rejection", async () => {
    const tracker = trackUnhandledRejections();
    try {
      const child = new HungBeforeSpawnUtilityProcess();
      const { supervisor, children } = createSupervisor(
        { spawnTimeoutMs: 5_000, killTimeoutMs: 20 },
        () => child,
      );
      const connecting = supervisor.connect({ connection: connection() });
      void connecting.catch(() => undefined);
      await vi.waitFor(() => expect(children).toHaveLength(1));
      child.exitCode = 1;
      child.emit("exit", 1);

      await expect(connecting).rejects.toThrow(/exited before/i);
      await drainRejectionQueue();
      expect(tracker.seen).toEqual([]);
      await supervisor.dispose();
    } finally {
      tracker.stop();
    }
  });

  it("rejects a crash after spawn but before ready without an unhandled rejection", async () => {
    const tracker = trackUnhandledRejections();
    try {
      const child = new FakeUtilityProcess();
      const { supervisor, children } = createSupervisor(
        { readyTimeoutMs: 5_000, killTimeoutMs: 50 },
        () => child,
      );
      const connecting = supervisor.connect({ connection: connection() });
      void connecting.catch(() => undefined);
      await vi.waitFor(() => expect(children).toHaveLength(1));

      child.exitCode = 1;
      child.emit("exit", 1);
      await expect(connecting).rejects.toThrow(/before it was ready|utility exited/i);
      await drainRejectionQueue();
      expect(tracker.seen).toEqual([]);
      await supervisor.dispose();
    } finally {
      tracker.stop();
    }
  });

  it("detaches the caller's abort listener once the request settles", async () => {
    const { supervisor, children } = createSupervisor();
    const controller = new AbortController();
    const connecting = supervisor.connect(
      { connection: connection() },
      { signal: controller.signal },
    );
    const child = await readyChild(children);
    const frame = await waitForFrame(child, "connect");
    child.emit("message", {
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      kind: "result",
      generation: frame.generation,
      requestId: frame.requestId,
      ok: true,
      result: connectResult(),
    });
    await expect(connecting).resolves.toEqual(connectResult());

    // A settled request must not leave a live abort listener behind.
    controller.abort();
    await drainRejectionQueue();
    expect(
      child.posted.filter(
        (message) => (message as { request?: { kind?: string } }).request?.kind === "cancel",
      ),
    ).toHaveLength(0);
    expect(supervisor.localStats().activeRequests).toBe(0);
    await supervisor.dispose();
  });

  it("joins a dispose-before-ready start without an unhandled rejection", async () => {
    const tracker = trackUnhandledRejections();
    try {
      const child = new FakeUtilityProcess();
      const { supervisor, children } = createSupervisor(
        { readyTimeoutMs: 5_000, exitTimeoutMs: 50 },
        () => child,
      );
      const connecting = supervisor.connect({ connection: connection() });
      void connecting.catch(() => undefined);
      await vi.waitFor(() => expect(children).toHaveLength(1));

      const disposing = supervisor.dispose();
      await expect(connecting).rejects.toMatchObject({ name: "AbortError" });
      await disposing;
      expect(child.killCalls).toBeGreaterThan(0);
      await drainRejectionQueue();
      expect(tracker.seen).toEqual([]);
    } finally {
      tracker.stop();
    }
  });

  it("treats a fatal frame as terminal without forking over the live process", async () => {
    const stuck = new UnkillableUtilityProcess();
    let forks = 0;
    const { supervisor, children } = createSupervisor({ killTimeoutMs: 10 }, () => {
      forks += 1;
      return forks === 1 ? stuck : new FakeUtilityProcess();
    });
    const connecting = supervisor.connect({ connection: connection() });
    void connecting.catch(() => undefined);
    await readyChild(children);
    await waitForFrame(stuck, "connect");

    stuck.emit("message", {
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      kind: "fatal",
      message: "worker failed",
    });
    await expect(connecting).rejects.toThrow(/worker failed/);
    expect(supervisor.localStats().generation).toBe(0);

    const retried = supervisor.connect({ connection: connection() });
    void retried.catch(() => undefined);
    await expect(retried).rejects.toThrow(/has not exited|refusing/i);
    expect(children).toHaveLength(1);

    stuck.exitCode = 1;
    stuck.emit("exit", 1);
    const third = supervisor.connect({ connection: connection() });
    void third.catch(() => undefined);
    const next = await vi.waitFor(() => {
      expect(children).toHaveLength(2);
      return children[1]!;
    });
    next.emit("message", { v: SSH_ENVIRONMENT_PROTOCOL_VERSION, kind: "ready" });
    const frame = await waitForFrame(next, "connect");
    next.emit("message", {
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      kind: "result",
      generation: frame.generation,
      requestId: frame.requestId,
      ok: true,
      result: connectResult(),
    });
    await expect(third).resolves.toEqual(connectResult());
    await supervisor.dispose();
  });

  it("joins a real IPC utility over the versioned protocol and its real exit", async () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-ssh-supervisor-real-"));
    tempDirs.push(root);
    const supervisor = new SshEnvironmentSupervisor({
      utilityPath: resolve("src/host/ssh/runtimeBundleColdWork.processFixture.ts"),
      config: {
        mainBundleDir: join(root, "main"),
        agentPluginsDir: join(root, "agent-plugins"),
        wslHelpersDir: join(root, "wsl-helpers"),
        cacheDir: join(root, "cache"),
      },
      env: { ...process.env, HOME: root },
      spawnTimeoutMs: 5_000,
      readyTimeoutMs: 20_000,
      exitTimeoutMs: 10_000,
      killTimeoutMs: 5_000,
      forkUtility: (_modulePath, forkOptions) => {
        const rawConfig = (forkOptions.env as Record<string, string | undefined> | undefined)?.[
          SSH_ENVIRONMENT_WORKER_CONFIG_ENV
        ];
        const child = fork(
          resolve("src/host/ssh/runtimeBundleColdWork.processFixture.ts"),
          [String(rawConfig)],
          {
            execArgv: [
              "--experimental-transform-types",
              "--disable-warning=ExperimentalWarning",
              "--import",
              resolve("scripts/remote-v3-ts-register.mjs"),
              "--import",
              resolve("src/host/ssh/sshColdWorkTestRegister.mjs"),
            ],
            env: forkOptions.env as NodeJS.ProcessEnv,
            stdio: ["ignore", "ignore", "inherit", "ipc"],
          },
        );
        realChildren.push(child);
        return adaptUtilityChild(child);
      },
    });

    await expect(supervisor.discoverHosts()).resolves.toEqual([]);
    expect(supervisor.localStats()).toMatchObject({ utilityStarts: 1, generation: 1 });
    await supervisor.dispose();
    expect(supervisor.localStats()).toMatchObject({ disposed: true, activeRequests: 0 });
    expect(realChildren[0]?.exitCode).toBe(0);
  }, 30_000);
});

describe.skipIf(process.platform === "win32")("SshUtilityChildLiveness (real process)", () => {
  it("joins the real exit event rather than the kill return", async () => {
    const child = spawn(
      process.execPath,
      [
        "-e",
        "process.on('SIGTERM', () => {}); console.log('armed'); setTimeout(() => process.exit(7), 60);",
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    realChildren.push(child);
    // The signal handler must be installed before the kill is delivered, so
    // the only way the process can leave is the real delayed exit.
    await once(child.stdout!, "data");
    const liveness = new SshUtilityChildLiveness(realUtilityHandle(child));
    const startedAt = Date.now();
    const exit = await liveness.terminateAndJoin(() => {
      child.kill();
    }, 5_000);
    expect(exit).toEqual({ code: 7 });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(40);
    liveness.release();
  });

  it("reports a bounded timeout as null, never as a synthetic exit", async () => {
    const child = spawn(
      process.execPath,
      ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"],
      { stdio: "ignore" },
    );
    realChildren.push(child);
    const liveness = new SshUtilityChildLiveness(realUtilityHandle(child));
    await expect(liveness.waitForExit(30)).resolves.toBeNull();
    expect(liveness.hasExited).toBe(false);

    child.kill("SIGKILL");
    await expect(liveness.waitForExit(5_000)).resolves.toEqual({ code: null });
    liveness.release();
  });
});
