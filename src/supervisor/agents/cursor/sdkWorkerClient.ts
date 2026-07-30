import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectLocation } from "@/shared/contracts";
import { terminateChildProcessTree } from "@/shared/processTree";
import { buildAgentCommand } from "../base";
import {
  resolveNodeForDistro,
  type ResolvedNode,
  type ResolveNodeOptions,
} from "../../wsl/runtime";
import {
  deployFilesToWslTempBase,
  resolveWslHelpersDir,
  type WslDeployFile,
} from "../../wsl/wslDeploy";
import {
  CURSOR_SDK_WORKER_PROTOCOL_VERSION,
  type CursorSdkWorkerAgentMessage,
  type CursorSdkWorkerDiscovery,
  type CursorSdkWorkerError,
  type CursorSdkWorkerEvent,
  type CursorSdkWorkerInitializeInput,
  type CursorSdkWorkerInitializeResult,
  type CursorSdkWorkerProbeResult,
  type CursorSdkWorkerStartInput,
  type CursorSdkWorkerStartResult,
  type CursorSdkWorkerWireMessage,
} from "./sdkWorkerProtocol";

const DEFAULT_BOOT_TIMEOUT_MS = 15_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const MAX_LINE_BYTES = 16 * 1024 * 1024;
const FATAL_REQUEST_TIMEOUT_METHODS = new Set(["initialize", "start", "cancel", "reload"]);

type WslLocation = Extract<ProjectLocation, { kind: "wsl" }>;

export interface CursorSdkWorkerSpawnOptions {
  projectLocation: ProjectLocation;
  /** Package root, package entry, node_modules root, or ancestor directory. */
  configuredPath?: string;
  /** Test/fast-path only; path is interpreted inside the target environment. */
  sdkEntryPath?: string;
  /** Required with sdkEntryPath when containment should be enforced. */
  sdkPackageRoot?: string;
  /** Non-secret process environment overrides. */
  env?: Record<string, string>;
  /** Override the native helper path, or the host source staged into WSL. */
  workerPath?: string;
  /** Override resources/wsl-helpers for WSL staging. */
  helpersDir?: string;
  bootTimeoutMs?: number;
  requestTimeoutMs?: number;
}

export type CursorSdkWorkerSpawnProcess = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface CursorSdkWorkerClientDependencies {
  spawnProcess?: CursorSdkWorkerSpawnProcess;
  resolveNode?: (distro: string, options?: ResolveNodeOptions) => Promise<ResolvedNode>;
  deploy?: (
    distro: string,
    baseName: string,
    files: readonly WslDeployFile[],
  ) => { linuxBaseDir: string } | null;
}

export type CursorSdkWorkerEventListener = (event: CursorSdkWorkerEvent) => void;
export type CursorSdkWorkerTransportErrorListener = (error: Error) => void;

export class CursorSdkWorkerRpcError extends Error {
  readonly code: string | undefined;

  constructor(error: CursorSdkWorkerError) {
    super(error.message);
    this.name = error.name || "CursorSdkWorkerRpcError";
    this.code = error.code;
  }
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

interface SpawnedWorker {
  child: ChildProcess;
  discovery: CursorSdkWorkerDiscovery;
  projectCwd: string;
  useProcessGroup: boolean;
}

export async function spawnCursorSdkWorker(
  options: CursorSdkWorkerSpawnOptions,
  dependencies: CursorSdkWorkerClientDependencies = {},
): Promise<CursorSdkWorkerClient> {
  const spawned = await spawnWorkerProcess(options, dependencies);
  const client = new CursorSdkWorkerClient(
    spawned.child,
    spawned.discovery,
    spawned.projectCwd,
    options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    spawned.useProcessGroup,
  );
  try {
    await client.waitUntilReady(options.bootTimeoutMs ?? DEFAULT_BOOT_TIMEOUT_MS);
    return client;
  } catch (error) {
    client.terminate();
    throw error;
  }
}

export class CursorSdkWorkerClient {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly listeners = new Set<CursorSdkWorkerEventListener>();
  private readonly transportErrorListeners = new Set<CursorSdkWorkerTransportErrorListener>();
  private readonly ready: Promise<void>;
  private resolveReady: (() => void) | undefined;
  private rejectReady: ((error: Error) => void) | undefined;
  private stdoutBuffer = "";
  private readyReceived = false;
  private terminated = false;
  private transportError: Error | undefined;
  private disposePromise: Promise<void> | undefined;

