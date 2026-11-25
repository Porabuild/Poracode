import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isQuotaExceededError,
  registerLocalStoragePressureRelief,
  relieveLocalStoragePressure,
  removeStoredKey,
  resetLocalStoragePressureReliefsForTest,
} from "./localStorage";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  resetLocalStoragePressureReliefsForTest();
});

describe("localStorage helpers", () => {
  it("removes a key and ignores an unavailable storage", () => {
    localStorage.setItem("poracode-test-remove", "1");
    removeStoredKey("poracode-test-remove");
    expect(localStorage.getItem("poracode-test-remove")).toBeNull();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Access is denied for this document.", "SecurityError");
    });
    expect(() => removeStoredKey("poracode-test-remove")).not.toThrow();
  });

  it("recognizes the quota errors browsers throw", () => {
    expect(isQuotaExceededError(new DOMException("full", "QuotaExceededError"))).toBe(true);
    expect(isQuotaExceededError({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
    expect(isQuotaExceededError(new Error("full"))).toBe(false);
    expect(isQuotaExceededError(undefined)).toBe(false);
  });

  it("asks every disposable cache for room and sums what they freed", () => {
    const asked: number[] = [];
    registerLocalStoragePressureRelief((minBytes) => {
      asked.push(minBytes);
      return 400;
    });
    registerLocalStoragePressureRelief(() => {
      throw new Error("cache unavailable");
    });
    registerLocalStoragePressureRelief(() => 100);
    expect(relieveLocalStoragePressure(300)).toBe(500);
    expect(asked).toEqual([300]);
  });

  it("reports nothing to free when no disposable cache is registered", () => {
    expect(relieveLocalStoragePressure(1024)).toBe(0);
  });
});
