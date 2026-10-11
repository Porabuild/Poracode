import { fork, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  sshRuntimeManifestFileName,
  SSH_RUNTIME_MANIFEST_VERSION,
  type SshRuntimeEntryName,
} from "@/shared/sshRuntimeManifest";
import { RUNTIME_BUILD_SOURCE_HASH } from "@/shared/runtimeBuildIdentity";

vi.mock("@/shared/runtimeBuildIdentity", () => ({ RUNTIME_BUILD_SOURCE_HASH: "d".repeat(64) }));
import {
  SSH_ENVIRONMENT_PROTOCOL_VERSION,
  type SshEnvironmentWorkerConfig,
} from "./sshEnvironmentProtocol";
import { createSshEnvironmentWorkerService } from "./sshEnvironmentWorkerService";

const tempDirs: string[] = [];
const children: ChildProcess[] = [];

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
  }
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

interface CapturedMessage {
  readonly v: number;
  readonly kind: string;
  readonly requestId?: string;
  readonly ok?: boolean;
  readonly result?: unknown;
  readonly error?: { name?: string };
}

function capture() {
  const messages: CapturedMessage[] = [];
  return {
    messages,
    port: {
      postMessage: (message: unknown) => messages.push(message as CapturedMessage),
      onMessage: () => undefined,
    },
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

function createWorkerConfig(options: { heavy?: boolean } = {}): SshEnvironmentWorkerConfig {
  const root = mkdtempSync(join(tmpdir(), "poracode-ssh-worker-service-"));
  tempDirs.push(root);
  const mainBundleDir = join(root, "main");
  const agentPluginsDir = join(root, "agent-plugins");
  const wslHelpersDir = join(root, "wsl-helpers");
  mkdirSync(mainBundleDir, { recursive: true });
  mkdirSync(agentPluginsDir, { recursive: true });
  mkdirSync(wslHelpersDir, { recursive: true });
  writeFileSync(join(mainBundleDir, "server.cjs"), "server", "utf8");
  writeFileSync(join(mainBundleDir, "supervisor.cjs"), "supervisor", "utf8");
  writeFileSync(join(mainBundleDir, "claudeSdkProbeWorker.mjs"), "worker", "utf8");
  writeFileSync(join(mainBundleDir, "cursorSdkWorker.mjs"), "worker", "utf8");
  const entries: readonly [SshRuntimeEntryName, string][] = [
    ["server", "server.cjs"],
    ["supervisor", "supervisor.cjs"],
    ["claudeSdkProbeWorker", "claudeSdkProbeWorker.mjs"],
    ["cursorSdkWorker", "cursorSdkWorker.mjs"],
  ];
  for (const [entry, file] of entries) {
    const bytes = readFileSync(join(mainBundleDir, file));
    writeFileSync(
      join(mainBundleDir, sshRuntimeManifestFileName(entry)),
      `${JSON.stringify({
        version: SSH_RUNTIME_MANIFEST_VERSION,
        entry,
        sourceHash: RUNTIME_BUILD_SOURCE_HASH,
        captureProtocolVersion: 1,
        settingsServiceVersion: 0,
        resources: [],
        files: [
          {
            path: file,
            format: file.endsWith(".mjs") ? "module" : "commonjs",
            bytes: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          },
        ],
        dependencies: ["better-sqlite3", "node-pty", "ws", "yaml"],
      })}\n`,
      "utf8",
    );
  }
  writeFileSync(join(agentPluginsDir, "plugin.json"), "{}", "utf8");
  writeFileSync(join(wslHelpersDir, "bridge.mjs"), "", "utf8");
  if (options.heavy) {
    // A multi-MB closure so staging is measurably in flight when shutdown lands.
    const chunk = Buffer.alloc(64 * 1024, 7);
    for (let index = 0; index < 96; index += 1) {
      writeFileSync(join(agentPluginsDir, `plugin-${index}.bin`), chunk);
      writeFileSync(join(wslHelpersDir, `helper-${index}.bin`), chunk);
    }
  }
  return {
    mainBundleDir,
    agentPluginsDir,
    wslHelpersDir,
    cacheDir: join(root, "cache"),
  };
}

async function waitForMessage(
  messages: CapturedMessage[],
  predicate: (message: CapturedMessage) => boolean,
): Promise<CapturedMessage> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const match = messages.find(predicate);
    if (match) return match;
    await new Promise((resolveWait) => setTimeout(resolveWait, 5));
  }
  throw new Error(`Timed out waiting for a worker message: ${JSON.stringify(messages)}`);
}