  constructor(
    private readonly child: ChildProcess,
    private readonly discovery: CursorSdkWorkerDiscovery,
    private readonly projectCwd: string,
    private readonly requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    private readonly useProcessGroup = false,
  ) {
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.attachProcess();
  }

  async initialize(
    input: CursorSdkWorkerInitializeInput,
  ): Promise<CursorSdkWorkerInitializeResult> {
    return this.request<CursorSdkWorkerInitializeResult>("initialize", {
      ...input,
      sdk: this.discovery,
    });
  }

  async start(input: CursorSdkWorkerStartInput): Promise<CursorSdkWorkerStartResult> {
    return this.request<CursorSdkWorkerStartResult>("start", input);
  }

  async cancel(runId?: string): Promise<{ cancelled: boolean }> {
    return this.request<{ cancelled: boolean }>("cancel", {
      ...(runId ? { runId } : {}),
    });
  }

  async reload(): Promise<void> {
    await this.request("reload", {});
  }

  async listMessages(
    input: {
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<CursorSdkWorkerAgentMessage[]> {
    return this.request<CursorSdkWorkerAgentMessage[]>("messages.list", input);
  }

  /**
   * Loads/authenticates the installed SDK and fetches its account-specific
   * model catalog without creating an agent. Suitable for install detection.
   */
  async probe(apiKey?: string): Promise<CursorSdkWorkerProbeResult> {
    return this.request<CursorSdkWorkerProbeResult>("models.list", {
      sdk: this.discovery,
      projectCwd: this.projectCwd,
      ...(apiKey ? { apiKey } : {}),
    });
  }

  async listModels(apiKey?: string): Promise<CursorSdkWorkerProbeResult> {
    return this.probe(apiKey);
  }

  onEvent(listener: CursorSdkWorkerEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Subscribe to an unexpected worker/process failure.
   *
   * Unlike run-error events, this covers transport loss after a start request
   * has already been acknowledged. Remember and replay the terminal error so
   * the narrow ready→listener-registration window cannot strand a session.
   * Intentional `dispose()`/`terminate()` calls remain silent.
   */
  onTransportError(listener: CursorSdkWorkerTransportErrorListener): () => void {
    this.transportErrorListeners.add(listener);
    if (this.transportError) {
      try {
        listener(this.transportError);
      } catch {
        // Transport teardown must not be disrupted by consumer code.
      }
    }
    return () => {
      this.transportErrorListeners.delete(listener);
    };
  }

  dispose(): Promise<void> {
    this.disposePromise ??= this.disposeOnce();
    return this.disposePromise;
  }

  terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.rejectAll(new Error("Cursor SDK worker terminated."));
    try {
      terminateCursorSdkWorkerTree(this.child, this.useProcessGroup);
    } catch {
      // Best effort.
    }
  }

  async waitUntilReady(timeoutMs: number): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.ready,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Cursor SDK worker boot timed out.")),
            timeoutMs,
          );
          timeout.unref?.();
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async disposeOnce(): Promise<void> {
    if (this.terminated) return;
    try {
      await this.request("dispose", {});
    } catch {
      // A dead worker is already disposed from the host's perspective.
    }
    this.child.stdin?.end();
    this.terminate();
  }

  private request<Result>(method: string, params: unknown): Promise<Result> {
    if (this.terminated) {
      return Promise.reject(new Error("Cursor SDK worker is not running."));
    }
    if (!this.child.stdin?.writable) {
      return Promise.reject(new Error("Cursor SDK worker stdin is unavailable."));
    }
    const id = randomUUID();
    return new Promise<Result>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const error = new Error(`Cursor SDK worker request ${method} timed out.`);
        if (FATAL_REQUEST_TIMEOUT_METHODS.has(method)) {
          // Mutating SDK calls may still resolve after the caller's deadline.
          // A fatal teardown prevents a late invisible agent/run or concurrent
          // mutation of provider state after the host has already moved on.
          this.fail(error);
          return;
        }
        this.pending.delete(id);
        reject(error);
      }, this.requestTimeoutMs);
      timeout.unref?.();
      this.pending.set(id, {
        resolve: (value) => resolve(value as Result),
        reject,
        timeout,
      });
      const payload = JSON.stringify({ type: "request", id, method, params });
      this.child.stdin!.write(`${payload}\n`, (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.pending.delete(id);
        pending.reject(error);
      });
    });
  }

  private attachProcess(): void {
    // SDK diagnostics are intentionally not forwarded: stderr can contain
    // provider-native payloads, and leaving an unread pipe can deadlock a
    // verbose child after its OS buffer fills.
    this.child.stderr?.resume();
    this.child.stdout?.on("data", (chunk: Buffer | string) => {
      this.consumeStdout(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    });
    this.child.stdout?.on("error", (error) => {
      this.fail(error);
    });
    this.child.stdin?.on("error", (error) => {
      this.fail(error);
    });
    this.child.once("error", (error) => {
      this.fail(error);
    });
    this.child.once("exit", (code, signal) => {
      if (this.terminated) return;
      const suffix = signal ? ` (${signal})` : code === null ? "" : ` (code ${code})`;
      this.fail(new Error(`Cursor SDK worker exited${suffix}.`));
    });
  }

  private consumeStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    // A UTF-16 code unit encodes to at most 3 UTF-8 bytes, so a buffer under
    // MAX_LINE_BYTES/3 code units cannot exceed the limit. Measuring is O(size)
    // and this runs per stdout chunk, so only confirm once the bound trips.
    if (
      this.stdoutBuffer.length > MAX_LINE_BYTES / 3 &&
      Buffer.byteLength(this.stdoutBuffer, "utf8") > MAX_LINE_BYTES
    ) {
      this.fail(new Error("Cursor SDK worker emitted an oversized protocol line."));
      return;
    }
    let newline = this.stdoutBuffer.indexOf("\n");
    while (newline !== -1) {
      const line = this.stdoutBuffer.slice(0, newline).replace(/\r$/, "").trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line) this.consumeLine(line);
      newline = this.stdoutBuffer.indexOf("\n");
    }
  }

  private consumeLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // Interactive login shells may print a banner before `exec node`.
      // Ignore non-protocol stdout rather than treating it as SDK data.
      return;
    }
    if (!parsed || typeof parsed !== "object") return;
    const message = parsed as CursorSdkWorkerWireMessage;
    if (message.type === "ready") {
      if (message.protocolVersion !== CURSOR_SDK_WORKER_PROTOCOL_VERSION) {
        this.fail(
          new Error(
            `Cursor SDK worker protocol ${message.protocolVersion} is not supported by host protocol ${CURSOR_SDK_WORKER_PROTOCOL_VERSION}.`,
          ),
        );
        return;
      }
      if (!this.readyReceived) {
        this.readyReceived = true;
        this.resolveReady?.();
        this.resolveReady = undefined;
        this.rejectReady = undefined;
      }
      return;
    }
    if (message.type === "response") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new CursorSdkWorkerRpcError(message.error));
      return;
    }
    if (message.type === "event") {
      for (const listener of this.listeners) {
        try {
          listener(message.event);
        } catch {
          // One consumer cannot break transport delivery to the others.
        }
      }
    }
  }

  private fail(error: Error): void {
    if (this.terminated) return;
    this.terminated = true;
    this.transportError = error;
    this.rejectReady?.(error);
    this.resolveReady = undefined;
    this.rejectReady = undefined;
    this.rejectAll(error);
    for (const listener of this.transportErrorListeners) {
      try {
        listener(error);
      } catch {
        // One consumer cannot hide transport loss from the others.
      }
    }
    try {
      terminateCursorSdkWorkerTree(this.child, this.useProcessGroup);
    } catch {
      // Best effort.
    }
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

async function spawnWorkerProcess(
  options: CursorSdkWorkerSpawnOptions,
  dependencies: CursorSdkWorkerClientDependencies,
): Promise<SpawnedWorker> {
  const discovery: CursorSdkWorkerDiscovery = {
    ...(options.configuredPath ? { configuredPath: options.configuredPath } : {}),
    ...(options.sdkEntryPath ? { entryPath: options.sdkEntryPath } : {}),
    ...(options.sdkPackageRoot ? { packageRoot: options.sdkPackageRoot } : {}),
  };
  const spawnProcess =
    dependencies.spawnProcess ??
    ((command, args, spawnOptions) => spawn(command, args, spawnOptions));

  if (options.projectLocation.kind === "wsl") {
    return spawnWslWorker(options, discovery, spawnProcess, dependencies);
  }

  const workerPath = options.workerPath ?? defaultNativeWorkerPath();
  if (!existsSync(workerPath)) {
    throw new Error(`Cursor SDK worker helper is missing: ${workerPath}`);
  }
  const command = buildAgentCommand(
    options.projectLocation,
    process.execPath,
    [workerPath],
    process.execPath,
    options.env,
  );
  const useProcessGroup = process.platform !== "win32";
  const child = spawnProcess(command.command, command.args, {
    cwd: command.cwd,
    env: {
      ...process.env,
      ...command.env,
      ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    detached: useProcessGroup,
  });
  return {
    child,
    discovery,
    projectCwd: options.projectLocation.path,
    useProcessGroup,
  };
}

async function spawnWslWorker(
  options: CursorSdkWorkerSpawnOptions,
  discovery: CursorSdkWorkerDiscovery,
  spawnProcess: CursorSdkWorkerSpawnProcess,
  dependencies: CursorSdkWorkerClientDependencies,
): Promise<SpawnedWorker> {
  const location = options.projectLocation as WslLocation;
  const helpersDir = options.helpersDir ?? resolveWslHelpersDir();
  const workerSource =
    options.workerPath ?? (helpersDir ? join(helpersDir, "cursor-sdk-worker.mjs") : "");
  if (!workerSource || !existsSync(workerSource)) {
    throw new Error("Cursor SDK worker helper is unavailable for WSL.");
  }
  const resolveNode = dependencies.resolveNode ?? resolveNodeForDistro;
  const node = await resolveNode(location.distro, { minimumVersion: "22.13.0" });
  const deploy =
    dependencies.deploy ??
    ((distro, baseName, files) => deployFilesToWslTempBase(distro, baseName, files));
  const deployed = deploy(location.distro, `poracode-cursor-sdk-${process.pid}`, [
    { src: workerSource, relDest: "cursor-sdk/cursor-sdk-worker.mjs" },
  ]);
  if (!deployed) {
    throw new Error("Cursor SDK worker could not be deployed to WSL.");
  }
  const workerPath = `${deployed.linuxBaseDir}/cursor-sdk/cursor-sdk-worker.mjs`;
  const safeEnv = stripApiKey(options.env);
  const command = buildAgentCommand(location, node.nodePath, [workerPath], node.nodePath, safeEnv);
  const useProcessGroup = process.platform !== "win32";
  const child = spawnProcess(command.command, command.args, {
    env: { ...process.env, ...command.env },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    detached: useProcessGroup,
  });
  return {
    child,
    discovery,
    projectCwd: location.linuxPath,
    useProcessGroup,
  };
}

/**
 * Cursor's local SDK can own shell/MCP descendants. Native POSIX workers are
 * launched as process-group leaders so an abnormal transport failure can
 * force the whole group down. Windows keeps the shared taskkill `/T /F`
 * implementation, including WSL and native SSH clients.
 */
export function terminateCursorSdkWorkerTree(
  child: Pick<ChildProcess, "pid">,
  useProcessGroup: boolean,
): void {
  if (useProcessGroup && process.platform !== "win32" && typeof child.pid === "number") {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // A test/custom spawn may not have honored detached; fall back safely.
    }
  }
  terminateChildProcessTree(child);
}

function stripApiKey(env: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!env || !("CURSOR_API_KEY" in env)) return env;
  const { CURSOR_API_KEY: _discarded, ...safe } = env;
  return Object.keys(safe).length > 0 ? safe : undefined;
}

function moduleDirectory(): string {
  return typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));
}

function unpackedAsarPath(path: string): string {
  return path.replace(/([\\/])app\.asar([\\/])/, "$1app.asar.unpacked$2");
}

function defaultNativeWorkerPath(): string {
  return join(unpackedAsarPath(moduleDirectory()), "cursorSdkWorker.mjs");
}
