import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type { GitExecWorkerInbound, GitExecWorkerResponse } from "./gitExecWorker";

const WORKER_FILE_NAMES = ["gitExecWorker.cjs", "gitExecWorker.mjs", "gitExecWorker.js"];

function moduleDirectory(): string {
  return typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));
}

function unpackedAsarPath(path: string): string {
  return path.replace(/([\\/])app\.asar([\\/])/, "$1app.asar.unpacked$2");
}

let workerPathOverrideForTests: string | undefined;

export function setGitExecWorkerPathForTests(path: string | undefined): void {
  workerPathOverrideForTests = path;
}

export function resolveGitExecWorkerPath(): string | undefined {
  if (workerPathOverrideForTests !== undefined) {
    return existsSync(workerPathOverrideForTests) ? workerPathOverrideForTests : undefined;
  }
  const directory = moduleDirectory();
  const unpacked = unpackedAsarPath(directory);
  const candidates: string[] = [];
  for (const name of WORKER_FILE_NAMES) {
    if (unpacked !== directory) candidates.push(join(unpacked, name));
    candidates.push(join(directory, name));
  }
  return candidates.find((candidate) => existsSync(candidate));
}

interface PendingGitExec {
  readonly resolve: (result: { stdout: string; stderr: string }) => void;
  readonly reject: (error: Error) => void;
  readonly cleanupAbort?: () => void;
}

function createAbortedError(): Error {
  const error = new Error("The operation was aborted") as Error & { code?: string };
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  return error;
}

class GitExecWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingGitExec>();
  private disabled = false;

  canOffload(): boolean {
    return !this.disabled && resolveGitExecWorkerPath() !== undefined;
  }

  exec(input: {
    command: string;
    args: string[];
    cwd: string;
    env: Record<string, string | undefined>;
    timeout: number;
    maxBuffer: number;
    stdinInput?: string;
    signal?: AbortSignal;
  }): Promise<{ stdout: string; stderr: string }> | null {
    if (input.signal?.aborted) {
      return Promise.reject(createAbortedError());
    }
    const worker = this.ensureWorker();
    if (!worker) return null;

    const id = this.nextId++;
    return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      let cleanupAbort: (() => void) | undefined;
      if (input.signal) {
        const onAbort = () => {
          const entry = this.pending.get(id);
          if (!entry) return;
          this.pending.delete(id);
          this.updateWorkerRef();
          this.post({ id, kind: "cancel" });
          reject(createAbortedError());
        };
        input.signal.addEventListener("abort", onAbort, { once: true });
        cleanupAbort = () => input.signal?.removeEventListener("abort", onAbort);
      }

      this.pending.set(id, {
        resolve,
        reject,
        ...(cleanupAbort ? { cleanupAbort } : {}),
      });
      this.updateWorkerRef();

      try {
        worker.postMessage({
          id,
          kind: "exec",
          command: input.command,
          args: input.args,
          cwd: input.cwd,
          env: input.env,
          timeout: input.timeout,
          maxBuffer: input.maxBuffer,
          ...(input.stdinInput !== undefined ? { input: input.stdinInput } : {}),
        } satisfies GitExecWorkerInbound);
      } catch (error) {
        this.pending.delete(id);
        cleanupAbort?.();
        this.updateWorkerRef();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async dispose(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    this.rejectAll(new Error("Git execution worker disposed."));
    if (worker) {
      await worker.terminate().catch(() => 0);
    }
  }

  private ensureWorker(): Worker | null {
    if (this.disabled) return null;
    if (this.worker) return this.worker;
    const workerPath = resolveGitExecWorkerPath();
    if (!workerPath) return null;
    try {
      const worker = new Worker(workerPath);
      worker.unref();
      worker.on("message", (response: GitExecWorkerResponse) => {
        const entry = this.pending.get(response.id);
        if (!entry) return;
        this.pending.delete(response.id);
        entry.cleanupAbort?.();
        this.updateWorkerRef();
        if (response.ok) {
          entry.resolve({ stdout: response.stdout, stderr: response.stderr });
          return;
        }
        const error = new Error(response.message) as Error & {
          code?: string | number | null;
          signal?: NodeJS.Signals | null;
          killed?: boolean;
          stdout?: string;
          stderr?: string;
        };
        if (response.name) error.name = response.name;
        if (response.code !== undefined) error.code = response.code;
        if (response.signal !== undefined) error.signal = response.signal;
        if (response.killed !== undefined) error.killed = response.killed;
        error.stdout = response.stdout;
        error.stderr = response.stderr;
        entry.reject(error);
      });
      worker.on("error", (error) => {
        this.worker = null;
        this.rejectAll(error instanceof Error ? error : new Error(String(error)));
      });
      worker.on("exit", (code) => {
        if (this.worker === worker) {
          this.worker = null;
          this.rejectAll(new Error(`Git execution worker exited (${code}).`));
        }
      });
      this.worker = worker;
      return worker;
    } catch {
      this.disabled = true;
      return null;
    }
  }

  private post(message: GitExecWorkerInbound): void {
    try {
      this.worker?.postMessage(message);
    } catch {
      // Worker exit path rejects pending jobs.
    }
  }

  private updateWorkerRef(): void {
    if (!this.worker) return;
    if (this.pending.size > 0) this.worker.ref();
    else this.worker.unref();
  }

  private rejectAll(error: Error): void {
    for (const [, entry] of this.pending) {
      entry.cleanupAbort?.();
      entry.reject(error);
    }
    this.pending.clear();
  }
}

const gitExecWorkerClient = new GitExecWorkerClient();

export function execGitOnWorkerThread(input: {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  timeout: number;
  maxBuffer: number;
  stdinInput?: string;
  signal?: AbortSignal;
}): Promise<{ stdout: string; stderr: string }> | null {
  return gitExecWorkerClient.exec(input);
}

export async function disposeGitExecWorker(): Promise<void> {
  await gitExecWorkerClient.dispose();
}
