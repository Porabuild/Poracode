import { matchEnvironmentProxyPath } from "@/shared/environments";
import { RemoteClientError } from "./clientErrors";

export type RemoteRequestPriority = "control" | "interactive" | "background";

export interface RemoteRequestSchedulerLimits {
  readonly maxTotal: number;
  readonly maxBulk: number;
  readonly maxBackground: number;
}

export interface RemoteRequestSchedulerOptions {
  readonly limits?: Partial<RemoteRequestSchedulerLimits>;
  readonly now?: () => number;
}

export interface RemoteRequestLease {
  release(): void;
}

export const DEFAULT_REMOTE_REQUEST_SCHEDULER_LIMITS: RemoteRequestSchedulerLimits = {
  maxTotal: 48,
  maxBulk: 40,
  maxBackground: 14,
};

const ADAPTIVE_BULK_FLOOR = 16;
const ADAPTIVE_BACKGROUND_FLOOR = 6;
const ADAPTIVE_RECOVERY_SUCCESSES = 8;

export const DEFAULT_REMOTE_OVERLOAD_MAX_RETRIES = 3;
const DEFAULT_OVERLOAD_BACKOFF_MS = [200, 500, 1_200] as const;
const MIN_OVERLOAD_DELAY_MS = 150;
const MAX_OVERLOAD_DELAY_MS = 5_000;
const MAX_BACKGROUND_PAUSE_MS = 2_000;

const CONTROL_THREAD_SUFFIXES: ReadonlySet<string> = new Set([
  "/interrupt",
  "/close",
  "/terminal/close",
  "/requests/resolve",
]);

const BACKGROUND_REMOTE_PROCEDURES: ReadonlySet<string> = new Set([
  "getGitStatus",
  "gitListBranches",
  "gitListWorktrees",
  "gitProjectSnapshot",
  "gitWorktreeStatusBatch",
  "gitGetWorktreeSourceBranch",
  "gitWorktreeSourceBranchBatch",
  "gitGetWorktreeOwner",
  "ghCheckAvailable",
  "ghGetPrForBranch",
  "ghPollPullRequests",
  "ghListPrs",
  "gitFetch",
  "gitWatchProject",
  "gitWatchWorktrees",
  "gitUnwatchProject",
  "workflowGetRun",
  "getProviderUsage",
  "resolveLinkMetadata",
  "getLatestAgentVersion",
  "resolveAgentAccount",
]);

const RETRYABLE_429_ADMISSION_CODES: ReadonlySet<string> = new Set([
  "overloaded",
  "principal_busy",
  "settings_overloaded",
]);

function normalizePathname(rawPath: string): string {
  const proxyMatch = matchEnvironmentProxyPath(rawPath);
  const candidate = proxyMatch?.kind === "match" ? proxyMatch.rawChildPath : rawPath;
  try {
    return new URL(candidate, "http://poracode.invalid").pathname;
  } catch {
    const queryIndex = candidate.indexOf("?");
    return queryIndex >= 0 ? candidate.slice(0, queryIndex) : candidate;
  }
}

function isControlThreadPath(pathname: string): boolean {
  if (!pathname.startsWith("/api/threads/")) return false;
  for (const suffix of CONTROL_THREAD_SUFFIXES) {
    if (!pathname.endsWith(suffix)) continue;
    const rawId = pathname.slice("/api/threads/".length, pathname.length - suffix.length);
    if (rawId && !rawId.includes("/")) return true;
  }
  return false;
}

export function classifyRemoteRequestPriority(
  method: string,
  path: string,
  body?: unknown,
): RemoteRequestPriority {
  const normalizedMethod = method.toUpperCase();
  const pathname = normalizePathname(path);

  if (normalizedMethod === "POST") {
    if (
      isControlThreadPath(pathname) ||
      pathname === "/oauth/token" ||
      pathname === "/api/auth/refresh" ||
      pathname === "/api/auth/websocket-ticket"
    ) {
      return "control";
    }
    if (pathname === "/api/git/call" && body && typeof body === "object") {
      const procedure = (body as { procedure?: unknown }).procedure;
      if (typeof procedure === "string" && BACKGROUND_REMOTE_PROCEDURES.has(procedure)) {
        return "background";
      }
      return "interactive";
    }
    if (
      pathname === "/api/files/image-ticket" ||
      pathname === "/api/profile/core-stats" ||
      pathname === "/api/profile/token-stats"
    ) {
      return "background";
    }
    return "interactive";
  }

  if (
    pathname === "/api/files/image" ||
    pathname === "/api/files/media" ||
    pathname === "/api/host/update" ||
    (pathname.startsWith("/api/agents/") && pathname.endsWith("/slash-commands"))
  ) {
    return "background";
  }

  return "interactive";
}

