import { utilityProcess, type ForkOptions } from "electron";
import type { SshConnectPayload, SshConnectResult, SshDiscoveredHost } from "@/shared/ssh";
import {
  deserializeSshEnvironmentError,
  isSshEnvironmentWorkerMessage,
  parseSshConnectResult,
  parseSshDiscoveredHosts,
  SSH_ENVIRONMENT_PROTOCOL_VERSION,
  SSH_ENVIRONMENT_WORKER_CONFIG_ENV,
  type SshEnvironmentPreparedRuntime,
  type SshEnvironmentRequest,
  type SshEnvironmentWorkerConfig,
} from "@/host/ssh/sshEnvironmentProtocol";
import {
  sshOperationAbortError,
  type SshConnectOptions,
  type SshEnvironmentController,
} from "@/host/ssh/sshEnvironmentController";
import { SshUtilityChildLiveness, type SshUtilityExitInfo } from "./sshUtilityProcessLiveness";

/** Structural slice of `UtilityProcess` the supervisor needs (test-injectable). */
export interface SshEnvironmentUtilityProcessLike {
  readonly pid?: number | undefined;
  readonly exitCode?: number | null;
  postMessage(message: unknown): void;
  kill(): boolean;
  once(event: "spawn", listener: () => void): unknown;
  once(event: "exit", listener: (code: number | null) => void): unknown;
  on(event: "spawn", listener: () => void): unknown;
  on(event: "exit", listener: (code: number | null) => void): unknown;
  on(event: "message", listener: (message: unknown) => void): unknown;
  /** Detach a listener attached with `on`/`once` (Electron returns an EventEmitter). */
  off?(event: "spawn" | "exit" | "message", listener: (...args: never[]) => void): unknown;
}

export interface SshEnvironmentSupervisorOptions {
  readonly utilityPath: string;
  readonly config: SshEnvironmentWorkerConfig;
  readonly isPackaged?: boolean;
  readonly env?: NodeJS.ProcessEnv;
  readonly forkUtility?: (
    modulePath: string,
    options: ForkOptions,
  ) => SshEnvironmentUtilityProcessLike;
  /** Spawn deadline for one fork attempt (tests shrink it). */
  readonly spawnTimeoutMs?: number;
  /** Handshake deadline for the worker's `ready` frame. */
  readonly readyTimeoutMs?: number;
  /** Bounded wait for a graceful worker exit during dispose. */
  readonly exitTimeoutMs?: number;
  /** Bounded wait for the real exit after a kill; a timeout retains custody. */
  readonly killTimeoutMs?: number;
  readonly log?: (message: string) => void;
}

export const SSH_ENVIRONMENT_SPAWN_TIMEOUT_MS = 10_000;
export const SSH_ENVIRONMENT_READY_TIMEOUT_MS = 10_000;
export const SSH_ENVIRONMENT_EXIT_TIMEOUT_MS = 15_000;
export const SSH_ENVIRONMENT_KILL_TIMEOUT_MS = 5_000;

interface PendingRequest {
  readonly requestId: string;
  readonly kind: SshEnvironmentRequest["kind"];
  readonly connectionId: string | null;
  /** Assigned once a generation is published; 0 while still starting. */
  generation: number;
  cancelled: boolean;
  /** Removes this caller's abort listener once the record settles. */
  detachAbort: (() => void) | null;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

interface UtilityAttempt {
  readonly child: SshEnvironmentUtilityProcessLike;
  readonly generation: number;
  /** Exit custody from the moment of fork; never consulted as a kill result. */
  readonly liveness: SshUtilityChildLiveness;
  retired: boolean;
  spawnTimer: ReturnType<typeof setTimeout> | null;
  readyTimer: ReturnType<typeof setTimeout> | null;
  readySettled: boolean;
  detachMessage: (() => void) | null;
}

/**
 * Main-process owner of the device-local SSH utility (C3/A5).
 *
 * Main performs no SSH mechanics: it admits calls, lazily forks one utility
 * process per generation, forwards versioned request frames, and fences every
 * result by generation and record identity so a cancelled request, a retired
 * utility, or a late frame can never publish a tunnel endpoint. `disconnect`
 * and `dispose` cancel and join the utility's own in-flight work before they
 * resolve.
 *
 * Lifecycle custody rules (C3 correction):
 * - every forked child is observed for its real `exit` from the moment of
 *   fork, so an exit that lands before the join point is never missed;
 * - no kill is treated as a join: a bounded failure rejects truthfully and the
 *   attempt stays in custody, so dispose can retry and no successor is forked
 *   over a possibly-live child;
 * - the startup `ready` latch is always observed, so an exit-before-spawn or a
 *   disposal-before-ready cannot escape as an unhandled rejection.
 */
export class SshEnvironmentSupervisor implements SshEnvironmentController {
  private readonly options: SshEnvironmentSupervisorOptions;
  private readonly spawnTimeoutMs: number;
  private readonly readyTimeoutMs: number;
  private readonly exitTimeoutMs: number;
  private readonly killTimeoutMs: number;
  private readonly forkUtility: (
    modulePath: string,
    options: ForkOptions,
  ) => SshEnvironmentUtilityProcessLike;

