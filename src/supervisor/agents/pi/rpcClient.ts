import { spawn, type ChildProcess } from "node:child_process";
import { terminateChildProcessTree } from "@/shared/processTree";

export interface PiRpcResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

export type PiRpcEvent = Record<string, unknown>;
export type PiRpcEventHandler = (event: PiRpcEvent) => void;

export interface PiRpcSpawnSpec {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

interface PendingRequest {
  resolve(response: PiRpcResponse): void;
  reject(error: Error): void;
}

/**
 * Minimal JSONL client for `pi --mode rpc`. Pi speaks newline-delimited JSON
 * over stdio: commands written to stdin (optionally with an `id`), responses
 * (`{ type: "response", id, success, data? }`) and asynchronous events streamed
 * on stdout. This client owns the subprocess lifecycle and request/response
 * correlation; the session layer maps events onto canonical runtime events.
 */
export class PiRpcClient {
  readonly spawnReady: Promise<void>;
  private readonly child: ChildProcess;
  private readonly exitPromise: Promise<void>;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly eventHandlers = new Set<PiRpcEventHandler>();
  private readonly exitHandlers = new Set<() => void>();
  private readonly stderrTail: string[] = [];
  private buffer = "";
  private sequence = 0;
  private closed = false;

  private constructor(child: ChildProcess) {
    this.child = child;
    this.spawnReady = new Promise<void>((resolve, reject) => {
      child.on("error", (error) => {
        reject(new Error(`Pi RPC agent failed to start: ${error.message}`));
      });
      child.on("spawn", () => resolve());
    });
    this.exitPromise = new Promise<void>((resolve) => {
      child.on("exit", () => resolve());
    });
    void this.exitPromise.then(() => this.handleClose());
    child.stdout?.on("data", (chunk: Buffer | string) => this.onData(String(chunk)));
    child.stderr?.on("data", (chunk: Buffer | string) => {
      this.stderrTail.push(String(chunk));
      if (this.stderrTail.length > 20) this.stderrTail.shift();
    });
  }

  static spawn(spec: PiRpcSpawnSpec): PiRpcClient {
    const child = spawn(spec.command, spec.args, {
      ...(spec.cwd ? { cwd: spec.cwd } : {}),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, TERM: "xterm-256color", ...(spec.env ?? {}) },
      shell: false,
      windowsHide: true,
    });
    return new PiRpcClient(child);
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get stderr(): string {
    return this.stderrTail.join("").trim();
  }

  onEvent(handler: PiRpcEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  onExit(handler: () => void): () => void {
    if (this.closed) {
      handler();
      return () => undefined;
    }
    this.exitHandlers.add(handler);
    return () => {
      this.exitHandlers.delete(handler);
    };
  }

  /** Send a command and await its correlated response. */
  async request(command: string, params: Record<string, unknown> = {}): Promise<PiRpcResponse> {
    if (this.closed) throw new Error("Pi RPC session is closed.");
    await this.spawnReady;
    const id = `pi-rpc-${++this.sequence}`;
    return new Promise<PiRpcResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write({ id, type: command, ...params });
    });
  }

  /** Send a message that does not expect a correlated response. */
  notify(message: Record<string, unknown>): void {
    if (this.closed) return;
    this.write(message);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    terminateChildProcessTree(this.child);
    await Promise.race([this.exitPromise, new Promise((resolve) => setTimeout(resolve, 2_000))]);
  }

  private write(message: Record<string, unknown>): void {
    this.child.stdin?.write(`${JSON.stringify(message)}\n`);
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message: PiRpcEvent;
      try {
        message = JSON.parse(line) as PiRpcEvent;
      } catch {
        continue;
      }
      if (message.type === "response" && typeof message.id === "string") {
        const pending = this.pending.get(message.id);
        if (pending) {
          this.pending.delete(message.id);
          pending.resolve({
            success: message.success === true,
            ...(message.data !== undefined ? { data: message.data } : {}),
            ...(message.error !== undefined ? { error: String(message.error) } : {}),
          });
        }
        continue;
      }
      for (const handler of this.eventHandlers) handler(message);
    }
  }

  private handleClose(): void {
    this.closed = true;
    for (const pending of this.pending.values()) {
      pending.reject(new Error("Pi RPC session closed."));
    }
    this.pending.clear();
    for (const handler of this.exitHandlers) handler();
    this.exitHandlers.clear();
  }
}
