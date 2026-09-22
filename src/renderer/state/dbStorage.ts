import type { PersistStorage, StorageValue } from "zustand/middleware";
import { isQuickComposerWindow, readBridge } from "../bridge";
import { captureRendererException } from "../diagnostics/sentry";
import { hasAnyClientBridge, hasClientCapability } from "../clientRuntime";
import type { AppView } from "@/shared/contracts";
import {
  CLIENT_ENGINE_AUX_STRINGIFY_MAX_BYTES,
  ClientEngineAuxInputTooLargeError,
  getPersistJsonEngine,
  projectJsonBytes,
} from "./remote/engine";
import { createBrowserMetadataCache } from "./browserMetadataCache";

const LARGE_STORAGE_JSON_CHARS = 32 * 1024;

/**
 * Surface a persistence failure instead of silently dropping it. These writes
 * are fire-and-forget (Zustand's persist middleware does not retry), so a
 * swallowed rejection means the user's data was never saved while the UI shows
 * it as committed. Reporting is the minimum so the loss is observable.
 */
function reportPersistError(operation: string, error: unknown): void {
  console.error(`[poracode] failed to persist ${operation}:`, error);
  captureRendererException(error, { featureArea: "app-state-persistence" });
}

/**
 * Raw string-level storage backend backed by SQLite via IPC.
 *
 * For the main app store ("poracode-app-v2"), it maps the Zustand persist
 * format to/from individual SQLite rows (projects, threads, view).
 * For other stores, it uses the generic key-value `app_state` table.
 */
function hasBridge(): boolean {
  return hasAnyClientBridge() && hasClientCapability("localBackend");
}

const APP_STORE_NAME = "poracode-app-v2";
const CURRENT_STORAGE_PREFIX = "poracode";
const LEGACY_STORAGE_PREFIX = "lightcode";
const lastStorageJson = new Map<string, string>();

function legacyStorageName(name: string): string | null {
  return name.startsWith(CURRENT_STORAGE_PREFIX)
    ? LEGACY_STORAGE_PREFIX + name.slice(CURRENT_STORAGE_PREFIX.length)
    : null;
}

async function readPersistedState(name: string): Promise<string | null> {
  const current = await readBridge().dbGetState(name);
  if (current) return current;
  const legacyName = legacyStorageName(name);
  if (!legacyName) return null;
  const legacy = await readBridge().dbGetState(legacyName);
  if (!legacy) return null;
  await readBridge()
    .dbSetState(name, legacy)
    .catch((error) => reportPersistError(`migration of state "${name}"`, error));
  return legacy;
}

/** Creates a Zustand-compatible storage adapter backed by SQLite via IPC. */
export function createDbStorage<S>(): PersistStorage<S> {
  const appStoreWrites = new AppStoreWriteQueue();
  // Bridge-less (browser/PWA) path: an asynchronous IndexedDB cache that
  // coalesces writes, bounds record size, and degrades to memory. The SQLite
  // path below is unchanged.
  const browserCache = createBrowserMetadataCache({
    parseLegacy: (raw) => parseStorageValue(raw),
    reportError: (operation, error) => reportPersistError(operation, error),
  });

  return {
    async getItem(name: string): Promise<StorageValue<S> | null> {
      if (!hasBridge()) {
        return (await browserCache.read(name)) as StorageValue<S> | null;
      }
      if (name === APP_STORE_NAME) {
        const value = await loadAppPreferences();
        if (value) appStoreWrites.remember(value);
        return value as StorageValue<S> | null;
      }
      return (await parseStorageValue(await readPersistedState(name))) as StorageValue<S> | null;
    },

    async setItem(name: string, value: StorageValue<S>): Promise<void> {
      if (name === APP_STORE_NAME) {
        if (!hasBridge()) {
          return browserCache.write(name, value);
        }
        if (isQuickComposerWindow()) return;
        return appStoreWrites.write(value);
      }

      if (!hasBridge()) {
        return browserCache.write(name, value);
      }
      const json = await shouldSkipWrite(name, value);
      if (json === null) return;
      readBridge()
        .dbSetState(name, json)
        .catch((error) => reportPersistError(`state "${name}"`, error));
    },

    async removeItem(name: string): Promise<void> {
      lastStorageJson.delete(name);
      if (!hasBridge()) {
        return browserCache.remove(name);
      }
      if (name === APP_STORE_NAME) {
        return appStoreWrites.remove(removeAppStore);
      }
      readBridge()
        .dbSetState(name, "")
        .catch((error) => reportPersistError(`removal of state "${name}"`, error));
    },
  };
}

