import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const safeStorageMock = vi.hoisted(() => ({
  decryptString: vi.fn<(value: Buffer) => string>(),
  encryptString: vi.fn<(value: string) => Buffer>(),
  getSelectedStorageBackend: vi.fn<() => string>(),
  isEncryptionAvailable: vi.fn<() => boolean>(),
}));

vi.mock("electron", () => ({ safeStorage: safeStorageMock }));

import {
  SafeStorageKeyUnavailableError,
  readOrCreateSafeStorageSecretKey,
} from "./secretStorageKey";

describe("readOrCreateSafeStorageSecretKey", () => {
  let dir: string;
  let consoleWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "poracode-safe-storage-"));
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    safeStorageMock.decryptString.mockReset();
    safeStorageMock.encryptString.mockReset().mockImplementation((value) => Buffer.from(value));
    safeStorageMock.getSelectedStorageBackend.mockReset().mockReturnValue("gnome_libsecret");
    safeStorageMock.isEncryptionAvailable.mockReset().mockReturnValue(true);
  });

  afterEach(() => {
    consoleWarn.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it.each([
    { available: false, backend: "gnome_libsecret" },
    { available: true, backend: "basic_text" },
  ])(
    "uses a session-only key when secure Linux storage is unavailable",
    ({ available, backend }) => {
      safeStorageMock.isEncryptionAvailable.mockReturnValue(available);
      safeStorageMock.getSelectedStorageBackend.mockReturnValue(backend);

      const first = readOrCreateSafeStorageSecretKey(dir, "linux");
      const second = readOrCreateSafeStorageSecretKey(dir, "linux");

      expect(Buffer.from(first, "base64")).toHaveLength(32);
      expect(Buffer.from(second, "base64")).toHaveLength(32);
      expect(second).toBe(first);
      expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
      expect(safeStorageMock.decryptString).not.toHaveBeenCalled();
      expect(() => readFileSync(join(dir, "secret-key.safe"))).toThrow(/ENOENT|no such file/i);
      expect(consoleWarn).toHaveBeenCalledWith(
        "[credential-storage] secure OS encryption is unavailable; credentials are session-only.",
      );
    },
  );

  it("persists a newly generated key only through safeStorage encryption", () => {
    safeStorageMock.encryptString.mockImplementation(() => Buffer.from("sealed-key"));

    const key = readOrCreateSafeStorageSecretKey(dir, "linux");

    expect(Buffer.from(key, "base64")).toHaveLength(32);
    expect(safeStorageMock.encryptString).toHaveBeenCalledWith(key);
    expect(readFileSync(join(dir, "secret-key.safe"), "utf8")).toBe(
      Buffer.from("sealed-key").toString("base64"),
    );
  });

  it("refuses loudly instead of rotating when the stored key cannot be decrypted", () => {
    const preserved = Buffer.from("old-sealed-key").toString("base64");
    writeFileSync(join(dir, "secret-key.safe"), preserved);
    safeStorageMock.decryptString.mockImplementation(() => {
      throw new Error("unexpected crypto details");
    });

    expect(() => readOrCreateSafeStorageSecretKey(dir, "linux")).toThrow(
      SafeStorageKeyUnavailableError,
    );
    expect(() => readOrCreateSafeStorageSecretKey(dir, "linux")).toThrow(/decryption failed/u);

    // No silent rotation: the sealed key file is byte-identical, no new key
    // was sealed, and the disclosure names the loss and the explicit remedies
    // without leaking native crypto details.
    expect(readFileSync(join(dir, "secret-key.safe"), "utf8")).toBe(preserved);
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
    let message = "";
    try {
      readOrCreateSafeStorageSecretKey(dir, "linux");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("sign in again");
    expect(message).toContain("restore");
    expect(message).not.toContain("unexpected crypto details");
  });

  it("refuses loudly when decryption yields invalid key material", () => {
    const preserved = Buffer.from("old-sealed-key").toString("base64");
    writeFileSync(join(dir, "secret-key.safe"), preserved);
    safeStorageMock.decryptString.mockReturnValue(Buffer.alloc(16).toString("base64"));

    expect(() => readOrCreateSafeStorageSecretKey(dir, "linux")).toThrow(
      SafeStorageKeyUnavailableError,
    );
    expect(readFileSync(join(dir, "secret-key.safe"), "utf8")).toBe(preserved);
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
  });

  it("types the refusal with a stable code for surfacing", () => {
    writeFileSync(join(dir, "secret-key.safe"), Buffer.from("old-sealed-key").toString("base64"));
    safeStorageMock.decryptString.mockImplementation(() => {
      throw new Error("unexpected crypto details");
    });
    const captured: unknown[] = [];
    try {
      readOrCreateSafeStorageSecretKey(dir, "linux");
    } catch (error) {
      captured.push(error);
    }
    expect(captured).toHaveLength(1);
    expect((captured[0] as SafeStorageKeyUnavailableError).code).toBe(
      "SAFE_STORAGE_KEY_UNAVAILABLE",
    );
    expect((captured[0] as SafeStorageKeyUnavailableError).reason).toBe("decrypt_failed");
  });

  it("keeps unexpected encryption failures observable without leaking the key", () => {
    safeStorageMock.encryptString.mockImplementation(() => {
      throw new Error("crypto backend details");
    });

    expect(() => readOrCreateSafeStorageSecretKey(dir, "linux")).toThrow(
      "Unable to encrypt the Poracode secret storage key.",
    );
    expect(() => readFileSync(join(dir, "secret-key.safe"))).toThrow(/ENOENT|no such file/i);
  });
});
