import { randomUUID } from "node:crypto";
import type { ProjectLocation } from "@/shared/contracts";
import type { WslBridgeServer, WatchEvent, WatchScope } from "./index";

const BRIDGE_REQUEST_TIMEOUT_MS = 30_000;
// For long-running commands (e.g. `git clone`) the request carries its own
// `timeoutMs`; the HTTP abort must outlast it so the server-side timeout — which
// returns a proper result — wins instead of the client aborting prematurely.
const BRIDGE_REQUEST_TIMEOUT_MARGIN_MS = 15_000;
const BRIDGE_FETCH_ATTEMPTS = 8;

/**
 * How long to let a single bridge HTTP request run before aborting. Commands
 * that pass a `timeoutMs` (git/process exec + batches) get that plus a margin so
 * the in-distro server's own timeout fires first; everything else uses the
 * default. A stuck server is still bounded.
 */
export function bridgeRequestTimeoutMs(body: unknown): number {
  const requested =
    body && typeof body === "object" ? (body as { timeoutMs?: unknown }).timeoutMs : undefined;
  if (typeof requested === "number" && Number.isFinite(requested) && requested > 0) {
    return Math.max(BRIDGE_REQUEST_TIMEOUT_MS, requested + BRIDGE_REQUEST_TIMEOUT_MARGIN_MS);
  }
  return BRIDGE_REQUEST_TIMEOUT_MS;
}

/**
 * Thin, typed façade over the in-distro bridge server's `/v1/fs/*` endpoints.
 * Every method ensures the bridge is running (lazy spawn), then issues one
 * HTTP request. Errors come back shaped like Node.js `fs` errors (with a
 * `.code` property) so callers can branch on `err.code === "ENOENT"` etc.
 *
 * Callers pass WSL `ProjectLocation`s; the client extracts `distro` and the
 * POSIX `linuxPath`/projectRoot so supervisor code never hand-assembles
 * distro paths.
 */
export class WslBridgeClient {
  constructor(private readonly server: WslBridgeServer) {}

  /**
   * Read a directory, batched with per-symlink target-kind detection. When
   * `includeChildCount` is set, every directory entry also carries a
   * `hasChildren` flag — computed by a cheap readdir on each child dir
   * inside the distro, where it costs ~microseconds vs UNC's ~milliseconds.
   */
  async readdir(
    location: WslLocation,
    absolutePath: string,
    options?: { includeChildCount?: boolean },
  ): Promise<{ entries: WslDirEntry[] }> {
    return this.call<{ entries: WslDirEntry[] }>(location, "/v1/fs/readdir", {
      projectRoot: location.linuxPath,
      path: absolutePath,
      includeChildCount: Boolean(options?.includeChildCount),
    });
  }

  /** Batched `lstat`/`stat` over a path list. */
  async stat(
    location: WslLocation,
    paths: string[],
    options?: { follow?: boolean },
  ): Promise<{ stats: WslStatResult[] }> {
    return this.call<{ stats: WslStatResult[] }>(location, "/v1/fs/stat", {
      projectRoot: location.linuxPath,
      paths,
      follow: Boolean(options?.follow),
    });
  }

  /**
   * Walk the project tree (skipping `ignore` directories) up to `maxEntries`.
   * The server enumerates inside the distro — orders of magnitude faster than
   * a recursive UNC readdir over the 9P bridge. `newestFirst` asks the server
   * to scan the full tree and retain the newest matching files.
   */
  async find(
    location: WslLocation,
    options: {
      root?: string;
      maxEntries: number;
      ignore?: string[];
      fileName?: string;
      newestFirst?: boolean;
    },
  ): Promise<{ entries: WslFindEntry[]; truncated: boolean }> {
    return this.call<{ entries: WslFindEntry[]; truncated: boolean }>(location, "/v1/fs/find", {
      projectRoot: location.linuxPath,
      root: options.root ?? location.linuxPath,
      maxEntries: options.maxEntries,
      ignore: options.ignore ?? [],
      ...(options.fileName ? { fileName: options.fileName } : {}),
      ...(options.newestFirst ? { newestFirst: true } : {}),
    });
  }

  /**
   * Read a file's raw bytes. If `maxBytes` is set and the file exceeds it,
   * the server returns `{ tooLarge: true, size, mtimeMs }` without reading
   * the payload. Callers handle binary detection / UTF-8 / BOM client-side.
   */
  async readFile(
    location: WslLocation,
    absolutePath: string,
    options?: { maxBytes?: number },
  ): Promise<WslReadFileResult> {
    return this.call<WslReadFileResult>(location, "/v1/fs/read", {
      projectRoot: location.linuxPath,
      path: absolutePath,
      maxBytes: options?.maxBytes ?? 0,
    });
  }