function requestFrame(
  generation: number,
  requestId: string,
  request: unknown,
): Record<string, unknown> {
  return { v: SSH_ENVIRONMENT_PROTOCOL_VERSION, generation, requestId, request };
}

describe("SSH environment worker service", () => {
  it("prepares the runtime bundle and reports its source", async () => {
    const config = createWorkerConfig();
    const sink = capture();
    const service = createSshEnvironmentWorkerService(config, sink.port);
    service.handleMessage(requestFrame(1, "req-1", { kind: "prepare-runtime" }));

    const message = await waitForMessage(sink.messages, (entry) => entry.requestId === "req-1");
    expect(message).toMatchObject({ kind: "result", ok: true });
    expect(message.result).toMatchObject({
      hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      source: "staged",
    });
    await service.dispose();
  });

  it("cancels an in-flight request by request id", async () => {
    const config = createWorkerConfig();
    const sink = capture();
    const service = createSshEnvironmentWorkerService(config, sink.port);
    service.handleMessage(requestFrame(1, "req-1", { kind: "prepare-runtime" }));
    service.handleMessage(requestFrame(1, "req-2", { kind: "cancel", requestId: "req-1" }));

    const message = await waitForMessage(sink.messages, (entry) => entry.requestId === "req-1");
    expect(message).toMatchObject({ ok: false });
    expect(message.error?.name).toBe("AbortError");
    await service.dispose();
  });

  it("ignores frames from another protocol generation and malformed frames", async () => {
    const config = createWorkerConfig();
    const sink = capture();
    const service = createSshEnvironmentWorkerService(config, sink.port);
    service.handleMessage({
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION + 1,
      generation: 1,
      requestId: "foreign",
      request: { kind: "prepare-runtime" },
    });
    service.handleMessage({ nonsense: true });
    service.handleMessage({
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      generation: 1,
      requestId: "unknown-kind",
      request: { kind: "not-a-request" },
    });
    service.handleMessage({
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      generation: 1,
      requestId: "malformed-disconnect",
      request: { kind: "disconnect", connectionId: 42 },
    });
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    expect(sink.messages).toEqual([]);
    await service.dispose();
  });

  it("resolves shutdownRequested and joins in-flight work on dispose", async () => {
    const config = createWorkerConfig();
    const sink = capture();
    const service = createSshEnvironmentWorkerService(config, sink.port);
    service.handleMessage(requestFrame(1, "req-1", { kind: "prepare-runtime" }));
    service.handleMessage(requestFrame(1, "shutdown-1", { kind: "shutdown" }));
    // Dispose before yielding: the in-flight prepare must be aborted, not raced.
    const disposing = service.dispose();
    await service.shutdownRequested;
    await disposing;
    const message = await waitForMessage(sink.messages, (entry) => entry.requestId === "req-1");
    expect(message.ok).toBe(false);
    expect(message.error?.name).toBe("AbortError");
  });

  it("keeps an aborted operation tracked until its completion settles", async () => {
    const config = createWorkerConfig();
    const sink = capture();
    const service = createSshEnvironmentWorkerService(config, sink.port);
    service.handleMessage(requestFrame(1, "req-1", { kind: "prepare-runtime" }));
    service.handleMessage(requestFrame(1, "req-2", { kind: "cancel", requestId: "req-1" }));

    // The caller may settle on abort, but the operation stays in the join set
    // until its own completion (and cleanup) settles.
    expect(service.localStats()).toMatchObject({ activeOperations: 1, closing: false });
    const message = await waitForMessage(sink.messages, (entry) => entry.requestId === "req-1");
    expect(message.error?.name).toBe("AbortError");
    await vi.waitFor(() => expect(service.localStats().activeOperations).toBe(0));
    await service.dispose();
  });

  it("refuses a request admitted after close and never starts it", async () => {
    const config = createWorkerConfig();
    const sink = capture();
    const service = createSshEnvironmentWorkerService(config, sink.port);
    await service.dispose();
    service.handleMessage(requestFrame(1, "req-late", { kind: "prepare-runtime" }));

    expect(service.localStats()).toMatchObject({
      activeOperations: 0,
      refusedRequests: 1,
      closing: true,
    });
    const message = sink.messages.find((entry) => entry.requestId === "req-late");
    expect(message).toMatchObject({ kind: "result", ok: false });
    expect(message?.error?.name).toBe("AbortError");
  });

  it("refuses new requests while an in-flight dispose is still joining", async () => {
    const config = createWorkerConfig({ heavy: true });
    const sink = capture();
    const service = createSshEnvironmentWorkerService(config, sink.port);
    service.handleMessage(requestFrame(1, "req-1", { kind: "prepare-runtime" }));
    const disposing = service.dispose();
    service.handleMessage(requestFrame(1, "req-2", { kind: "prepare-runtime" }));

    expect(service.localStats()).toMatchObject({ activeOperations: 1, refusedRequests: 1 });
    const refused = sink.messages.find((entry) => entry.requestId === "req-2");
    expect(refused).toMatchObject({ ok: false });
    await disposing;
    const aborted = await waitForMessage(sink.messages, (entry) => entry.requestId === "req-1");
    expect(aborted.error?.name).toBe("AbortError");
  });

  it("refuses a duplicate request id while the first is still in flight", async () => {
    const config = createWorkerConfig();
    const sink = capture();
    const service = createSshEnvironmentWorkerService(config, sink.port);
    service.handleMessage(requestFrame(1, "req-1", { kind: "prepare-runtime" }));
    service.handleMessage(requestFrame(1, "req-1", { kind: "prepare-runtime" }));

    const duplicate = sink.messages.find((entry) => entry.requestId === "req-1" && !entry.ok);
    expect(duplicate).toMatchObject({ ok: false });
    expect(service.localStats().refusedRequests).toBe(1);
    await service.dispose();
  });

  it("ignores a cancel frame from another generation", async () => {
    const config = createWorkerConfig();
    const sink = capture();
    const service = createSshEnvironmentWorkerService(config, sink.port);
    service.handleMessage(requestFrame(1, "req-1", { kind: "prepare-runtime" }));
    service.handleMessage(requestFrame(2, "cancel-1", { kind: "cancel", requestId: "req-1" }));

    const message = await waitForMessage(sink.messages, (entry) => entry.requestId === "req-1");
    expect(message).toMatchObject({ ok: true });
    await service.dispose();
  });

  it("swallows a failed result post when the channel closes during shutdown", async () => {
    const tracker = trackUnhandledRejections();
    try {
      const config = createWorkerConfig({ heavy: true });
      const messages: CapturedMessage[] = [];
      let closed = false;
      const service = createSshEnvironmentWorkerService(config, {
        postMessage: (message: unknown) => {
          if (closed) throw new Error("Message port closed.");
          messages.push(message as CapturedMessage);
        },
        onMessage: () => undefined,
      });
      service.handleMessage(requestFrame(1, "req-1", { kind: "prepare-runtime" }));
      closed = true;
      await service.dispose();
      await drainRejectionQueue();
      expect(tracker.seen).toEqual([]);
      expect(messages).toEqual([]);
    } finally {
      tracker.stop();
    }
  });

  it("joins prepare-runtime file work before the real child exits on shutdown", async () => {
    const config = createWorkerConfig({ heavy: true });
    const child = fork(
      resolve("src/host/ssh/runtimeBundleColdWork.processFixture.ts"),
      [JSON.stringify(config)],
      {
        execArgv: [
          "--experimental-transform-types",
          "--disable-warning=ExperimentalWarning",
          "--import",
          resolve("scripts/remote-v3-ts-register.mjs"),
          "--import",
          resolve("src/host/ssh/sshColdWorkTestRegister.mjs"),
        ],
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      },
    );
    children.push(child);
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const messages: CapturedMessage[] = [];
    child.on("message", (message) => messages.push(message as CapturedMessage));

    const waitForChildMessage = async (predicate: (message: CapturedMessage) => boolean) => {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const match = messages.find(predicate);
        if (match) return match;
        await new Promise((resolveWait) => setTimeout(resolveWait, 5));
      }
      throw new Error(`Timed out waiting for fixture output: ${stderr}`);
    };

    await waitForChildMessage((message) => message.kind === "ready");
    child.send(requestFrame(1, "req-prepare", { kind: "prepare-runtime" }));

    // Only ask for shutdown once staging is really in flight, so the abort
    // lands inside the copy/hash work rather than after a finished build.
    await vi.waitFor(
      () => {
        const staged =
          existsSync(config.cacheDir) &&
          readdirSync(config.cacheDir).some((name) => name.startsWith("stage-"));
        expect(staged).toBe(true);
      },
      { timeout: 20_000 },
    );

    child.send(requestFrame(1, "shutdown-1", { kind: "shutdown" }));
    const [code] = await once(child, "exit");
    expect(code).toBe(0);

    // The builder's cleanup only runs if dispose joined the prepare promise
    // before the fixture's process.exit: no stage and no archive may remain.
    const leftovers = existsSync(config.cacheDir) ? readdirSync(config.cacheDir) : [];
    expect(leftovers.filter((name) => name.startsWith("stage-"))).toEqual([]);
    expect(leftovers.filter((name) => name.endsWith(".tar.gz"))).toEqual([]);
  }, 60_000);
});
