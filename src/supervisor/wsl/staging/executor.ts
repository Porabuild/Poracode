import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { executeStagingRequest } from "./backend";
import {
  WSL_STAGING_PROTOCOL_VERSION,
  type WslStagingRequest,
  type WslStagingWorkerMessage,
} from "./protocol";

export interface WslStagingExecuteOptions {
  /** Deadline owned by the supervisor; on expiry the worker process is killed. */
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface WslStagingExecutor {
  execute<T = unknown>(request: WslStagingRequest, options: WslStagingExecuteOptions): Promise<T>;
  /**
   * Terminate the worker and resolve only after it has actually exited (or a
   * bounded fallback fires). Callers that treat shutdown as complete must
   * await this; a killed-but-not-joined worker could still hold UNC handles
   * open while a successor starts.
   */
  dispose(): Promise<void>;
}

export interface WslStagingProcessSpec {
  command: string;
  args: readonly string[];
  env: NodeJS.ProcessEnv;
  cwd?: string;
  readyTimeoutMs?: number;
}

const DEFAULT_READY_TIMEOUT_MS = 10_000;
const MAX_PENDING_OUTPUT_BYTES = 8 * 1024 * 1024;
/** Upper bound on awaiting a killed worker's exit before the join resolves. */
const CHILD_EXIT_FALLBACK_MS = 2_000;

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  onAbort?: () => void;
}

/**
 * One worker process per distro. A request deadline kills the process rather
 * than leaving the isolated work running: a filesystem call that never
 * returns cannot occupy the worker after the caller has moved on, and all
 * other waiters on that worker are settled at the same time. The executor
 * respawns lazily on the next request.
 */
class ProcessStagingExecutor implements WslStagingExecutor {
  private child: ChildProcess | undefined;
  private buffer = "";
  private stderrTail = "";
  private disposed = false;
  private termination: Promise<void> | undefined;
  private readonly pending = new Map<string, PendingRequest>();
  private resolveReady: (() => void) | undefined;
  private rejectReady: ((error: Error) => void) | undefined;

  constructor(private readonly spec: WslStagingProcessSpec) {}

