/**
 * Git subprocess admission for one supervisor execution owner (plan item B7).
 *
 * The supervisor runs as exactly one forked process per owner
 * (`SupervisorRuntime`, constructed once in `src/supervisor/index.ts`), and the
 * `./git/exec` module state is a singleton inside that process. The
 * process-default {@link gitProcessAdmission} scheduler below is therefore
 * "one scheduler per execution owner": it bounds aggregate short Git
 * subprocess starts across background polling, direct requests,
 * checkpoint/worktree callers, remote sockets and every transient `GitService`
 * instance in the process. It is process-local state: never persisted, never
 * carried over the wire, and it holds no user-facing strings.
 *
 * Operation classes are declared by subcommand, never derived from the command
 * timeout (a long timeout must not become an admission bypass):
 * - `short`: bounded reads and local plumbing — status/remote/diff/branch
 *   plumbing, `worktree list`, checkpoint `commit-tree` writes, and the WSL
 *   status batches (all current batch commands are short).
 * - `long`: clone, network (fetch/pull/push/ls-remote), hook-running
 *   commands (commit/merge/rebase/revert/cherry-pick/am), stash (merge
 *   machinery) and `worktree remove|prune`. A separate finite pool so a
 *   stalled long operation can never consume the short-read permits; the
 *   short pool cannot evict long permits either.
 *
 * Sizing (documented derivation, not an imported constant): the fixed project
 * snapshot uses seven commands, while worktree status batches grow with the
 * number of worktrees. `execGitBatchWslBridge` therefore chunks every batch at
 * the current class limit. `shortPermits: 8` admits the seven-command snapshot
 * plus one concurrent read and is at least the four-read POSIX status fanout.
 * `longPermits: 2` gives interactive headroom (a clone plus a push) while
 * staying finite.
 *
 * Invariants:
 * - Bounded both ways: active work is capped per class and the queue is
 *   capped at {@link GitProcessAdmissionPolicy.maxQueuedEntries} entries;
 *   overflow and over-age are typed refusals, not unbounded waits.
 * - Strict FIFO per class: a queued head is never bypassed by later requests,
 *   including smaller ones, and an immediate request queues behind existing
 *   waiters even when a slot is free. Head-of-line blocking for a multi-unit
 *   batch is deliberate fairness, not a leak.
 * - One entry per request, `units` weighted: a WSL batch is one queue entry
 *   that consumes `commands.length` permits, so concurrent batches cannot
 *   multiply the effective process allowance. No nested acquisition exists:
 *   every call site holds at most one ticket at a time, so waiting for units
 *   cannot deadlock against its own holders (holders always settle — every
 *   Git command has a finite execution timeout).
 * - A batch whose `units` can never fit a class limit (`units > permits`) is
 *   refused immediately instead of waiting forever.
 * - Admission wait has its own bounded deadline
 *   ({@link GitProcessAdmissionPolicy.admissionWaitTimeoutMs}), distinct from
 *   every command execution timeout. There is no age-based unlimited bypass.
 * - Refusals are typed ({@link GitProcessAdmissionError}) with string codes
 *   and carry no `stdout`/`stderr`/numeric exit code, so overload can never
 *   be re-read as a Git failure such as "not a Git repository".
 * - Cancellation ({@link AbortSignal}) releases a queued entry before spawn.
 *   After admission, local children honor the signal through `execFile`'s
 *   own abort support; the WSL bridge has no mid-call abort, so only
 *   pre-spawn cancellation applies there.
 * - Release is exactly-once and idempotent; `./git/exec` releases after the
 *   awaited command settles, which for local children is the exec
 *   callback/reap boundary and for WSL is the bridge call settling.
 * - Lowering a limit below current usage never kills active work; new
 *   admissions queue or refuse until usage drops under the new limit.
 *
 * Status probes preserve this typed error instead of translating admission
 * pressure into `isRepo: false`; actual Git-level failures retain their
 * existing non-repository fallback.
 */

import { performance } from "node:perf_hooks";
import type {
  GitProcessAdmissionClassDiagnostics,
  GitProcessAdmissionDiagnostics,
  GitProcessAdmissionEnvironment,
  GitProcessAdmissionEnvironmentUsage,
} from "@/shared/hostResourceAdmission";
import {
  GIT_ADMISSION_CANCELLED_CODE,
  GIT_ADMISSION_QUEUE_FULL_CODE,
  GIT_ADMISSION_WAIT_TIMEOUT_CODE,
  type GitProcessAdmissionRefusalCode,
} from "@/shared/gitProcessAdmission";

