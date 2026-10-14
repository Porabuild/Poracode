import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, renameSync } from "node:fs";
import type { Dir, Dirent } from "node:fs";
import { opendir, rm } from "node:fs/promises";
import { join } from "node:path";
import { getThreadAttachmentDirName } from "./attachmentStorage";
import {
  attachmentDirNameAliases,
  isPersistedStagingAttachmentDirName,
  isSafeAttachmentDirName,
} from "./attachmentDirPolicy";

/**
 * Owner-scoped reclamation of deleted threads' attachment directories.
 *
 * One service instance per host process owns one attachments root (the
 * composition supplies the canonical paths and the id-only live-thread read).
 * The DB layer announces committed deletions through
 * `onThreadsDeleted`; this service queues the ids and — always on a later
 * macrotask, never inside the caller's DB turn — processes them in batches,
 * rechecking the CURRENT live rows per batch, detaching each confirmed-unowned
 * directory with an atomic rename into a private trash area, and removing the
 * detached trees asynchronously with bounded concurrency.
 *
 * Safety properties (the reason for this shape):
 * - **Rollback-safe**: a notification can outlive its own transaction (an
 *   outer transaction may roll the delete back), so the live-row recheck at
 *   drain time — not the notification — decides. A re-upserted id wins the
 *   same way.
 * - **No await across check+detach**: within one batch the ownership read and
 *   the renames are one synchronous region, so a same-turn writer cannot
 *   interleave. Between batches the loop yields and re-reads live rows, and
 *   the backlog scan streams the root with `opendir` instead of materializing
 *   it, so neither pass ever holds a stale snapshot across an await.
 * - **Detachment precedes deletion**: only the trash copy is ever removed, so
 *   a write that recreates the original namespace after detachment (an
 *   upload for a just-deleted id) can never be destroyed by the async
 *   removal; it becomes an ordinary backlog orphan for the next startup scan.
 * - **Bounded work**: batches of 64 with a macrotask yield between them, at
 *   most two concurrent removals, and a capped removal queue — when the queue
 *   is full, producers wait with their candidates still in place, then resume
 *   against fresh ownership when capacity becomes available.
 * - **Conservative retention**: directory names are compared through
 *   case/normalization/Windows-trailing alias forms, staging-prefixed entries
 *   (`draft-`/`remote-`/`handoff-`/`picker-`) are always kept, and unknown
 *   non-directory root entries are left untouched — so a surviving thread's
 *   files, including 12-char truncated and alias-colliding names, are never
 *   erased when a neighbor is reclaimed.
 * - **No TTLs**: nothing is deleted because of its age; only the committed
 *   absence of its owning row reclaims a directory.
 * - **Failures are isolated and retryable**: every error is reported, never
 *   thrown to the SQL caller or out of a drain turn; a directory that could
 *   not be detached stays in place and the startup backlog scan retries; a
 *   missing attachments root is the expected fresh-host shape, not an error;
 *   trash leftovers are swept on the next startup.
 */

/** Private trash area inside the attachments root. Same volume, so the
 * detach rename never crosses a filesystem. The name is longer than the
 * 12-character cap on upload directory names, so no writer can ever create a
 * colliding entry. Contents are disposable derived state: every entry was
 * already detached from its original namespace when it was written, so a
 * stale trash from a crashed run is swept wholesale at the next startup. */
export const RECLAIM_TRASH_DIR_NAME = ".reclaim-trash-v1";

/** Concurrent detached-tree removals. Bounded so a large tree cannot hog the
 * event loop's I/O and shutdown joins stay prompt. */
const REMOVAL_CONCURRENCY = 2;

/** Startup backlog scan: entries detached per batch, then the loop yields. */
const SCAN_BATCH_SIZE = 64;

/** Deleted-thread ids reclaimed per synchronous drain region, then the loop
 * yields and re-reads the CURRENT live rows for the next batch. */
const DRAIN_BATCH_SIZE = 64;

/** Cap on queued plus active removals. Producers wait before further detaches. */
export const REMOVAL_QUEUE_LIMIT = 128;

/** Delay before the startup backlog scan; keeps it off the boot-critical path. */
const STARTUP_SCAN_DELAY_MS = 1_000;

/** Drain retries for a transient live-row read failure before the remaining
 * ids are dropped (the startup backlog scan remains the retry path). */
const DRAIN_MAX_CONSECUTIVE_FAILURES = 2;
const DRAIN_RETRY_DELAY_MS = 5_000;

function isExpectedEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

/** One later-macrotask step, so a bounded batch loop cannot monopolize the
 * event loop while still letting synchronous timers/IO callbacks interleave. */