  private child: SshEnvironmentUtilityProcessLike | null = null;
  private attempt: UtilityAttempt | null = null;
  private currentGeneration = 0;
  private lastIssuedGeneration = 0;
  /** Bumped by dispose; fences a start attempt that is still in flight. */
  private shutdownEpoch = 0;
  private startPromise: Promise<number> | null = null;
  private disposed = false;
  private disposeStarted: Promise<void> | null = null;
  private requestSeq = 0;
  private utilityStarts = 0;
  private readonly requests = new Map<string, PendingRequest>();

  constructor(options: SshEnvironmentSupervisorOptions) {
    this.options = options;
    this.spawnTimeoutMs = options.spawnTimeoutMs ?? SSH_ENVIRONMENT_SPAWN_TIMEOUT_MS;
    this.readyTimeoutMs = options.readyTimeoutMs ?? SSH_ENVIRONMENT_READY_TIMEOUT_MS;
    this.exitTimeoutMs = options.exitTimeoutMs ?? SSH_ENVIRONMENT_EXIT_TIMEOUT_MS;
    this.killTimeoutMs = options.killTimeoutMs ?? SSH_ENVIRONMENT_KILL_TIMEOUT_MS;
    this.forkUtility =
      options.forkUtility ??
      ((modulePath, forkOptions) => utilityProcess.fork(modulePath, [], forkOptions));
  }

  get generation(): number {
    return this.currentGeneration;
  }

  async discoverHosts(): Promise<SshDiscoveredHost[]> {
    const result = await this.request({ kind: "discover-hosts" });
    return parseSshDiscoveredHosts(result);
  }

  async connect(
    input: SshConnectPayload,
    options: SshConnectOptions = {},
  ): Promise<SshConnectResult> {
    const result = await this.request(
      { kind: "connect", payload: input },
      {
        connectionId: input.connection.id,
        ...(options.signal ? { signal: options.signal } : {}),
      },
    );
    return parseSshConnectResult(result);
  }

  async disconnect(connectionId: string): Promise<void> {
    const owned = [...this.requests.values()].filter(
      (record) => record.kind === "connect" && record.connectionId === connectionId,
    );
    for (const record of owned) {
      this.cancelRecord(
        record,
        sshOperationAbortError("The SSH connection was disconnected while connecting."),
      );
    }
    await this.request({ kind: "disconnect", connectionId });
  }

  /** Build/load the runtime bundle in the utility without dialing (diagnostics/prewarm). */
  async prepareRuntime(): Promise<SshEnvironmentPreparedRuntime> {
    const result = await this.request({ kind: "prepare-runtime" });
    if (
      typeof result === "object" &&
      result !== null &&
      typeof (result as { hash?: unknown }).hash === "string" &&
      typeof (result as { version?: unknown }).version === "string"
    ) {
      const source = (result as { source?: unknown }).source;
      return {
        hash: (result as { hash: string }).hash,
        version: (result as { version: string }).version,
        source: source === "preassembled" ? "preassembled" : "staged",
      };
    }
    throw new Error("The SSH utility returned an invalid runtime bundle.");
  }

  dispose(): Promise<void> {
    this.disposed = true;
    this.shutdownEpoch += 1;
    if (!this.disposeStarted) {
      const started = this.disposeInternal();
      this.disposeStarted = started;
      // A bounded failure leaves the attempt in custody; clear the memo so a
      // later dispose() can retry the join instead of replaying a rejection.
      void started.catch(() => {
        if (this.disposeStarted === started) this.disposeStarted = null;
      });
    }
    return this.disposeStarted;
  }

  /** Payload-free lifecycle counters for diagnostics. */
  localStats(): {
    readonly activeRequests: number;
    readonly utilityStarts: number;
    readonly generation: number;
    readonly disposed: boolean;
  } {
    return {
      activeRequests: this.requests.size,
      utilityStarts: this.utilityStarts,
      generation: this.currentGeneration,
      disposed: this.disposed,
    };
  }

