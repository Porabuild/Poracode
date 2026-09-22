import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ENVIRONMENT_STORE_MAX_ENVIRONMENTS,
  ENVIRONMENT_STORE_MAX_FILE_BYTES,
  type EnvironmentRecord,
} from "@/shared/environments";
import {
  EnvironmentStore,
  type EnvironmentCreateInput,
  type EnvironmentStoreLease,
  type EnvironmentUpdatePatch,
} from "./EnvironmentStore";
import { environmentsFilePath, serializeEnvironmentStoreFile } from "./environmentStoreFile";
import {
  EnvironmentChildIdentityChangedError,
  EnvironmentIdentifierCollisionError,
  EnvironmentLegacyConnectionConflictError,
  EnvironmentNotFoundError,
  EnvironmentRevisionConflictError,
  EnvironmentStoreClosedError,
  EnvironmentStoreFormatError,
  EnvironmentStoreLimitError,
  EnvironmentStoreLockedError,
  EnvironmentTrustChangedError,
  EnvironmentTrustMismatchError,
} from "./environmentStoreErrors";

const runtimeHash = "a".repeat(64);
const legacyIdA = "11111111-1111-4111-8111-111111111111";
const legacyIdB = "22222222-2222-4222-8222-222222222222";
const childDesktopId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const otherDesktopId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const pinA = `SHA256:${"A".repeat(43)}`;
const pinB = `SHA256:${"B".repeat(43)}`;

class TestLease implements EnvironmentStoreLease {
  readonly paths: { readonly dataRoot: string };
  generation = randomUUID();
  active = true;

  constructor(dataRoot: string) {
    this.paths = { dataRoot };
  }

  assertActive(expectedGeneration?: string): void {
    if (!this.active) throw new Error("host lease is not active");
    if (expectedGeneration !== undefined && expectedGeneration !== this.generation) {
      throw new Error("host lease generation changed");
    }
  }
}

let nowValue = 1000;
const now = (): number => (nowValue += 1);

