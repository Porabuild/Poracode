import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnvironmentRecord } from "@/shared/environments";
import {
  ENVIRONMENT_STORE_MAX_PENDING_MUTATIONS,
  EnvironmentStore,
  type EnvironmentCreateInput,
  type EnvironmentStoreLease,
} from "./EnvironmentStore";
import { environmentsFilePath } from "./environmentStoreFile";
import {
  EnvironmentNotFoundError,
  EnvironmentRevisionConflictError,
  EnvironmentStoreBusyError,
  EnvironmentStoreClosedError,
} from "./environmentStoreErrors";

/**
 * Holds the rename step of the atomic writer so a commit can be stalled while
 * it is mid-flight. Resolving the gate releases every rename that captured it,
 * preserving the serialized operation order behind it.
 */
const renameControl = vi.hoisted(() => ({
  gate: null as Promise<void> | null,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: vi.fn<(from: string, to: string) => Promise<void>>(async (from, to) => {
      const gate = renameControl.gate;
      if (gate) await gate;
      return actual.rename(from, to);
    }) as typeof actual.rename,
  };
});

const runtimeHash = "a".repeat(64);

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

function createInput(overrides: Partial<EnvironmentCreateInput> = {}): EnvironmentCreateInput {
  return {
    label: "Lab server",
    target: "dev@example.internal",
    runtime: { hash: runtimeHash },
    ...overrides,
  };
}

function holdRenames(): () => void {
  let releaseGate!: () => void;
  renameControl.gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  return () => {
    renameControl.gate = null;
    releaseGate();
  };
}

function tick(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("EnvironmentStore async commits", () => {
  let root: string;

  beforeEach(() => {
    renameControl.gate = null;
    root = mkdtempSync(join(tmpdir(), "environment-store-async-"));
  });

  afterEach(() => {
    renameControl.gate = null;
    rmSync(root, { recursive: true, force: true });
  });

  async function openStore(lease: TestLease = new TestLease(root)): Promise<EnvironmentStore> {
    return EnvironmentStore.open({ lease });
  }

  function readFileRecords(): EnvironmentRecord[] {
    return JSON.parse(readFileSync(environmentsFilePath(root), "utf8"))
      .environments as EnvironmentRecord[];
  }

  it("keeps the event loop responsive while an atomic commit is stalled on rename", async () => {
    const store = await openStore();
    const release = holdRenames();
    const settled = vi.fn<() => void>();
    const pending = store.create(createInput()).then(settled);
    await tick(25);
    expect(settled).not.toHaveBeenCalled();
    release();
    await pending;
    expect(settled).toHaveBeenCalledTimes(1);
    expect(readFileRecords()).toHaveLength(1);
    await store.close();
  });

  it("does not resolve close before an admitted stalled write completes", async () => {
    const store = await openStore();
    const release = holdRenames();
    const pending = store.create(createInput());
    let closed = false;
    const closing = store.close().then(() => {
      closed = true;
    });
    await tick(25);
    expect(closed).toBe(false);
    release();
    await closing;
    await pending;
    expect(closed).toBe(true);
    expect(readFileRecords()).toHaveLength(1);
    await expect(store.create(createInput())).rejects.toBeInstanceOf(EnvironmentStoreClosedError);
  });

  it("refuses admission beyond the pending mutation bound instead of queueing unbounded work", async () => {
    const store = await openStore();
    const release = holdRenames();
    const admitted = Array.from({ length: ENVIRONMENT_STORE_MAX_PENDING_MUTATIONS }, (_, index) =>
      store.create(createInput({ label: `Env ${index}` })),
    );
    await expect(store.create(createInput())).rejects.toBeInstanceOf(EnvironmentStoreBusyError);
    release();
    await Promise.all(admitted);
    expect(readFileRecords()).toHaveLength(ENVIRONMENT_STORE_MAX_PENDING_MUTATIONS);
    const afterSettled = await store.create(createInput());
    expect(afterSettled.revision).toBe(1);
    await store.close();
  });

  it("serializes a concurrent CAS update and delete so exactly one wins", async () => {
    const store = await openStore();
    const created = await store.create(createInput());
    const release = holdRenames();
    const update = store.update({
      environmentId: created.environmentId,
      expectedRevision: 1,
      patch: { label: "Winner" },
    });
    const remove = store.delete({
      environmentId: created.environmentId,
      expectedRevision: 1,
    });
    release();
    const settled = await Promise.allSettled([update, remove]);
    expect(settled[0].status).toBe("fulfilled");
    expect(settled[1].status).toBe("rejected");
    expect((settled[1] as PromiseRejectedResult).reason).toBeInstanceOf(
      EnvironmentRevisionConflictError,
    );
    expect(store.getRecord(created.environmentId)?.label).toBe("Winner");
    expect(readFileRecords()[0]?.label).toBe("Winner");
    await store.close();
  });

  it("serializes delete before a concurrent CAS update and leaves no record", async () => {
    const store = await openStore();
    const created = await store.create(createInput());
    const release = holdRenames();
    const remove = store.delete({
      environmentId: created.environmentId,
      expectedRevision: 1,
    });
    const update = store.update({
      environmentId: created.environmentId,
      expectedRevision: 1,
      patch: { label: "Late" },
    });
    release();
    const settled = await Promise.allSettled([remove, update]);
    expect(settled[0].status).toBe("fulfilled");
    expect((settled[1] as PromiseRejectedResult).reason).toBeInstanceOf(EnvironmentNotFoundError);
    expect(readFileRecords()).toHaveLength(0);
    await store.close();
  });
});
