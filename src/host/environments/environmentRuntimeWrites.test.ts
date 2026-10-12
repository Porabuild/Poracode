import { describe, expect, it } from "vitest";
import type { EnvironmentRecord } from "@/shared/environments";
import type {
  PinTrustInput,
  RecordChildIdentityInput,
  RecordObservedTrustInput,
  SetRuntimeInput,
} from "./EnvironmentStore";
import {
  EnvironmentNotFoundError,
  EnvironmentRevisionConflictError,
  EnvironmentStoreBusyError,
} from "./environmentStoreErrors";
import {
  pinTrust,
  recordChildIdentity,
  recordObservedTrust,
  setRuntime,
  type EnvironmentRuntimeWriteStore,
} from "./environmentRuntimeWrites";

const environmentId = "11111111-1111-4111-8111-111111111111";
const fingerprint = `SHA256:${"A".repeat(43)}`;

function storeRecord(revision: number): EnvironmentRecord {
  return {
    environmentId,
    revision,
    label: "Lab",
    target: "dev@host.example",
    trust: { state: "unknown" },
    runtime: { hash: "a".repeat(64) },
    legacyConnectionIds: [],
    desired: "enabled",
    createdAt: 1,
    updatedAt: 1,
  };
}

class FakeWriteStore implements EnvironmentRuntimeWriteStore {
  current: EnvironmentRecord | undefined = storeRecord(1);
  conflictsRemaining = 0;
  failure: Error | undefined;
  observedTrustCalls = 0;
  childIdentityCalls = 0;
  setRuntimeCalls = 0;
  pinTrustCalls = 0;
  readonly seenObservedTrustRevisions: number[] = [];
  lastPinInput: PinTrustInput | undefined;
  lastChildIdentity: RecordChildIdentityInput | undefined;
  lastSetRuntime: SetRuntimeInput | undefined;

  getRecord(id: string): EnvironmentRecord | undefined {
    return id === this.current?.environmentId ? this.current : undefined;
  }

  async recordObservedTrust(input: RecordObservedTrustInput): Promise<EnvironmentRecord> {
    this.observedTrustCalls += 1;
    this.seenObservedTrustRevisions.push(input.expectedRevision);
    this.maybeConflict();
    this.current = {
      ...this.current!,
      revision: input.expectedRevision + 1,
      trust: { state: "observed", observedFingerprint: input.observedFingerprint },
    };
    return this.current;
  }

  async pinTrust(input: PinTrustInput): Promise<EnvironmentRecord> {
    this.pinTrustCalls += 1;
    this.lastPinInput = input;
    this.maybeConflict();
    this.current = {
      ...this.current!,
      revision: input.expectedRevision + 1,
      trust: { state: "pinned", hostKeyFingerprint: input.hostKeyFingerprint },
    };
    return this.current;
  }

  async recordChildIdentity(input: RecordChildIdentityInput): Promise<EnvironmentRecord> {
    this.childIdentityCalls += 1;
    this.lastChildIdentity = input;
    this.maybeConflict();
    this.current = {
      ...this.current!,
      revision: input.expectedRevision + 1,
      childIdentity: { desktopId: input.desktopId },
    };
    return this.current;
  }

  async setRuntime(input: SetRuntimeInput): Promise<EnvironmentRecord> {
    this.setRuntimeCalls += 1;
    this.lastSetRuntime = input;
    this.maybeConflict();
    this.current = {
      ...this.current!,
      revision: input.expectedRevision + 1,
      runtime: input.runtime,
    };
    return this.current;
  }

  private maybeConflict(): void {
    if (this.failure !== undefined) throw this.failure;
    if (this.conflictsRemaining > 0) {
      this.conflictsRemaining -= 1;
      const expected = this.current!.revision;
      this.current = { ...this.current!, revision: expected + 1 };
      throw new EnvironmentRevisionConflictError(environmentId, expected, expected + 1);
    }
  }
}