  private async disposeInternal(): Promise<void> {
    // Reject every caller first: no request may outlive dispose, and a late
    // frame is dropped by the released record.
    for (const record of [...this.requests.values()]) {
      this.cancelRecord(record, sshOperationAbortError("The SSH connection manager was disposed."));
    }
    const attempt = this.attempt;
    if (!attempt) {
      this.requests.clear();
      return;
    }
    attempt.retired = true;
    if (attempt.liveness.hasExited) {
      if (this.attempt === attempt) this.releaseAttempt(attempt);
      this.requests.clear();
      return;
    }
    if (this.child === attempt.child) {
      this.postToUtility({
        v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
        generation: attempt.generation,
        requestId: `shutdown-${attempt.generation}`,
        request: { kind: "shutdown" },
      });
      const graceful = await attempt.liveness.waitForExit(this.exitTimeoutMs);
      if (graceful === null) {
        const forced = await this.reapAttempt(attempt);
        if (!forced) {
          throw new Error(
            "The SSH utility did not exit after shutdown and kill; its process remains in custody.",
          );
        }
      }
    } else {
      const forced = await this.reapAttempt(attempt);
      if (!forced) {
        throw new Error("The SSH utility did not exit after kill; its process remains in custody.");
      }
    }
    if (this.attempt === attempt) this.releaseAttempt(attempt);
    this.requests.clear();
  }