  /**
   * Write raw bytes to a file. If `expectedMtimeMs` is set and the file
   * has changed on disk since it was read, the server returns an `EMTIME`
   * error without writing.
   */
  async writeFile(
    location: WslLocation,
    absolutePath: string,
    content: Buffer,
    options?: { expectedMtimeMs?: number },
  ): Promise<WslWriteFileResult> {
    return this.call<WslWriteFileResult>(location, "/v1/fs/write", {
      projectRoot: location.linuxPath,
      path: absolutePath,
      contentBase64: content.toString("base64"),
      expectedMtimeMs: options?.expectedMtimeMs,
    });
  }

  /** Write a new file. Fails with `EEXIST` if the path already exists. */
  async writeNewFile(
    location: WslLocation,
    absolutePath: string,
    content: Buffer,
  ): Promise<WslWriteFileResult> {
    return this.call<WslWriteFileResult>(location, "/v1/fs/write-new", {
      projectRoot: location.linuxPath,
      path: absolutePath,
      contentBase64: content.toString("base64"),
    });
  }

  /** Create a directory (optionally recursive). */
  async mkdir(
    location: WslLocation,
    absolutePath: string,
    options?: { recursive?: boolean },
  ): Promise<void> {
    await this.call(location, "/v1/fs/mkdir", {
      projectRoot: location.linuxPath,
      path: absolutePath,
      recursive: Boolean(options?.recursive),
    });
  }

  /** Remove a file or directory. */
  async rm(
    location: WslLocation,
    absolutePath: string,
    options?: { recursive?: boolean; force?: boolean },
  ): Promise<void> {
    await this.call(location, "/v1/fs/rm", {
      projectRoot: location.linuxPath,
      path: absolutePath,
      recursive: Boolean(options?.recursive),
      force: Boolean(options?.force),
    });
  }

  async home(location: WslLocation): Promise<{ home: string }> {
    return this.call<{ home: string }>(location, "/v1/fs/home", {});
  }

  async createGitCheckpointSnapshot(
    location: WslLocation,
    input: { ref: string; metadata: unknown },
  ): Promise<{ commit: string }> {
    return this.call<{ commit: string }>(location, "/v1/git/checkpoint-snapshot", {
      projectRoot: location.linuxPath,
      ref: input.ref,
      metadata: input.metadata,
    });
  }

  async gitExec(location: WslLocation, input: WslGitExecInput): Promise<WslGitExecResult> {
    return this.call<WslGitExecResult>(location, "/v1/git/exec", input);
  }

  async gitBatch(
    location: WslLocation,
    input: { commands: WslGitExecInput[]; timeoutMs?: number },
  ): Promise<{ results: WslGitExecResult[] }> {
    return this.call<{ results: WslGitExecResult[] }>(location, "/v1/git/batch", input);
  }

  async ghVersion(
    location: WslLocation,
    input: Pick<WslGitExecInput, "cwd" | "loginEnv" | "timeoutMs">,
  ): Promise<WslGitExecResult> {
    return this.call<WslGitExecResult>(location, "/v1/gh/version", input);
  }

  async processExec(
    location: WslLocation,
    input: WslProcessExecInput,
  ): Promise<WslProcessExecResult> {
    return this.call<WslProcessExecResult>(location, "/v1/process/exec", input);
  }

  async processBatch(
    location: WslLocation,
    input: { commands: WslProcessExecInput[]; timeoutMs?: number },
  ): Promise<{ results: WslProcessExecResult[] }> {
    return this.call<{ results: WslProcessExecResult[] }>(location, "/v1/process/batch", input);
  }

  /** Rename/move a path. Both sides must live inside `location`. */
  async rename(location: WslLocation, fromAbsolute: string, toAbsolute: string): Promise<void> {
    await this.call(location, "/v1/fs/rename", {
      projectRoot: location.linuxPath,
      from: fromAbsolute,
      to: toAbsolute,
    });
  }

