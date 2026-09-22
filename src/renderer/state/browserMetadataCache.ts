/**
 * Asynchronous, coalesced browser metadata cache (B5).
 *
 * Replaces the synchronous whole-state `localStorage` write of the bridge-less
 * (browser/PWA) persist path: `setItem` records the snapshot reference in
 * memory and enqueues it, and a coalesced drain commits it to IndexedDB later.
 *
 * Invariants:
 * - At most one in-flight commit plus one queued write and one queued removal
 *   per store name. Superseded operations settle their callers immediately
 *   instead of accumulating waiters, so a stalled IndexedDB cannot retain an
 *   unbounded set of callbacks.
 * - Commits are compare-and-set on the revision the writer last observed, so a
 *   delayed snapshot is rejected after another writer commits a newer one.
 * - Reads never adopt a disk value that an awaited write/remove has since
 *   superseded (per-name operation generation).
 * - A removal supersedes any commit that was already in flight: the commit never
 *   reinstates the removed record's `committed` identity, so a later write of
 *   the same snapshot reference re-creates the durable record.
 * - Legacy localStorage payloads are migrated once, and the key is deleted only
 *   when its bytes are still the migrated ones. An explicit `remove` also drops
 *   the legacy key (shape-gated, fingerprint-bound), so a later session cannot
 *   re-migrate data the caller cleared.
 * - Unknown future record formats are preserved, including across `remove`.
 * - Failures (IndexedDB unavailable, quota, deadline) degrade to an in-memory
 *   map for the session and never throw into the persist middleware.
 * - Only Zustand persist payloads (`{ state, version }`) are cached durably.
 */

import {
  browserMetadataIndexedDbAvailable,
  closeBrowserMetadataCacheForTest,
  deleteBrowserMetadataRecord,
  readBrowserMetadataRecord,
  writeBrowserMetadataRecord,
  __resetBrowserMetadataCacheRecordsForTest,
  MAX_BROWSER_METADATA_CACHE_TOTAL_BYTES,
  type BrowserMetadataCacheRecord,
} from "./browserMetadataCacheRecords";
import {
  MAX_BROWSER_METADATA_RECORD_BYTES,
  projectBoundedCacheValue,
} from "./browserMetadataCacheProjection";

export { closeBrowserMetadataCacheForTest, __resetBrowserMetadataCacheRecordsForTest };

/** Zustand persist shape: `{ state: object, version?: number }`. */
function isPersistedStateValue(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const state = (value as { state?: unknown }).state;
  return typeof state === "object" && state !== null;
}

export interface BrowserMetadataCacheOptions {
  /** Parses a legacy localStorage payload; null means "unusable, preserve it". */
  readonly parseLegacy?: (raw: string) => Promise<unknown | null>;
  /** Reports the first degradation (IndexedDB unavailable, quota, oversized). */
  readonly reportError?: (operation: string, error: unknown) => void;
  /** Record cap override for tests; production uses the projection default. */
  readonly maxRecordBytes?: number;
  /** Aggregate cache cap override for tests. */
  readonly maxTotalBytes?: number;
}

export type BrowserMetadataCacheWriteStatus =
  | "committed"
  /** Unknown-format record kept; this session serves from memory. */
  | "preserved"
  /** A newer queued operation replaced this one before it committed. */
  | "superseded"
  /** Another writer committed a different revision first. */
  | "stale"
  /** Durable cache unavailable, over budget, or over the record cap. */
  | "memory-only"
  | "removed";

export interface BrowserMetadataCache {
  read(name: string): Promise<unknown | null>;
  write(name: string, value: unknown): Promise<void>;
  remove(name: string): Promise<void>;
}

interface CacheWriteOperation {
  kind: "write";
  value: unknown;
  migratedFrom?: string;
  migratedFingerprint?: string;
  readonly waiters: Array<(status: BrowserMetadataCacheWriteStatus) => void>;
}

interface CacheRemoveOperation {
  kind: "remove";
  readonly waiters: Array<(status: BrowserMetadataCacheWriteStatus) => void>;
}

type CacheOperation = CacheWriteOperation | CacheRemoveOperation;