  execute<T = unknown>(request: WslStagingRequest, options: WslStagingExecuteOptions): Promise<T> {
    if (this.disposed) {
      return Promise.reject(new Error("WSL staging worker is disposed"));
    }
    if (options.signal?.aborted) {
      return Promise.reject(options.signal.reason ?? new Error("WSL staging request aborted"));
    }
    const id = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.failAll(new Error(`WSL staging request timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs);
      timer.unref?.();
      const pending: PendingRequest = {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
        ...(options.signal ? { signal: options.signal } : {}),
      };
      if (options.signal) {
        pending.onAbort = () => {
          if (!this.pending.delete(id)) return;
          clearTimeout(pending.timer);
          reject(options.signal?.reason ?? new Error("WSL staging request aborted"));
        };
        options.signal.addEventListener("abort", pending.onAbort, { once: true });
      }
      this.pending.set(id, pending);
      this.ensureChild()
        .then(() => {
          if (!this.pending.has(id)) return;
          this.writeRequest(id, request);
        })
        .catch((error: unknown) => {
          const current = this.pending.get(id);
          if (!current) return;
          this.pending.delete(id);
          clearTimeout(current.timer);
          current.reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      await this.termination;
      return;
    }
    this.disposed = true;
    this.failAll(new Error("WSL staging worker disposed"));
    await this.termination;
  }

  private async ensureChild(): Promise<void> {
    // A worker that was killed (deadline/exit) is joined before a replacement
    // starts, so a successor can never race the previous worker's handles.
    if (this.termination) await this.termination;
    if (this.child) return;
    if (this.disposed) throw new Error("WSL staging worker is disposed");
    const child = spawn(this.spec.command, [...this.spec.args], {
      ...(this.spec.cwd ? { cwd: this.spec.cwd } : {}),
      env: this.spec.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;
    this.buffer = "";
    this.stderrTail = "";
    let clearReadyTimer: () => void = () => undefined;
    const ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
      const timer = setTimeout(() => {
        reject(new Error("WSL staging worker did not become ready"));
        void this.terminateChild();
      }, this.spec.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS);
      timer.unref?.();
      clearReadyTimer = () => clearTimeout(timer);
    });
    void ready.then(
      () => clearReadyTimer(),
      () => clearReadyTimer(),
    );

    unrefReadable(child.stdout);
    unrefWritable(child.stdin);
    child.stdout?.on("data", (chunk: Buffer | string) => {
      if (this.child !== child) return;
      this.consume(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      if (this.child !== child) return;
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      this.stderrTail = `${this.stderrTail}${text}`.slice(-2_048);
    });
    child.stderr?.resume();
    child.once("error", (error) => {
      if (this.child !== child) return;
      this.failAll(error);
    });
    child.once("exit", (code, signal) => {
      if (this.child !== child) return;
      const suffix = signal ? ` (${signal})` : code === null ? "" : ` (code ${code})`;
      this.failAll(new Error(`WSL staging worker exited${suffix}${this.stderrTail.trim()}`));
    });
    return ready;
  }

  private writeRequest(id: string, request: WslStagingRequest): void {
    if (!this.child?.stdin?.writable) {
      this.failAll(new Error("WSL staging worker stdin is unavailable"));
      return;
    }
    const envelope = { protocolVersion: WSL_STAGING_PROTOCOL_VERSION, id, request };
    this.child.stdin.write(`${JSON.stringify(envelope)}\n`, (error) => {
      if (!error) return;
      this.failAll(error);
    });
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer, "utf8") > MAX_PENDING_OUTPUT_BYTES) {
      this.failAll(new Error("WSL staging worker emitted an oversized response"));
      return;
    }
    let newline = this.buffer.indexOf("\n");
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.consumeLine(line);
      newline = this.buffer.indexOf("\n");
    }
  }

  private consumeLine(line: string): void {
    let message: WslStagingWorkerMessage;
    try {
      message = JSON.parse(line) as WslStagingWorkerMessage;
    } catch {
      return;
    }
    if (message.type === "ready") {
      if (message.protocolVersion !== WSL_STAGING_PROTOCOL_VERSION) {
        this.failAll(
          new Error(
            `WSL staging worker protocol ${message.protocolVersion} is not supported by host protocol ${WSL_STAGING_PROTOCOL_VERSION}.`,
          ),
        );
        return;
      }
      this.resolveReady?.();
      this.resolveReady = undefined;
      this.rejectReady = undefined;
      return;
    }
    if (message.type !== "result") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (pending.signal && pending.onAbort) {
      pending.signal.removeEventListener("abort", pending.onAbort);
    }
    if (message.ok) pending.resolve(message.result);
    else pending.reject(new Error(message.error?.message ?? "WSL staging request failed"));
  }

  private failAll(error: Error): void {
    this.rejectReady?.(error);
    this.resolveReady = undefined;
    this.rejectReady = undefined;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      if (pending.signal && pending.onAbort) {
        pending.signal.removeEventListener("abort", pending.onAbort);
      }
      pending.reject(error);
    }
    this.pending.clear();
    void this.terminateChild();
  }

  /**
   * Kill the worker and return a promise that resolves when the process is
   * actually gone. Every rejection path routes through here, so waiters are
   * released immediately while the join happens in the background; the next
   * `ensureChild` awaits the same promise before spawning a successor.
   */
  private terminateChild(): Promise<void> {
    if (this.termination) return this.termination;
    const child = this.child;
    this.child = undefined;
    this.buffer = "";
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      return Promise.resolve();
    }
    const joined = new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(fallback);
        resolve();
      };
      const fallback = setTimeout(finish, CHILD_EXIT_FALLBACK_MS);
      fallback.unref?.();
      child.once("close", finish);
      child.once("exit", finish);
      try {
        child.kill("SIGKILL");
      } catch {
        // Best effort; the fallback still bounds the join.
      }
      child.stdin?.destroy();
      child.stdout?.destroy();
      child.stderr?.destroy();
    });
    let tracked: Promise<void>;
    tracked = joined.finally(() => {
      if (this.termination === tracked) this.termination = undefined;
    });
    this.termination = tracked;
    return tracked;
  }
}

export function createProcessStagingExecutor(spec: WslStagingProcessSpec): WslStagingExecutor {
  return new ProcessStagingExecutor(spec);
}

/**
 * In-process async fallback for environments where the bundled worker entry
 * is unavailable. It keeps callers responsive but cannot terminate a stalled
 * filesystem call, so the process worker is always preferred.
 */
export function createInlineStagingExecutor(): WslStagingExecutor {
  return {
    async execute<T = unknown>(request: WslStagingRequest, options: WslStagingExecuteOptions) {
      if (options.signal?.aborted) {
        throw options.signal.reason ?? new Error("WSL staging request aborted");
      }
      const timeout = timeoutRejection(options.timeoutMs);
      try {
        return (await Promise.race([executeStagingRequest(request), timeout.promise])) as T;
      } finally {
        timeout.cancel();
      }
    },
    async dispose() {
      // Nothing isolated to terminate.
    },
  };
}

function timeoutRejection(timeoutMs: number): { promise: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`WSL staging request timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    timer.unref?.();
  });
  return {
    promise,
    cancel: () => {
      if (timer) clearTimeout(timer);
    },
  };
}

function unrefReadable(stream: NodeJS.ReadableStream | null): void {
  (stream as (NodeJS.ReadableStream & { unref?: () => void }) | null)?.unref?.();
}

function unrefWritable(stream: NodeJS.WritableStream | null): void {
  (stream as (NodeJS.WritableStream & { unref?: () => void }) | null)?.unref?.();
}
