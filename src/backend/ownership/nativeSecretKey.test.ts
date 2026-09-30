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
import {
  HOST_KEY_ADOPTION_OFFER_FILE,
  HostCredentialAdoptionService,
  HostKeyAdoptionRefusedError,
  getNativeSecretStorageKey,
  readHostKeyAdoptionOffer,
  requestNativeKeyAdoption,
} from "./nativeSecretKey";
import { createHostControlRequestProof } from "./hostControlAuth";
import { request } from "node:http";

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
    const sealRequest = codec.seal.mock.calls[0]![0];
    pending.resolve({
      ownerGeneration: sealRequest.ownerGeneration,
      value: Buffer.from(`sealed:${sealRequest.value}`).toString("base64"),
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
        codec.unseal.mockImplementation(async (unsealRequest) => ({
          ...unsealRequest,
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

  it("initializes the same key through the controller-owned facade", async () => {
    const value = ownedKeyFixture("desktop");
    const codec = syntheticNativeCodec();
    const key = await getNativeSecretStorageKey(value.lease, codec);
    const restarted = value.restart();
    expect(await getNativeSecretStorageKey(restarted, codec)).toBe(key);
    expect(codec.seal).toHaveBeenCalledTimes(1);
  });
});

describe("one-time native key-adoption protocol", () => {
  function desktopFixture() {
    return ownedKeyFixture("desktop");
  }

  async function startedService(
    value: ReturnType<typeof desktopFixture>,
    unseal: (sealedKey: string, generation: string) => Promise<string> = async (sealed) =>
      Buffer.from(sealed, "base64").toString().slice("sealed:".length),
  ) {
    const service = new HostCredentialAdoptionService({ lease: value.lease, unseal });
    await service.start();
    return service;
  }

  it("publishes a private, owner-bound, expiring offer and answers exactly one unseal", async () => {
    const value = desktopFixture();
    writeFileSync(
      join(value.paths.dataRoot, "secret-key.safe"),
      Buffer.from("sealed:ignored").toString("base64"),
    );
    const service = await startedService(value);
    try {
      const offer = readHostKeyAdoptionOffer(value.paths);
      expect(offer.ownerGeneration).toBe(value.lease.generation);
      expect(offer.transport.kind).toBe("http-loopback");
      // The desktop profile root holds the offer; it is 0600-private.
      expect(
        readFileSync(join(value.paths.dataRoot, HOST_KEY_ADOPTION_OFFER_FILE), "utf8"),
      ).toContain(offer.token);

      const key = Buffer.alloc(32, 11).toString("base64");
      const sealed = Buffer.from(`sealed:${key}`).toString("base64");
      await expect(requestNativeKeyAdoption(value.paths, sealed)).resolves.toBe(key);
      // One-shot: the offer was retired before the answer, and a second
      // request finds no live offer at all.
      expect(existsSync(join(value.paths.dataRoot, HOST_KEY_ADOPTION_OFFER_FILE))).toBe(false);
      await expect(requestNativeKeyAdoption(value.paths, sealed)).rejects.toThrow(
        /offering key adoption/u,
      );
    } finally {
      await service.dispose();
    }
  });

  it("refuses a request bound to another profile without consuming the one-shot", async () => {
    const value = desktopFixture();
    const service = await startedService(value);
    try {
      const offer = readHostKeyAdoptionOffer(value.paths);
      const forged = {
        version: 1,
        requestId: "00000000-0000-4000-8000-000000000000",
        nonce: offer.nonce,
        profileNamespace: value.paths.profileNamespace,
        dataRoot: `${value.paths.dataRoot}.elsewhere`,
        sealedKey: Buffer.from("sealed:ignored").toString("base64"),
      };
      const body = Buffer.from(JSON.stringify(forged));
      const authority = `127.0.0.1:${offer.transport.port}`;
      const reply = await new Promise<string>((resolve, reject) => {
        const outgoing = request(
          {
            hostname: "127.0.0.1",
            family: 4,
            port: offer.transport.port,
            method: "POST",
            path: "/adopt-native-key",
            agent: false,
            headers: {
              host: authority,
              authorization: createHostControlRequestProof(offer.token, {
                method: "POST",
                path: "/adopt-native-key",
                authority,
                body,
              }),
              "content-type": "application/json",
              "content-length": Buffer.byteLength(body),
              connection: "close",
            },
          },
          (incoming) => {
            const chunks: Buffer[] = [];
            incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
            incoming.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
            incoming.on("error", reject);
          },
        );
        outgoing.once("error", reject);
        outgoing.end(body);
      });
      expect(JSON.parse(reply)).toMatchObject({ ok: false, code: "profile-mismatch" });
      // The offer survives a refused request; the real profile still works.
      expect(readHostKeyAdoptionOffer(value.paths).nonce).toBe(offer.nonce);
    } finally {
      await service.dispose();
    }
  });

  function postAdoption(
    offer: ReturnType<typeof readHostKeyAdoptionOffer>,
    body: Buffer,
  ): Promise<{ status: number; reply: string }> {
    const authority = `127.0.0.1:${offer.transport.port}`;
    return new Promise((resolve, reject) => {
      const outgoing = request(
        {
          hostname: "127.0.0.1",
          family: 4,
          port: offer.transport.port,
          method: "POST",
          path: "/adopt-native-key",
          agent: false,
          headers: {
            host: authority,
            authorization: createHostControlRequestProof(offer.token, {
              method: "POST",
              path: "/adopt-native-key",
              authority,
              body,
            }),
            "content-type": "application/json",
            "content-length": Buffer.byteLength(body),
            connection: "close",
          },
        },
        (incoming) => {
          const chunks: Buffer[] = [];
          incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
          incoming.on("end", () =>
            resolve({
              status: incoming.statusCode ?? 0,
              reply: Buffer.concat(chunks).toString("utf8"),
            }),
          );
          incoming.on("error", reject);
        },
      );
      outgoing.once("error", reject);
      outgoing.end(body);
    });
  }

  it("answers exactly one of two overlapping adoption requests", async () => {
    const value = desktopFixture();
    const key = Buffer.alloc(32, 11).toString("base64");
    const sealed = Buffer.from(`sealed:${key}`).toString("base64");
    const pending = Promise.withResolvers<string>();
    const unseal = vi.fn<(sealedKey: string, generation: string) => Promise<string>>(
      () => pending.promise,
    );
    const service = await startedService(value, unseal);
    try {
      const first = requestNativeKeyAdoption(value.paths, sealed);
      const second = requestNativeKeyAdoption(value.paths, sealed);
      const settledPromise = Promise.allSettled([first, second]);
      await vi.waitFor(() => expect(unseal).toHaveBeenCalledTimes(1));
      pending.resolve(key);
      const settled = await settledPromise;
      const wins = settled.filter(
        (result): result is PromiseFulfilledResult<string> => result.status === "fulfilled",
      );
      const losses = settled.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      expect(wins).toHaveLength(1);
      expect(wins[0]?.value).toBe(key);
      expect(losses).toHaveLength(1);
      const reason = losses[0]?.reason;
      expect(reason).toBeInstanceOf(HostKeyAdoptionRefusedError);
      expect(reason).toMatchObject({ code: "already-served" });
      expect(unseal).toHaveBeenCalledTimes(1);
      expect(existsSync(join(value.paths.dataRoot, HOST_KEY_ADOPTION_OFFER_FILE))).toBe(false);
    } finally {
      await service.dispose();
    }
  });

  it("returns a typed invalid-request body for authenticated malformed JSON", async () => {
    const value = desktopFixture();
    const service = await startedService(value);
    try {
      const offer = readHostKeyAdoptionOffer(value.paths);
      const body = Buffer.from("{");
      const result = await postAdoption(offer, body);
      expect(result.status).toBe(200);
      expect(JSON.parse(result.reply)).toMatchObject({ ok: false, code: "invalid-request" });
      expect(readHostKeyAdoptionOffer(value.paths).nonce).toBe(offer.nonce);
    } finally {
      await service.dispose();
    }
  });

  it("does not consume the offer when the native unseal fails", async () => {
    const value = desktopFixture();
    const key = Buffer.alloc(32, 13).toString("base64");
    const sealed = Buffer.from(`sealed:${key}`).toString("base64");
    const unseal = vi.fn<(sealedKey: string, generation: string) => Promise<string>>();
    unseal.mockRejectedValueOnce(new Error("synthetic safeStorage outage"));
    const service = await startedService(value, unseal);
    try {
      await expect(requestNativeKeyAdoption(value.paths, sealed)).rejects.toThrow(
        HostKeyAdoptionRefusedError,
      );
      // A failed native unseal leaves the offer live for a retry.
      expect(existsSync(join(value.paths.dataRoot, HOST_KEY_ADOPTION_OFFER_FILE))).toBe(true);
      expect(unseal).toHaveBeenCalledTimes(1);
      unseal.mockImplementation(async (sealedKey) =>
        Buffer.from(sealedKey, "base64").toString().slice("sealed:".length),
      );
      await expect(requestNativeKeyAdoption(value.paths, sealed)).resolves.toBe(key);
    } finally {
      await service.dispose();
    }
  });

  it("expires and rejects stale or future offers", async () => {
    const value = desktopFixture();
    const service = await startedService(value);
    try {
      expect(
        readHostKeyAdoptionOffer(value.paths, { now: () => Date.now() + 4 * 60_000 }),
      ).toBeDefined();
      expect(() =>
        readHostKeyAdoptionOffer(value.paths, { now: () => Date.now() + 6 * 60_000 }),
      ).toThrow(/invalid or expired/u);
      expect(() =>
        readHostKeyAdoptionOffer(value.paths, { now: () => Date.now() - 60_000 }),
      ).toThrow(/invalid or expired/u);
    } finally {
      await service.dispose();
    }
    // Dispose retires the offer of a stopped generation.
    expect(existsSync(join(value.paths.dataRoot, HOST_KEY_ADOPTION_OFFER_FILE))).toBe(false);
  });
});
