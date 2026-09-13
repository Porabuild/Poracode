import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getOwnedCredentialCapabilities,
  HOST_CREDENTIAL_STATE_FILE,
  readHostCredentialState,
} from "./hostCredentialState";
import { getOwnedSecretStorageKey } from "./ownedSecretKey";
import {
  cleanOwnedKeyFixtures,
  ownedKeyFixture,
  syntheticNativeCodec,
} from "./fixtures/ownedKeyFixture";

afterEach(cleanOwnedKeyFixtures);

describe("owned credential mode and provenance", () => {
  it("reuses one persisted headless key across owner generations", async () => {
    const value = ownedKeyFixture();
    const first = await getOwnedSecretStorageKey(value.lease, { mode: "headless" });
    expect(Buffer.from(first, "base64")).toHaveLength(32);
    expect(readHostCredentialState(value.lease)?.mode).toBe("headless-file");
    const second = await getOwnedSecretStorageKey(value.restart(), { mode: "headless" });
    expect(second).toBe(first);
  });

  it.each(["", " ", "\t\n"])(
    "validates explicit blank injection even after initialization (%j)",
    async (environmentKey) => {
      const value = ownedKeyFixture();
      const key = await getOwnedSecretStorageKey(value.lease, { mode: "headless" });
      await expect(
        getOwnedSecretStorageKey(value.lease, { mode: "headless", environmentKey }),
      ).rejects.toThrow(/32-byte key/u);
      expect(await getOwnedSecretStorageKey(value.lease, { mode: "headless" })).toBe(key);
    },
  );

  it("does not cache a request rejected before key initialization", async () => {
    const value = ownedKeyFixture();
    await expect(
      getOwnedSecretStorageKey(value.lease, { mode: "headless", environmentKey: " " }),
    ).rejects.toThrow(/32-byte key/u);
    expect(
      Buffer.from(await getOwnedSecretStorageKey(value.lease, { mode: "headless" }), "base64"),
    ).toHaveLength(32);
  });

  it("refuses durable secret writes under a transient key without changing existing ciphertext", async () => {
    const value = ownedKeyFixture("desktop");
    await getOwnedSecretStorageKey(value.lease, { mode: "session-only" });
    const capabilities = getOwnedCredentialCapabilities(value.lease);
    const existing = join(value.paths.dataRoot, "settings.json");
    writeFileSync(existing, '{"secret":"synthetic-existing-ciphertext","theme":"dark"}');
    expect(capabilities.canPersistSecrets).toBe(false);
    expect(() => capabilities.assertCanPersistSecrets()).toThrow(/session-only key/u);
    expect(readFileSync(existing, "utf8")).toBe(
      '{"secret":"synthetic-existing-ciphertext","theme":"dark"}',
    );
  });

  it("requires an initialized live generation for persistent credential admission", async () => {
    const value = ownedKeyFixture();
    expect(() => getOwnedCredentialCapabilities(value.lease)).toThrow(/not been initialized/u);
    await getOwnedSecretStorageKey(value.lease, { mode: "headless" });
    const capabilities = getOwnedCredentialCapabilities(value.lease);
    expect(capabilities.canPersistSecrets).toBe(true);
    expect(capabilities.assertCanPersistSecrets()).toBeUndefined();
    value.lease.release();
    expect(() => capabilities.assertCanPersistSecrets()).toThrow(/no longer active/u);
  });

  it("keeps injected keys off disk and refuses an unconfigured or changed injection on restart", async () => {
    const value = ownedKeyFixture();
    const key = Buffer.alloc(32, 11).toString("base64");
    expect(
      await getOwnedSecretStorageKey(value.lease, { mode: "headless", environmentKey: key }),
    ).toBe(key);
    expect(existsSync(join(value.paths.dataRoot, "secret-key.headless"))).toBe(false);
    expect(readHostCredentialState(value.lease)?.mode).toBe("headless-environment");
    await expect(getOwnedSecretStorageKey(value.restart(), { mode: "headless" })).rejects.toThrow(
      /mode change/u,
    );
    await expect(
      getOwnedSecretStorageKey(value.restart(), {
        mode: "headless",
        environmentKey: Buffer.alloc(32, 12).toString("base64"),
      }),
    ).rejects.toThrow(/no longer matches/u);
    expect(
      await getOwnedSecretStorageKey(value.restart(), { mode: "headless", environmentKey: key }),
    ).toBe(key);
  });

  it("allows matching injection for an existing file mode without converting its provenance", async () => {
    const value = ownedKeyFixture();
    const key = await getOwnedSecretStorageKey(value.lease, { mode: "headless" });
    expect(
      await getOwnedSecretStorageKey(value.restart(), { mode: "headless", environmentKey: key }),
    ).toBe(key);
    expect(readHostCredentialState(value.lease)?.mode).toBe("headless-file");
    expect(await getOwnedSecretStorageKey(value.restart(), { mode: "headless" })).toBe(key);
  });

  it("refuses mismatching injection while preserving the existing file and provenance", async () => {
    const value = ownedKeyFixture();
    const key = await getOwnedSecretStorageKey(value.lease, { mode: "headless" });
    const path = join(value.paths.dataRoot, HOST_CREDENTIAL_STATE_FILE);
    const before = readFileSync(path, "utf8");
    await expect(
      getOwnedSecretStorageKey(value.restart(), {
        mode: "headless",
        environmentKey: Buffer.alloc(32, 2).toString("base64"),
      }),
    ).rejects.toThrow(/keys differ/u);
    expect(readFileSync(join(value.paths.dataRoot, "secret-key.headless"), "utf8")).toBe(key);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("recovers a fresh-root interrupted key write without minting a replacement", async () => {
    const value = ownedKeyFixture();
    const key = Buffer.alloc(32, 3).toString("base64");
    writeFileSync(join(value.paths.dataRoot, "secret-key.headless"), key);
    expect(
      await getOwnedSecretStorageKey(value.lease, { mode: "headless", environmentKey: key }),
    ).toBe(key);
    expect(readHostCredentialState(value.lease)?.mode).toBe("headless-file");
  });

  it("will not infer provenance once a database already exists", async () => {
    const value = ownedKeyFixture();
    const database = join(value.paths.dataRoot, "state.sqlite");
    const key = Buffer.alloc(32, 3).toString("base64");
    writeFileSync(database, "synthetic unopened database");
    writeFileSync(join(value.paths.dataRoot, "secret-key.headless"), key);
    await expect(getOwnedSecretStorageKey(value.lease, { mode: "headless" })).rejects.toThrow(
      /explicit ownership activation/u,
    );
    expect(existsSync(join(value.paths.dataRoot, HOST_CREDENTIAL_STATE_FILE))).toBe(false);
    expect(readFileSync(database, "utf8")).toBe("synthetic unopened database");
    expect(readFileSync(join(value.paths.dataRoot, "secret-key.headless"), "utf8")).toBe(key);
  });

  it("keeps session-only keys within an owner lifetime and stores no persistent key", async () => {
    const value = ownedKeyFixture("desktop");
    const first = await getOwnedSecretStorageKey(value.lease, { mode: "session-only" });
    expect(await getOwnedSecretStorageKey(value.lease, { mode: "session-only" })).toBe(first);
    expect(readHostCredentialState(value.lease)).toMatchObject({
      mode: "session-only",
      keyFingerprint: null,
    });
    expect(existsSync(join(value.paths.dataRoot, "secret-key.safe"))).toBe(false);
    expect(existsSync(join(value.paths.dataRoot, "secret-key.headless"))).toBe(false);
    expect(await getOwnedSecretStorageKey(value.restart(), { mode: "session-only" })).not.toBe(
      first,
    );
  });

  it("does not rotate a malformed or missing recorded key", async () => {
    const value = ownedKeyFixture();
    await getOwnedSecretStorageKey(value.lease, { mode: "headless" });
    const path = join(value.paths.dataRoot, "secret-key.headless");
    writeFileSync(path, "invalid synthetic key");
    await expect(getOwnedSecretStorageKey(value.restart(), { mode: "headless" })).rejects.toThrow(
      /Invalid stored/u,
    );
    expect(readFileSync(path, "utf8")).toBe("invalid synthetic key");
    rmSync(path);
    await expect(getOwnedSecretStorageKey(value.restart(), { mode: "headless" })).rejects.toThrow(
      /missing/u,
    );
    expect(existsSync(path)).toBe(false);
  });

  it("refuses a valid but replaced key using the stored fingerprint", async () => {
    const value = ownedKeyFixture();
    await getOwnedSecretStorageKey(value.lease, { mode: "headless" });
    const replaced = Buffer.alloc(32, 99).toString("base64");
    const path = join(value.paths.dataRoot, "secret-key.headless");
    writeFileSync(path, replaced);
    await expect(getOwnedSecretStorageKey(value.restart(), { mode: "headless" })).rejects.toThrow(
      /no longer matches/u,
    );
    expect(readFileSync(path, "utf8")).toBe(replaced);
  });

  it("does not accept a plaintext file appearing in a recorded environment-only mode", async () => {
    const value = ownedKeyFixture();
    const key = Buffer.alloc(32, 4).toString("base64");
    await getOwnedSecretStorageKey(value.lease, { mode: "headless", environmentKey: key });
    writeFileSync(join(value.paths.dataRoot, "secret-key.headless"), key);
    await expect(
      getOwnedSecretStorageKey(value.restart(), { mode: "headless", environmentKey: key }),
    ).rejects.toThrow(/another mode/u);
  });

  it.each([0, 2, "1", undefined])(
    "refuses backward/future credential metadata (%s)",
    async (formatVersion) => {
      const value = ownedKeyFixture();
      await getOwnedSecretStorageKey(value.lease, { mode: "headless" });
      const path = join(value.paths.dataRoot, HOST_CREDENTIAL_STATE_FILE);
      const previous = JSON.parse(readFileSync(path, "utf8"));
      const changed = JSON.stringify({ ...previous, formatVersion });
      writeFileSync(path, changed);
      await expect(getOwnedSecretStorageKey(value.restart(), { mode: "headless" })).rejects.toThrow(
        /Unsupported.*version/u,
      );
      expect(readFileSync(path, "utf8")).toBe(changed);
    },
  );

  it.each([
    { mode: "future-mode" },
    { dataRoot: "/unrelated-root" },
    { profileNamespace: "/unrelated-profile" },
    { keyFingerprint: null },
  ])("refuses copied or unrecognized credential metadata (%j)", async (change) => {
    const value = ownedKeyFixture();
    await getOwnedSecretStorageKey(value.lease, { mode: "headless" });
    const path = join(value.paths.dataRoot, HOST_CREDENTIAL_STATE_FILE);
    const changed = JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), ...change });
    writeFileSync(path, changed);
    await expect(getOwnedSecretStorageKey(value.restart(), { mode: "headless" })).rejects.toThrow(
      /credential|profile/u,
    );
    expect(readFileSync(path, "utf8")).toBe(changed);
  });

  it("requires explicit activation before crossing headless, sealed or session-only modes", async () => {
    const value = ownedKeyFixture();
    await getOwnedSecretStorageKey(value.lease, { mode: "headless" });
    const codec = syntheticNativeCodec();
    await expect(
      getOwnedSecretStorageKey(value.restart(), { mode: "os-sealed", codec }),
    ).rejects.toThrow(/mode change/u);
    await expect(
      getOwnedSecretStorageKey(value.restart(), { mode: "session-only" }),
    ).rejects.toThrow(/mode change/u);
    expect(codec.seal).not.toHaveBeenCalled();
    expect(codec.unseal).not.toHaveBeenCalled();
  });
});
