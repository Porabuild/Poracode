import type { StoreApi } from "zustand";

/**
 * Read a persisted slice previously written by {@link persistStoreSlice}. Also
 * unwraps the zustand `persist` middleware envelope (`{ state, version }`) so
 * installs that ran an intermediate build which used `persist` keep their value
 * on the first launch after switching to slice persistence. Returns `null` when
 * the key is absent or unparseable.
 */
export function readPersistedSlice<S extends Record<string, unknown>>(
  key: string,
): Partial<S> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      const envelope = parsed as { state?: unknown };
      if (envelope.state && typeof envelope.state === "object") {
        return envelope.state as Partial<S>;
      }
      return parsed as Partial<S>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persist only `select(state)` to `localStorage[key]`, writing exactly when that
 * slice changes (shallow comparison of its top-level fields).
 *
 * This exists because zustand's `persist` middleware calls `setItem()` after
 * *every* action, even ones that touch only session-scoped fields. Stores whose
 * hot-path setters (ResizeObserver-driven width, frequent panel/modal toggles)
 * vastly outnumber the writes that actually change the persisted slice would
 * otherwise incur a synchronous `JSON.stringify` + `localStorage.setItem` on
 * every one of those unrelated updates. Slice persistence does zero I/O until
 * the persisted slice itself changes.
 *
 * Hydration stays synchronous and lives at the call site: seed the store's
 * initial state from {@link readPersistedSlice} so the value is present before
 * first paint, then wire this subscriber to keep it written.
 */
export function persistStoreSlice<T, S extends Record<string, unknown>>(
  store: StoreApi<T>,
  key: string,
  select: (state: T) => S,
): void {
  let prev = select(store.getState());
  store.subscribe((state) => {
    const next = select(state);
    if (shallowEqual(prev, next)) return;
    prev = next;
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Persistence is best-effort; ignore quota/serialization failures.
    }
  });
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}
