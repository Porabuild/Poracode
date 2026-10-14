import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeSecretValue } from "@/shared/hostCredentialProtocol";
import { resetSafeStorageHealthForTests } from "../safeStorageHealth";
import { resolveNativeCredentialMode, transformNativeCredentialKey } from "./nativeCredentialCodec";

const native = vi.hoisted(() => ({
  available: vi.fn<() => boolean>(),
  backend: vi.fn<() => string>(),
  seal: vi.fn<(value: string) => Buffer>(),
  unseal: vi.fn<(value: Buffer) => string>(),
}));
vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: native.available,
    getSelectedStorageBackend: native.backend,
    encryptString: native.seal,
    decryptString: native.unseal,
  },
}));

const key = Buffer.alloc(32, 7).toString("base64");
const sealed = Buffer.from("synthetic-sealed-key");
const generation = "synthetic-owner-generation";

beforeEach(() => {
  // The availability verdict is latched once per process (P3); every test
  // starts from an unprobed latch so mock changes are observed.
  resetSafeStorageHealthForTests();
  native.available.mockReset().mockReturnValue(true);
  native.backend.mockReset().mockReturnValue("gnome_libsecret");
  native.seal.mockReset().mockReturnValue(sealed);
  native.unseal.mockReset().mockReturnValue(key);
});

describe("native credential byte codec", () => {
  it("rejects an unknown callback operation before using native storage", () => {
    expect(() =>
      transformNativeCredentialKey(
        "unknown" as "seal",
        { ownerGeneration: generation, value: key },
        generation,
      ),
    ).toThrow("Unknown credential callback operation");
    expect(native.unseal).not.toHaveBeenCalled();
    expect(native.seal).not.toHaveBeenCalled();
  });

  it("round-trips only bytes and the same generation through the native boundary", () => {
    const result = transformNativeCredentialKey(
      "seal",
      { ownerGeneration: generation, value: key },
      generation,
      "darwin",
    );
    expect(result).toEqual({ ownerGeneration: generation, value: sealed.toString("base64") });
    expect(native.seal).toHaveBeenCalledExactlyOnceWith(key);
    expect(transformNativeCredentialKey("unseal", result, generation, "darwin")).toEqual({
      ownerGeneration: generation,
      value: key,
    });
    expect(native.unseal).toHaveBeenCalledExactlyOnceWith(sealed);
  });

  it.each([undefined, "", "another-generation"])(
    "rejects generation %s before using the OS store",
    (ownerGeneration) => {
      const request = { ownerGeneration, value: key } as NativeSecretValue;
      expect(() => transformNativeCredentialKey("seal", request, generation)).toThrow(
        "another owner generation",
      );
      expect(native.available).not.toHaveBeenCalled();
      expect(native.seal).not.toHaveBeenCalled();
    },
  );

  it.each(["", "not-base64", Buffer.alloc(31).toString("base64")])(
    "rejects malformed unsealed key bytes without calling native storage",
    (value) => {
      expect(() =>
        transformNativeCredentialKey("seal", { ownerGeneration: generation, value }, generation),
      ).toThrow("Invalid credential callback bytes");
      expect(native.seal).not.toHaveBeenCalled();
    },
  );

  it("does not use Linux basic_text as persistent OS encryption", () => {
    native.backend.mockReturnValue("basic_text");
    expect(resolveNativeCredentialMode("linux")).toBe("session-only");
    expect(() =>
      transformNativeCredentialKey(
        "seal",
        { ownerGeneration: generation, value: key },
        generation,
        "linux",
      ),
    ).toThrow("unavailable");
    expect(native.seal).not.toHaveBeenCalled();
  });

  it("reports unavailable storage as session-only, and inspection failure as an error", () => {
    native.available.mockReturnValue(false);
    expect(resolveNativeCredentialMode()).toBe("session-only");
    // The latch holds the verdict for the whole launch, so a changed backend
    // is only observed after an explicit reset (as at process start).
    resetSafeStorageHealthForTests();
    native.available.mockImplementation(() => {
      throw new Error("synthetic keychain error");
    });
    expect(() => resolveNativeCredentialMode()).toThrow("Unable to inspect");
  });

  it("refuses malformed unseal output without generating a replacement", () => {
    native.unseal.mockReturnValue("invalid");
    expect(() =>
      transformNativeCredentialKey(
        "unseal",
        { ownerGeneration: generation, value: sealed.toString("base64") },
        generation,
      ),
    ).toThrow("Invalid OS-backed credential key result");
    expect(native.seal).not.toHaveBeenCalled();
  });

  it("contains native errors without echoing key material", () => {
    native.unseal.mockImplementation(() => {
      throw new Error(`synthetic diagnostic with ${key}`);
    });
    expect(() =>
      transformNativeCredentialKey(
        "unseal",
        { ownerGeneration: generation, value: sealed.toString("base64") },
        generation,
      ),
    ).toThrow(/^OS-backed credential key operation failed\.$/);
    expect(native.seal).not.toHaveBeenCalled();
  });
});