describe("environmentRuntimeWrites runtime-owned convergence", () => {
  it("reads the current revision and returns the converged record", async () => {
    const store = new FakeWriteStore();
    const updated = await recordObservedTrust(store, environmentId, fingerprint);
    expect(store.observedTrustCalls).toBe(1);
    expect(store.seenObservedTrustRevisions).toEqual([1]);
    expect(updated.trust).toEqual({ state: "observed", observedFingerprint: fingerprint });
  });

  it("retries a revision conflict a bounded number of times and converges", async () => {
    const store = new FakeWriteStore();
    store.conflictsRemaining = 3;
    const updated = await recordObservedTrust(store, environmentId, fingerprint);
    expect(store.observedTrustCalls).toBe(4);
    expect(store.seenObservedTrustRevisions).toEqual([1, 2, 3, 4]);
    expect(updated.revision).toBe(5);
    expect(updated.trust).toEqual({ state: "observed", observedFingerprint: fingerprint });
  });

  it("exhausts the bounded attempts with a typed revision conflict", async () => {
    const store = new FakeWriteStore();
    store.conflictsRemaining = 4;
    await expect(recordObservedTrust(store, environmentId, fingerprint)).rejects.toMatchObject({
      name: "EnvironmentRuntimeError",
      code: "environment/revision-conflict",
    });
    expect(store.observedTrustCalls).toBe(4);
    expect(store.seenObservedTrustRevisions).toEqual([1, 2, 3, 4]);
  });

  it("re-reads the revision for child identity and runtime writes", async () => {
    const store = new FakeWriteStore();
    store.conflictsRemaining = 1;
    await recordChildIdentity(store, environmentId, "child-desktop");
    expect(store.childIdentityCalls).toBe(2);
    expect(store.lastChildIdentity).toMatchObject({
      expectedRevision: 2,
      desktopId: "child-desktop",
    });

    store.conflictsRemaining = 1;
    const runtime = { hash: "b".repeat(64) };
    await setRuntime(store, environmentId, runtime);
    expect(store.setRuntimeCalls).toBe(2);
    expect(store.lastSetRuntime).toMatchObject({ expectedRevision: 4, runtime });
    expect(store.current?.runtime).toEqual(runtime);
  });

  it("fails closed when the record is gone and performs no store write", async () => {
    const store = new FakeWriteStore();
    store.current = undefined;
    await expect(recordObservedTrust(store, environmentId, fingerprint)).rejects.toMatchObject({
      code: "environment/not-found",
    });
    await expect(recordChildIdentity(store, environmentId, "child")).rejects.toMatchObject({
      code: "environment/not-found",
    });
    await expect(setRuntime(store, environmentId, { hash: "b".repeat(64) })).rejects.toMatchObject({
      code: "environment/not-found",
    });
    expect(store.observedTrustCalls).toBe(0);
    expect(store.childIdentityCalls).toBe(0);
    expect(store.setRuntimeCalls).toBe(0);
  });

  it("maps a non-conflict store failure into the bounded vocabulary", async () => {
    const store = new FakeWriteStore();
    store.failure = new EnvironmentStoreBusyError(64);
    await expect(recordObservedTrust(store, environmentId, fingerprint)).rejects.toMatchObject({
      name: "EnvironmentRuntimeError",
      code: "environment/store-busy",
    });
    expect(store.observedTrustCalls).toBe(1);
  });
});

describe("environmentRuntimeWrites strict pin", () => {
  it("passes the caller revision through and mirrors the observed fingerprint", async () => {
    const store = new FakeWriteStore();
    const updated = await pinTrust(store, environmentId, 1, fingerprint);
    expect(store.pinTrustCalls).toBe(1);
    expect(store.lastPinInput).toEqual({
      environmentId,
      expectedRevision: 1,
      hostKeyFingerprint: fingerprint,
      observedFingerprint: fingerprint,
    });
    expect(updated.trust).toEqual({ state: "pinned", hostKeyFingerprint: fingerprint });
  });

  it("never retries a strict pin conflict", async () => {
    const store = new FakeWriteStore();
    store.conflictsRemaining = 1;
    await expect(pinTrust(store, environmentId, 1, fingerprint)).rejects.toMatchObject({
      code: "environment/revision-conflict",
    });
    expect(store.pinTrustCalls).toBe(1);
  });

  it("maps a store not-found for the strict pin", async () => {
    const store = new FakeWriteStore();
    store.failure = new EnvironmentNotFoundError(environmentId);
    await expect(pinTrust(store, environmentId, 1, fingerprint)).rejects.toMatchObject({
      code: "environment/not-found",
    });
    expect(store.pinTrustCalls).toBe(1);
  });
});
