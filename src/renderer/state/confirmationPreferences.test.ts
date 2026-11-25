// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  setConfirmContextSizeReload,
  shouldConfirmContextSizeReload,
} from "./contextSizeReloadPreference";
import { setConfirmThreadDelete, shouldConfirmThreadDelete } from "./threadDeletePreference";

describe("confirmation preferences under a full storage quota", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps asking when the opt-out cannot be stored", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    expect(() => setConfirmThreadDelete(false)).not.toThrow();
    expect(shouldConfirmThreadDelete()).toBe(true);
    expect(() => setConfirmContextSizeReload(false)).not.toThrow();
    expect(shouldConfirmContextSizeReload()).toBe(true);
  });

  it("stores and clears the opt-outs when storage is available", () => {
    setConfirmThreadDelete(false);
    setConfirmContextSizeReload(false);
    expect(shouldConfirmThreadDelete()).toBe(false);
    expect(shouldConfirmContextSizeReload()).toBe(false);
    setConfirmThreadDelete(true);
    setConfirmContextSizeReload(true);
    expect(shouldConfirmThreadDelete()).toBe(true);
    expect(shouldConfirmContextSizeReload()).toBe(true);
  });
});