export {
  GIT_ADMISSION_CANCELLED_CODE,
  GIT_ADMISSION_QUEUE_FULL_CODE,
  GIT_ADMISSION_WAIT_TIMEOUT_CODE,
  type GitProcessAdmissionRefusalCode,
} from "@/shared/gitProcessAdmission";

export type GitProcessClass = "short" | "long";

export interface GitProcessAdmissionPolicy {
  /** Concurrent permit units for `short` Git processes. */
  shortPermits: number;
  /** Concurrent permit units for `long` Git processes. */
  longPermits: number;
  /** Maximum queued entries across both classes. */
  maxQueuedEntries: number;
  /** Bounded admission wait deadline; unrelated to command execution timeouts. */
  admissionWaitTimeoutMs: number;
}

/**
 * Documented defaults: see the module comment for the derivation from the
 * current batch/fanout inventory. Explicit so the numbers are auditable and
 * not inherited from another codebase's capacity guess.
 */
export const GIT_PROCESS_ADMISSION_DEFAULT_POLICY: Readonly<GitProcessAdmissionPolicy> =
  Object.freeze({
    shortPermits: 8,
    longPermits: 2,
    maxQueuedEntries: 64,
    admissionWaitTimeoutMs: 10_000,
  });

/**
 * A direct `fetch` whose admitted execution (grant→release) exceeds this span
 * is counted in `slowFetches`. Derived as a third of the 30s network command
 * timeout (`GIT_NETWORK_TIMEOUT` in `./exec`): a network fetch that has
 * consumed a third of its budget is slow enough to surface in burst
 * qualification evidence. Strictly-greater comparison, and only
 * single-command admissions carry a subcommand tag — WSL batch chunks never
 * populate it, so batch fetches are out of scope by construction.
 */
export const GIT_SLOW_FETCH_EXECUTION_MS = 10_000;

export interface GitProcessAdmissionRefusalDetails {
  gitClass: GitProcessClass;
  units: number;
  /** Effective class limit at refusal time; 0 is never produced. */
  limit: number;
  active: number;
  queued: number;
  /** Retry hint for queue-full refusals: the bounded admission deadline. */
  retryAfterMs: number;
}

/**
 * Typed admission refusal (queue overflow, admission wait timeout, or queued
 * cancellation). Deliberately shaped unlike Git command failures — no numeric
 * `code`, no `stdout`/`stderr` — so generic error handling cannot present
 * overload as a Git-level result such as "not a Git repository".
 */
export class GitProcessAdmissionError extends Error {
  readonly code: GitProcessAdmissionRefusalCode;
  readonly details: GitProcessAdmissionRefusalDetails;

  constructor(
    code: GitProcessAdmissionRefusalCode,
    details: GitProcessAdmissionRefusalDetails,
    message: string,
  ) {
    super(message);
    this.name = "GitProcessAdmissionError";
    this.code = code;
    this.details = details;
  }
}

const LONG_GIT_SUBCOMMANDS: ReadonlySet<string> = new Set([
  // Network operations.
  "clone",
  "fetch",
  "pull",
  "push",
  "ls-remote",
  // Hook-running history commands.
  "commit",
  "merge",
  "rebase",
  "revert",
  "cherry-pick",
  "am",
  // Stash pop/apply run merge machinery and can stall on conflicts.
  "stash",
]);

const LONG_GIT_WORKTREE_SUBCOMMANDS: ReadonlySet<string> = new Set(["remove", "prune"]);

function firstSubcommandToken(
  args: readonly string[],
): { token: string; next: number } | undefined {
  let index = 0;
  while (index < args.length && args[index]!.startsWith("-")) index += 1;
  if (index >= args.length) return undefined;
  return { token: args[index]!, next: index + 1 };
}

/**
 * Declared admission class for a Git argv. The subcommand decides; the
 * command timeout never does. Callers that know better can override per call
 * via `execGit`'s `admissionClass` option.
 */
