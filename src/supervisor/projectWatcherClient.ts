import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { nativeGitHelperBinaryPath } from "./git/gitNativeHelperClient";
import { GIT_HELPER_PROTOCOL_VERSION } from "./git/gitNativeHelperProtocol";
import type {
  ProjectWatchCommand,
  ProjectWatchMessage,
  ProjectWatchScope,
} from "./projectWatcherProtocol";

interface Subscription {
  rootPath: string;
  onChanged: (scope: ProjectWatchScope) => void;
  onError: ((error: Error) => void) | undefined;
  resolve: () => void;
  reject: (error: Error) => void;
  ready: boolean;
  recovering: boolean;
}

interface Backend {
  kind: "native" | "worker";
  ready: boolean;
  readySince?: number;
  post: (command: ProjectWatchCommand) => void;
  close: () => Promise<void>;
  startupTimer?: ReturnType<typeof setTimeout>;
}

function resolveWorkerPath(): string {
  const directory =
    typeof __dirname === "string" ? __dirname : dirname(fileURLToPath(import.meta.url));
  const unpacked = directory.replace(/([\\/])app\.asar([\\/])/u, "$1app.asar.unpacked$2");
  const candidates = [
    "projectWatcherWorker.cjs",
    "projectWatcherWorker.mjs",
    "projectWatcherWorker.js",
  ].flatMap((name) => [join(unpacked, name), join(directory, name)]);
  // Direct source/CLI tests on Node 26 use native TypeScript stripping. Packaged
  // desktop, standalone and SSH hosts carry the self-contained CJS entry.
  candidates.push(join(directory, "projectWatcherWorker.ts"));
  return candidates.find((path) => existsSync(path)) ?? candidates[0]!;
}

function isWatchMessage(value: unknown): value is ProjectWatchMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    message.protocolVersion === GIT_HELPER_PROTOCOL_VERSION &&
    Number.isSafeInteger(message.id) &&
    Number(message.id) >= 0 &&
    (message.kind === "ready" ||
      message.kind === "unwatched" ||
      (message.kind === "changed" && (message.scope === "git" || message.scope === "worktree")) ||
      (message.kind === "error" && typeof message.error === "string"))
  );
}

/** One off-supervisor watcher owner, shared by every local project and worktree. */
export class ProjectWatcherClient {
  private readonly subscriptions = new Map<number, Subscription>();
  private nextId = 1;
  private backend: Backend | undefined;
  private nativeFailed = false;
  private workerRestarts = 0;
  private disposed = false;
  private readonly closing = new Set<Promise<void>>();

  constructor(
    private readonly options: { nativeBinaryPath?: string | false; workerPath?: string } = {},
  ) {}

  watch(
    rootPath: string,
    onChanged: (scope: ProjectWatchScope) => void,
    onError?: (error: Error) => void,
  ): {
    ready: Promise<void>;
    unsubscribe: () => void;
  } {
    if (this.disposed) throw new Error("Project watcher disposed");
    const id = this.nextId++;
    const ready = new Promise<void>((resolve, reject) => {
      this.subscriptions.set(id, {
        rootPath,
        onChanged,
        onError,
        resolve,
        reject,
        ready: false,
        recovering: false,
      });
    });
    const existing = this.backend;
    this.ensureBackend();
    if (existing?.ready && this.backend === existing) this.postWatch(existing, id, rootPath);
    return {
      ready,
      unsubscribe: () => {
        const entry = this.subscriptions.get(id);
        if (!entry) return;
        this.subscriptions.delete(id);
        entry.resolve();
        const backend = this.backend;
        if (backend?.ready)
          this.post(backend, { protocolVersion: GIT_HELPER_PROTOCOL_VERSION, id, kind: "unwatch" });
        if (this.subscriptions.size === 0 && backend)
          queueMicrotask(() => {
            if (this.subscriptions.size === 0 && this.backend === backend)
              this.closeBackend(backend);
          });
      },
    };
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    for (const entry of this.subscriptions.values()) entry.resolve();
    this.subscriptions.clear();
    if (this.backend) this.closeBackend(this.backend);
    await Promise.all(this.closing);
  }

  private ensureBackend(): void {
    if (this.backend || this.disposed || this.subscriptions.size === 0) return;
    const binary = this.options.nativeBinaryPath ?? nativeGitHelperBinaryPath();
    try {
      if (!this.nativeFailed && binary) this.startNative(binary);
      else this.startWorker();
    } catch (error) {
      const backend = this.backend;
      if (backend) this.failBackend(backend, error);
      else if (!this.nativeFailed && binary) {
        this.nativeFailed = true;
        this.ensureBackend();
      } else this.rejectSubscriptions(error);
    }
  }

  private armStartup(backend: Backend): void {
    backend.startupTimer = setTimeout(
      () => this.failBackend(backend, new Error("Project watcher startup timed out")),
      5_000,
    );
    backend.startupTimer.unref();
  }