interface PendingAppStoreWrite {
  kind: "write";
  value: StorageValue<unknown>;
  waiters: Array<() => void>;
}

interface PendingAppStoreRemoval {
  kind: "remove";
  remove: () => Promise<void>;
  waiters: Array<() => void>;
}

type AppStoreOperation = PendingAppStoreWrite | PendingAppStoreRemoval;

/**
 * Bounds for the pending app-store operation queue (Gate 4 Batch 1). The
 * queue only grows while a SQLite IPC write is stalled, and each queued
 * snapshot holds the FULL app state, so the stall path is capped three ways:
 *
 * - Count: at most {@link MAX_PENDING_APP_STORE_OPERATIONS} pending
 *   operations; further callers block (backpressure) until space frees
 *   instead of growing the queue.
 * - Bytes: writes coalesce eagerly — a queued write is superseded by any
 *   strictly later write (the later snapshot overwrites every row, so
 *   dropping the older one cannot change the final persisted state; its
 *   waiters transfer to the newer write). At most ONE queued write snapshot
 *   plus the in-flight one is therefore ever retained, which bounds queued
 *   snapshot memory without paying a whole-state JSON.stringify on the hot
 *   per-change path.
 * - Age: superseded writes never outlive the arrival of their successor
 *   (eager reap, strictly stronger than an age-based reaper). Removals are
 *   never dropped or reordered: a removal that silently vanished could
 *   resurrect cleared rows after a crash, so excess removals are what
 *   backpressure waits on. No time-based reaper exists because nothing in
 *   the queue is both droppable and older than its successor.
 */
const MAX_PENDING_APP_STORE_OPERATIONS = 8;

class AppStoreWriteQueue {
  private lastPersisted: StorageValue<unknown> | undefined;
  private readonly operations: AppStoreOperation[] = [];
  private readonly spaceWaiters: Array<() => void> = [];
  private draining = false;

  isDuplicate(value: StorageValue<unknown>): boolean {
    return !this.draining && isSameAppStoreValue(this.lastPersisted, value);
  }

  remember(value: StorageValue<unknown>): void {
    this.lastPersisted = value;
  }

  write(value: StorageValue<unknown>): Promise<void> {
    const pending = this.operations.at(-1);
    if (pending?.kind === "write") {
      pending.value = value;
      return new Promise<void>((resolve) => {
        pending.waiters.push(resolve);
      });
    }
    if (this.isDuplicate(value)) return Promise.resolve();
    return this.enqueue({ kind: "write", value, waiters: [] });
  }

  remove(remove: () => Promise<void>): Promise<void> {
    const pending = this.operations.at(-1);
    if (pending?.kind === "write") {
      this.operations.pop();
      for (const resolve of pending.waiters) resolve();
    }
    return this.enqueue({ kind: "remove", remove, waiters: [] });
  }

  private enqueue(operation: AppStoreOperation): Promise<void> {
    if (operation.kind === "write") {
      // Eager supersession: the incoming snapshot overwrites every row, so
      // any queued write is already obsolete. Transfer its waiters so they
      // resolve when the newer content is durable.
      for (let index = this.operations.length - 1; index >= 0; index -= 1) {
        const queued = this.operations[index]!;
        if (queued.kind !== "write") continue;
        this.operations.splice(index, 1);
        operation.waiters.push(...queued.waiters);
      }
    }
    if (this.operations.length >= MAX_PENDING_APP_STORE_OPERATIONS) {
      return this.enqueueWhenSpaceAllows(operation);
    }
    const result = new Promise<void>((resolve) => {
      operation.waiters.push(resolve);
      this.operations.push(operation);
    });
    if (!this.draining) {
      this.draining = true;
      queueMicrotask(() => void this.drain());
    }
    return result;
  }

