import { spawn, type ChildProcessByStdio } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import type { GitStatusDetail } from "@/shared/contracts";
import { resolveWslHelpersDir } from "../wsl/wslDeploy";
import {
  GIT_HELPER_BINARY_NAME,
  GIT_HELPER_PROTOCOL_VERSION,
  type GitHelperResponse,
  type GitHelperStatusBatchRequest,
  type NativeGitStatusEntry,
} from "./gitNativeHelperProtocol";

interface PendingRequest {
  resolve: (statuses: Record<string, NativeGitStatusEntry>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_GRACE_MS = 5_000;

export function nativeGitHelperTargetId(): string | undefined {
  if (process.platform === "darwin") return "darwin-universal";
  if (process.platform === "win32") {
    return process.arch === "x64" || process.arch === "arm64" ? `win32-${process.arch}` : undefined;
  }
  if (process.platform === "linux" && process.arch === "x64") return "linux-x64";
  return undefined;
}

export function nativeGitHelperBinaryPath(helpersDir?: string): string | undefined {
  const override = process.env.PORACODE_GIT_HELPER_BIN?.trim();
  if (override) {
    return existsSync(override) ? override : undefined;
  }
  if (process.env.PORACODE_DISABLE_GIT_HELPER === "1") {
    return undefined;
  }

  const id = nativeGitHelperTargetId();
  if (!id) return undefined;
  const exe =
    process.platform === "win32" ? `${GIT_HELPER_BINARY_NAME}.exe` : GIT_HELPER_BINARY_NAME;

  const candidateRoots: string[] = [];
  const envDir = helpersDir ?? resolveWslHelpersDir();
  if (envDir) candidateRoots.push(envDir);

  // Repo-local fallback for direct `vitest` / CLI runs where `PORACODE_WSL_HELPERS_DIR`
  // is not injected by Electron main.
  try {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    candidateRoots.push(resolve(moduleDir, "../../../resources/wsl-helpers"));
    candidateRoots.push(resolve(moduleDir, "../../resources/wsl-helpers"));
  } catch {
    // Ignore CJS or synthetic URL contexts without fileURLToPath.
  }

  for (const root of candidateRoots) {
    const candidate = join(root, "git-helper", id, exe);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

class GitNativeHelperDaemon {
  private child: ChildProcessByStdio<Writable, Readable, null> | null = null;
  private stdoutBuffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private disabled = false;

  constructor(private readonly binaryPath: string) {}

  isAvailable(): boolean {
    return !this.disabled;
  }

  private ensureProcess(): ChildProcessByStdio<Writable, Readable, null> | null {
    if (this.disabled) return null;
    if (this.child && this.child.exitCode === null && !this.child.killed) {
      return this.child;
    }

    try {
      const child = spawn(this.binaryPath, ["--serve-v1"], {
        stdio: ["pipe", "pipe", "ignore"],
        windowsHide: true,
      });
      child.unref();
      this.stdoutBuffer = "";
      this.child = child;

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        this.handleStdoutChunk(chunk);
      });
      child.stdin.on("error", () => {
        // Handled by process close/exit rejection.
      });
      child.on("error", (err) => {
        this.failAll(err instanceof Error ? err : new Error(String(err)), true);
      });
      child.on("close", (code) => {
        const fatalProtocolExit = code === 2;
        this.child = null;
        this.stdoutBuffer = "";
        this.failAll(
          new Error(`poracode-git-helper exited (code ${code ?? "null"})`),
          fatalProtocolExit,
        );
      });
      return child;
    } catch {
      this.disabled = true;
      return null;
    }
  }

  private handleStdoutChunk(chunk: string): void {
    this.stdoutBuffer += chunk;
    for (;;) {
      const newlineIdx = this.stdoutBuffer.indexOf("\n");
      if (newlineIdx === -1) break;
      const rawLine = this.stdoutBuffer.slice(0, newlineIdx).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIdx + 1);
      if (!rawLine) continue;

      let parsed: GitHelperResponse;
      try {
        parsed = JSON.parse(rawLine) as GitHelperResponse;
      } catch {
        continue;
      }
      if (parsed.protocolVersion !== GIT_HELPER_PROTOCOL_VERSION) {
        this.failAll(
          new Error(`Incompatible git-helper protocolVersion: ${parsed.protocolVersion}`),
          true,
        );
        this.dispose();
        return;
      }
      const entry = this.pending.get(parsed.id);
      if (!entry) continue;
      this.pending.delete(parsed.id);
      clearTimeout(entry.timer);

      if (parsed.ok && parsed.statuses) {
        entry.resolve(parsed.statuses);
      } else {
        entry.reject(new Error(parsed.error ?? "poracode-git-helper request failed"));
      }
    }
  }

  private failAll(error: Error, disablePermanently: boolean): void {
    if (disablePermanently) {
      this.disabled = true;
    }
    const entries = [...this.pending.values()];
    this.pending.clear();
    for (const entry of entries) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
  }

  statusBatch(args: {
    paths: string[];
    detail: GitStatusDetail;
    timeoutMs: number;
    maxConcurrency: number;
  }): Promise<Record<string, NativeGitStatusEntry>> | null {
    const child = this.ensureProcess();
    if (!child) return null;

    const id = this.nextId++;
    const req: GitHelperStatusBatchRequest = {
      protocolVersion: GIT_HELPER_PROTOCOL_VERSION,
      id,
      kind: "statusBatch",
      paths: args.paths,
      detail: args.detail,
      timeoutMs: args.timeoutMs,
      maxConcurrency: args.maxConcurrency,
    };

    return new Promise<Record<string, NativeGitStatusEntry>>((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          rejectPromise(new Error("poracode-git-helper request timed out"));
        }
      }, args.timeoutMs + REQUEST_GRACE_MS);
      timer.unref?.();

      this.pending.set(id, {
        resolve: resolvePromise,
        reject: rejectPromise,
        timer,
      });

      try {
        child.stdin.write(`${JSON.stringify(req)}\n`);
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        rejectPromise(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  dispose(): void {
    const child = this.child;
    this.child = null;
    this.stdoutBuffer = "";
    this.failAll(new Error("poracode-git-helper disposed"), false);
    if (child) {
      try {
        child.stdin.end();
      } catch {
        // Ignore
      }
      try {
        child.kill();
      } catch {
        // Ignore
      }
    }
  }
}

let sharedDaemon: { path: string; instance: GitNativeHelperDaemon } | null = null;

function getSharedDaemon(): GitNativeHelperDaemon | null {
  const binaryPath = nativeGitHelperBinaryPath();
  if (!binaryPath) {
    if (sharedDaemon) {
      sharedDaemon.instance.dispose();
      sharedDaemon = null;
    }
    return null;
  }
  if (!sharedDaemon || sharedDaemon.path !== binaryPath) {
    sharedDaemon?.instance.dispose();
    sharedDaemon = {
      path: binaryPath,
      instance: new GitNativeHelperDaemon(binaryPath),
    };
  }
  return sharedDaemon.instance.isAvailable() ? sharedDaemon.instance : null;
}

export async function queryNativeGitStatusBatch(args: {
  paths: string[];
  detail: GitStatusDetail;
  timeoutMs: number;
  maxConcurrency: number;
}): Promise<Record<string, NativeGitStatusEntry> | null> {
  if (args.paths.length === 0) return {};
  const daemon = getSharedDaemon();
  if (!daemon) return null;
  const pending = daemon.statusBatch(args);
  if (!pending) return null;
  try {
    return await pending;
  } catch {
    // Any helper crash/timeout transparently falls back to the TypeScript path!
    return null;
  }
}

export function disposeNativeGitHelper(): void {
  if (!sharedDaemon) return;
  const current = sharedDaemon.instance;
  sharedDaemon = null;
  current.dispose();
}