function yieldToMacrotask(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

export interface AttachmentReclaimServiceOptions {
  /** The attachments root this service exclusively owns. */
  attachmentsDir: string;
  /**
   * Id-only live-thread read. Re-queried at every drain batch and every scan
   * batch — never cached across an await — so the answer is always the
   * CURRENT committed ownership, including after an outer rollback.
   */
  listLiveThreadIds(): readonly string[];
  reportError?(error: unknown): void;
  /** Test seam: the removal implementation for detached trash entries. */
  removeDetached?(path: string): Promise<void>;
  /** Test seam: startup scan delay override (default 1s off the boot path). */
  startupScanDelayMs?: number;
}

export class AttachmentReclaimService {
  private readonly pendingIds = new Set<string>();
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly removalQueue: string[] = [];
  /** Queued/in-flight targets only, shared by deletion and startup producers. */
  private readonly removalTargets = new Set<string>();
  private readonly capacityWaiters = new Set<() => void>();
  private activeRemovals = 0;
  private removalsSettled: (() => void) | null = null;
  private drainFailures = 0;
  private disposed = false;
  /** Shared disposal: every dispose caller gets this one promise instance. */
  private disposal: Promise<void> | null = null;
  /** True while a drain turn is running; a running loop picks up newly
   * notified ids itself, so no second drain is ever started concurrently. */
  private drainActive = false;
  /** In-flight async work, joined by dispose. */
  private drainRun: Promise<void> | null = null;
  private scanRun: Promise<void> | null = null;

  constructor(private readonly options: AttachmentReclaimServiceOptions) {}

  /** Schedule the one-per-process startup backlog scan (and trash sweep). */
  start(): void {
    if (this.disposed || this.scanTimer || this.scanRun) return;
    this.scanTimer = setTimeout(() => {
      this.scanTimer = null;
      this.scanRun = this.runBacklogScan().finally(() => {
        this.scanRun = null;
      });
    }, this.options.startupScanDelayMs ?? STARTUP_SCAN_DELAY_MS);
    this.scanTimer.unref?.();
  }

  /**
   * Seam entry: queue committed deleted-thread ids for reclamation. Never
   * touches the filesystem on the caller's turn and never throws.
   */
  notifyDeletedThreadIds(threadIds: readonly string[]): void {
    if (this.disposed) return;
    let added = false;
    for (const threadId of threadIds) {
      if (this.pendingIds.has(threadId)) continue;
      this.pendingIds.add(threadId);
      added = true;
    }
    // A running drain picks the new ids up at its next batch; a retry timer
    // already covers them. Only an idle service needs a fresh drain.
    if (!added || this.drainActive || this.drainTimer) return;
    this.armDrainTimer(this.drainFailures > 0 ? DRAIN_RETRY_DELAY_MS : 0);
  }

  /**
   * Cancel pending work, abandon not-yet-started removals (their trash entries
   * are swept by the next startup), and join the running drain, scan, and
   * in-flight removals. Idempotent and shareable: every caller receives the
   * same disposal promise, so a second dispose can never hang behind a
   * resolver only the first caller holds. No new ownership checks or detach
   * jobs start after disposal; already-started removals are joined.
   */
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    this.pendingIds.clear();
    this.removalQueue.length = 0;
    this.removalTargets.clear();
    this.wakeCapacityWaiters();
    const joins: Promise<unknown>[] = [];
    if (this.scanRun) joins.push(this.scanRun);
    if (this.drainRun) joins.push(this.drainRun);
    if (this.activeRemovals > 0) {
      joins.push(
        new Promise<void>((resolve) => {
          this.removalsSettled = resolve;
        }),
      );
    }
    this.disposal = Promise.all(joins).then(() => undefined);
    return this.disposal;
  }

  private report(operation: string, error: unknown): void {
    const wrapped =
      error instanceof Error
        ? new Error(`Attachment reclamation (${operation}) failed: ${error.message}`, {
            cause: error,
          })
        : new Error(`Attachment reclamation (${operation}) failed: ${String(error)}`);
    try {
      this.options.reportError?.(wrapped);
    } catch {
      // A failing reporter must never escape into the DB caller or a drain
      // turn; losing the report is the smaller failure.
    }
  }

  private waitForRemovalCapacity(): Promise<void> {
    if (this.disposed || this.removalsOutstanding() < REMOVAL_QUEUE_LIMIT) return Promise.resolve();
    return new Promise((resolve) => this.capacityWaiters.add(resolve));
  }

  private wakeCapacityWaiters(): void {
    for (const resolve of this.capacityWaiters) resolve();
    this.capacityWaiters.clear();
  }

  private armDrainTimer(delayMs: number): void {
    if (this.disposed || this.drainTimer) return;
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      this.drainActive = true;
      this.drainRun = this.drainPendingIds().finally(() => {
        this.drainActive = false;
        this.drainRun = null;
      });
    }, delayMs);
    this.drainTimer.unref?.();
  }

  /**
   * Drain turn: each batch is one synchronous region — the CURRENT live-row
   * read and every detach rename below it happen with no await between them.
   * Between batches the loop yields to a macrotask, so a large notification
   * burst cannot monopolize the event loop.
   */
  private async drainPendingIds(): Promise<void> {
    while (!this.disposed && this.pendingIds.size > 0) {
      await this.waitForRemovalCapacity();
      if (this.disposed) return;
      // Another producer may have taken the capacity while this await resumed.
      // Compute the budget now; ownership check + detaches below never await.
      const budget = Math.min(DRAIN_BATCH_SIZE, REMOVAL_QUEUE_LIMIT - this.removalsOutstanding());
      if (budget === 0) continue;
      const batch: string[] = [];
      for (const id of this.pendingIds) {
        batch.push(id);
        if (batch.length === budget) break;
      }
      try {
        const liveNames = this.liveAttachmentDirNames();
        for (const threadId of batch) {
          this.pendingIds.delete(threadId);
          this.detachIfUnowned(getThreadAttachmentDirName(threadId), liveNames);
        }
        this.drainFailures = 0;
      } catch (error) {
        // Transient live-read failure: put the untouched batch back and retry
        // a bounded number of times, then drop them — the startup backlog
        // scan still heals.
        for (const threadId of batch) this.pendingIds.add(threadId);
        this.drainFailures += 1;
        this.report("recheck live threads", error);
        if (this.drainFailures < DRAIN_MAX_CONSECUTIVE_FAILURES) {
          this.armDrainTimer(DRAIN_RETRY_DELAY_MS);
        } else {
          this.pendingIds.clear();
        }
        return;
      }
      if (this.pendingIds.size > 0) await yieldToMacrotask();
    }
  }

  private liveAttachmentDirNames(): Set<string> {
    const names = new Set<string>();
    for (const threadId of this.options.listLiveThreadIds()) {
      for (const alias of attachmentDirNameAliases(getThreadAttachmentDirName(threadId))) {
        names.add(alias);
      }
    }
    return names;
  }

  /** Detach the directory for `dirName` unless a live thread could own it
   * (exact, truncated-shared, or alias-colliding name). Synchronous. */
  private detachIfUnowned(dirName: string, liveNames: Set<string>): void {
    // Staging-prefixed entries are pre-creation uploads referenced by
    // persisted messages; a durable id can never reach the reclaimer with one
    // of these prefixes, but the guard keeps the two passes consistent.
    if (isPersistedStagingAttachmentDirName(dirName)) return;
    if (attachmentDirNameAliases(dirName).some((alias) => liveNames.has(alias))) return;
    this.detachToTrash(dirName);
  }

  private detachToTrash(dirName: string): void {
    if (this.disposed) return;
    // A derived name is validated before it ever reaches join()/the fs; an
    // empty name would target the root itself.
    if (!isSafeAttachmentDirName(dirName)) {
      this.report("refuse unsafe attachment directory name", new Error(JSON.stringify(dirName)));
      return;
    }
    if (this.removalsOutstanding() >= REMOVAL_QUEUE_LIMIT) {
      throw new Error("Attachment reclaim producer exceeded its reserved batch capacity");
    }
    const source = join(this.options.attachmentsDir, dirName);
    try {
      // Conservative: only real directories are ever detached. A missing name
      // is the ordinary nothing-to-reclaim case; a file or symlink at the
      // name is left untouched.
      if (!lstatSync(source).isDirectory()) return;
    } catch (error) {
      if (!isExpectedEnoent(error)) this.report(`stat ${dirName}`, error);
      return;
    }
    const trashRoot = join(this.options.attachmentsDir, RECLAIM_TRASH_DIR_NAME);
    const target = join(trashRoot, `${dirName}.${randomUUID()}`);
    try {
      mkdirSync(trashRoot, { recursive: true });
      if (!lstatSync(trashRoot).isDirectory())
        throw new Error("Attachment reclaim trash must be a real directory");
      renameSync(source, target);
    } catch (error) {
      // The directory stays in place; the startup backlog scan retries.
      this.report(`detach ${dirName}`, error);
      return;
    }
    this.enqueueRemoval(target);
  }

  /** Detached trees not yet removed: waiting in the queue plus in flight.
   * The cap counts both — pumped entries leave the queue while they run. */
  private removalsOutstanding(): number {
    return this.removalQueue.length + this.activeRemovals;
  }

  private enqueueRemoval(target: string): boolean {
    if (this.disposed || this.removalTargets.has(target)) return false;
    if (this.removalsOutstanding() >= REMOVAL_QUEUE_LIMIT) return false;
    this.removalTargets.add(target);
    this.removalQueue.push(target);
    this.pumpRemovals();
    return true;
  }

  private pumpRemovals(): void {
    while (
      !this.disposed &&
      this.activeRemovals < REMOVAL_CONCURRENCY &&
      this.removalQueue.length > 0
    ) {
      const target = this.removalQueue.shift()!;
      this.activeRemovals += 1;
      const removal = this.startRemoval(target);
      void removal.then(
        () => this.settleRemoval(target),
        (error: unknown) => {
          // The tree is already detached; a leftover trash entry is swept by
          // the next startup scan.
          this.report(`remove detached trash ${target}`, error);
          this.settleRemoval(target);
        },
      );
    }
    if (this.disposed && this.activeRemovals === 0) this.removalsSettled?.();
  }

  /** A throwing removeDetached seam becomes the same rejection path, so the
   * active counter can never leak and disposal can never hang on a sync throw. */
  private startRemoval(target: string): Promise<void> {
    try {
      return this.options.removeDetached?.(target) ?? rm(target, { recursive: true, force: true });
    } catch (error: unknown) {
      return Promise.reject(error);
    }
  }

  private settleRemoval(target: string): void {
    this.removalTargets.delete(target);
    this.activeRemovals -= 1;
    if (this.disposed) {
      if (this.activeRemovals === 0) this.removalsSettled?.();
    } else {
      this.pumpRemovals();
    }
    this.wakeCapacityWaiters();
  }

  /**
   * Startup backlog: reclaim pre-crash / pre-upgrade orphans and sweep trash
   * leftovers. The root is streamed with `opendir` (never fully materialized)
   * in batches; each batch revalidates against a FRESH live-row read inside
   * one synchronous region, and the loop yields between batches so a large
   * backlog cannot monopolize the loop.
   */
  private async runBacklogScan(): Promise<void> {
    if (this.disposed) return;
    try {
      await this.sweepTrashLeftovers();
    } catch (error) {
      this.report("sweep reclaim trash", error);
    }
    if (this.disposed) return;
    let root: Dir;
    try {
      root = await opendir(this.options.attachmentsDir);
    } catch (error) {
      if (!isExpectedEnoent(error)) this.report("open attachments root", error);
      return;
    }
    try {
      let batch: string[] = [];
      for await (const entry of root) {
        if (this.disposed) return;
        if (!this.isScanCandidate(entry)) continue;
        batch.push(entry.name);
        if (batch.length < SCAN_BATCH_SIZE) continue;
        await this.detachScanBatch(batch);
        batch = [];
        await yieldToMacrotask();
      }
      if (!this.disposed && batch.length > 0) await this.detachScanBatch(batch);
    } catch (error) {
      this.report("iterate attachments root", error);
    }
  }

  /** Directory entries the scan may consider: not the trash area, not hidden
   * state, not a persisted staging directory, and only real directories —
   * unknown non-directory entries at the root are left conservatively
   * untouched. */
  private isScanCandidate(entry: Dirent): boolean {
    return (
      entry.isDirectory() &&
      entry.name !== RECLAIM_TRASH_DIR_NAME &&
      !entry.name.startsWith(".") &&
      !isPersistedStagingAttachmentDirName(entry.name)
    );
  }

  /** Capacity waits precede the fresh read; each read + detach region is synchronous. */
  private async detachScanBatch(entries: string[]): Promise<void> {
    let offset = 0;
    while (!this.disposed && offset < entries.length) {
      await this.waitForRemovalCapacity();
      if (this.disposed) return;
      const budget = Math.min(
        entries.length - offset,
        REMOVAL_QUEUE_LIMIT - this.removalsOutstanding(),
      );
      if (budget === 0) continue;
      try {
        const liveNames = this.liveAttachmentDirNames();
        for (const entry of entries.slice(offset, offset + budget))
          this.detachIfUnowned(entry, liveNames);
      } catch (error) {
        this.report("reclaim backlog batch", error);
      }
      offset += budget;
      if (offset < entries.length) await yieldToMacrotask();
    }
  }

  /** Stream old trash, waiting for capacity rather than abandoning the tail. */
  private async sweepTrashLeftovers(): Promise<void> {
    const trashRoot = join(this.options.attachmentsDir, RECLAIM_TRASH_DIR_NAME);
    let trash: Dir;
    try {
      // Never follow a restored or user-created link outside this owned root.
      if (!lstatSync(trashRoot).isDirectory())
        throw new Error("Attachment reclaim trash must be a real directory");
      trash = await opendir(trashRoot);
    } catch (error) {
      if (!isExpectedEnoent(error)) throw error;
      return;
    }
    for await (const entry of trash) {
      const target = join(trashRoot, entry.name);
      while (!this.disposed && !this.removalTargets.has(target)) {
        await this.waitForRemovalCapacity();
        if (this.disposed) return;
        if (this.enqueueRemoval(target)) break;
      }
      if (this.disposed) return;
    }
  }
}