  /**
   * Admission backpressure for a queue full of non-droppable operations
   * (removals): the caller waits for the drain to make room instead of
   * growing the queue or silently skipping durable work.
   */
  private enqueueWhenSpaceAllows(operation: AppStoreOperation): Promise<void> {
    return new Promise<void>((release) => {
      this.spaceWaiters.push(release);
    }).then(() => this.enqueue(operation));
  }

  private releaseWaitingEnqueues(): void {
    while (
      this.spaceWaiters.length > 0 &&
      this.operations.length < MAX_PENDING_APP_STORE_OPERATIONS
    ) {
      this.spaceWaiters.shift()!();
    }
  }

  private async drain(): Promise<void> {
    while (this.operations.length > 0) {
      const operation = this.operations.shift()!;
      if (operation.kind === "write") {
        if (!isSameAppStoreValue(this.lastPersisted, operation.value)) {
          try {
            await saveAppPreferences(operation.value);
            this.lastPersisted = operation.value;
          } catch {
            this.lastPersisted = undefined;
            // The next identical queued write becomes the retry.
          }
        }
      } else {
        try {
          await operation.remove();
          this.lastPersisted = undefined;
        } catch {
          this.lastPersisted = undefined;
          // removeAppStore reports the failing boundary.
        }
      }
      for (const resolve of operation.waiters) resolve();
      this.releaseWaitingEnqueues();
    }
    this.draining = false;
    this.releaseWaitingEnqueues();
  }
}

/**
 * Preferences-only desktop hydration (B4 S4/D2).
 *
 * The root catalog is host-owned and arrives over the managed loopback bounded
 * HTTP walk, so hydration reads ONLY the native preferences (`view`,
 * `groupLayouts`). It never reads catalog rows, never awaits the loopback, and
 * returns the catalog keys ABSENT (never `[]`, which the persist merge would
 * treat as an authoritative empty catalog and clobber rows installed while the
 * read was in flight).
 */
async function loadAppPreferences(): Promise<StorageValue<unknown> | null> {
  const startedAt = performance.now();
  const [viewJson, groupLayoutsJson] = await Promise.all([
    readBridge().dbGetState("view"),
    readBridge().dbGetState("groupLayouts"),
  ]);
  if (import.meta.env.DEV) {
    performance.measure("poracode:preferences hydration", { start: startedAt });
  }
  if (!viewJson && !groupLayoutsJson) return null;

  let view: AppView = { kind: "home" };
  if (viewJson) {
    try {
      view = JSON.parse(viewJson) as AppView;
    } catch {
      // corrupt — fall back to home
    }
  }
  let groupLayouts: Record<string, unknown> = {};
  if (groupLayoutsJson) {
    try {
      groupLayouts = JSON.parse(groupLayoutsJson) as Record<string, unknown>;
    } catch {
      // corrupt — ignore
    }
  }
  return { state: { view, groupLayouts }, version: 5 };
}

/**
 * Write only the persisted preferences. Catalog rows have no renderer write
 * path: every content intent is an explicit host command, so `dbSyncAll` /
 * `dbSyncChanges` are unreachable from persistence.
 */