export function classifyGitProcess(args: readonly string[]): GitProcessClass {
  const sub = firstSubcommandToken(args);
  if (!sub) return "short";
  if (sub.token === "worktree") {
    const action = firstSubcommandToken(args.slice(sub.next));
    return action && LONG_GIT_WORKTREE_SUBCOMMANDS.has(action.token) ? "long" : "short";
  }
  return LONG_GIT_SUBCOMMANDS.has(sub.token) ? "long" : "short";
}

/**
 * First non-option argv token (the git subcommand), shared with admit sites
 * so callers can tag a request without re-deriving the token rule.
 */
export function firstGitSubcommandToken(args: readonly string[]): string | undefined {
  return firstSubcommandToken(args)?.token;
}

/** Released admission slot. `release()` is exactly-once (idempotent no-op after). */
export interface GitProcessAdmissionTicket {
  readonly gitClass: GitProcessClass;
  readonly units: number;
  release(): void;
}

export interface GitProcessAdmitRequest {
  /** Permit units to hold at once (a WSL batch admits its command count). */
  units?: number;
  /** Abort while queued → cancelled before spawn (see module comment). */
  signal?: AbortSignal;
  /**
   * Execution environment of the child (`ProjectLocation["kind"]`). The
   * scheduler cannot infer it; admit sites in `./exec` always declare it.
   * Drives the `usage().environments` gauges.
   */
  environment?: GitProcessAdmissionEnvironment;
  /**
   * First subcommand token, when the caller knows it. Only single-command
   * admissions declare it; drives the `slowFetches` counter.
   */
  subcommand?: string;
}

export interface GitProcessAdmissionClassUsage extends GitProcessAdmissionClassDiagnostics {
  limit: number;
  active: number;
  queued: number;
  /** High-water mark of concurrent active units observed since creation/reset. */
  maxActive: number;
  queueWaitMs: number;
  maxQueueWaitMs: number;
  executionMs: number;
  maxExecutionMs: number;
}

export interface GitProcessAdmissionUsage extends GitProcessAdmissionDiagnostics {
  short: GitProcessAdmissionClassUsage;
  long: GitProcessAdmissionClassUsage;
  slowFetches: number;
  environments: Record<GitProcessAdmissionEnvironment, GitProcessAdmissionEnvironmentUsage>;
}

interface QueueEntry {
  gitClass: GitProcessClass;
  units: number;
  environment: GitProcessAdmissionEnvironment | undefined;
  subcommand: string | undefined;
  /** Monotonic timestamp taken when the entry was enqueued. */
  enqueuedAt: number;
  signal: AbortSignal | undefined;
  onAbort: (() => void) | undefined;
  timer: ReturnType<typeof setTimeout>;
  settle: (ticket: GitProcessAdmissionTicket) => void;
  fail: (error: GitProcessAdmissionError) => void;
}

interface ClassPool {
  limit: number;
  active: number;
  maxActive: number;
  queueWaitMs: number;
  maxQueueWaitMs: number;
  executionMs: number;
  maxExecutionMs: number;
  queue: QueueEntry[];
}

function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/** Monotonic default clock for the timing split; injectable for deterministic tests. */
const defaultSchedulerNow = (): number => performance.now();

function emptyEnvironmentUsage(): Record<
  GitProcessAdmissionEnvironment,
  GitProcessAdmissionEnvironmentUsage
> {
  return {
    posix: { active: 0, queued: 0 },
    windows: { active: 0, queued: 0 },
    wsl: { active: 0, queued: 0 },
  };
}

/**
 * FIFO, queueing, bounded Git process admission. One instance per execution
 * owner; the process-default instance is exposed by this module. Not thread
 * safe, by construction: all supervisors live on one event loop.
 */
export class GitProcessAdmissionScheduler {
  private policy: GitProcessAdmissionPolicy;
  private readonly pools: Record<GitProcessClass, ClassPool>;
  private counts: Pick<
    GitProcessAdmissionUsage,
    "admitted" | "queueFullRefusals" | "waitTimeoutRefusals" | "cancellations" | "slowFetches"
  >;
  private environments: Record<GitProcessAdmissionEnvironment, GitProcessAdmissionEnvironmentUsage>;
  private now: () => number;
  private generation = 0;

