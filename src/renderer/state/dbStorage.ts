import type { PersistStorage, StorageValue } from "zustand/middleware";
import { isQuickComposerWindow, readBridge } from "../bridge";
import { captureRendererException } from "../diagnostics/sentry";
import type { Project, Thread, AppView } from "@/shared/contracts";

/**
 * Surface a persistence failure instead of silently dropping it. These writes
 * are fire-and-forget (Zustand's persist middleware does not retry), so a
 * swallowed rejection means the user's data was never saved while the UI shows
 * it as committed. Reporting is the minimum so the loss is observable.
 */
function reportPersistError(operation: string, error: unknown): void {
  console.error(`[lightcode] failed to persist ${operation}:`, error);
  captureRendererException(error, { featureArea: "app-state-persistence" });
}

/**
 * Raw string-level storage backend backed by SQLite via IPC.
 *
 * For the main app store ("lightcode-app-v2"), it maps the Zustand persist
 * format to/from individual SQLite rows (projects, threads, view).
 * For other stores, it uses the generic key-value `app_state` table.
 */
function hasBridge(): boolean {
  return typeof window !== "undefined" && window.lightcode !== undefined;
}

const APP_STORE_NAME = "lightcode-app-v2";
const lastStorageValues = new Map<string, StorageValue<unknown>>();
const lastStorageJson = new Map<string, string>();

const dbStorageBackend = {
  async getItem(name: string): Promise<StorageValue<unknown> | null> {
    if (!hasBridge()) return parseStorageValue(localStorage.getItem(name));
    if (name === APP_STORE_NAME) {
      return loadAppStore();
    }
    return parseStorageValue(await readBridge().dbGetState(name));
  },

  async setItem(name: string, value: StorageValue<unknown>): Promise<void> {
    const json = shouldSkipWrite(name, value);
    if (json === null) return;
    if (!hasBridge()) {
      localStorage.setItem(name, json || JSON.stringify(value));
      return;
    }
    if (name === APP_STORE_NAME) {
      if (isQuickComposerWindow()) return;
      return saveAppStore(value);
    }
    readBridge()
      .dbSetState(name, json)
      .catch((error) => reportPersistError(`state "${name}"`, error));
  },

  async removeItem(name: string): Promise<void> {
    lastStorageValues.delete(name);
    lastStorageJson.delete(name);
    if (!hasBridge()) {
      localStorage.removeItem(name);
      return;
    }
    readBridge()
      .dbSetState(name, "")
      .catch((error) => reportPersistError(`removal of state "${name}"`, error));
  },
};

/** Creates a Zustand-compatible storage adapter backed by SQLite via IPC. */
export function createDbStorage<S>(): PersistStorage<S> {
  return dbStorageBackend as PersistStorage<S>;
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

  return rememberStorageValue(APP_STORE_NAME, {
    state: { projects, threads, view, groupLayouts },
    version: 4,
  });
}

/** Parse the Zustand persist payload and write to SQLite. */
async function saveAppStore(value: StorageValue<unknown>): Promise<void> {
  try {
    const state = value.state as
      | {
          projects?: Project[];
          threads?: Thread[];
          view?: AppView;
          groupLayouts?: Record<string, unknown>;
        }
      | undefined;
    if (!state || typeof state !== "object") return;

    readBridge()
      .dbSyncAll(
        state.projects ?? [],
        state.threads ?? [],
        JSON.stringify(state.view ?? { kind: "home" }),
      )
      .catch((error) => reportPersistError("projects/threads/view", error));
    if (state.groupLayouts) {
      readBridge()
        .dbSetState("groupLayouts", JSON.stringify(state.groupLayouts))
        .catch((error) => reportPersistError("group layouts", error));
    }
  } catch (error) {
    // Synchronous failure (e.g. JSON.stringify on a circular structure).
    reportPersistError("app store", error);
  }
}

function parseStorageValue(raw: string | null): StorageValue<unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StorageValue<unknown>;
  } catch {
    return null;
  }
}

function rememberStorageValue(name: string, value: StorageValue<unknown>): StorageValue<unknown> {
  lastStorageValues.set(name, value);
  return value;
}

function shouldSkipWrite(name: string, value: StorageValue<unknown>): string | null {
  if (name === APP_STORE_NAME && isSameAppStoreValue(lastStorageValues.get(name), value)) {
    return null;
  }

  if (name === APP_STORE_NAME) {
    lastStorageValues.set(name, value);
    lastStorageJson.delete(name);
    return "";
  }

  const json = JSON.stringify(value);
  if (lastStorageJson.get(name) === json) return null;
  lastStorageJson.set(name, json);
  lastStorageValues.set(name, value);
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
