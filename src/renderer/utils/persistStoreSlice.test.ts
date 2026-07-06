import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { persistStoreSlice, readPersistedSlice } from "./persistStoreSlice";

interface TestState {
  persisted: string;
  session: number;
  setPersisted: (v: string) => void;
  // Mirrors the real stores' no-op guard: unchanged value returns the same
  // state reference so zustand skips the notification entirely.
  setSessionGuarded: (v: number) => void;
}

function makeStore() {
  return createStore<TestState>((set) => ({
    persisted: "a",
    session: 0,
    setPersisted: (v) => set({ persisted: v }),
    setSessionGuarded: (v) => set((s) => (s.session === v ? s : { session: v })),
  }));
}

describe("persistStoreSlice", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("does no localStorage I/O when a non-persisted field changes", () => {
    const store = makeStore();
    persistStoreSlice(store, "k", (s) => ({ persisted: s.persisted }));
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    // The regression: with the `persist` middleware every one of these hot-path
    // session updates wrote localStorage. Slice persistence writes zero times.
    store.getState().setSessionGuarded(1);
    store.getState().setSessionGuarded(2);
    store.getState().setSessionGuarded(3);

    expect(setItem).not.toHaveBeenCalled();
  });

  it("writes only the selected slice, and only when it changes", () => {
    const store = makeStore();
    persistStoreSlice(store, "k", (s) => ({ persisted: s.persisted }));

    store.getState().setPersisted("b");
    expect(JSON.parse(localStorage.getItem("k") ?? "null")).toEqual({ persisted: "b" });

    const setItem = vi.spyOn(Storage.prototype, "setItem");
    // Re-setting the same value produces an equal slice → no rewrite.
    store.getState().setPersisted("b");
    expect(setItem).not.toHaveBeenCalled();

    // A real change writes again.
    store.getState().setPersisted("c");
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem("k") ?? "null")).toEqual({ persisted: "c" });
  });
});

describe("readPersistedSlice", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("reads a raw slice", () => {
    localStorage.setItem("k", JSON.stringify({ isCollapsed: true }));
    expect(readPersistedSlice<{ isCollapsed: boolean }>("k")).toEqual({ isCollapsed: true });
  });

  it("unwraps the legacy `persist` middleware envelope", () => {
    localStorage.setItem("k", JSON.stringify({ state: { isCollapsed: true }, version: 1 }));
    expect(readPersistedSlice<{ isCollapsed: boolean }>("k")).toEqual({ isCollapsed: true });
  });

  it("returns null for absent or unparseable values", () => {
    expect(readPersistedSlice("absent")).toBeNull();
    localStorage.setItem("bad", "{not json");
    expect(readPersistedSlice("bad")).toBeNull();
  });
});