  constructor(
    policy: GitProcessAdmissionPolicy = GIT_PROCESS_ADMISSION_DEFAULT_POLICY,
    options?: { now?: () => number },
  ) {
    this.policy = { ...policy };
    this.now = options?.now ?? defaultSchedulerNow;
    this.pools = {
      short: {
        limit: this.policy.shortPermits,
        active: 0,
        maxActive: 0,
        queueWaitMs: 0,
        maxQueueWaitMs: 0,
        executionMs: 0,
        maxExecutionMs: 0,
        queue: [],
      },
      long: {
        limit: this.policy.longPermits,
        active: 0,
        maxActive: 0,
        queueWaitMs: 0,
        maxQueueWaitMs: 0,
        executionMs: 0,
        maxExecutionMs: 0,
        queue: [],
      },
    };
    this.environments = emptyEnvironmentUsage();
    this.counts = {
      admitted: 0,
      queueFullRefusals: 0,
      waitTimeoutRefusals: 0,
      cancellations: 0,
      slowFetches: 0,
    };
  }

  /**
   * Process-local test hook for the timing split: replaces the monotonic
   * clock, or restores the default when omitted.
   */
  setClockForTests(now?: () => number): void {
    this.now = now ?? defaultSchedulerNow;
  }

  /**
   * Process-local configuration hook for tests and future metrics. Lowering a
   * limit below current usage never interrupts active work; queued heads are
   * pumped under the new limit immediately.
   */
  configure(patch: Partial<GitProcessAdmissionPolicy>): void {
    const next = { ...this.policy, ...patch };
    if (
      !isPositiveInt(next.shortPermits) ||
      !isPositiveInt(next.longPermits) ||
      !isPositiveInt(next.maxQueuedEntries) ||
      !isPositiveInt(next.admissionWaitTimeoutMs)
    ) {
      throw new TypeError("Git process admission policy values must be positive integers.");
    }
    this.policy = next;
    this.pools.short.limit = next.shortPermits;
    this.pools.long.limit = next.longPermits;
    this.pump("short");
    this.pump("long");
  }

  /**
   * Admit `units` permit units of one Git process class. Resolves with a
   * ticket whose single `release()` returns the units; rejects with
   * {@link GitProcessAdmissionError} for queue overflow, admission wait
   * timeout, or queued cancellation — never for Git-level failures.
   */
  async admit(
    gitClass: GitProcessClass,
    request?: GitProcessAdmitRequest,
  ): Promise<GitProcessAdmissionTicket> {
    const units = request?.units ?? 1;
    if (!isPositiveInt(units)) {
      throw new TypeError("Git process admission units must be a positive integer.");
    }
    if (request?.signal?.aborted) {
      this.counts.cancellations += 1;
      throw this.cancelled(gitClass, units);
    }
    const pool = this.pools[gitClass];
    if (units > pool.limit) {
      // Unsatisfiable by construction; refuse instead of waiting forever.
      this.counts.queueFullRefusals += 1;
      throw this.refusal(GIT_ADMISSION_QUEUE_FULL_CODE, gitClass, units);
    }
    const environment = request?.environment;
    const subcommand = request?.subcommand;
    if (pool.queue.length === 0 && pool.active + units <= pool.limit) {
      return this.grant(gitClass, units, { environment, subcommand });
    }
    if (this.queuedEntryCount() >= this.policy.maxQueuedEntries) {
      this.counts.queueFullRefusals += 1;
      throw this.refusal(GIT_ADMISSION_QUEUE_FULL_CODE, gitClass, units);
    }
    return await new Promise<GitProcessAdmissionTicket>((settle, fail) => {
      const entry: QueueEntry = {
        gitClass,
        units,
        environment,
        subcommand,
        enqueuedAt: this.now(),
        signal: request?.signal,
        onAbort: undefined,
        timer: setTimeout(() => {
          this.removeQueued(gitClass, entry);
          this.pump(gitClass);
          this.counts.waitTimeoutRefusals += 1;
          fail(this.refusal(GIT_ADMISSION_WAIT_TIMEOUT_CODE, gitClass, units));
        }, this.policy.admissionWaitTimeoutMs),
        settle,
        fail,
      };
      if (request?.signal) {
        const signal = request.signal;
        entry.onAbort = () => {
          this.removeQueued(gitClass, entry);
          this.pump(gitClass);
          this.counts.cancellations += 1;
          fail(this.cancelled(gitClass, units));
        };
        signal.addEventListener("abort", entry.onAbort, { once: true });
      }
      // Enqueue before any capacity re-check so a synchronous release in
      // between cannot strand this entry.
      pool.queue.push(entry);
      if (environment) this.environments[environment].queued += units;
      // A configure() between our limit read and now may have freed room; the
      // strict-FIFO pump only admits this entry when it is the head and fits.
      this.pump(gitClass);
    });
  }