  private request(
    request: SshEnvironmentRequest,
    options: { readonly connectionId?: string; readonly signal?: AbortSignal } = {},
  ): Promise<unknown> {
    if (this.disposed) {
      return Promise.reject(sshOperationAbortError("The SSH connection manager was disposed."));
    }
    if (options.signal?.aborted) {
      return Promise.reject(sshOperationAbortError(options.signal.reason));
    }
    const requestId = `ssh-${++this.requestSeq}`;
    return new Promise<unknown>((resolve, reject) => {
      const record: PendingRequest = {
        requestId,
        kind: request.kind,
        connectionId: options.connectionId ?? null,
        generation: 0,
        cancelled: false,
        detachAbort: null,
        resolve,
        reject,
      };
      this.requests.set(requestId, record);
      const signal = options.signal;
      if (signal) {
        const onAbort = () => {
          this.cancelRecord(record, sshOperationAbortError(signal.reason));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        record.detachAbort = () => signal.removeEventListener("abort", onAbort);
      }
      const shutdownEpoch = this.shutdownEpoch;
      void (async () => {
        let generation: number;
        try {
          generation = await this.ensureStarted();
        } catch (error) {
          this.releaseRecord(record);
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        const child = this.child;
        if (
          record.cancelled ||
          this.requests.get(requestId) !== record ||
          !child ||
          this.currentGeneration !== generation ||
          this.shutdownEpoch !== shutdownEpoch
        ) {
          this.releaseRecord(record);
          reject(new Error("The SSH utility was retired before the request could run."));
          return;
        }
        record.generation = generation;
        try {
          child.postMessage({
            v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
            generation,
            requestId,
            request,
          });
        } catch (error) {
          this.releaseRecord(record);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    });
  }

  private cancelRecord(record: PendingRequest, error: Error): void {
    if (record.cancelled) return;
    record.cancelled = true;
    if (record.generation > 0 && this.child) {
      this.postToUtility({
        v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
        generation: record.generation,
        requestId: record.requestId,
        request: { kind: "cancel", requestId: record.requestId },
      });
    }
    this.releaseRecord(record);
    record.reject(error);
  }

  private releaseRecord(record: PendingRequest): void {
    record.detachAbort?.();
    record.detachAbort = null;
    if (this.requests.get(record.requestId) === record) this.requests.delete(record.requestId);
  }

  private async ensureStarted(): Promise<number> {
    if (this.child) return this.currentGeneration;
    if (this.startPromise) return this.startPromise;
    const stale = this.attempt;
    if (stale) {
      // A previous attempt is still in custody (failed start or fatal frame).
      // No successor may be forked over a possibly-live process; reap it with
      // a bounded join first.
      const reaped = await this.reapAttempt(stale);
      if (!reaped) {
        throw new Error(
          "A previous SSH utility process has not exited; refusing to start another.",
        );
      }
    }
    const pending = this.start();
    this.startPromise = pending;
    try {
      return await pending;
    } finally {
      if (this.startPromise === pending) this.startPromise = null;
    }
  }

  private async start(): Promise<number> {
    // Consume the generation before forking: every attempt owns a monotonically
    // increasing generation so a retry can never reuse a stale one.
    const generation = this.lastIssuedGeneration + 1;
    this.lastIssuedGeneration = generation;
    const shutdownEpoch = this.shutdownEpoch;
    const execArgv = this.inspectExecArgv();
    const forkOptions: ForkOptions = {
      env: {
        ...(this.options.env ?? process.env),
        [SSH_ENVIRONMENT_WORKER_CONFIG_ENV]: JSON.stringify(this.options.config),
      },
      stdio: ["ignore", "inherit", "inherit"],
      serviceName: "Poracode SSH Environment",
      ...(execArgv ? { execArgv } : {}),
    };
    const child = this.forkUtility(this.options.utilityPath, forkOptions);
    const attempt: UtilityAttempt = {
      child,
      generation,
      liveness: new SshUtilityChildLiveness(child),
      retired: false,
      spawnTimer: null,
      readyTimer: null,
      readySettled: false,
      detachMessage: null,
    };
    this.attempt = attempt;

    let resolveReady: () => void = () => undefined;
    let rejectReady: (error: Error) => void = () => undefined;
    const ready = new Promise<void>((resolvePromise, rejectPromise) => {
      resolveReady = resolvePromise;
      rejectReady = rejectPromise;
    });
    // The ready latch is observed even on paths that never await it
    // (exit-before-spawn, dispose-before-ready): a late rejection must not
    // escape as an unhandled rejection.
    void ready.catch(() => undefined);
    const settleReady = (error?: Error) => {
      if (attempt.readySettled) return;
      attempt.readySettled = true;
      if (error) rejectReady(error);
      else resolveReady();
    };
    const onEarlyMessage = (message: unknown) => {
      if (!isSshEnvironmentWorkerMessage(message)) return;
      if (message.kind === "ready") settleReady();
      else if (message.kind === "fatal") {
        attempt.retired = true;
        settleReady(new Error(message.message));
      }
    };
    child.on("message", onEarlyMessage);
    // Exit is observed from fork onward: no later join can miss it.
    void attempt.liveness.exited.then((exit) => {
      settleReady(
        new Error(`The SSH utility exited before it was ready (code ${String(exit.code)}).`),
      );
    });
    try {
      await this.waitForSpawn(attempt);
      attempt.readyTimer = setTimeout(() => {
        settleReady(new Error("The SSH utility did not become ready."));
      }, this.readyTimeoutMs);
      attempt.readyTimer.unref?.();
      await ready;
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      settleReady(cause);
      this.detachAttempt(attempt);
      const joined = await this.reapAttempt(attempt);
      if (shutdownEpoch !== this.shutdownEpoch) {
        throw new Error("The SSH utility was disposed while starting.", { cause: error });
      }
      if (!joined) {
        throw new Error(
          "The SSH utility did not exit while failing to start; its process remains in custody.",
          { cause: error },
        );
      }
      throw cause;
    }
    this.detachAttempt(attempt);
    if (attempt.retired || shutdownEpoch !== this.shutdownEpoch) {
      const cause = attempt.retired
        ? new Error("The SSH utility was retired while starting.")
        : new Error("The SSH utility was disposed while starting.");
      const joined = await this.reapAttempt(attempt);
      if (!joined) {
        throw new Error(
          "The SSH utility did not exit while failing to start; its process remains in custody.",
          { cause },
        );
      }
      throw cause;
    }
    const onMessage = (message: unknown) => this.handleWorkerMessage(generation, message);
    child.on("message", onMessage);
    attempt.detachMessage = () => {
      child.off?.("message", onMessage as (...args: never[]) => void);
    };
    void attempt.liveness.exited.then(() => this.handleExit(attempt));
    this.child = child;
    this.currentGeneration = generation;
    this.utilityStarts += 1;
    this.options.log?.(
      `[poracode] ssh-environment utility started generation=${generation} pid=${child.pid ?? "unknown"}`,
    );
    return generation;
  }

  private inspectExecArgv(): string[] | undefined {
    if (this.options.isPackaged) return undefined;
    const raw = (this.options.env ?? process.env).PORACODE_SSH_ENVIRONMENT_INSPECT_PORT?.trim();
    if (!raw) return undefined;
    const port = Number.parseInt(raw, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) return undefined;
    return [`--inspect=127.0.0.1:${port}`];
  }

  private waitForSpawn(attempt: UtilityAttempt): Promise<void> {
    const { child } = attempt;
    if (attempt.liveness.hasExited) {
      const exit = attempt.liveness.exitInfo;
      return Promise.reject(
        new Error(`The SSH utility exited before start (code ${String(exit?.code ?? "unknown")}).`),
      );
    }
    if (child.pid !== undefined) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        child.off?.("spawn", onSpawn as (...args: never[]) => void);
        if (attempt.spawnTimer !== null) clearTimeout(attempt.spawnTimer);
        attempt.spawnTimer = null;
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        attempt.retired = true;
        reject(error);
      };
      const onSpawn = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      attempt.spawnTimer = setTimeout(() => {
        fail(new Error("The SSH utility did not start."));
      }, this.spawnTimeoutMs);
      attempt.spawnTimer.unref?.();
      child.once("spawn", onSpawn);
      // The exit listener lives on the liveness record (attached at fork), so
      // an exit emitted before this waiter existed is still seen.
      void attempt.liveness.exited.then((exit: SshUtilityExitInfo) => {
        fail(new Error(`The SSH utility exited before start (code ${String(exit.code)}).`));
      });
    });
  }

  private detachAttempt(attempt: UtilityAttempt): void {
    if (attempt.spawnTimer !== null) clearTimeout(attempt.spawnTimer);
    if (attempt.readyTimer !== null) clearTimeout(attempt.readyTimer);
    attempt.spawnTimer = null;
    attempt.readyTimer = null;
    attempt.detachMessage?.();
    attempt.detachMessage = null;
  }

  private releaseAttempt(attempt: UtilityAttempt | null = this.attempt): void {
    if (!attempt) return;
    attempt.retired = true;
    this.detachAttempt(attempt);
    attempt.liveness.release();
    if (this.attempt === attempt) this.attempt = null;
    if (this.child === attempt.child) {
      this.child = null;
      this.currentGeneration = 0;
    }
  }

  /**
   * Kill and join one attempt with a bounded wait. Returns `true` only when the
   * real exit was observed; on `false` the attempt stays in `this.attempt`
   * (custody) so a retry or a later exit can still reap it.
   */
  private async reapAttempt(attempt: UtilityAttempt): Promise<boolean> {
    attempt.retired = true;
    if (attempt.liveness.hasExited) {
      if (this.attempt === attempt) this.releaseAttempt(attempt);
      return true;
    }
    const exit = await attempt.liveness.terminateAndJoin(
      () => this.killChild(attempt.child),
      this.killTimeoutMs,
    );
    if (exit === null) return false;
    if (this.attempt === attempt) this.releaseAttempt(attempt);
    return true;
  }

  private killChild(child: SshEnvironmentUtilityProcessLike): void {
    try {
      child.kill();
    } catch (error) {
      this.options.log?.(
        `[poracode] ssh-environment kill failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private handleExit(attempt: UtilityAttempt): void {
    if (this.attempt !== attempt && this.child !== attempt.child) return;
    this.releaseAttempt(attempt);
    const rejected = this.requests.size;
    for (const record of [...this.requests.values()]) {
      this.releaseRecord(record);
      record.reject(new Error("The SSH utility exited."));
    }
    this.options.log?.(
      `[poracode] ssh-environment utility exited generation=${attempt.generation} code=${String(attempt.liveness.exitInfo?.code ?? null)} activeRejected=${rejected}`,
    );
  }

  private handleWorkerMessage(generation: number, message: unknown): void {
    if (generation !== this.currentGeneration) return;
    if (!isSshEnvironmentWorkerMessage(message)) return;
    if (message.kind === "fatal") {
      // The utility declared itself terminal. Reject callers now; the process
      // stays in custody until its real exit is observed, so dispose joins it
      // and no successor is forked over it.
      this.options.log?.(`[poracode] ssh-environment utility fatal: ${message.message}`);
      const attempt = this.attempt;
      if (!attempt || attempt.generation !== generation) return;
      attempt.retired = true;
      if (this.child === attempt.child) {
        this.child = null;
        this.currentGeneration = 0;
      }
      const error = new Error(message.message);
      for (const record of [...this.requests.values()]) {
        this.releaseRecord(record);
        record.reject(error);
      }
      return;
    }
    if (message.kind !== "result") return;
    if (message.generation !== generation) return;
    const record = this.requests.get(message.requestId);
    if (!record || record.cancelled) return;
    this.releaseRecord(record);
    if (!message.ok) {
      record.reject(deserializeSshEnvironmentError(message.error));
      return;
    }
    record.resolve(message.result);
  }

  private postToUtility(message: unknown): void {
    try {
      this.child?.postMessage(message);
    } catch (error) {
      this.options.log?.(
        `[poracode] ssh-environment post failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