export function originKeyForEndpoint(endpoint: string): string {
  try {
    return new URL(endpoint).origin;
  } catch {
    return endpoint;
  }
}

export function isRetryableRemoteAdmissionError(error: unknown): error is RemoteClientError {
  if (!(error instanceof RemoteClientError)) return false;
  if (error.status === 429 && RETRYABLE_429_ADMISSION_CODES.has(error.code)) return true;
  return error.status === 503 && error.code === "host_busy";
}

export function parseRetryAfterMs(
  headerValue: string | null,
  nowMs = Date.now(),
): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (!trimmed) return undefined;
  if (/^\d+$/u.test(trimmed)) {
    const seconds = Number(trimmed);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - nowMs);
  }
  return undefined;
}

export function computeOverloadRetryDelayMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined && Number.isFinite(retryAfterMs)) {
    return Math.min(Math.max(retryAfterMs, MIN_OVERLOAD_DELAY_MS), MAX_OVERLOAD_DELAY_MS);
  }
  return (
    DEFAULT_OVERLOAD_BACKOFF_MS[Math.min(attempt, DEFAULT_OVERLOAD_BACKOFF_MS.length - 1)] ??
    DEFAULT_OVERLOAD_BACKOFF_MS[2]
  );
}

interface QueuedWaiter {
  readonly priority: RemoteRequestPriority;
  readonly resolve: (lease: RemoteRequestLease) => void;
  readonly reject: (error: unknown) => void;
  readonly cleanup: () => void;
  settled: boolean;
}

interface OriginBucket {
  activeControl: number;
  activeInteractive: number;
  activeBackground: number;
  effectiveMaxBulk: number;
  effectiveMaxBackground: number;
  successesSinceThrottle: number;
  backgroundPausedUntil: number;
  resumeTimer: ReturnType<typeof setTimeout> | null;
  readonly queues: Record<RemoteRequestPriority, QueuedWaiter[]>;
}

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    (timer as { unref?: () => void }).unref?.();
  }
}

function createAbortError(signal?: AbortSignal): DOMException {
  if (signal?.reason instanceof DOMException) return signal.reason;
  return new DOMException("The remote request was cancelled.", "AbortError");
}

export class RemoteRequestScheduler {
  readonly limits: RemoteRequestSchedulerLimits;
  private readonly now: () => number;
  private readonly buckets = new Map<string, OriginBucket>();

  constructor(options: RemoteRequestSchedulerOptions = {}) {
    const maxTotal = Math.max(
      1,
      Math.floor(options.limits?.maxTotal ?? DEFAULT_REMOTE_REQUEST_SCHEDULER_LIMITS.maxTotal),
    );
    const maxBulk = Math.max(
      1,
      Math.min(
        maxTotal,
        Math.floor(options.limits?.maxBulk ?? DEFAULT_REMOTE_REQUEST_SCHEDULER_LIMITS.maxBulk),
      ),
    );
    const maxBackground = Math.max(
      1,
      Math.min(
        maxBulk,
        Math.floor(
          options.limits?.maxBackground ?? DEFAULT_REMOTE_REQUEST_SCHEDULER_LIMITS.maxBackground,
        ),
      ),
    );
    this.limits = { maxTotal, maxBulk, maxBackground };
    this.now = options.now ?? (() => Date.now());
  }

  tryAcquire(origin: string, priority: RemoteRequestPriority): RemoteRequestLease | null {
    const bucket = this.bucketFor(origin);
    if (this.canAdmitImmediately(bucket, priority)) {
      return this.grantLease(origin, bucket, priority);
    }
    this.pruneBucketIfIdle(origin, bucket);
    return null;
  }

