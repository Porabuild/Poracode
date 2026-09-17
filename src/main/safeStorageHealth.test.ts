import { beforeEach, describe, expect, it, vi } from "vitest";

const safeStorageMock = vi.hoisted(() => ({
  decryptString: vi.fn<(value: Buffer) => string>(),
  encryptString: vi.fn<(value: string) => Buffer>(),
  getSelectedStorageBackend: vi.fn<() => string>(),
  isEncryptionAvailable: vi.fn<() => boolean>(),
}));

vi.mock("electron", () => ({ safeStorage: safeStorageMock }));

import {
  SAFE_STORAGE_LATCH_WARNING,
  reprobeSafeStorageHealth,
  resetSafeStorageHealthForTests,
  safeStorageHealth,
} from "./safeStorageHealth";

describe("safeStorageHealth latch", () => {
  let consoleWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetSafeStorageHealthForTests();
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    safeStorageMock.decryptString.mockReset();
    safeStorageMock.encryptString.mockReset();
    safeStorageMock.getSelectedStorageBackend.mockReset().mockReturnValue("gnome_libsecret");
    safeStorageMock.isEncryptionAvailable.mockReset().mockReturnValue(true);
  });

  it("probes exactly once per launch and latches the healthy verdict", () => {
    expect(safeStorageHealth()).toEqual({ kind: "healthy" });
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
    expect(safeStorageHealth()).toEqual({ kind: "healthy" });
    expect(safeStorageMock.isEncryptionAvailable).toHaveBeenCalledTimes(1);
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("latches the unavailable verdict and warns exactly once across calls and platforms", () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
    expect(safeStorageHealth("darwin")).toEqual({ kind: "unavailable" });
    expect(safeStorageHealth("linux")).toEqual({ kind: "unavailable" });
    expect(safeStorageMock.isEncryptionAvailable).toHaveBeenCalledTimes(1);
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn).toHaveBeenCalledWith(SAFE_STORAGE_LATCH_WARNING);
    expect(SAFE_STORAGE_LATCH_WARNING).toContain("session-only until");
  });

  it("treats the Linux basic_text backend as unavailable", () => {
    safeStorageMock.getSelectedStorageBackend.mockReturnValue("basic_text");
    expect(safeStorageHealth("linux")).toEqual({ kind: "unavailable" });
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });

  it("does not apply the Linux backend check on other platforms", () => {
    safeStorageMock.getSelectedStorageBackend.mockReturnValue("basic_text");
    expect(safeStorageHealth("darwin")).toEqual({ kind: "healthy" });
    expect(safeStorageMock.getSelectedStorageBackend).not.toHaveBeenCalled();
  });

  it("latches inspection failure and preserves its cause for callers", () => {
    const cause = new Error("synthetic keychain error");
    safeStorageMock.isEncryptionAvailable.mockImplementation(() => {
      throw cause;
    });
    expect(safeStorageHealth()).toEqual({ kind: "inspection-failed", cause });
    expect(safeStorageHealth()).toEqual({ kind: "inspection-failed", cause });
    expect(safeStorageMock.isEncryptionAvailable).toHaveBeenCalledTimes(1);
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("re-probes only on the explicit reprobe request", () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValueOnce(false);
    expect(safeStorageHealth()).toEqual({ kind: "unavailable" });
    expect(consoleWarn).toHaveBeenCalledTimes(1);

    safeStorageMock.isEncryptionAvailable.mockReturnValue(true);
    expect(safeStorageHealth()).toEqual({ kind: "unavailable" });
    expect(reprobeSafeStorageHealth()).toEqual({ kind: "healthy" });
    expect(safeStorageMock.isEncryptionAvailable).toHaveBeenCalledTimes(2);
    // The warning belongs to the latched launch verdict, not to re-probes.
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });
});