  /**
   * Subscribe to filesystem changes under `paths`. Listener is registered
   * BEFORE the HTTP request so the first event cannot race in ahead of the
   * supervisor's router. Returns an `unsubscribe()` that is safe to call
   * even if the subscribe call failed (idempotent).
   */
  async watch(
    location: WslLocation,
    options: { paths: { path: string; scope: WatchScope }[]; ignore?: string[] },
    onEvent: (event: WatchEvent) => void,
  ): Promise<{ subscriptionId: string; unsubscribe: () => Promise<void> }> {
    const subscriptionId = randomUUID();
    this.server.registerWatchListener(subscriptionId, location.distro, onEvent);
    try {
      await this.call(location, "/v1/watch/subscribe", {
        projectRoot: location.linuxPath,
        subscriptionId,
        paths: options.paths,
        ignore: options.ignore ?? [],
      });
    } catch (err) {
      this.server.unregisterWatchListener(subscriptionId);
      throw err;
    }
    let disposed = false;
    return {
      subscriptionId,
      unsubscribe: async () => {
        if (disposed) return;
        disposed = true;
        this.server.unregisterWatchListener(subscriptionId);
        await this.call(location, "/v1/watch/unsubscribe", { subscriptionId }).catch((error) => {
          console.warn(`[wsl-bridge] unsubscribe ${subscriptionId} failed:`, error);
        });
      },
    };
  }

  private async call<T>(location: WslLocation, path: string, body: unknown): Promise<T> {
    const handle = await this.server.ensureBridge(location.distro);
    if (!handle) {
      throw asNodeErr("EUNAVAIL", `WSL bridge unavailable for distro ${location.distro}`);
    }
    const response = await fetchBridge(
      `${handle.baseUrl}${path}`,
      handle.secret,
      body,
      bridgeRequestTimeoutMs(body),
    );
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw asNodeErr("EIO", `bridge ${path} returned non-JSON body (status ${response.status})`);
    }
    if (!parsed || typeof parsed !== "object") {
      throw asNodeErr("EIO", `bridge ${path} returned unexpected body (status ${response.status})`);
    }
    const envelope = parsed as {
      ok?: boolean;
      data?: unknown;
      code?: unknown;
      message?: unknown;
      error?: unknown;
    };
    if (envelope.ok === true) return envelope.data as T;
    const code = resolveErrCode(envelope.code, response.status);
    const message = resolveErrMessage(envelope.message, envelope.error, path, response.status);
    throw asNodeErr(code, message);
  }
}

async function fetchBridge(
  url: string,
  secret: string,
  body: unknown,
  requestTimeoutMs: number = BRIDGE_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= BRIDGE_FETCH_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    if (typeof timeout.unref === "function") timeout.unref();
    try {
      return await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      lastError = err;
      if (!shouldRetryBridgeFetch(err) || attempt === BRIDGE_FETCH_ATTEMPTS) break;
      await delay(125 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw asNodeErr("ECONN", `bridge request failed: ${errMessage(lastError)}`);
}

function shouldRetryBridgeFetch(err: unknown): boolean {
  const message = errMessage(err).toLowerCase();
  return message.includes("fetch failed") || message.includes("econnrefused");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type WslLocation = Extract<ProjectLocation, { kind: "wsl" }>;

export interface WslDirEntry {
  name: string;
  type: "file" | "directory" | "symlink" | "other";
  /** Only set when `type === "symlink"`. Indicates the resolved target's kind. */
  isDirectoryLink?: boolean;
  /** Populated only when the request asked for `includeChildCount`. */
  hasChildren?: boolean;
}

export interface WslStatResult {
  path: string;
  exists: boolean;
  isDirectory?: boolean;
  isFile?: boolean;
  isSymlink?: boolean;
  size?: number;
  mtimeMs?: number;
  /** Present when `exists === false`; mirrors Node's `err.code`. */
  code?: string;
}

export interface WslFindEntry {
  path: string;
  name: string;
  type: "file" | "directory";
  mtimeMs?: number;
}

export type WslReadFileResult =
  | { tooLarge: true; size: number; mtimeMs: number }
  | { tooLarge?: false; size: number; mtimeMs: number; contentBase64: string };

export interface WslWriteFileResult {
  mtimeMs: number;
  size: number;
}

export interface WslGitExecInput {
  cwd: string;
  args: string[];
  env?: Record<string, string>;
  loginEnv?: boolean;
  timeoutMs?: number;
}

export interface WslGitExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  signal?: string;
  error?: string;
  timedOut?: boolean;
}

export interface WslProcessExecInput extends WslGitExecInput {
  command: string;
}

export type WslProcessExecResult = WslGitExecResult;

function asNodeErr(code: string, message: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function resolveErrCode(envelopeCode: unknown, status: number): string {
  if (typeof envelopeCode === "string") return envelopeCode;
  if (status === 401) return "EAUTH";
  if (status === 404) return "ENOENT";
  return "EIO";
}

function resolveErrMessage(
  envelopeMessage: unknown,
  envelopeError: unknown,
  path: string,
  status: number,
): string {
  if (typeof envelopeMessage === "string") return envelopeMessage;
  if (typeof envelopeError === "string") return envelopeError;
  return `bridge ${path} failed (status ${status})`;
}
