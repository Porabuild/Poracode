import { createJSONStorage } from "zustand/middleware";
import { readBridge } from "../bridge";
import type { Project, Thread, AppView } from "../../shared/contracts";

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

const dbStorageBackend = {
  async getItem(name: string): Promise<string | null> {
    if (!hasBridge()) return localStorage.getItem(name);
    if (name === "lightcode-app-v2") {
      return loadAppStore();
    }
    return readBridge().dbGetState(name);
  },

  async setItem(name: string, value: string): Promise<void> {
    if (!hasBridge()) {
      localStorage.setItem(name, value);
      return;
    }
    if (name === "lightcode-app-v2") {
      return saveAppStore(value);
    }
    void readBridge().dbSetState(name, value);
  },

  async removeItem(name: string): Promise<void> {
    if (!hasBridge()) {
      localStorage.removeItem(name);
      return;
    }
    void readBridge().dbSetState(name, "");
  },
};

/** Creates a Zustand-compatible storage adapter backed by SQLite via IPC. */
export function createDbStorage() {
  return createJSONStorage(() => dbStorageBackend);
}

/** Load projects + threads + view from SQLite and assemble into Zustand persist format. */
async function loadAppStore(): Promise<string | null> {
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

  return JSON.stringify({
    state: { projects, threads, view },
    version: 4,
  });
}

/** Parse the Zustand persist payload and write to SQLite. */
async function saveAppStore(value: string): Promise<void> {
  try {
    const parsed = JSON.parse(value) as {
      state?: { projects?: Project[]; threads?: Thread[]; view?: AppView };
    };
    const state = parsed.state;
    if (!state) return;

    void readBridge().dbSyncAll(
      state.projects ?? [],
      state.threads ?? [],
      JSON.stringify(state.view ?? { kind: "home" }),
    );
  } catch {
    // If parsing fails, skip the write.
  }
}