  private startNative(binary: string): void {
    const child = spawn(binary, ["--watch-v3"], {
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
    });
    const exited = new Promise<void>((resolve) => child.once("close", () => resolve()));
    const backend: Backend = {
      kind: "native",
      ready: false,
      post: (command) => {
        child.stdin.write(`${JSON.stringify(command)}\n`);
      },
      close: async () => {
        child.stdin.destroy();
        child.kill();
        await exited;
      },
    };
    this.backend = backend;
    child.unref();
    child.stdout.setEncoding("utf8");
    let buffer = "";
    child.stdout.on("data", (chunk: string) => {
      if (this.backend !== backend) return;
      buffer += chunk;
      // Watch replies contain no file paths or event arrays. A flood or a
      // mismatched binary must not grow a supervisor-side buffer indefinitely.
      for (;;) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) break;
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.length > 64 * 1024) {
          this.failBackend(backend, new Error("Project watcher response exceeded limit"));
          return;
        }
        try {
          this.receive(backend, JSON.parse(line));
        } catch (error) {
          this.failBackend(backend, error);
          return;
        }
        if (this.backend !== backend) return;
      }
      if (buffer.length > 64 * 1024)
        this.failBackend(backend, new Error("Project watcher response exceeded limit"));
    });
    child.stdin.on("error", (error) => this.failBackend(backend, error));
    child.on("error", (error) => this.failBackend(backend, error));
    child.on("close", (code) =>
      this.failBackend(backend, new Error(`Project watcher exited (${code})`)),
    );
    this.armStartup(backend);
  }

  private startWorker(): void {
    const worker = new Worker(this.options.workerPath ?? resolveWorkerPath());
    const backend: Backend = {
      kind: "worker",
      ready: false,
      post: (command) => worker.postMessage(command),
      close: async () => {
        await worker.terminate();
      },
    };
    this.backend = backend;
    worker.on("message", (message: unknown) => this.receive(backend, message));
    worker.on("error", (error) => this.failBackend(backend, error));
    worker.on("exit", (code) =>
      this.failBackend(backend, new Error(`Project watcher worker exited (${code})`)),
    );
    worker.unref();
    this.armStartup(backend);
  }

  private receive(backend: Backend, value: unknown): void {
    if (this.backend !== backend) return;
    if (!isWatchMessage(value)) {
      this.failBackend(backend, new Error("Incompatible project watcher protocol"));
      return;
    }
    if (value.id === 0) {
      if (value.kind !== "ready" || backend.ready) {
        this.failBackend(
          backend,
          new Error(value.kind === "error" ? value.error : "Invalid watcher handshake"),
        );
        return;
      }
      clearTimeout(backend.startupTimer);
      backend.ready = true;
      backend.readySince = Date.now();
      for (const [id, entry] of this.subscriptions) this.postWatch(backend, id, entry.rootPath);
      return;
    }
    const entry = this.subscriptions.get(value.id);
    if (!entry || !backend.ready) return;
    if (value.kind === "ready") {
      entry.ready = true;
      entry.resolve();
      if (entry.recovering) {
        entry.recovering = false;
        entry.onChanged("git");
        entry.onChanged("worktree");
      }
    } else if (value.kind === "changed") {
      if (entry.ready) entry.onChanged(value.scope);
    } else if (value.kind === "error") {
      if (entry.ready) {
        entry.ready = false;
        entry.recovering = true;
        this.postWatch(backend, value.id, entry.rootPath);
      } else {
        this.rejectSubscription(value.id, entry, new Error(value.error));
        this.post(backend, {
          protocolVersion: GIT_HELPER_PROTOCOL_VERSION,
          id: value.id,
          kind: "unwatch",
        });
      }
    }
  }

  private postWatch(backend: Backend, id: number, rootPath: string): void {
    this.post(backend, {
      protocolVersion: GIT_HELPER_PROTOCOL_VERSION,
      id,
      kind: "watch",
      rootPath,
    });
  }

  private post(backend: Backend, command: ProjectWatchCommand): void {
    try {
      backend.post(command);
    } catch (error) {
      this.failBackend(backend, error);
    }
  }

  private failBackend(backend: Backend, error: unknown): void {
    if (this.backend !== backend) return;
    this.closeBackend(backend);
    for (const entry of this.subscriptions.values()) {
      entry.recovering ||= entry.ready;
      entry.ready = false;
    }
    if (backend.kind === "native") this.nativeFailed = true;
    else {
      if (this.workerRestarts++ >= 1) {
        this.rejectSubscriptions(error);
        console.warn("[watcher] Off-supervisor watcher failed:", error);
        return;
      }
    }
    this.ensureBackend();
  }

  private closeBackend(backend: Backend): void {
    if (this.backend === backend) this.backend = undefined;
    clearTimeout(backend.startupTimer);
    // Credit healthy runs on failure and on a clean final unwatch.
    if (
      backend.kind === "worker" &&
      backend.readySince !== undefined &&
      Date.now() - backend.readySince >= 30_000
    ) {
      this.workerRestarts = 0;
    }
    const closing = backend
      .close()
      .catch(() => {})
      .finally(() => this.closing.delete(closing));
    this.closing.add(closing);
  }

  private rejectSubscriptions(error: unknown): void {
    const failure = error instanceof Error ? error : new Error(String(error));
    for (const [id, entry] of this.subscriptions) this.rejectSubscription(id, entry, failure);
  }

  private rejectSubscription(id: number, entry: Subscription, error: Error): void {
    this.subscriptions.delete(id);
    entry.reject(error);
    if (entry.recovering) {
      entry.onChanged("git");
      entry.onChanged("worktree");
    }
    entry.onError?.(error);
  }
}