interface CommittedMetadata {
  /**
   * Present when the last durable commit wrote exactly this payload. Persist
   * builds a fresh `{ state, version }` wrapper per call, so identity is the
   * partializer's `state` reference, which only changes on a real state edit.
   */
  state?: unknown;
  revision: number;
}

function persistedStateIdentity(value: unknown): unknown {
  return isPersistedStateValue(value) ? (value as { state: unknown }).state : value;
}

/**
 * Fingerprint (length + two 32-bit hashes) of a legacy localStorage payload.
 * The migration marker stores it so a later cleanup deletes the key only while
 * the bytes are still the ones that were migrated; a payload rewritten by an
 * older app/tab meanwhile is preserved.
 */
export function legacyStoragePayloadFingerprint(raw: string): string {
  let fnv = 0x811c9dc5;
  let djb2 = 5381;
  for (let index = 0; index < raw.length; index += 1) {
    const code = raw.charCodeAt(index);
    fnv ^= code;
    fnv = Math.imul(fnv, 0x01000193);
    djb2 = Math.imul(djb2, 33) ^ code;
  }
  return `${raw.length}:${(fnv >>> 0).toString(16)}:${(djb2 >>> 0).toString(16)}`;
}

export function createBrowserMetadataCache(
  options: BrowserMetadataCacheOptions = {},
): BrowserMetadataCache {
  const maxRecordBytes = options.maxRecordBytes ?? MAX_BROWSER_METADATA_RECORD_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? MAX_BROWSER_METADATA_CACHE_TOTAL_BYTES;
  const memory = new Map<string, unknown>();
  const committed = new Map<string, CommittedMetadata>();
  const queues = new Map<string, CacheOperation[]>();
  const draining = new Set<string>();
  /** Names with an in-flight or queued operation: reads must not touch disk. */
  const busy = new Set<string>();
  /** Names holding an unknown future-format record that must not be overwritten. */
  const frozen = new Set<string>();
  /**
   * Fingerprint of the legacy bytes this cache last read as ours. Explicit
   * removal deletes only bytes that still match it, so a payload an older
   * app/tab rewrote is newer data and survives, exactly like the migration
   * cleanup. Without a recorded fingerprint the bytes present at removal time
   * are the candidate.
   */
  const legacyFingerprints = new Map<string, string>();
  /** Bumped by every write/remove so an awaited read can discard stale disk data. */
  const generations = new Map<string, number>();
  /**
   * Bumped by every queued removal. A commit that was already in flight when
   * the removal arrived must not reinstall `committed` for a record the drain
   * deletes next, or a later identical write would be deduped and the durable
   * record never re-created (F1).
   */
  const removalGenerations = new Map<string, number>();
  const reportedOversized = new Set<string>();
  const reportedOverBudget = new Set<string>();
  let writesDisabled = false;
  let degradationReported = false;

  function generationOf(name: string): number {
    return generations.get(name) ?? 0;
  }

  function bumpGeneration(name: string): void {
    generations.set(name, generationOf(name) + 1);
  }

  function removalGenerationOf(name: string): number {
    return removalGenerations.get(name) ?? 0;
  }

  function memoryValue(name: string): unknown | null {
    return memory.has(name) ? (memory.get(name) ?? null) : null;
  }

  function settleWaiters(
    waiters: Array<(status: BrowserMetadataCacheWriteStatus) => void>,
    status: BrowserMetadataCacheWriteStatus,
  ): void {
    for (const resolve of waiters.splice(0)) resolve(status);
  }

  function reportUnavailable(): void {
    if (writesDisabled) return;
    writesDisabled = true;
    reportDegradation(
      "browser metadata cache unavailable",
      new Error("IndexedDB is not available."),
    );
  }

  function reportDegradation(operation: string, error: unknown): void {
    if (degradationReported) return;
    degradationReported = true;
    options.reportError?.(operation, error);
  }

  function reportOversized(name: string, bytes: number): void {
    if (reportedOversized.has(name)) return;
    reportedOversized.add(name);
    options.reportError?.(
      `oversized browser metadata cache "${name}"`,
      new Error(`snapshot is ${bytes} bytes and cannot be projected under the record cap.`),
    );
  }

  function reportOverBudget(name: string, totalBytes: number): void {
    if (reportedOverBudget.has(name)) return;
    reportedOverBudget.add(name);
    options.reportError?.(
      `browser metadata cache over total budget for "${name}"`,
      new Error(`the cache would hold ${totalBytes} bytes; keeping this snapshot in memory only.`),
    );
  }

  function readLegacyRaw(name: string): string | null {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  }

  function removeLegacyRaw(name: string): void {
    try {
      localStorage.removeItem(name);
    } catch {
      // Removal failed: the legacy key survives and the next read retries it.
    }
  }

  /** Deletes the legacy key only while it still holds the migrated bytes. */
  function removeLegacyRawIfUnchanged(name: string, fingerprint: string): void {
    const current = readLegacyRaw(name);
    if (current === null) return;
    if (legacyStoragePayloadFingerprint(current) !== fingerprint) return;
    removeLegacyRaw(name);
  }

  /**
   * Explicit removal is authoritative for the legacy key too: leaving it would
   * let the next session re-migrate data the caller just cleared (F5). The
   * payload must still parse as ours (unknown formats are preserved) and the
   * delete stays fingerprint-bound to the captured bytes, so bytes an older
   * tab rewrites while the parse is in flight survive.
   */
  async function removeLegacyForRemoval(name: string): Promise<void> {
    const raw = readLegacyRaw(name);
    if (raw === null) return;
    const fingerprint = legacyStoragePayloadFingerprint(raw);
    const known = legacyFingerprints.get(name);
    // Bytes this cache never read as ours are newer data from an older tab;
    // an explicit removal of the cached record is not a command to destroy it.
    if (known !== undefined && known !== fingerprint) return;
    const parsed = await parseLegacyPayload(raw);
    if (parsed === null) return;
    removeLegacyRawIfUnchanged(name, fingerprint);
  }

  async function parseLegacyPayload(raw: string): Promise<unknown | null> {
    try {
      const parsed = await (options.parseLegacy?.(raw) ??
        Promise.resolve(JSON.parse(raw) as unknown));
      // Only a Zustand persist payload (`{ state, version }`) is ours to
      // migrate. Anything else under the key is an unknown format: leave it.
      return isPersistedStateValue(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /**
   * Legacy parse for the degraded path only: nothing is committed or deleted,
   * so an interrupted migration keeps its drafts available this session.
   */
  async function readLegacyForMemory(
    name: string,
    generationAtStart: number,
  ): Promise<unknown | null> {
    const raw = readLegacyRaw(name);
    if (raw === null) return null;
    const parsed = await parseLegacyPayload(raw);
    if (parsed === null) return null;
    if (generationOf(name) !== generationAtStart) return memoryValue(name);
    memory.set(name, parsed);
    legacyFingerprints.set(name, legacyStoragePayloadFingerprint(raw));
    return parsed;
  }

  /**
   * One-time, versioned migration. The legacy key is removed only after the
   * IndexedDB transaction commits AND its bytes are still the migrated ones; an
   * interrupted commit leaves the payload intact for the next attempt.
   */
  async function migrateLegacy(name: string, generationAtStart: number): Promise<unknown | null> {
    const raw = readLegacyRaw(name);
    if (raw === null) return null;
    const parsed = await parseLegacyPayload(raw);
    if (generationOf(name) !== generationAtStart) return memoryValue(name);
    if (parsed === null) return null;
    memory.set(name, parsed);
    const fingerprint = legacyStoragePayloadFingerprint(raw);
    legacyFingerprints.set(name, fingerprint);
    const status = await enqueue(name, {
      kind: "write",
      value: parsed,
      migratedFrom: name,
      migratedFingerprint: fingerprint,
      waiters: [],
    });
    if (status === "committed" || status === "removed") {
      removeLegacyRawIfUnchanged(name, fingerprint);
    }
    if (generationOf(name) !== generationAtStart) return memoryValue(name);
    return parsed;
  }

  function completeInterruptedMigration(name: string, record: BrowserMetadataCacheRecord): void {
    if (record.migratedFrom !== name) return;
    const fingerprint = record.migratedFingerprint;
    if (fingerprint === undefined) return;
    legacyFingerprints.set(name, fingerprint);
    removeLegacyRawIfUnchanged(name, fingerprint);
  }

  function scheduleDrain(name: string): void {
    if (draining.has(name)) return;
    draining.add(name);
    queueMicrotask(() => void drain(name));
  }

  /**
   * Adds an operation and returns when it is durably settled or superseded.
   * A queued write that is replaced by a newer write, a removal, or a later
   * removal settles immediately with `superseded`, which keeps the waiter list
   * bounded no matter how long the drain is stalled.
   */
  function enqueue(
    name: string,
    operation: CacheOperation,
  ): Promise<BrowserMetadataCacheWriteStatus> {
    const queue = queues.get(name) ?? [];
    queues.set(name, queue);
    const tail = queue.at(-1);
    let tracked = operation;
    if (operation.kind === "write") {
      if (tail?.kind === "write") {
        // The newer snapshot replaces the queued one; the caller settles on it.
        settleWaiters(tail.waiters, "superseded");
        tail.value = operation.value;
        if (tail.migratedFrom === undefined && operation.migratedFrom !== undefined) {
          tail.migratedFrom = operation.migratedFrom;
        }
        if (tail.migratedFingerprint === undefined && operation.migratedFingerprint !== undefined) {
          tail.migratedFingerprint = operation.migratedFingerprint;
        }
        tracked = tail;
      } else {
        queue.push(operation);
      }
    } else {
      if (tail?.kind === "write") {
        // The removal supersedes the queued snapshot: it is never written.
        queue.pop();
        settleWaiters(tail.waiters, "superseded");
      }
      const previousRemove = queue.at(-1);
      if (previousRemove?.kind === "remove") {
        queue.pop();
        settleWaiters(previousRemove.waiters, "superseded");
      }
      queue.push(operation);
    }
    busy.add(name);
    scheduleDrain(name);
    return new Promise<BrowserMetadataCacheWriteStatus>((resolve) => tracked.waiters.push(resolve));
  }

  async function drain(name: string): Promise<void> {
    for (;;) {
      const operation = queues.get(name)?.shift();
      if (operation === undefined) break;
      let status: BrowserMetadataCacheWriteStatus;
      try {
        status =
          operation.kind === "write"
            ? await commitWrite(name, operation)
            : await commitRemove(name);
      } catch {
        status = "memory-only";
      }
      settleWaiters(operation.waiters, status);
    }
    queues.delete(name);
    draining.delete(name);
    busy.delete(name);
  }

  async function commitWrite(
    name: string,
    operation: CacheWriteOperation,
  ): Promise<BrowserMetadataCacheWriteStatus> {
    if (frozen.has(name) || writesDisabled || !browserMetadataIndexedDbAvailable()) {
      return "memory-only";
    }
    const projection = projectBoundedCacheValue(operation.value, maxRecordBytes);
    if (projection.kind === "oversized") {
      // Bounded disk wins: the snapshot stays in memory for this session only.
      reportOversized(name, projection.bytes);
      return "memory-only";
    }
    const removalAtStart = removalGenerationOf(name);
    try {
      const result = await writeBrowserMetadataRecord({
        key: name,
        value: projection.value,
        bytes: projection.bytes,
        expectedRevision: committed.get(name)?.revision ?? 0,
        totalBudgetBytes: maxTotalBytes,
        ...(operation.migratedFrom !== undefined ? { migratedFrom: operation.migratedFrom } : {}),
        ...(operation.migratedFingerprint !== undefined
          ? { migratedFingerprint: operation.migratedFingerprint }
          : {}),
        ...(projection.kind === "truncated"
          ? { truncated: true, droppedThreadCount: projection.droppedThreadCount }
          : {}),
      });
      if (result.kind === "preserved") {
        frozen.add(name);
        return "preserved";
      }
      if (result.kind === "over-budget") {
        reportOverBudget(name, result.totalBytes);
        return "memory-only";
      }
      if (removalGenerationOf(name) !== removalAtStart) {
        // A removal arrived while this commit was in flight and the drain
        // deletes this record next. Mirroring it in `committed` would dedupe a
        // later identical write and leave the removed record un-recreated.
        return result.kind === "stale" ? "stale" : "committed";
      }
      if (result.kind === "stale") {
        // Another writer committed first. Keep serving memory; a later write
        // adopts the observed revision and can commit normally.
        committed.set(name, { revision: result.revision });
        return "stale";
      }
      committed.set(name, {
        state: persistedStateIdentity(operation.value),
        revision: result.revision,
      });
      return "committed";
    } catch (error) {
      writesDisabled = true;
      reportDegradation(`write of browser metadata cache "${name}"`, error);
      return "memory-only";
    }
  }

  async function commitRemove(name: string): Promise<BrowserMetadataCacheWriteStatus> {
    if (writesDisabled || !browserMetadataIndexedDbAvailable()) {
      reportUnavailable();
      await removeLegacyForRemoval(name);
      return "memory-only";
    }
    try {
      const result = await deleteBrowserMetadataRecord(name);
      if (result.kind === "preserved") {
        // Not ours to delete: a record written by a newer app version. Its
        // legacy key is likewise not ours to clear.
        frozen.add(name);
        return "preserved";
      }
      frozen.delete(name);
      // `committed` mirrors the durable record; it is now gone. Any commit
      // still in flight is barred from reinstalling it by the removal
      // generation, and a queued write behind this removal sets its own.
      committed.delete(name);
      // The explicit removal owns the legacy key too, and the drain holds
      // `busy` for this whole operation, so a concurrent read cannot observe
      // a half-cleared store or re-migrate the bytes being cleared (F5).
      await removeLegacyForRemoval(name);
      return "removed";
    } catch (error) {
      writesDisabled = true;
      reportDegradation(`removal of browser metadata cache "${name}"`, error);
      await removeLegacyForRemoval(name);
      return "memory-only";
    }
  }

  async function read(name: string): Promise<unknown | null> {
    if (memory.has(name)) return memory.get(name) ?? null;
    // While an operation is queued or in flight, memory is the newest truth;
    // consulting disk here could observe pre-removal or stale rows.
    if (busy.has(name)) return null;
    if (frozen.has(name)) return null;
    const generationAtStart = generationOf(name);
    if (!browserMetadataIndexedDbAvailable()) {
      reportUnavailable();
      return readLegacyForMemory(name, generationAtStart);
    }
    try {
      const result = await readBrowserMetadataRecord(name);
      // A write/remove that arrived while the disk read was in flight is newer
      // than what the disk returned; never adopt or resurrect it.
      if (generationOf(name) !== generationAtStart) return memoryValue(name);
      if (result.kind === "future") {
        frozen.add(name);
        return null;
      }
      if (result.kind === "missing") return await migrateLegacy(name, generationAtStart);
      const value = result.record.value ?? null;
      if (value !== null) {
        memory.set(name, value);
        committed.set(name, {
          state: persistedStateIdentity(value),
          revision: result.record.revision,
        });
        completeInterruptedMigration(name, result.record);
      }
      return value;
    } catch (error) {
      writesDisabled = true;
      reportDegradation(`read of browser metadata cache "${name}"`, error);
      return readLegacyForMemory(name, generationAtStart);
    }
  }

  async function write(name: string, value: unknown): Promise<void> {
    memory.set(name, value);
    bumpGeneration(name);
    // Only Zustand persist payloads belong in the durable cache.
    if (!isPersistedStateValue(value)) return;
    if (frozen.has(name)) return;
    if (writesDisabled || !browserMetadataIndexedDbAvailable()) {
      reportUnavailable();
      return;
    }
    const identity = persistedStateIdentity(value);

    if (committed.get(name)?.state === identity) return;
    const tail = queues.get(name)?.at(-1);
    if (tail?.kind === "write" && persistedStateIdentity(tail.value) === identity) return;
    await enqueue(name, { kind: "write", value, waiters: [] });
  }

  async function remove(name: string): Promise<void> {
    memory.delete(name);
    committed.delete(name);
    bumpGeneration(name);
    // The queued removal performs the durable delete and the legacy cleanup
    // while the drain holds `busy`, so a concurrent read cannot re-migrate the
    // bytes being cleared (F5). The degraded path drains the same way and
    // cleans up without touching IndexedDB.
    removalGenerations.set(name, removalGenerationOf(name) + 1);
    await enqueue(name, { kind: "remove", waiters: [] });
  }

  return { read, write, remove };
}

export async function __resetBrowserMetadataCacheForTest(): Promise<void> {
  await __resetBrowserMetadataCacheRecordsForTest();
}
