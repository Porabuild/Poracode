import { spawn, type ChildProcessByStdio } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import type { FileEntry, GitStatusDetail, ProjectTreeEntry } from "@/shared/contracts";
import { resolveWslHelpersDir } from "../wsl/wslDeploy";
import {
  GIT_HELPER_BINARY_NAME,
  GIT_HELPER_PROTOCOL_VERSION,
  type GitHelperRequest,
  type GitHelperResponse,
  type NativeGitStatusEntry,
} from "./gitNativeHelperProtocol";

interface PendingRequest {
  resolve: (response: GitHelperResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_GRACE_MS = 5_000;

/**
 * Returns `false` if any exclude pattern uses brace expansion or bash extglobs
 * (`{a,b}`, `!(foo)`, `+(bar)`, `\` escapes) that require `micromatch`. Standard
 * globs (`*`, `**`, `?`, `[abc]`, `[!abc]`) are handled natively in Rust.
 */
export function areSearchExcludePatternsNativeCompatible(patterns: readonly string[]): boolean {
  for (const p of patterns) {
    if (/[{}\\]|(?:!|\+|\*|@|\?)\(/u.test(p)) {
      return false;
    }
  }
  return true;
}

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

  nextRequestId(): number {
    return this.nextId++;
  }

  private ensureProcess(): ChildProcessByStdio<Writable, Readable, null> | null {
    if (this.disabled) return null;
    if (this.child && this.child.exitCode === null && !this.child.killed) {
      return this.child;
    }

    try {
      const child = spawn(this.binaryPath, ["--serve-v2"], {
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

      if (parsed.ok) {
        entry.resolve(parsed);
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

  request(req: GitHelperRequest, timeoutMs: number): Promise<GitHelperResponse> | null {
    const child = this.ensureProcess();
    if (!child) return null;

    return new Promise<GitHelperResponse>((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(req.id)) {
          rejectPromise(new Error("poracode-git-helper request timed out"));
        }
      }, timeoutMs + REQUEST_GRACE_MS);
      timer.unref?.();

      this.pending.set(req.id, {
        resolve: resolvePromise,
        reject: rejectPromise,
        timer,
      });

      try {
        child.stdin.write(`${JSON.stringify(req)}\n`);
      } catch (err) {
        this.pending.delete(req.id);
        clearTimeout(timer);
        rejectPromise(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  sendFireAndForgetIfAlive(req: GitHelperRequest): void {
    if (!this.child || this.child.exitCode !== null || this.child.killed) {
      return;
    }
    try {
      this.child.stdin.write(`${JSON.stringify(req)}\n`);
    } catch {
      // Ignore write failures during shutdown; cache is process-local anyway.
    }
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
  const pending = daemon.request(
    {
      protocolVersion: GIT_HELPER_PROTOCOL_VERSION,
      id: daemon.nextRequestId(),
      kind: "statusBatch",
      paths: args.paths,
      detail: args.detail,
      timeoutMs: args.timeoutMs,
      maxConcurrency: args.maxConcurrency,
    },
    args.timeoutMs,
  );
  if (!pending) return null;
  try {
    const res = await pending;
    return res.statuses ?? null;
  } catch {
    return null;
  }
}

export async function queryNativeSearchTree(args: {
  rootPath: string;
  query: string;
  limit: number;
  entryType?: "file" | "directory";
  useIgnoreFiles: boolean;
  excludePatterns: string[];
  timeoutMs: number;
}): Promise<ProjectTreeEntry[] | null> {
  const daemon = getSharedDaemon();
  if (!daemon) return null;
  const pending = daemon.request(
    {
      protocolVersion: GIT_HELPER_PROTOCOL_VERSION,
      id: daemon.nextRequestId(),
      kind: "searchTree",
      rootPath: args.rootPath,
      query: args.query,
      limit: args.limit,
      ...(args.entryType ? { entryType: args.entryType } : {}),
      useIgnoreFiles: args.useIgnoreFiles,
      excludePatterns: args.excludePatterns,
      timeoutMs: args.timeoutMs,
    },
    args.timeoutMs,
  );
  if (!pending) return null;
  try {
    const res = await pending;
    return res.treeEntries ?? null;
  } catch {
    return null;
  }
}

export async function queryNativeSearchFiles(args: {
  rootPath: string;
  query: string;
  limit: number;
  useIgnoreFiles: boolean;
  excludePatterns: string[];
  timeoutMs: number;
}): Promise<{ entries: FileEntry[]; totalIndexed: number } | null> {
  const daemon = getSharedDaemon();
  if (!daemon) return null;
  const pending = daemon.request(
    {
      protocolVersion: GIT_HELPER_PROTOCOL_VERSION,
      id: daemon.nextRequestId(),
      kind: "searchFiles",
      rootPath: args.rootPath,
      query: args.query,
      limit: args.limit,
      useIgnoreFiles: args.useIgnoreFiles,
      excludePatterns: args.excludePatterns,
      timeoutMs: args.timeoutMs,
    },
    args.timeoutMs,
  );
  if (!pending) return null;
  try {
    const res = await pending;
    if (!res.fileEntries || typeof res.totalIndexed !== "number") return null;
    return { entries: res.fileEntries, totalIndexed: res.totalIndexed };
  } catch {
    return null;
  }
}

export function invalidateNativeSearchCache(rootPath?: string): void {
  if (!sharedDaemon) return;
  const daemon = sharedDaemon.instance;
  daemon.sendFireAndForgetIfAlive({
    protocolVersion: GIT_HELPER_PROTOCOL_VERSION,
    id: daemon.nextRequestId(),
    kind: "invalidateSearch",
    ...(rootPath !== undefined ? { rootPath } : {}),
  });
}

export function disposeNativeGitHelper(): void {
  if (!sharedDaemon) return;
  const current = sharedDaemon.instance;
  sharedDaemon = null;
  current.dispose();
}
