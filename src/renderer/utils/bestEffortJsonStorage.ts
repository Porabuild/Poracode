import { createJSONStorage } from "zustand/middleware";

/**
 * zustand `persist` storage over localStorage for best-effort state. Reads stay
 * synchronous so the value is present on first paint. A failed write — a full
 * per-origin quota (about 5 MB in iOS Safari, shared with composer drafts) or
 * an unavailable storage — keeps the previous value instead of throwing into
 * the `set()` caller, where an event or socket handler would take it to the
 * crash screen. Returns undefined when localStorage cannot be accessed, like
 * `createJSONStorage`.
 */
export function createBestEffortJsonStorage(): ReturnType<typeof createJSONStorage> {
  const storage = createJSONStorage(() => localStorage);
  if (!storage) return undefined;
  return {
    getItem: (name) => storage.getItem(name),
    setItem: (name, value) => {
      try {
        storage.setItem(name, value);
      } catch (error) {
        console.warn("[localStorage] failed to persist %s", name, error);
      }
    },
    removeItem: (name) => {
      try {
        storage.removeItem(name);
      } catch (error) {
        console.warn("[localStorage] failed to remove %s", name, error);
      }
    },
  };
}