function createInput(overrides: Partial<EnvironmentCreateInput> = {}): EnvironmentCreateInput {
  return {
    label: "Lab server",
    target: "dev@example.internal",
    runtime: { hash: runtimeHash },
    ...overrides,
  };
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("EnvironmentStore", () => {
  let root: string;

  beforeEach(() => {
    nowValue = 1000;
    root = mkdtempSync(join(tmpdir(), "environment-store-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function openStore(lease: TestLease = new TestLease(root), mint?: () => string) {
    const store = await EnvironmentStore.open({
      lease,
      now,
      ...(mint === undefined ? {} : { mintEnvironmentId: mint }),
    });
    return { store, lease };
  }

  function readFileRecords(): EnvironmentRecord[] {
    const path = environmentsFilePath(root);
    return JSON.parse(readFileSync(path, "utf8")).environments as EnvironmentRecord[];
  }

  it("mints stable UUID identity and a first revision for each created environment", async () => {
    const { store } = await openStore();
    const first = await store.create(createInput());
    const second = await store.create(createInput());
    expect(first.environmentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(first.revision).toBe(1);
    expect(first.desired).toBe("enabled");
    expect(first.trust).toEqual({ state: "unknown" });
    expect(first.legacyConnectionIds).toEqual([]);
    expect(second.environmentId).not.toBe(first.environmentId);
    expect(readFileRecords()).toHaveLength(2);
    await store.close();
  });

  it("keeps separate environments for the same target instead of deduplicating", async () => {
    const { store } = await openStore();
    const first = await store.create(createInput({ label: "First" }));
    const second = await store.create(createInput({ label: "Second" }));
    expect(second.target).toBe(first.target);
    expect(
      store
        .listRecords()
        .map((record) => record.environmentId)
        .sort(),
    ).toEqual([first.environmentId, second.environmentId].sort());
    await store.close();
  });

  it("rejects caller-supplied identity, child identity, and identity paths", async () => {
    const { store } = await openStore();
    await expect(
      store.create({ ...createInput(), environmentId: randomUUID() } as EnvironmentCreateInput),
    ).rejects.toThrow(z.ZodError);
    await expect(
      store.create({ ...createInput(), childIdentity: { desktopId: randomUUID() } } as never),
    ).rejects.toThrow(z.ZodError);
    await expect(
      store.create({ ...createInput(), identityFile: "/home/me/.ssh/id" } as never),
    ).rejects.toThrow(z.ZodError);
    expect(existsSync(environmentsFilePath(root))).toBe(false);
    await store.close();
  });

  it("rejects unsafe targets, ports, credential references, and legacy identifiers", async () => {
    const { store } = await openStore();
    const invalid: readonly Partial<EnvironmentCreateInput>[] = [
      { target: "-oProxyCommand=touch /tmp/pwned" },
      { target: "user@host/../evil" },
      { target: "host with spaces" },
      { port: 0 },
      { port: 65_536 },
      { credentialRef: "/home/me/.ssh/id_ed25519" },
      { credentialRef: "..\\keys\\id" },
      { credentialRef: "slots/../escape" },
      { legacyConnectionId: "not-a-uuid" },
      { runtime: { hash: "short" } },
    ];
    for (const overrides of invalid) {
      await expect(store.create(createInput(overrides))).rejects.toThrow(z.ZodError);
    }
    expect(existsSync(environmentsFilePath(root))).toBe(false);
    await store.close();
  });

  it("mutates through serialized CAS revisions and refuses stale writers without partial writes", async () => {
    const { store } = await openStore();
    const created = await store.create(createInput());
    const updated = await store.update({
      environmentId: created.environmentId,
      expectedRevision: 1,
      patch: { label: "Renamed", target: "ops@example.internal", port: 22_022 },
    });
    expect(updated.revision).toBe(2);
    expect(updated.label).toBe("Renamed");
    expect(updated.port).toBe(22_022);
    await expect(
      store.update({
        environmentId: created.environmentId,
        expectedRevision: 1,
        patch: { label: "Stale" },
      }),
    ).rejects.toBeInstanceOf(EnvironmentRevisionConflictError);
    const current = store.getRecord(created.environmentId);
    expect(current?.revision).toBe(2);
    expect(current?.label).toBe("Renamed");
    expect(readFileRecords()[0]?.revision).toBe(2);
    await store.close();
  });

  it("serializes concurrent CAS edits so exactly one winner commits", async () => {
    const { store } = await openStore();
    const created = await store.create(createInput());
    const first = store.update({
      environmentId: created.environmentId,
      expectedRevision: 1,
      patch: { label: "First writer" },
    });
    const second = store.update({
      environmentId: created.environmentId,
      expectedRevision: 1,
      patch: { label: "Second writer" },
    });
    const settled = await Promise.allSettled([first, second]);
    const fulfilled = settled.filter((result) => result.status === "fulfilled");
    const rejected = settled.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      EnvironmentRevisionConflictError,
    );
    const winner = (fulfilled[0] as PromiseFulfilledResult<EnvironmentRecord>).value;
    expect(store.getRecord(created.environmentId)?.label).toBe(winner.label);
    expect(winner.revision).toBe(2);
    expect(readFileRecords()[0]).toEqual(winner);
    await store.close();
  });

  it("leaves the previous valid generation when a write fails, and retries cleanly", async () => {
    const { store } = await openStore();
    const created = await store.create(createInput());
    const storePath = environmentsFilePath(root);
    rmSync(storePath);
    mkdirSync(storePath);
    await expect(
      store.update({
        environmentId: created.environmentId,
        expectedRevision: 1,
        patch: { label: "Should not land" },
      }),
    ).rejects.toThrow(/EISDIR|EPERM|ENOTDIR|EACCES/);
    const afterFailure = store.getRecord(created.environmentId);
    expect(afterFailure?.label).toBe("Lab server");
    expect(afterFailure?.revision).toBe(1);
    rmSync(storePath, { recursive: true, force: true });
    const retried = await store.update({
      environmentId: created.environmentId,
      expectedRevision: 1,
      patch: { label: "Landed after retry" },
    });
    expect(retried.revision).toBe(2);
    expect(readFileRecords()[0]?.label).toBe("Landed after retry");
    await store.close();
  });

  it("reloads identity, revision, desired state, trust, child identity, and legacy mapping", async () => {
    const { store } = await openStore();
    const created = await store.create(
      createInput({
        desired: "disabled",
        credentialRef: "agent:prod",
        legacyConnectionId: legacyIdA,
        trust: { state: "pinned", hostKeyFingerprint: pinA },
      }),
    );
    await store.recordChildIdentity({
      environmentId: created.environmentId,
      expectedRevision: 1,
      desktopId: childDesktopId,
    });
    await store.close();

    const { store: reopened } = await openStore();
    const loaded = reopened.getRecord(created.environmentId);
    expect(loaded?.environmentId).toBe(created.environmentId);
    expect(loaded?.revision).toBe(2);
    expect(loaded?.desired).toBe("disabled");
    expect(loaded?.credentialRef).toBe("agent:prod");
    expect(loaded?.trust).toEqual({ state: "pinned", hostKeyFingerprint: pinA });
    expect(loaded?.childIdentity).toEqual({ desktopId: childDesktopId });
    expect(loaded?.legacyConnectionIds).toEqual([legacyIdA]);
    await reopened.close();
  });

  it("refuses a future format without overwriting the file", async () => {
    const storePath = environmentsFilePath(root);
    const future = `${JSON.stringify({ formatVersion: 2, environments: [] }, null, 2)}\n`;
    writeFileSync(storePath, future);
    await expect(openStore()).rejects.toMatchObject({
      code: "environment/store-future-format",
    });
    await expect(openStore()).rejects.toBeInstanceOf(EnvironmentStoreFormatError);
    expect(readFileSync(storePath, "utf8")).toBe(future);
  });

  it("refuses an oversized store file with a typed limit error and preserves its bytes", async () => {
    const storePath = environmentsFilePath(root);
    const oversized = `{"formatVersion":1,"environments":[]}${" ".repeat(
      ENVIRONMENT_STORE_MAX_FILE_BYTES,
    )}`;
    writeFileSync(storePath, oversized);
    const error = await captureRejection(openStore());
    expect(error).toBeInstanceOf(EnvironmentStoreLimitError);
    expect((error as EnvironmentStoreLimitError).reason).toBe("file-bytes");
    expect((error as EnvironmentStoreLimitError).limit).toBe(ENVIRONMENT_STORE_MAX_FILE_BYTES);
    expect((error as Error).message).not.toContain(root);
    expect(readFileSync(storePath, "utf8")).toBe(oversized);
  });

  it("refuses create at the environment-count limit with a typed error", async () => {
    const records: EnvironmentRecord[] = Array.from(
      { length: ENVIRONMENT_STORE_MAX_ENVIRONMENTS },
      (_, index) => ({
        environmentId: randomUUID(),
        revision: 1,
        label: `Env ${index}`,
        target: "dev@example.internal",
        trust: { state: "unknown" },
        runtime: { hash: runtimeHash },
        legacyConnectionIds: [],
        desired: "enabled",
        createdAt: 100,
        updatedAt: 100,
      }),
    );
    writeFileSync(environmentsFilePath(root), serializeEnvironmentStoreFile(records));
    const { store } = await openStore();
    const error = await captureRejection(store.create(createInput()));
    expect(error).toBeInstanceOf(EnvironmentStoreLimitError);
    expect((error as EnvironmentStoreLimitError).reason).toBe("environment-count");
    expect(store.listRecords()).toHaveLength(ENVIRONMENT_STORE_MAX_ENVIRONMENTS);
    await store.close();
  });

  it("refuses a corrupt file without overwriting it, and errors carry no private paths", async () => {
    const storePath = environmentsFilePath(root);
    const corrupt = `{"formatVersion":1,"environments":[{"environmentId":"nope"}]}\n`;
    writeFileSync(storePath, corrupt);
    const error = await captureRejection(openStore());
    expect(error).toBeInstanceOf(EnvironmentStoreFormatError);
    expect((error as EnvironmentStoreFormatError).reason).toBe("corrupt");
    expect((error as Error).message).not.toContain(root);
    expect(readFileSync(storePath, "utf8")).toBe(corrupt);
  });

  it("adopts exactly one legacy connection id and refuses silent merges or double adoption", async () => {
    const { store } = await openStore();
    const adopter = await store.create(createInput({ legacyConnectionId: legacyIdA }));
    expect(adopter.legacyConnectionIds).toEqual([legacyIdA]);
    await expect(
      store.create(createInput({ legacyConnectionId: legacyIdA })),
    ).rejects.toBeInstanceOf(EnvironmentLegacyConnectionConflictError);
    await expect(
      store.adoptLegacyConnection({
        environmentId: adopter.environmentId,
        expectedRevision: 1,
        legacyConnectionId: legacyIdB,
      }),
    ).rejects.toMatchObject({ reason: "already-adopted" });
    const idempotent = await store.adoptLegacyConnection({
      environmentId: adopter.environmentId,
      expectedRevision: 1,
      legacyConnectionId: legacyIdA,
    });
    expect(idempotent.revision).toBe(1);
    await store.delete({ environmentId: adopter.environmentId, expectedRevision: 1 });
    const second = await store.create(createInput({ legacyConnectionId: legacyIdA }));
    expect(second.legacyConnectionIds).toEqual([legacyIdA]);
    await store.close();
  });

  it("keeps legacy ids disjoint from every environment id and adopted mapping", async () => {
    const { store } = await openStore();
    const first = await store.create(createInput());
    // Another environment's id is never an adoptable legacy id.
    await expect(
      store.create(createInput({ legacyConnectionId: first.environmentId })),
    ).rejects.toMatchObject({ reason: "collides-with-environment-id" });
    await expect(
      store.adoptLegacyConnection({
        environmentId: first.environmentId,
        expectedRevision: 1,
        legacyConnectionId: first.environmentId,
      }),
    ).rejects.toMatchObject({ reason: "collides-with-environment-id" });
    // The synchronous admission check refuses before any mutation.
    expect(() =>
      store.assertAdoptable({
        environmentId: first.environmentId,
        expectedRevision: 1,
        legacyConnectionId: first.environmentId,
      }),
    ).toThrow(EnvironmentLegacyConnectionConflictError);
    await store.close();
  });

  it("mints ids that collide with no environment id and no adopted mapping", async () => {
    const minted = [
      legacyIdA,
      legacyIdA,
      "33333333-3333-4333-8333-333333333333",
      legacyIdA,
      "44444444-4444-4444-8444-444444444444",
    ];
    let index = 0;
    const { store } = await openStore(new TestLease(root), () => minted[index++]!);
    // The first two candidates collide with the legacy id being adopted.
    const adopter = await store.create(createInput({ legacyConnectionId: legacyIdA }));
    expect(adopter.environmentId).toBe("33333333-3333-4333-8333-333333333333");
    // The next candidate repeats the adopted mapping; it must be skipped too.
    const second = await store.create(createInput());
    expect(second.environmentId).toBe("44444444-4444-4444-8444-444444444444");
    expect(second.environmentId).not.toBe(legacyIdA);
    await store.close();
  });

  it("adopts a legacy connection onto an existing environment", async () => {
    const { store } = await openStore();
    const created = await store.create(createInput());
    const adopted = await store.adoptLegacyConnection({
      environmentId: created.environmentId,
      expectedRevision: 1,
      legacyConnectionId: legacyIdA,
    });
    expect(adopted.revision).toBe(2);
    expect(adopted.legacyConnectionIds).toEqual([legacyIdA]);
    await expect(
      store.create(createInput({ legacyConnectionId: legacyIdA })),
    ).rejects.toBeInstanceOf(EnvironmentLegacyConnectionConflictError);
    await store.close();
  });

  it("records the child identity once and refuses an unmanaged identity change", async () => {
    const { store } = await openStore();
    const created = await store.create(createInput());
    const recorded = await store.recordChildIdentity({
      environmentId: created.environmentId,
      expectedRevision: 1,
      desktopId: childDesktopId,
    });
    expect(recorded.childIdentity).toEqual({ desktopId: childDesktopId });
    const idempotent = await store.recordChildIdentity({
      environmentId: created.environmentId,
      expectedRevision: 2,
      desktopId: childDesktopId,
    });
    expect(idempotent.revision).toBe(2);
    await expect(
      store.recordChildIdentity({
        environmentId: created.environmentId,
        expectedRevision: 2,
        desktopId: otherDesktopId,
      }),
    ).rejects.toBeInstanceOf(EnvironmentChildIdentityChangedError);
    const deliberate = await store.recordChildIdentity({
      environmentId: created.environmentId,
      expectedRevision: 2,
      desktopId: otherDesktopId,
      acceptChangedIdentity: true,
    });
    expect(deliberate.revision).toBe(3);
    expect(deliberate.childIdentity).toEqual({ desktopId: otherDesktopId });
    await store.close();
  });

  it("records a non-UUID child desktop id that matches the existing descriptor grammar", async () => {
    const { store } = await openStore();
    const created = await store.create(createInput());
    const recorded = await store.recordChildIdentity({
      environmentId: created.environmentId,
      expectedRevision: 1,
      desktopId: "fixture-child",
    });
    expect(recorded.childIdentity).toEqual({ desktopId: "fixture-child" });
    await store.close();
    const { store: reopened } = await openStore();
    expect(reopened.getRecord(created.environmentId)?.childIdentity).toEqual({
      desktopId: "fixture-child",
    });
    await reopened.close();
  });

  it("records observed trust, refuses silent fingerprint changes, and enforces pins", async () => {
    const { store } = await openStore();
    const created = await store.create(createInput());
    const observed = await store.recordObservedTrust({
      environmentId: created.environmentId,
      expectedRevision: 1,
      observedFingerprint: pinA,
    });
    expect(observed.trust).toEqual({ state: "observed", observedFingerprint: pinA });
    const idempotent = await store.recordObservedTrust({
      environmentId: created.environmentId,
      expectedRevision: 2,
      observedFingerprint: pinA,
    });
    expect(idempotent.revision).toBe(2);
    await expect(
      store.recordObservedTrust({
        environmentId: created.environmentId,
        expectedRevision: 2,
        observedFingerprint: pinB,
      }),
    ).rejects.toBeInstanceOf(EnvironmentTrustChangedError);
    const repinned = await store.pinTrust({
      environmentId: created.environmentId,
      expectedRevision: 2,
      hostKeyFingerprint: pinB,
      observedFingerprint: pinB,
    });
    expect(repinned.trust).toEqual({
      state: "pinned",
      hostKeyFingerprint: pinB,
      observedFingerprint: pinB,
    });
    await expect(
      store.recordObservedTrust({
        environmentId: created.environmentId,
        expectedRevision: 3,
        observedFingerprint: pinA,
      }),
    ).rejects.toBeInstanceOf(EnvironmentTrustMismatchError);
    const cleared = await store.clearTrust({
      environmentId: created.environmentId,
      expectedRevision: 3,
    });
    expect(cleared.trust).toEqual({ state: "unknown" });
    expect(cleared.revision).toBe(4);
    await expect(
      store.pinTrust({
        environmentId: created.environmentId,
        expectedRevision: 4,
        hostKeyFingerprint: "SHA256:malformed",
      }),
    ).rejects.toThrow(z.ZodError);
    await store.close();
  });

  it("sets the runtime only through the explicit CAS operation", async () => {
    const { store } = await openStore();
    const created = await store.create(createInput());
    const upgraded = await store.setRuntime({
      environmentId: created.environmentId,
      expectedRevision: 1,
      runtime: { hash: "b".repeat(64), appVersion: "2.0.0" },
    });
    expect(upgraded.revision).toBe(2);
    expect(upgraded.runtime).toEqual({ hash: "b".repeat(64), appVersion: "2.0.0" });
    const idempotent = await store.setRuntime({
      environmentId: created.environmentId,
      expectedRevision: 2,
      runtime: { hash: "b".repeat(64), appVersion: "2.0.0" },
    });
    expect(idempotent.revision).toBe(2);
    await store.close();
  });

  it("exposes the configured target port but never the raw credential reference in public projections", async () => {
    const { store } = await openStore();
    const created = await store.create(createInput({ port: 22_022, credentialRef: "agent:prod" }));
    const publicRecord = store.getPublic(created.environmentId);
    expect(publicRecord).toBeDefined();
    expect(publicRecord?.credential).toBe("configured");
    expect(publicRecord?.port).toBe(22_022);
    const serialized = JSON.stringify(publicRecord);
    expect(serialized).toContain("22022");
    expect(serialized).not.toContain("agent:prod");
    expect(serialized).not.toContain("credentialRef");
    expect(serialized).not.toContain("identityFile");
    expect(serialized).not.toContain(root);
    expect(Object.isFrozen(publicRecord)).toBe(true);
    expect(store.listPublic()).toHaveLength(1);
    expect(Object.isFrozen(store.listPublic())).toBe(true);
    await store.close();
    const { store: reopened } = await openStore();
    const reopenedPublic = reopened.getPublic(created.environmentId);
    expect(reopenedPublic?.port).toBe(22_022);
    expect(JSON.stringify(reopenedPublic)).not.toContain("agent:prod");
    await reopened.close();
  });

  it("joins admitted mutations on close and rejects late admission", async () => {
    const { store } = await openStore();
    const pending = [
      store.create(createInput({ label: "One" })),
      store.create(createInput({ label: "Two" })),
      store.create(createInput({ label: "Three" })),
    ];
    await store.close();
    const created = await Promise.all(pending);
    expect(created.every((record) => record.revision === 1)).toBe(true);
    expect(readFileRecords()).toHaveLength(3);
    await expect(store.create(createInput())).rejects.toBeInstanceOf(EnvironmentStoreClosedError);
    expect(() => store.listRecords()).toThrow(EnvironmentStoreClosedError);
    expect(() => store.listPublic()).toThrow(EnvironmentStoreClosedError);
  });

  it("refuses a second store for the same leased root until the first closes", async () => {
    const { store } = await openStore(new TestLease(root));
    await expect(openStore(new TestLease(root))).rejects.toBeInstanceOf(
      EnvironmentStoreLockedError,
    );
    await store.close();
    const { store: reopened } = await openStore(new TestLease(root));
    await reopened.close();
  });

  it("refuses reads and writes after the host lease is lost, leaving the file untouched", async () => {
    const lease = new TestLease(root);
    const { store } = await openStore(lease);
    const created = await store.create(createInput());
    const before = readFileRecords();
    lease.active = false;
    await expect(
      store.update({
        environmentId: created.environmentId,
        expectedRevision: 1,
        patch: { label: "Nope" },
      }),
    ).rejects.toThrow("host lease is not active");
    expect(() => store.getRecord(created.environmentId)).toThrow("host lease is not active");
    expect(readFileRecords()).toEqual(before);
  });

  it("reports missing environments and minted-id collisions as typed errors", async () => {
    const { store } = await openStore();
    await expect(
      store.update({
        environmentId: randomUUID(),
        expectedRevision: 1,
        patch: { label: "Missing" },
      }),
    ).rejects.toBeInstanceOf(EnvironmentNotFoundError);
    await store.close();
    const fixedId = randomUUID();
    const { store: colliding } = await openStore(new TestLease(root), () => fixedId);
    await colliding.create(createInput());
    await expect(colliding.create(createInput())).rejects.toBeInstanceOf(
      EnvironmentIdentifierCollisionError,
    );
    await colliding.close();
  });

  it("treats a no-op update as success without consuming a revision", async () => {
    const { store } = await openStore();
    const created = await store.create(createInput());
    const patch: EnvironmentUpdatePatch = { label: created.label, target: created.target };
    const unchanged = await store.update({
      environmentId: created.environmentId,
      expectedRevision: 1,
      patch,
    });
    expect(unchanged.revision).toBe(1);
    const cleared = await store.create(createInput({ port: 22, credentialRef: "agent:one" }));
    await store.update({
      environmentId: cleared.environmentId,
      expectedRevision: 1,
      patch: { port: null },
    });
    const current = store.getRecord(cleared.environmentId);
    expect(current?.port).toBeUndefined();
    expect(current?.credentialRef).toBe("agent:one");
    await store.close();
  });
});
