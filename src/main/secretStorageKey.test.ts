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

import { readOrCreateSafeStorageSecretKey } from "./secretStorageKey";

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

  it("recovers from an undecryptable stored key with only a fixed local warning", () => {
    writeFileSync(join(dir, "secret-key.safe"), Buffer.from("old-sealed-key").toString("base64"));
    safeStorageMock.decryptString.mockImplementation(() => {
      throw new Error("unexpected crypto details");
    });

    const key = readOrCreateSafeStorageSecretKey(dir, "linux");

    expect(Buffer.from(key, "base64")).toHaveLength(32);
    expect(consoleWarn).toHaveBeenCalledWith(
      "[credential-storage] stored key recovery (decrypt_failed); rotating encrypted key.",
    );
    expect(consoleWarn).not.toHaveBeenCalledWith(expect.stringContaining("unexpected crypto"));
  });

  it("rotates an invalid decrypted key with only a fixed local warning", () => {
    writeFileSync(join(dir, "secret-key.safe"), Buffer.from("old-sealed-key").toString("base64"));
    safeStorageMock.decryptString.mockReturnValue(Buffer.alloc(16).toString("base64"));

    const key = readOrCreateSafeStorageSecretKey(dir, "linux");

    expect(Buffer.from(key, "base64")).toHaveLength(32);
    expect(consoleWarn).toHaveBeenCalledWith(
      "[credential-storage] stored key recovery (invalid_key); rotating encrypted key.",
    );
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