  usage(): GitProcessAdmissionUsage {
    return {
      short: this.classUsage("short"),
      long: this.classUsage("long"),
      ...this.counts,
      environments: {
        posix: { ...this.environments.posix },
        windows: { ...this.environments.windows },
        wsl: { ...this.environments.wsl },
      },
    };
  }

  /** Process-local test reset: drops pending waiters (rejected as cancelled). */
  resetForTests(): void {
    this.generation += 1;
    for (const gitClass of ["short", "long"] as const) {
      const pool = this.pools[gitClass];
      for (const entry of pool.queue.splice(0)) {
        clearTimeout(entry.timer);
        this.detachSignal(entry);
        this.counts.cancellations += 1;
        entry.fail(this.cancelled(gitClass, entry.units));
      }
      pool.active = 0;
      pool.maxActive = 0;
      pool.queueWaitMs = 0;
      pool.maxQueueWaitMs = 0;
      pool.executionMs = 0;
      pool.maxExecutionMs = 0;
    }
    this.environments = emptyEnvironmentUsage();
    this.counts = {
      admitted: 0,
      queueFullRefusals: 0,
      waitTimeoutRefusals: 0,
      cancellations: 0,
      slowFetches: 0,
    };
  }

  private grant(
    gitClass: GitProcessClass,
    units: number,
    context?: {
      environment: GitProcessAdmissionEnvironment | undefined;
      subcommand: string | undefined;
      enqueuedAt?: number;
    },
  ): GitProcessAdmissionTicket {
    const pool = this.pools[gitClass];
    const queueWaitMs =
      context?.enqueuedAt === undefined ? 0 : Math.max(0, this.now() - context.enqueuedAt);
    pool.queueWaitMs += queueWaitMs;
    pool.maxQueueWaitMs = Math.max(pool.maxQueueWaitMs, queueWaitMs);
    pool.active += units;
    pool.maxActive = Math.max(pool.maxActive, pool.active);
    this.counts.admitted += 1;
    const environment = context?.environment;
    if (environment) {
      // Only pumped entries were counted as queued; immediate grants were
      // never enqueued, so their environment gauge never carried them.
      if (context?.enqueuedAt !== undefined) this.environments[environment].queued -= units;
      this.environments[environment].active += units;
    }
    const subcommand = context?.subcommand;
    const grantedAt = this.now();
    let released = false;
    const generation = this.generation;
    return {
      gitClass,
      units,
      release: () => {
        if (released) return;
        released = true;
        if (generation !== this.generation) return;
        pool.active -= units;
        if (environment) this.environments[environment].active -= units;
        const executionMs = Math.max(0, this.now() - grantedAt);
        pool.executionMs += executionMs;
        pool.maxExecutionMs = Math.max(pool.maxExecutionMs, executionMs);
        if (subcommand === "fetch" && executionMs > GIT_SLOW_FETCH_EXECUTION_MS) {
          this.counts.slowFetches += 1;
        }
        this.pump(gitClass);
      },
    };
  }

  /**
   * Strict FIFO: only the head is considered, and a head whose units do not
   * fit blocks everything behind it. Smaller later requests never overtake.
   */
  private pump(gitClass: GitProcessClass): void {
    const pool = this.pools[gitClass];
    while (pool.queue.length > 0 && pool.queue[0]!.units <= pool.limit - pool.active) {
      const head = pool.queue.shift()!;
      clearTimeout(head.timer);
      this.detachSignal(head);
      head.settle(
        this.grant(head.gitClass, head.units, {
          environment: head.environment,
          subcommand: head.subcommand,
          enqueuedAt: head.enqueuedAt,
        }),
      );
    }
  }

  private removeQueued(gitClass: GitProcessClass, entry: QueueEntry): void {
    const pool = this.pools[gitClass];
    const index = pool.queue.indexOf(entry);
    if (index >= 0) {
      pool.queue.splice(index, 1);
      if (entry.environment) this.environments[entry.environment].queued -= entry.units;
    }
    clearTimeout(entry.timer);
    this.detachSignal(entry);
  }

