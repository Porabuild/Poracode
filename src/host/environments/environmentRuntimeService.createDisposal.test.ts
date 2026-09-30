import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import type { EnvironmentRecord } from "@/shared/environments";
import type { SshConnectPayload, SshConnectResult } from "@/shared/ssh";
import type { SshConnectOptions } from "@/host/ssh/sshEnvironmentController";
import { EnvironmentStore, type EnvironmentStoreLease } from "./EnvironmentStore";
import {
  EnvironmentRuntimeService,
  type EnvironmentSshTransport,
} from "./environmentRuntimeService";
import type { EnvironmentTrustAuthority } from "./environmentTrustAuthority";

/**
 * F-1 regression (C1 composed-server review): a `create` whose durable write
 * commits while composition disposal closes the store must report the
 * committed projection, never `environment/store-unavailable`.
 *
 * Before the correction the post-write `requirePublic()` re-read was refused
 * by `EnvironmentStore.close()` (`closing` set before the admitted mutation
 * join), so the caller saw an error even though the record was durable — a
 * client retry then minted a second environment. The first test below fails
 * exactly that way pre-correction (`store-unavailable` + persisted: 1); the
 * second pins the other half: a create that never reached admission still
 * rejects, and nothing is persisted.
 */

const RUNTIME = { hash: "a".repeat(64) };

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

class TestSshTransport implements EnvironmentSshTransport {
  async connect(
    _input: SshConnectPayload,
    _options?: SshConnectOptions,
  ): Promise<SshConnectResult> {
    throw new Error("SSH is not part of this fixture");
  }

  async disconnect(_connectionId: string): Promise<void> {}
}

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function testTrust(): EnvironmentTrustAuthority {
  return {
    resolveTarget: async () => ({ host: "host.example", port: 22, lookupName: "host.example" }),
  } as unknown as EnvironmentTrustAuthority;
}

async function openService(root: string): Promise<{
  readonly store: EnvironmentStore;
  readonly service: EnvironmentRuntimeService;
}> {
  const lease = new TestLease(root);
  const store = await EnvironmentStore.open({ lease });
  const service = new EnvironmentRuntimeService({
    store,
    ssh: new TestSshTransport(),
    trust: testTrust(),
    runtimeProvider: async () => RUNTIME,
  });
  return { store, service };
}

/** Gate the store's private write path exactly at the commit point. */
function gateStorePersist(store: EnvironmentStore): {
  readonly entered: Promise<void>;
  readonly release: () => void;
} {
  const entered = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<void>();
  const target = store as unknown as {
    persist: (...args: unknown[]) => Promise<void>;
  };
  const original = target.persist.bind(store);
  target.persist = async (...args: unknown[]) => {
    entered.resolve();
    await gate.promise;
    return original(...args);
  };
  return { entered: entered.promise, release: () => gate.resolve() };
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: string }).code
    : undefined;
}

it("returns the committed create outcome when disposal closes the store after the write", async () => {
  const root = await mkdtemp(join(tmpdir(), "poracode-env-create-disposal-"));
  roots.push(root);
  const { store, service } = await openService(root);
  const { entered, release } = gateStorePersist(store);

  const create = service.create({
    label: "Build box",
    target: "dev@example.test",
    desired: "disabled",
  });
  await entered;

  // Composition disposal order: the service is stopped and joined, then the
  // store is closed; the admitted create mutation is already in flight.
  await service.dispose();
  const close = store.close();
  let closed = false;
  void close.then(() => {
    closed = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  // close() is waiting on the admitted mutation and holds the writer slot.
  expect(closed).toBe(false);

  release();
  const created = await create;
  await close;
  expect(closed).toBe(true);
  expect(created.state).toBe("disconnected");
  expect(created.label).toBe("Build box");

  // The durable ground truth agrees with the reported outcome: exactly one
  // record, the same environment the caller was told was created.
  const reopened = await EnvironmentStore.open({ lease: new TestLease(root) });
  const persisted: readonly EnvironmentRecord[] = reopened.listRecords();
  expect(persisted).toHaveLength(1);
  expect(persisted[0]!.environmentId).toBe(created.environmentId);
  const publicRecord = reopened.getPublic(created.environmentId)!;
  expect(publicRecord.label).toBe(created.label);
  expect(publicRecord.target).toBe(created.target);
  expect(publicRecord.runtime).toEqual(created.runtime);
  expect(publicRecord.desired).toBe("disabled");
  await reopened.close();
});

it("still refuses a create that was never admitted, and persists nothing", async () => {
  const root = await mkdtemp(join(tmpdir(), "poracode-env-create-refused-"));
  roots.push(root);
  const lease = new TestLease(root);
  const store = await EnvironmentStore.open({ lease });
  const entered = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<void>();
  const service = new EnvironmentRuntimeService({
    store,
    ssh: new TestSshTransport(),
    trust: testTrust(),
    runtimeProvider: async () => {
      entered.resolve();
      await gate.promise;
      return RUNTIME;
    },
  });

  const create = service.create({
    label: "Build box",
    target: "dev@example.test",
    desired: "disabled",
  });
  await entered.promise;
  // The store closes before the provider resolves, so the mutation is never
  // admitted: a definite rejection is truthful here.
  await store.close();
  gate.resolve();
  const outcome = await create.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  expect(outcome.ok).toBe(false);
  if (outcome.ok) throw new Error("create unexpectedly resolved");
  expect(errorCode(outcome.error)).toBe("environment/store-unavailable");

  const reopened = await EnvironmentStore.open({ lease: new TestLease(root) });
  expect(reopened.listPublic()).toEqual([]);
  await reopened.close();
  await service.dispose();
});
