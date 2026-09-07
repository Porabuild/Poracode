import type { ChildProcessWithoutNullStreams } from "node:child_process";

export type HostUnavailableCode = "spawn_failed" | "exited" | "timeout" | "buffer_overflow";

export class HostUnavailableError extends Error {
  readonly code: HostUnavailableCode;

  constructor(code: HostUnavailableCode, message: string) {
    super(message);
    this.name = "HostUnavailableError";
    this.code = code;
  }
}

export class JsonLineActionError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "JsonLineActionError";
    if (code !== undefined) this.code = code;
  }
}

interface PendingRequest {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface PersistentJsonLineHostOptions {
  encodeRequest?: (payload: unknown) => string;
  label: string;
  maxStdoutBufferBytes: number;
  onTeardown?: (error: Error) => void;
  requestTimeoutMs?: number;
  spawn(): ChildProcessWithoutNullStreams;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 25_000;

function defaultEncodeRequest(payload: unknown): string {
  return `${JSON.stringify(payload)}\n`;
}

/** Persistent child-process host speaking one JSON request/response per line. */
export class PersistentJsonLineHost {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private stderrTail = "";
  private stdoutBuffer = "";

  constructor(private readonly options: PersistentJsonLineHostOptions) {}

  request<T>(action: string, input?: unknown): Promise<T> {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.ensureChild();
    } catch (error) {
      return Promise.reject(error);
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timeoutMs = this.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
      const timer = setTimeout(() => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        const error = new HostUnavailableError(
          "timeout",
          `${this.options.label} action "${action}" timed out after ${timeoutMs}ms`,
        );
        pending.reject(error);
        this.teardown(error, true);
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      const line = (this.options.encodeRequest ?? defaultEncodeRequest)({
        id,
        action,
        input: input ?? {},
      });
      try {
        child.stdin.write(line, (error) => {
          if (!error || !this.pending.has(id)) return;
          this.teardown(
            new HostUnavailableError(
              "exited",
              `${this.options.label} write failed: ${error.message}`,
            ),
            true,
          );
        });
      } catch (error) {
        this.teardown(
          new HostUnavailableError(
            "exited",
            `${this.options.label} write failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
          true,
        );
      }
    });
  }

  dispose(): void {
    this.teardown(new HostUnavailableError("exited", `${this.options.label} disposed`), true);
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;
    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.options.spawn();
    } catch (error) {
      throw new HostUnavailableError(
        "spawn_failed",
        `${this.options.label} failed to start: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.child = child;
    this.stdoutBuffer = "";
    this.stderrTail = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (this.child === child) this.onStdout(chunk);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (this.child === child) this.stderrTail = (this.stderrTail + chunk).slice(-4096);
    });
    child.stdin.on("error", (error: Error) => {
      if (this.child !== child) return;
      this.teardown(
        new HostUnavailableError("exited", `${this.options.label} stdin failed: ${error.message}`),
        true,
      );
    });
    child.on("error", (error: Error) => {
      if (this.child !== child) return;
      this.teardown(
        new HostUnavailableError(
          "spawn_failed",
          `${this.options.label} failed to start: ${error.message}`,
        ),
        false,
      );
    });
    child.on("exit", (code, signal) => {
      if (this.child !== child) return;
      const detail = this.stderrTail.trim();
      this.teardown(
        new HostUnavailableError(
          "exited",
          `${this.options.label} exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"})${detail ? `: ${detail}` : ""}`,
        ),
        false,
      );
    });
    return child;
  }

  private onStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    if (Buffer.byteLength(this.stdoutBuffer, "utf8") > this.options.maxStdoutBufferBytes) {
      this.teardown(
        new HostUnavailableError(
          "buffer_overflow",
          `${this.options.label} response exceeded the buffer limit`,
        ),
        true,
      );
      return;
    }
    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      this.dispatchLine(line);
      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  private dispatchLine(line: string): void {
    if (!line) return;
    let message: { code?: unknown; error?: unknown; id?: unknown; ok?: unknown; result?: unknown };
    try {
      message = JSON.parse(line) as typeof message;
    } catch {
      return;
    }
    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.ok === true) {
      pending.resolve(message.result);
      return;
    }
    pending.reject(
      new JsonLineActionError(
        typeof message.error === "string" ? message.error : `${this.options.label} action failed`,
        typeof message.code === "string" ? message.code : undefined,
      ),
    );
  }

  private teardown(error: Error, kill: boolean): void {
    const child = this.child;
    this.child = null;
    this.stdoutBuffer = "";
    this.stderrTail = "";
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const request of pending) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.options.onTeardown?.(error);
    if (!child) return;
    child.stdout.removeAllListeners();
    child.stderr.removeAllListeners();
    child.stdin.removeAllListeners();
    // A stream error can already be queued when teardown starts. Keep a
    // terminal sink after removing the identity-bound listener so it cannot
    // become an uncaught EventEmitter error while the process is recycled.
    child.stdin.on("error", () => {});
    child.removeAllListeners();
    if (!kill) return;
    try {
      child.kill();
    } catch {
      // The process may already be gone.
    }
  }
}
