import { toWslUncPath } from "@/shared/wsl";
import { SingleFlight, type SingleFlightOptions } from "../singleFlight";
import { stagingContentKeyAsync } from "./contentKey";
import {
  createInlineStagingExecutor,
  createProcessStagingExecutor,
  type WslStagingExecutor,
} from "./executor";
import type { WslStagingDeployResult, WslStagingFileRequest, WslStagingRequest } from "./protocol";
import { wslStagingProcessSpec } from "./workerPath";

export interface WslStagingHomeInput {
  /** Linux home directory inside the distro. */
  home: string;
  files: readonly WslStagingFileRequest[];
}

export interface WslStagingTempInput {
  /** Caller-scoped base name; sanitized before it becomes a path segment. */
  baseName: string;
  files: readonly WslStagingFileRequest[];
}

export interface WslStagingBaseResult {
  /** Linux path of the staged base directory inside the distro. */
  linuxBaseDir: string;
}

export interface WslStagingServiceOptions {
  /** Test seam: build the per-distro executor. Defaults to the bundled worker. */
  createExecutor?: (distro: string) => WslStagingExecutor;
  /**
   * Async home resolver used when the cached home is cold. The supervisor
   * installs a single-flight around it so concurrent callers share one
   * probe per distro.
   */
  resolveHome?: (distro: string) => Promise<string | undefined>;
  cachedHome?: (distro: string) => string | undefined;
  requestTimeoutMs?: number;
  largeRequestTimeoutMs?: number;
  idleTimeoutMs?: number;
  maxExecutors?: number;
  onDebug?: (message: string, details?: Record<string, unknown>) => void;
}

interface ExecutorEntry {
  executor: WslStagingExecutor;
  active: number;
  lastUsed: number;
  idleTimer: ReturnType<typeof setTimeout> | undefined;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_LARGE_REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_EXECUTORS = 4;

/**
 * Per-distro staging front door.
 *
 * - One worker process per distro, so a stopped or stalled distro only ever
 *   blocks its own queue.
 * - Single-flight per content identity, so concurrent consumers of the same
 *   artifact share one install.
 * - Every request is bounded: the deadline kills the isolated worker rather
 *   than leaving a stalled filesystem call behind.
 */
export class WslStagingService {
  private readonly executors = new Map<string, ExecutorEntry>();
  /**
   * Per-distro teardown promises. A successor executor may only spawn after
   * the previous child has actually exited, so a request arriving while a
   * worker is being reaped waits for that reap instead of racing its handles.
   */
  private readonly disposing = new Map<string, Promise<void>>();
  private readonly flights = new SingleFlight();
  private readonly requestTimeoutMs: number;
  private readonly largeRequestTimeoutMs: number;
  private readonly idleTimeoutMs: number;
  private readonly maxExecutors: number;
  private warnedInlineFallback = false;
  private disposed = false;

  constructor(private readonly options: WslStagingServiceOptions = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.largeRequestTimeoutMs = options.largeRequestTimeoutMs ?? DEFAULT_LARGE_REQUEST_TIMEOUT_MS;
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.maxExecutors = options.maxExecutors ?? DEFAULT_MAX_EXECUTORS;
  }

  async resolveHome(distro: string, options?: SingleFlightOptions): Promise<string | undefined> {
    const cached = this.options.cachedHome?.(distro);
    if (cached) return cached;
    const resolver = this.options.resolveHome;
    if (!resolver) return undefined;
    try {
      return await this.flights.run(`home-resolve:${distro}`, () => resolver(distro), options);
    } catch {
      return undefined;
    }
  }

  async deployHome(
    distro: string,
    input: WslStagingHomeInput,
    options?: SingleFlightOptions,
  ): Promise<WslStagingDeployResult> {
    const contentKey = await stagingContentKeyAsync(input.files);
    const base = toWslUncPath(distro, `${input.home}/.poracode`);
    return this.flights.run(
      `home:${distro}:${input.home}:${contentKey}`,
      (signal) =>
        this.execute<WslStagingDeployResult>(
          distro,
          { op: "deploy", base, files: input.files, freshness: "content" },
          this.requestTimeoutMs,
          signal,
        ),
      options,
    );
  }