async function saveAppPreferences(value: StorageValue<unknown>): Promise<void> {
  let viewJson: string;
  let groupLayoutsJson: string | undefined;
  try {
    const state = value.state as { view?: AppView; groupLayouts?: Record<string, unknown> } | null;
    if (!state || typeof state !== "object") return;
    viewJson = JSON.stringify(state.view ?? { kind: "home" });
    groupLayoutsJson = state.groupLayouts ? JSON.stringify(state.groupLayouts) : undefined;
  } catch (error) {
    reportPersistError("app preferences", error);
    throw error;
  }

  const writes: Promise<void>[] = [
    readBridge()
      .dbSetState("view", viewJson)
      .catch((error) => {
        reportPersistError("view", error);
        throw error;
      }),
  ];
  if (groupLayoutsJson !== undefined) {
    writes.push(
      readBridge()
        .dbSetState("groupLayouts", groupLayoutsJson)
        .catch((error) => {
          reportPersistError("group layouts", error);
          throw error;
        }),
    );
  }
  const results = await Promise.allSettled(writes);
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

/**
 * Clears renderer preferences only. A client reset must never delete
 * host-shared catalog rows, so there is no `dbSyncAll([], [], …)` wipe here.
 */
async function removeAppStore(): Promise<void> {
  const writes = [
    readBridge()
      .dbSetState("view", JSON.stringify({ kind: "home" }))
      .catch((error) => {
        reportPersistError("removal of view", error);
        throw error;
      }),
    readBridge()
      .dbSetState("groupLayouts", "")
      .catch((error) => {
        reportPersistError("removal of group layouts", error);
        throw error;
      }),
    readBridge()
      .dbSetState(APP_STORE_NAME, "")
      .catch((error) => {
        reportPersistError("removal of app store", error);
        throw error;
      }),
  ];
  const results = await Promise.allSettled(writes);
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

async function parseStorageValue(raw: string | null): Promise<StorageValue<unknown> | null> {
  if (!raw) return null;
  try {
    if (raw.length >= LARGE_STORAGE_JSON_CHARS) {
      // Persist-owned engine (V5 2.2): a renderer-stream or remote-socket
      // engine reset can no longer reject this hydration read and silently
      // report persisted state as absent.
      return (await getPersistJsonEngine().parseJson(raw)) as StorageValue<unknown>;
    }
    return JSON.parse(raw) as StorageValue<unknown>;
  } catch {
    return null;
  }
}

/**
 * Serialize one generic named store for SQLite.
 *
 * Producer-side admission (A3 correction): a bounded projection decides both
 * the hard cap and the route, without ever serializing the whole graph to
 * measure it. The old heuristic chose the off-thread engine from the PREVIOUS
 * payload length, so a small-to-large growth spur could still run an unbounded
 * synchronous `JSON.stringify` on the UI thread, and the engine could accept an
 * unbounded stringify graph on a 64 KiB reservation. Now:
 *
 * - a graph whose projected footprint exceeds the per-request cap is refused
 *   typed, reported, and the write is skipped (in-memory state is kept; the
 *   next change retries) instead of freezing the UI thread;
 * - a graph at or above the large threshold rides the persist engine, which
 *   charges the same bounded projection and stringifies off-thread;
 * - everything smaller stays on the synchronous path, which is safe because
 *   the projection proved it is small.
 */
async function shouldSkipWrite(name: string, value: StorageValue<unknown>): Promise<string | null> {
  const projection = projectJsonBytes(value, CLIENT_ENGINE_AUX_STRINGIFY_MAX_BYTES);
  if (!projection.ok) {
    reportPersistError(
      `state "${name}" input (${projection.reason})`,
      new ClientEngineAuxInputTooLargeError(projection.reason),
    );
    return null;
  }
  let json: string;
  if (projection.bytes >= LARGE_STORAGE_JSON_CHARS * 2) {
    try {
      json = await getPersistJsonEngine().stringifyJson(value);
    } catch (error) {
      // Typed engine failure (worker unavailable/mismatch): report and skip
      // instead of leaving an unhandled rejection on Zustand's fire-and-forget
      // setItem. In-memory state is kept; the next change retries.
      reportPersistError(`state "${name}"`, error);
      return null;
    }
  } else {
    json = JSON.stringify(value);
  }
  if (lastStorageJson.get(name) === json) return null;
  lastStorageJson.set(name, json);
  return json;
}

function isSameAppStoreValue(
  previous: StorageValue<unknown> | undefined,
  next: StorageValue<unknown>,
): boolean {
  if (!previous || previous.version !== next.version) return false;
  const prevState = previous.state as
    | { view?: AppView; groupLayouts?: Record<string, unknown> }
    | undefined;
  const nextState = next.state as
    | { view?: AppView; groupLayouts?: Record<string, unknown> }
    | undefined;
  if (!prevState || !nextState) return false;
  return prevState.view === nextState.view && prevState.groupLayouts === nextState.groupLayouts;
}
