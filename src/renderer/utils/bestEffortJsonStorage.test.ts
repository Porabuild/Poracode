import { afterEach, describe, expect, it, vi } from "vitest";
import { createBestEffortJsonStorage } from "./bestEffortJsonStorage";

const KEY = "poracode-best-effort-storage-test-v1";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("createBestEffortJsonStorage", () => {
  it("writes and reads through to localStorage", () => {
    const storage = createBestEffortJsonStorage()!;
    const value = { state: { count: 1 }, version: 1 };
    storage.setItem(KEY, value);
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify(value));
    expect(storage.getItem(KEY)).toEqual(value);
    storage.removeItem(KEY);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps the previous value instead of throwing when the quota is exceeded", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = createBestEffortJsonStorage()!;
    const value = { state: { count: 1 }, version: 1 };
    storage.setItem(KEY, value);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    expect(() => storage.setItem(KEY, { state: { count: 2 }, version: 1 })).not.toThrow();
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify(value));
    expect(warn).toHaveBeenCalledTimes(1);
    setItem.mockRestore();
  });

  it("swallows a failed remove", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = createBestEffortJsonStorage()!;
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    expect(() => storage.removeItem(KEY)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("returns undefined when localStorage cannot be accessed", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Access is denied for this document.", "SecurityError");
    });
    expect(createBestEffortJsonStorage()).toBeUndefined();
  });
});