  async deployTemp(
    distro: string,
    input: WslStagingTempInput,
    options?: SingleFlightOptions,
  ): Promise<WslStagingBaseResult> {
    const contentKey = await stagingContentKeyAsync(input.files);
    const safeBaseName = input.baseName.replace(/[^A-Za-z0-9._-]/gu, "-");
    const linuxBaseDir = `/tmp/${safeBaseName}-${contentKey.slice(0, 12)}`;
    const base = toWslUncPath(distro, linuxBaseDir);
    await this.flights.run(
      `temp:${distro}:${linuxBaseDir}`,
      (signal) =>
        this.execute(
          distro,
          { op: "deploy", base, files: input.files, freshness: "content" },
          this.requestTimeoutMs,
          signal,
        ),
      options,
    );
    return { linuxBaseDir };
  }

  /**
   * List one directory level inside the distro through the worker. Reports
   * `exists: false` for a missing directory; throws on transport failure so a
   * caller can distinguish "absent" from "could not enumerate".
   */
  async readDirectory(
    distro: string,
    path: string,
    options?: SingleFlightOptions,
  ): Promise<{ exists: boolean; entries: { name: string; directory: boolean }[] }> {
    return this.execute(distro, { op: "read-dir", path }, this.requestTimeoutMs, options?.signal);
  }

  async pathExists(distro: string, path: string, options?: SingleFlightOptions): Promise<boolean> {
    try {
      return await this.execute<boolean>(
        distro,
        { op: "exists", path },
        this.requestTimeoutMs,
        options?.signal,
      );
    } catch {
      return false;
    }
  }

  /**
   * Read a staged/installed text file inside the distro through the worker.
   * Returns `null` when the path does not exist; throws on transport failure
   * so a caller merging a settings document can distinguish "absent" from
   * "could not read" and refuse to overwrite.
   */
  async readTextFile(
    distro: string,
    path: string,
    options?: SingleFlightOptions,
  ): Promise<string | null> {
    const result = await this.execute<{ exists: boolean; contentBase64?: string }>(
      distro,
      { op: "read-file", path },
      this.requestTimeoutMs,
      options?.signal,
    );
    if (!result.exists) return null;
    return Buffer.from(result.contentBase64 ?? "", "base64").toString("utf8");
  }

  /** Atomically write a text file inside the distro through the worker. */
  async writeTextFile(
    distro: string,
    path: string,
    content: string,
    options?: SingleFlightOptions & { mode?: number },
  ): Promise<void> {
    await this.flights.run(
      `write-file:${distro}:${path}`,
      (signal) =>
        this.execute(
          distro,
          {
            op: "write-file",
            path,
            contentBase64: Buffer.from(content, "utf8").toString("base64"),
            ...(options?.mode !== undefined ? { mode: options.mode } : {}),
          },
          this.requestTimeoutMs,
          signal,
        ),
      options,
    );
  }

  async remove(distro: string, path: string, options?: SingleFlightOptions): Promise<void> {
    await this.execute(
      distro,
      { op: "remove", path, recursive: true },
      this.requestTimeoutMs,
      options?.signal,
    );
  }

  async mkdirp(
    distro: string,
    path: string,
    options?: SingleFlightOptions & { mode?: number },
  ): Promise<void> {
    await this.execute(
      distro,
      { op: "mkdirp", path, ...(options?.mode !== undefined ? { mode: options.mode } : {}) },
      this.requestTimeoutMs,
      options?.signal,
    );
  }

  async stageFile(
    distro: string,
    input: { src: string; dest: string },
    options?: SingleFlightOptions,
  ): Promise<void> {
    await this.flights.run(
      `stage-file:${distro}:${input.dest}`,
      (signal) =>
        this.execute(
          distro,
          { op: "stage-file", src: input.src, dest: input.dest },
          this.largeRequestTimeoutMs,
          signal,
        ),
      options,
    );
  }

  async pruneRuntimeDirs(
    distro: string,
    dir: string,
    keepName: string,
    options?: SingleFlightOptions,
  ): Promise<void> {
    await this.flights.run(
      `prune:${distro}:${dir}:${keepName}`,
      (signal) =>
        this.execute(
          distro,
          { op: "prune-dirs", dir, keepPrefix: "node-v", keepName },
          this.largeRequestTimeoutMs,
          signal,
        ),
      options,
    );
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await Promise.all([
      ...[...this.executors.keys()].map((distro) => this.destroyExecutor(distro)),
      ...this.disposing.values(),
    ]);
  }