  private detachSignal(entry: QueueEntry): void {
    if (entry.signal && entry.onAbort) {
      entry.signal.removeEventListener("abort", entry.onAbort);
      entry.onAbort = undefined;
    }
  }

  private classUsage(gitClass: GitProcessClass): GitProcessAdmissionClassUsage {
    const pool = this.pools[gitClass];
    return {
      limit: pool.limit,
      active: pool.active,
      queued: pool.queue.length,
      maxActive: pool.maxActive,
      queueWaitMs: pool.queueWaitMs,
      maxQueueWaitMs: pool.maxQueueWaitMs,
      executionMs: pool.executionMs,
      maxExecutionMs: pool.maxExecutionMs,
    };
  }

  private queuedEntryCount(): number {
    return this.pools.short.queue.length + this.pools.long.queue.length;
  }

  private refusal(
    code: typeof GIT_ADMISSION_QUEUE_FULL_CODE | typeof GIT_ADMISSION_WAIT_TIMEOUT_CODE,
    gitClass: GitProcessClass,
    units: number,
  ): GitProcessAdmissionError {
    const pool = this.pools[gitClass];
    const details: GitProcessAdmissionRefusalDetails = {
      gitClass,
      units,
      limit: pool.limit,
      active: pool.active,
      queued: pool.queue.length,
      retryAfterMs: this.policy.admissionWaitTimeoutMs,
    };
    const reason =
      code === GIT_ADMISSION_QUEUE_FULL_CODE
        ? `Git ${gitClass} admission queue is full or the request can never fit`
        : `Git ${gitClass} admission wait exceeded the ${this.policy.admissionWaitTimeoutMs}ms deadline`;
    return new GitProcessAdmissionError(
      code,
      details,
      `${reason} (class ${gitClass}, units ${units}, limit ${pool.limit}, active ${pool.active}, queued ${pool.queue.length}).`,
    );
  }

  private cancelled(gitClass: GitProcessClass, units: number): GitProcessAdmissionError {
    const pool = this.pools[gitClass];
    return new GitProcessAdmissionError(
      GIT_ADMISSION_CANCELLED_CODE,
      {
        gitClass,
        units,
        limit: pool.limit,
        active: pool.active,
        queued: pool.queue.length,
        retryAfterMs: this.policy.admissionWaitTimeoutMs,
      },
      `Git ${gitClass} admission was cancelled before spawn (units ${units}).`,
    );
  }
}

/**
 * The per-owner scheduler: one per supervisor process, shared by every Git
 * service in it. Tests can reset or reconfigure it process-locally; nothing
 * here is persisted, exposed over IPC, or user-facing.
 */
const processGitProcessAdmission = new GitProcessAdmissionScheduler();

export function admitGitProcess(
  gitClass: GitProcessClass,
  request?: GitProcessAdmitRequest,
): Promise<GitProcessAdmissionTicket> {
  return processGitProcessAdmission.admit(gitClass, request);
}

export function gitProcessAdmissionUsage(): GitProcessAdmissionUsage {
  return processGitProcessAdmission.usage();
}

export function configureGitProcessAdmission(patch: Partial<GitProcessAdmissionPolicy>): void {
  processGitProcessAdmission.configure(patch);
}

export function resetGitProcessAdmissionForTests(): void {
  processGitProcessAdmission.resetForTests();
}

/**
 * Process-local test hook for the timing split: installs a deterministic
 * clock on the singleton, or restores the default monotonic clock when
 * omitted. Only the process-default instance is affected.
 */
export function setGitProcessAdmissionClockForTests(now?: () => number): void {
  processGitProcessAdmission.setClockForTests(now);
}

export function isGitProcessAdmissionError(error: unknown): error is GitProcessAdmissionError {
  return error instanceof GitProcessAdmissionError;
}

/** Direct scheduler access for tests that need an isolated instance. */
export function createGitProcessAdmissionScheduler(
  policy?: Partial<GitProcessAdmissionPolicy>,
  options?: { now?: () => number },
): GitProcessAdmissionScheduler {
  return new GitProcessAdmissionScheduler(
    { ...GIT_PROCESS_ADMISSION_DEFAULT_POLICY, ...policy },
    options,
  );
}
