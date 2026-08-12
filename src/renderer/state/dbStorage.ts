import type { PersistStorage, StorageValue } from "zustand/middleware";
import { isQuickComposerWindow, readBridge } from "../bridge";
import { captureRendererException } from "../diagnostics/sentry";
import { hasClientCapability } from "../clientRuntime";
import type { Project, Thread, AppView } from "@/shared/contracts";

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
  return (
    typeof window !== "undefined" &&
    (window.poracodeHost !== undefined || window.poracode !== undefined) &&
    hasClientCapability("localBackend")
  );
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

  return {
    async getItem(name: string): Promise<StorageValue<S> | null> {
      if (!hasBridge()) return parseStorageValue(localStorage.getItem(name)) as StorageValue<S>;
      if (name === APP_STORE_NAME) {
        const value = await loadAppStore();
        if (value) appStoreWrites.remember(value);
        return value as StorageValue<S> | null;
      }
      return parseStorageValue(await readPersistedState(name)) as StorageValue<S> | null;
    },

    async setItem(name: string, value: StorageValue<S>): Promise<void> {
      if (name === APP_STORE_NAME) {
        if (!hasBridge()) {
          if (appStoreWrites.isDuplicate(value)) return;
          appStoreWrites.remember(value);
          localStorage.setItem(name, JSON.stringify(value));
          return;
        }
        if (isQuickComposerWindow()) return;
        return appStoreWrites.write(value);
      }

      const json = shouldSkipWrite(name, value);
      if (json === null) return;
      if (!hasBridge()) {
        localStorage.setItem(name, json);
        return;
      }
      readBridge()
        .dbSetState(name, json)
        .catch((error) => reportPersistError(`state "${name}"`, error));
    },

    async removeItem(name: string): Promise<void> {
      lastStorageJson.delete(name);
      if (!hasBridge()) {
        if (name === APP_STORE_NAME) {
          appStoreWrites.forget();
        }
        return localStorage.removeItem(name);
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

class AppStoreWriteQueue {
  private lastPersisted: StorageValue<unknown> | undefined;
  private readonly operations: AppStoreOperation[] = [];
  private draining = false;

  isDuplicate(value: StorageValue<unknown>): boolean {
    return !this.draining && isSameAppStoreValue(this.lastPersisted, value);
  }

  remember(value: StorageValue<unknown>): void {
    this.lastPersisted = value;
  }

  forget(): void {
    this.lastPersisted = undefined;
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

  private async drain(): Promise<void> {
    while (this.operations.length > 0) {
      const operation = this.operations.shift()!;
      if (operation.kind === "write") {
        if (!isSameAppStoreValue(this.lastPersisted, operation.value)) {
          try {
            await saveAppStore(operation.value);
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
    }
    this.draining = false;
  }
}

/** Load projects + threads + view from SQLite and assemble into Zustand persist format. */
async function loadAppStore(): Promise<StorageValue<unknown> | null> {
  const [projects, threads, viewJson] = await Promise.all([
    readBridge().dbGetProjects(),
    readBridge().dbGetThreads(),
    readBridge().dbGetState("view"),
  ]);

  if (projects.length === 0 && threads.length === 0 && !viewJson) {
    return null;
  }

  let view: AppView = { kind: "home" };
  if (viewJson) {
    try {
      view = JSON.parse(viewJson) as AppView;
    } catch {
      // corrupt — fall back to home
    }
  }

  let groupLayouts: Record<string, unknown> = {};
  const groupLayoutsJson = await readBridge().dbGetState("groupLayouts");
  if (groupLayoutsJson) {
    try {
      groupLayouts = JSON.parse(groupLayoutsJson) as Record<string, unknown>;
    } catch {
      // corrupt — ignore
    }
  }

  return {
    state: { projects, threads, view, groupLayouts },
    version: 4,
  };
}

/** Parse the Zustand persist payload and write to SQLite. */
async function saveAppStore(value: StorageValue<unknown>): Promise<void> {
  let state:
    | {
        projects?: Project[];
        threads?: Thread[];
        view?: AppView;
        groupLayouts?: Record<string, unknown>;
      }
    | undefined;
  let viewJson: string;
  let groupLayoutsJson: string | undefined;
  try {
    state = value.state as typeof state;
    if (!state || typeof state !== "object") return;
    viewJson = JSON.stringify(state.view ?? { kind: "home" });
    groupLayoutsJson = state.groupLayouts ? JSON.stringify(state.groupLayouts) : undefined;
  } catch (error) {
    reportPersistError("app store", error);
    throw error;
  }

  const writes: Promise<void>[] = [
    readBridge()
      .dbSyncAll(state.projects ?? [], state.threads ?? [], viewJson)
      .catch((error) => {
        reportPersistError("projects/threads/view", error);
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

async function removeAppStore(): Promise<void> {
  const writes = [
    readBridge()
      .dbSyncAll([], [], JSON.stringify({ kind: "home" }))
      .catch((error) => {
        reportPersistError("removal of projects/threads/view", error);
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

function parseStorageValue(raw: string | null): StorageValue<unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StorageValue<unknown>;
  } catch {
    return null;
  }
}

function shouldSkipWrite(name: string, value: StorageValue<unknown>): string | null {
  const json = JSON.stringify(value);
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
    | {
        projects?: Project[];
        threads?: Thread[];
        view?: AppView;
        groupLayouts?: Record<string, unknown>;
      }
    | undefined;
  const nextState = next.state as
    | {
        projects?: Project[];
        threads?: Thread[];
        view?: AppView;
        groupLayouts?: Record<string, unknown>;
      }
    | undefined;
  if (!prevState || !nextState) return false;
  return (
    prevState.projects === nextState.projects &&
    prevState.threads === nextState.threads &&
    prevState.view === nextState.view &&
    prevState.groupLayouts === nextState.groupLayouts
  );
}
