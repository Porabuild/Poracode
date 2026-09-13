import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HOST_CREDENTIAL_STATE_FILE } from "./hostCredentialState";
import { getOwnedSecretStorageKey, type NativeSecretValue } from "./ownedSecretKey";
import {
  cleanOwnedKeyFixtures,
  ownedKeyFixture,
  syntheticNativeCodec,
} from "./fixtures/ownedKeyFixture";

afterEach(cleanOwnedKeyFixtures);

describe("owner-fenced native secret codec", () => {
  it("persists sealed bytes in the backend and gives the native callback no paths", async () => {
    const value = ownedKeyFixture("desktop");
    const codec = syntheticNativeCodec();
    const first = await getOwnedSecretStorageKey(value.lease, { mode: "os-sealed", codec });
    expect(codec.seal).toHaveBeenCalledWith({
      ownerGeneration: value.lease.generation,
      value: first,
    });
    const stored = readFileSync(join(value.paths.dataRoot, "secret-key.safe"), "utf8");
    expect(stored).not.toBe(first);
    const restarted = value.restart();
    expect(await getOwnedSecretStorageKey(restarted, { mode: "os-sealed", codec })).toBe(first);
    expect(codec.unseal).toHaveBeenCalledWith({
      ownerGeneration: restarted.generation,
      value: stored,
    });
    expect(codec.seal).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent initialization while the native callback is pending", async () => {
    const value = ownedKeyFixture("desktop");
    const codec = syntheticNativeCodec();
    const pending = Promise.withResolvers<NativeSecretValue>();
    codec.seal.mockReturnValue(pending.promise);
    const first = getOwnedSecretStorageKey(value.lease, { mode: "os-sealed", codec });
    const second = getOwnedSecretStorageKey(value.lease, { mode: "os-sealed", codec });
    await vi.waitFor(() => expect(codec.seal).toHaveBeenCalledTimes(1));
    const request = codec.seal.mock.calls[0]![0];
    pending.resolve({
      ownerGeneration: request.ownerGeneration,
      value: Buffer.from(`sealed:${request.value}`).toString("base64"),
    });
    expect(await second).toBe(await first);
  });

  it("does not let a late old-generation seal overwrite a successor's key", async () => {
    const value = ownedKeyFixture("desktop");
    const codec = syntheticNativeCodec();
    const pending = Promise.withResolvers<NativeSecretValue>();
    codec.seal.mockReturnValue(pending.promise);
    const first = getOwnedSecretStorageKey(value.lease, { mode: "os-sealed", codec });
    await vi.waitFor(() => expect(codec.seal).toHaveBeenCalledTimes(1));
    const oldGeneration = value.lease.generation;
    await getOwnedSecretStorageKey(value.restart(), {
      mode: "os-sealed",
      codec: syntheticNativeCodec(),
    });
    const path = join(value.paths.dataRoot, "secret-key.safe");
    const successorBytes = readFileSync(path, "utf8");
    pending.resolve({
      ownerGeneration: oldGeneration,
      value: Buffer.from("late synthetic sealed bytes").toString("base64"),
    });
    await expect(first).rejects.toThrow(/no longer active/u);
    expect(readFileSync(path, "utf8")).toBe(successorBytes);
  });

  it("does not return an unsealed key after the owner loses its lease", async () => {
    const value = ownedKeyFixture("desktop");
    const codec = syntheticNativeCodec();
    const key = await getOwnedSecretStorageKey(value.lease, { mode: "os-sealed", codec });
    value.restart();
    const pending = Promise.withResolvers<NativeSecretValue>();
    codec.unseal.mockReturnValue(pending.promise);
    const result = getOwnedSecretStorageKey(value.lease, { mode: "os-sealed", codec });
    await vi.waitFor(() => expect(codec.unseal).toHaveBeenCalledTimes(1));
    const generation = value.lease.generation;
    value.lease.release();
    pending.resolve({ ownerGeneration: generation, value: key });
    await expect(result).rejects.toThrow(/no longer active/u);
  });

  it("refuses a native reply tagged for another generation before writing files", async () => {
    const value = ownedKeyFixture("desktop");
    const codec = syntheticNativeCodec();
    codec.seal.mockResolvedValue({
      ownerGeneration: "unrelated-generation",
      value: Buffer.from("synthetic").toString("base64"),
    });
    await expect(
      getOwnedSecretStorageKey(value.lease, { mode: "os-sealed", codec }),
    ).rejects.toThrow(/no longer active/u);
    expect(existsSync(join(value.paths.dataRoot, "secret-key.safe"))).toBe(false);
    expect(existsSync(join(value.paths.dataRoot, HOST_CREDENTIAL_STATE_FILE))).toBe(false);
  });

  it("requires an explicit generation on a native reply", async () => {
    const value = ownedKeyFixture("desktop");
    const codec = syntheticNativeCodec();
    codec.seal.mockResolvedValue({
      value: Buffer.from("synthetic sealed bytes").toString("base64"),
    } as NativeSecretValue);
    await expect(
      getOwnedSecretStorageKey(value.lease, { mode: "os-sealed", codec }),
    ).rejects.toThrow(/Invalid.*response/u);
    expect(existsSync(join(value.paths.dataRoot, "secret-key.safe"))).toBe(false);
  });

  it.each(["throw", "invalid-key"] as const)(
    "preserves an old sealed key on native %s failure",
    async (failure) => {
      const value = ownedKeyFixture("desktop");
      const codec = syntheticNativeCodec();
      await getOwnedSecretStorageKey(value.lease, { mode: "os-sealed", codec });
      const path = join(value.paths.dataRoot, "secret-key.safe");
      const old = readFileSync(path, "utf8");
      value.restart();
      if (failure === "throw")
        codec.unseal.mockRejectedValue(new Error("synthetic private crypto detail"));
      else
        codec.unseal.mockImplementation(async (request) => ({
          ...request,
          value: "invalid synthetic key",
        }));
      await expect(
        getOwnedSecretStorageKey(value.lease, { mode: "os-sealed", codec }),
      ).rejects.toThrow(/existing key was preserved|not replaced/u);
      expect(readFileSync(path, "utf8")).toBe(old);
      expect(codec.seal).toHaveBeenCalledTimes(1);
    },
  );

  it("refuses damaged sealed bytes without asking native code to replace them", async () => {
    const value = ownedKeyFixture("desktop");
    const codec = syntheticNativeCodec();
    const path = join(value.paths.dataRoot, "secret-key.safe");
    writeFileSync(path, "malformed synthetic sealed bytes");
    await expect(
      getOwnedSecretStorageKey(value.lease, { mode: "os-sealed", codec }),
    ).rejects.toThrow(/Invalid sealed/u);
    expect(codec.seal).not.toHaveBeenCalled();
    expect(codec.unseal).not.toHaveBeenCalled();
    expect(readFileSync(path, "utf8")).toBe("malformed synthetic sealed bytes");
  });
});