  acquire(
    origin: string,
    priority: RemoteRequestPriority,
    signal?: AbortSignal,
  ): Promise<RemoteRequestLease> {
    if (signal?.aborted) {
      return Promise.reject(createAbortError(signal));
    }
    const immediate = this.tryAcquire(origin, priority);
    if (immediate) {
      return Promise.resolve(immediate);
    }
    const bucket = this.bucketFor(origin);
    return new Promise<RemoteRequestLease>((resolve, reject) => {
      const queue = bucket.queues[priority];
      const onAbort = () => {
        if (waiter.settled) return;
        waiter.settled = true;
        const index = queue.indexOf(waiter);
        if (index >= 0) queue.splice(index, 1);
        this.pruneBucketIfIdle(origin, bucket);
        reject(createAbortError(signal));
      };
      const waiter: QueuedWaiter = {
        priority,
        resolve,
        reject,
        cleanup: () => {
          signal?.removeEventListener("abort", onAbort);
        },
        settled: false,
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      queue.push(waiter);
      if (priority === "background") {
        this.scheduleBackgroundResume(origin, bucket);
      }
    });
  }

  noteOverload(origin: string, pauseMs = MIN_OVERLOAD_DELAY_MS): void {
    const bucket = this.bucketFor(origin);
    const clamped = Math.min(Math.max(pauseMs, MIN_OVERLOAD_DELAY_MS), MAX_BACKGROUND_PAUSE_MS);
    const until = this.now() + clamped;
    if (until > bucket.backgroundPausedUntil) {
      bucket.backgroundPausedUntil = until;
    }
    // AIMD multiplicative decrease so clients automatically converge below an
    // older or busier host's concurrency ceiling.
    const bulkFloor = Math.min(this.limits.maxBulk, ADAPTIVE_BULK_FLOOR);
    const bgFloor = Math.min(this.limits.maxBackground, ADAPTIVE_BACKGROUND_FLOOR);
    bucket.effectiveMaxBulk = Math.max(bulkFloor, Math.floor(bucket.effectiveMaxBulk / 2));
    bucket.effectiveMaxBackground = Math.max(
      bgFloor,
      Math.floor(bucket.effectiveMaxBackground / 2),
    );
    bucket.successesSinceThrottle = 0;
    this.scheduleBackgroundResume(origin, bucket);
  }

  stats(origin: string): {
    readonly activeControl: number;
    readonly activeInteractive: number;
    readonly activeBackground: number;
    readonly queuedControl: number;
    readonly queuedInteractive: number;
    readonly queuedBackground: number;
  } {
    const bucket = this.buckets.get(origin);
    if (!bucket) {
      return {
        activeControl: 0,
        activeInteractive: 0,
        activeBackground: 0,
        queuedControl: 0,
        queuedInteractive: 0,
        queuedBackground: 0,
      };
    }
    return {
      activeControl: bucket.activeControl,
      activeInteractive: bucket.activeInteractive,
      activeBackground: bucket.activeBackground,
      queuedControl: bucket.queues.control.length,
      queuedInteractive: bucket.queues.interactive.length,
      queuedBackground: bucket.queues.background.length,
    };
  }

  reset(): void {
    for (const bucket of this.buckets.values()) {
      if (bucket.resumeTimer !== null) {
        clearTimeout(bucket.resumeTimer);
        bucket.resumeTimer = null;
      }
      for (const priority of ["control", "interactive", "background"] as const) {
        for (const waiter of bucket.queues[priority].splice(0)) {
          if (waiter.settled) continue;
          waiter.settled = true;
          waiter.cleanup();
          waiter.reject(createAbortError());
        }
      }
    }
    this.buckets.clear();
  }

  private bucketFor(origin: string): OriginBucket {
    let bucket = this.buckets.get(origin);
    if (!bucket) {
      bucket = {
        activeControl: 0,
        activeInteractive: 0,
        activeBackground: 0,
        effectiveMaxBulk: this.limits.maxBulk,
        effectiveMaxBackground: this.limits.maxBackground,
        successesSinceThrottle: 0,
        backgroundPausedUntil: 0,
        resumeTimer: null,
        queues: { control: [], interactive: [], background: [] },
      };
      this.buckets.set(origin, bucket);
    }
    return bucket;
  }

  private activeTotal(bucket: OriginBucket): number {
    return bucket.activeControl + bucket.activeInteractive + bucket.activeBackground;
  }

  private activeBulk(bucket: OriginBucket): number {
    return bucket.activeInteractive + bucket.activeBackground;
  }

  private canAdmit(bucket: OriginBucket, priority: RemoteRequestPriority): boolean {
    if (this.activeTotal(bucket) >= this.limits.maxTotal) return false;
    if (priority === "control") return true;
    if (this.activeBulk(bucket) >= bucket.effectiveMaxBulk) return false;
    if (priority === "interactive") return true;
    if (bucket.activeBackground >= bucket.effectiveMaxBackground) return false;
    return bucket.backgroundPausedUntil <= this.now();
  }

  private canAdmitImmediately(bucket: OriginBucket, priority: RemoteRequestPriority): boolean {
    if (!this.canAdmit(bucket, priority)) return false;
    if (bucket.queues[priority].length > 0) return false;
    if (priority === "interactive" && bucket.queues.control.length > 0) return false;
    if (
      priority === "background" &&
      (bucket.queues.control.length > 0 || bucket.queues.interactive.length > 0)
    ) {
      return false;
    }
    return true;
  }

  private grantLease(
    origin: string,
    bucket: OriginBucket,
    priority: RemoteRequestPriority,
  ): RemoteRequestLease {
    if (priority === "control") bucket.activeControl += 1;
    else if (priority === "interactive") bucket.activeInteractive += 1;
    else bucket.activeBackground += 1;

    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        if (priority === "control") bucket.activeControl = Math.max(0, bucket.activeControl - 1);
        else if (priority === "interactive") {
          bucket.activeInteractive = Math.max(0, bucket.activeInteractive - 1);
        } else {
          bucket.activeBackground = Math.max(0, bucket.activeBackground - 1);
        }
        if (
          bucket.backgroundPausedUntil <= this.now() &&
          (bucket.effectiveMaxBulk < this.limits.maxBulk ||
            bucket.effectiveMaxBackground < this.limits.maxBackground)
        ) {
          bucket.successesSinceThrottle += 1;
          if (bucket.successesSinceThrottle >= ADAPTIVE_RECOVERY_SUCCESSES) {
            bucket.successesSinceThrottle = 0;
            bucket.effectiveMaxBulk = Math.min(this.limits.maxBulk, bucket.effectiveMaxBulk + 2);
            bucket.effectiveMaxBackground = Math.min(
              this.limits.maxBackground,
              bucket.effectiveMaxBackground + 1,
            );
          }
        }
        this.drain(origin, bucket);
      },
    };
  }

  private drain(origin: string, bucket: OriginBucket): void {
    for (;;) {
      const next = this.shiftAdmissibleWaiter(bucket);
      if (!next) break;
      next.settled = true;
      next.cleanup();
      next.resolve(this.grantLease(origin, bucket, next.priority));
    }
    this.scheduleBackgroundResume(origin, bucket);
    this.pruneBucketIfIdle(origin, bucket);
  }

  private shiftAdmissibleWaiter(bucket: OriginBucket): QueuedWaiter | undefined {
    for (const priority of ["control", "interactive", "background"] as const) {
      const queue = bucket.queues[priority];
      if (queue.length === 0) continue;
      if (!this.canAdmit(bucket, priority)) continue;
      while (queue.length > 0) {
        const candidate = queue.shift()!;
        if (!candidate.settled) return candidate;
      }
    }
    return undefined;
  }

  private scheduleBackgroundResume(origin: string, bucket: OriginBucket): void {
    const remaining = bucket.backgroundPausedUntil - this.now();
    if (remaining <= 0) {
      if (bucket.resumeTimer !== null) {
        clearTimeout(bucket.resumeTimer);
        bucket.resumeTimer = null;
      }
      return;
    }
    if (bucket.queues.background.length === 0) return;
    if (bucket.resumeTimer !== null) return;
    const timer = setTimeout(() => {
      bucket.resumeTimer = null;
      this.drain(origin, bucket);
    }, remaining);
    unrefTimer(timer);
    bucket.resumeTimer = timer;
  }

  private pruneBucketIfIdle(origin: string, bucket: OriginBucket): void {
    if (
      this.activeTotal(bucket) === 0 &&
      bucket.queues.control.length === 0 &&
      bucket.queues.interactive.length === 0 &&
      bucket.queues.background.length === 0 &&
      bucket.resumeTimer === null &&
      bucket.backgroundPausedUntil <= this.now()
    ) {
      this.buckets.delete(origin);
    }
  }
}

const defaultScheduler = new RemoteRequestScheduler();

export function defaultRemoteRequestScheduler(): RemoteRequestScheduler {
  return defaultScheduler;
}

export function __resetDefaultRemoteRequestSchedulerForTest(): void {
  defaultScheduler.reset();
}