  private async execute<T>(
    distro: string,
    request: WslStagingRequest,
    timeoutMs: number,
    signal: AbortSignal | undefined,
  ): Promise<T> {
    if (this.disposed) throw new Error("WSL staging service is disposed");
    const entry = await this.acquireExecutor(distro);
    entry.active += 1;
    this.clearIdleTimer(entry);
    try {
      return await entry.executor.execute<T>(request, {
        timeoutMs,
        ...(signal ? { signal } : {}),
      });
    } finally {
      entry.active -= 1;
      entry.lastUsed = Date.now();
      this.scheduleIdle(distro, entry);
    }
  }

  private async acquireExecutor(distro: string): Promise<ExecutorEntry> {
    const pendingTeardown = this.disposing.get(distro);
    if (pendingTeardown) await pendingTeardown;
    const existing = this.executors.get(distro);
    if (existing) return existing;
    if (this.executors.size >= this.maxExecutors) {
      await this.evictIdleExecutor();
      // Eviction awaits the victim's teardown, so a concurrent acquisition may
      // already have created this distro's executor. Re-read before creating:
      // two acquisitions must never overwrite one live entry.
      const reacquired = this.executors.get(distro);
      if (reacquired) return reacquired;
    }
    const executor = this.options.createExecutor?.(distro) ?? this.createDefaultExecutor();
    const entry: ExecutorEntry = {
      executor,
      active: 0,
      lastUsed: Date.now(),
      idleTimer: undefined,
    };
    this.executors.set(distro, entry);
    return entry;
  }

  private createDefaultExecutor(): WslStagingExecutor {
    const spec = wslStagingProcessSpec();
    if (spec) return createProcessStagingExecutor(spec);
    if (!this.warnedInlineFallback) {
      this.warnedInlineFallback = true;
      const message =
        "WSL staging worker bundle is unavailable; using in-process async fallback (stalled filesystem calls are not killable)";
      // The production singleton does not wire `onDebug`; never degrade silently.
      if (this.options.onDebug) this.options.onDebug(message);
      else console.warn(`[supervisor] ${message}`);
    }
    return createInlineStagingExecutor();
  }

  private async evictIdleExecutor(): Promise<void> {
    let candidate: { distro: string; entry: ExecutorEntry } | undefined;
    for (const [distro, entry] of this.executors) {
      if (entry.active > 0) continue;
      if (!candidate || entry.lastUsed < candidate.entry.lastUsed) {
        candidate = { distro, entry };
      }
    }
    if (candidate) await this.destroyExecutor(candidate.distro, candidate.entry);
  }

  private scheduleIdle(distro: string, entry: ExecutorEntry): void {
    if (this.disposed || entry.active > 0 || entry.idleTimer) return;
    entry.idleTimer = setTimeout(() => {
      entry.idleTimer = undefined;
      // Retire only the exact entry this timer was armed for: a successor
      // executor may have replaced it in the map while the timer was pending.
      if (entry.active === 0 && this.executors.get(distro) === entry) {
        void this.destroyExecutor(distro, entry);
      }
    }, this.idleTimeoutMs);
    entry.idleTimer.unref?.();
  }

  private clearIdleTimer(entry: ExecutorEntry): void {
    if (!entry.idleTimer) return;
    clearTimeout(entry.idleTimer);
    entry.idleTimer = undefined;
  }

  private destroyExecutor(distro: string, expected?: ExecutorEntry): Promise<void> {
    const pending = this.disposing.get(distro);
    if (pending) return pending;
    const entry = this.executors.get(distro);
    // Never retire an entry a later acquisition installed in its place.
    if (!entry || (expected && entry !== expected)) return Promise.resolve();
    this.executors.delete(distro);
    this.clearIdleTimer(entry);
    let settleTeardown!: () => void;
    const teardown = new Promise<void>((resolve) => {
      settleTeardown = resolve;
    });
    this.disposing.set(distro, teardown);
    void (async () => {
      try {
        await entry.executor.dispose();
      } catch {
        // Teardown is best effort.
      }
      if (this.disposing.get(distro) === teardown) this.disposing.delete(distro);
      this.options.onDebug?.("WSL staging worker released", { distro });
      settleTeardown();
    })();
    return teardown;
  }
}
