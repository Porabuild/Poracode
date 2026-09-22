import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HostDataFence } from "@/backend/ownership/hostDataFence";
import { HostOwnerLease } from "@/backend/ownership/hostOwnerLease";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import type { RemoteEnvironmentDescriptor } from "@/shared/remote/protocol";
import type { SshConnectPayload, SshConnectResult } from "@/shared/ssh";
import {
  sshKeyFingerprint,
  type SshHostKeyObservation,
  type SshHostKeyProbe,
  type SshResolvedTarget,
} from "@/host/ssh/sshHostKeyTrust";
import type { SshRuntimeBundle } from "@/host/ssh/runtimeBundleShared";
import type { EnvironmentRuntime } from "@/shared/environments";
import {
  composeHostEnvironments,
  environmentStoreLeaseFromCustody,
  type ComposedHostEnvironments,
  type HostEnvironmentSshInputs,
  type HostEnvironmentSshManager,
} from "./composeHostEnvironments";
import type { EnvironmentTrustAuthority } from "./environmentTrustAuthority";
import { EnvironmentStore, type EnvironmentStoreLease } from "./EnvironmentStore";
import type {
  EnvironmentDescriptorReader,
  EnvironmentStartupOptions,
} from "./environmentRuntimeService";
import { environmentAbortError, EnvironmentRuntimeError } from "./environmentRuntimeErrors";

/**
 * Composition lifecycle tests: partial-construction rollback, lazy archive
 * preparation cancellation, authoritative borrow/own joins with explicit
 * retry, and host-owned startup reconnects. Every fixture runs under a fresh
 * mkdtemp root with a fake manager/trust/descriptor; no ssh process, user
 * config, or profile is read or written.
 */

const runtimeHash = "a".repeat(64);
const childDesktopId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function observation(seed = "A"): SshHostKeyObservation {
  const blob = Buffer.from(`ssh-ed25519 compose fixture ${seed}`).toString("base64");
  return {
    keyType: "ssh-ed25519",
    keyBlob: blob,
    fingerprint: sshKeyFingerprint(blob)!,
    hostField: "host.example",
  };
}

class FakeTrustAuthority implements EnvironmentTrustAuthority {
  readonly resolved: SshResolvedTarget = {
    host: "host.example",
    port: 22,
    lookupName: "host.example",
  };
  readonly obs = observation();

  async resolveTarget(): Promise<SshResolvedTarget> {
    return this.resolved;
  }

  async probe(): Promise<SshHostKeyProbe> {
    return { target: this.resolved, observations: [this.obs], preferred: this.obs };
  }

  async readSystemTrust(): Promise<{
    readonly lookupName: string;
    readonly observations: readonly SshHostKeyObservation[];
  }> {
    return { lookupName: this.resolved.lookupName, observations: [this.obs] };
  }

  knownHostsLine(obs: SshHostKeyObservation, target: SshResolvedTarget): string {
    return `${target.lookupName} ${obs.keyType} ${obs.keyBlob}`;
  }

  async writeKnownHostsFile(path: string, lines: readonly string[]): Promise<void> {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, lines.join("\n") + "\n", "utf8");
  }
}

function defaultResult(input: SshConnectPayload): SshConnectResult {
  return {
    connectionId: input.connection.id,
    endpoint: "http://127.0.0.1:5555/",
    remotePort: 5555,
  };
}

class FakeSshManager implements HostEnvironmentSshManager {
  readonly connects: SshConnectPayload[] = [];
  readonly disconnects: string[] = [];
  disposeCalls = 0;
  connectImpl: ((input: SshConnectPayload) => Promise<SshConnectResult>) | null = null;
  disconnectImpl: ((connectionId: string) => Promise<void>) | null = null;
  onTunnelExitImpl: (() => () => void) | null = null;
  private readonly listeners = new Set<(connectionId: string) => void>();

  connect(input: SshConnectPayload): Promise<SshConnectResult> {
    this.connects.push(input);
    return this.connectImpl ? this.connectImpl(input) : Promise.resolve(defaultResult(input));
  }

  disconnect(connectionId: string): Promise<void> {
    this.disconnects.push(connectionId);
    return this.disconnectImpl ? this.disconnectImpl(connectionId) : Promise.resolve();
  }

  onTunnelExit(listener: (connectionId: string) => void): () => void {
    if (this.onTunnelExitImpl) return this.onTunnelExitImpl();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): Promise<void> {
    this.disposeCalls += 1;
    return Promise.resolve();
  }

  emitTunnelExit(connectionId: string): void {
    for (const listener of [...this.listeners]) listener(connectionId);
  }
}

function descriptor(): RemoteEnvironmentDescriptor {
  return {
    protocolVersion: 12,
    hostMode: "helper",
    desktopId: childDesktopId,
    label: "Remote",
    appVersion: "1.0.0",
    platform: "linux",
    auth: {
      policy: "remote-reachable",
      bootstrapMethods: ["one-time-token"],
      sessionMethods: ["bearer-access-token"],
      scopes: ["session:read"],
    },
    endpoints: { httpBaseUrl: "http://127.0.0.1:5555/", wsBaseUrl: "ws://127.0.0.1:5555/" },
  };
}

const roots: string[] = [];
const ownerLeases: HostOwnerLease[] = [];
const fences: HostDataFence[] = [];
const compositions: ComposedHostEnvironments[] = [];

afterEach(async () => {
  for (const composition of compositions.splice(0)) {
    await composition.dispose().catch(() => undefined);
    await composition.store.close().catch(() => undefined);
  }
  for (const lease of ownerLeases.splice(0)) lease.release();
  for (const fence of fences.splice(0)) fence.release();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function newRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "poracode-env-compose-"));
  roots.push(root);
  return root;
}

function headlessLease(root: string): HostOwnerLease {
  const lease = HostOwnerLease.acquire(resolveHostRootPaths(join(root, "profile")), "headless");
  ownerLeases.push(lease);
  return lease;
}

function desktopCustody(root: string): { lease: EnvironmentStoreLease; dataRoot: string } {
  const paths = resolveHostRootPaths(join(root, "profile"));
  const fence = HostDataFence.acquire(paths.dataFencePath);
  fences.push(fence);
  return {
    lease: environmentStoreLeaseFromCustody(paths.dataRoot, fence),
    dataRoot: paths.dataRoot,
  };
}

interface ComposeHarnessOptions {
  readonly root: string;
  /** Defaults to a fresh headless owner lease under `root`. */
  readonly lease?: EnvironmentStoreLease;
  readonly borrow: boolean;
  readonly manager: FakeSshManager;
  readonly trust?: EnvironmentTrustAuthority;
  readonly runtimeProvider?: () => Promise<EnvironmentRuntime>;
  readonly prepareRuntimeBundle?: (signal: AbortSignal) => Promise<SshRuntimeBundle>;
  readonly startup?: EnvironmentStartupOptions;
  readonly descriptorReader?: EnvironmentDescriptorReader;
}

async function composeHarness(options: ComposeHarnessOptions): Promise<ComposedHostEnvironments> {
  const lease = options.lease ?? headlessLease(options.root);
  const inputs: HostEnvironmentSshInputs = {
    mainBundleDir: options.root,
    agentPluginsDir: options.root,
    wslHelpersDir: options.root,
  };
  const composition = await composeHostEnvironments({
    lease,
    baseDir: options.root,
    inputs,
    ...(options.borrow
      ? { borrowSshManager: options.manager }
      : { createSshManager: () => options.manager }),
    trust: options.trust ?? new FakeTrustAuthority(),
    runtimeProvider:
      options.runtimeProvider ?? (async () => ({ hash: runtimeHash, appVersion: "1.0.0" })),
    descriptorReader: options.descriptorReader ?? (async () => descriptor()),
    ...(options.prepareRuntimeBundle === undefined
      ? {}
      : { prepareRuntimeBundle: options.prepareRuntimeBundle }),
    ...(options.startup === undefined ? {} : { startup: options.startup }),
  });
  compositions.push(composition);
  return composition;
}

describe("composeHostEnvironments", () => {
  it("composes over a headless owner lease and never releases it", async () => {
    const root = newRoot();
    const lease = headlessLease(root);
    const manager = new FakeSshManager();
    const composition = await composeHarness({ root, lease, borrow: true, manager });

    expect(composition.store.dataRoot).toBe(lease.paths.dataRoot);
    expect(composition.ownsSshManager).toBe(false);

    const created = await composition.runtimeService.create({
      label: "Lab",
      target: "dev@host.example",
    });
    expect(composition.store.getPublic(created.environmentId)).toBeDefined();

    await composition.dispose();
    expect(manager.disposeCalls).toBe(0);
    expect(() => lease.assertActive()).not.toThrow();
    expect(() => composition.store.listPublic()).toThrow(/store is closed/u);
  });

  it("composes over a desktop data-fence adapter and fails closed once custody ends", async () => {
    const root = newRoot();
    const { lease, dataRoot } = desktopCustody(root);
    const manager = new FakeSshManager();
    const composition = await composeHarness({ root, lease, borrow: true, manager });

    expect(composition.store.dataRoot).toBe(dataRoot);
    const created = await composition.runtimeService.create({
      label: "Lab",
      target: "dev@host.example",
    });
    expect(composition.store.getPublic(created.environmentId)).toBeDefined();

    const fence = fences.at(-1)!;
    fence.release();
    expect(() => composition.store.listPublic()).toThrow(/no longer active/u);
    await expect(composition.dispose()).rejects.toBeInstanceOf(AggregateError);
    // The store writer slot is released explicitly; only root custody is gone.
    await composition.store.close();
    expect(manager.disposeCalls).toBe(0);
    expect(() => lease.assertActive()).toThrow(/no longer active/u);
  });

  it("rolls back an owned manager and closes the store when construction fails", async () => {
    const root = newRoot();
    const lease = headlessLease(root);
    const manager = new FakeSshManager();
    manager.onTunnelExitImpl = () => {
      throw new Error("tunnel-exit subscription failed");
    };
    const inputs: HostEnvironmentSshInputs = {
      mainBundleDir: root,
      agentPluginsDir: root,
      wslHelpersDir: root,
    };

    await expect(
      composeHostEnvironments({
        lease,
        baseDir: root,
        inputs,
        createSshManager: () => manager,
        trust: new FakeTrustAuthority(),
        runtimeProvider: async () => ({ hash: runtimeHash }),
      }),
    ).rejects.toThrow("tunnel-exit subscription failed");
    expect(manager.disposeCalls).toBe(1);

    // The writer slot was released: the same lease can open a fresh store.
    const reopened = await EnvironmentStore.open({ lease });
    await reopened.close();
    expect(() => lease.assertActive()).not.toThrow();
  });

  it("leaves a borrowed manager untouched when construction fails", async () => {
    const root = newRoot();
    const lease = headlessLease(root);
    const manager = new FakeSshManager();
    manager.onTunnelExitImpl = () => {
      throw new Error("tunnel-exit subscription failed");
    };
    const inputs: HostEnvironmentSshInputs = {
      mainBundleDir: root,
      agentPluginsDir: root,
      wslHelpersDir: root,
    };

    await expect(
      composeHostEnvironments({
        lease,
        baseDir: root,
        inputs,
        borrowSshManager: manager,
        trust: new FakeTrustAuthority(),
        runtimeProvider: async () => ({ hash: runtimeHash }),
      }),
    ).rejects.toThrow("tunnel-exit subscription failed");
    expect(manager.disposeCalls).toBe(0);

    const reopened = await EnvironmentStore.open({ lease });
    await reopened.close();
  });

  it("detaches one caller while the shared archive preparation continues", async () => {
    const root = newRoot();
    const manager = new FakeSshManager();
    const gate = Promise.withResolvers<SshRuntimeBundle>();
    let stageCalls = 0;
    const composition = await composeHarness({
      root,
      borrow: true,
      manager,
      prepareRuntimeBundle: () => {
        stageCalls += 1;
        return gate.promise;
      },
    });

    const caller = new AbortController();
    const first = composition.prepareRuntime(caller.signal);
    caller.abort("cancelled while preparing the runtime archive");
    await expect(first).rejects.toMatchObject({ name: "AbortError" });

    gate.resolve({
      archivePath: join(root, "runtime.tar.gz"),
      hash: runtimeHash,
      version: "1.0.0",
    });
    await expect(composition.prepareRuntime()).resolves.toEqual({
      hash: runtimeHash,
      appVersion: "1.0.0",
    });
    expect(stageCalls).toBe(1);
    await composition.dispose();
  });

  it("aborts pending archive preparation on dispose and leaves no work pending", async () => {
    const root = newRoot();
    const manager = new FakeSshManager();
    const observed: { signal: AbortSignal | null } = { signal: null };
    const composition = await composeHarness({
      root,
      borrow: true,
      manager,
      prepareRuntimeBundle: (signal) =>
        new Promise<SshRuntimeBundle>((_resolve, reject) => {
          observed.signal = signal;
          const onAbort = (): void => reject(environmentAbortError(signal.reason));
          if (signal.aborted) onAbort();
          else signal.addEventListener("abort", onAbort, { once: true });
        }),
    });

    const pending = composition.prepareRuntime();
    await composition.dispose();
    expect(observed.signal?.aborted).toBe(true);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("waits for a delayed abort cleanup before releasing custody and refuses new work", async () => {
    const root = newRoot();
    const manager = new FakeSshManager();
    const cleanup = Promise.withResolvers<SshRuntimeBundle>();
    let stageCalls = 0;
    let abortObserved = false;
    const composition = await composeHarness({
      root,
      borrow: true,
      manager,
      prepareRuntimeBundle: (signal) => {
        stageCalls += 1;
        signal.addEventListener(
          "abort",
          () => {
            abortObserved = true;
          },
          { once: true },
        );
        // The builder ignores the abort until its own cleanup is done and only
        // then settles. The abort request alone must not release the store.
        return cleanup.promise;
      },
    });
    const created = await composition.runtimeService.create({
      label: "Lab",
      target: "dev@host.example",
    });
    const preparation = composition.prepareRuntime().catch((error: unknown) => error);
    const first = composition.dispose();
    const concurrent = composition.dispose();
    expect(concurrent).toBe(first);

    let settled = false;
    void first.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(abortObserved).toBe(true);
    expect(settled).toBe(false);
    expect(composition.store.getPublic(created.environmentId)).toBeDefined();
    await expect(composition.start()).rejects.toMatchObject({ name: "AbortError" });
    await expect(composition.prepareRuntime()).rejects.toMatchObject({ name: "AbortError" });
    expect(stageCalls).toBe(1);
    expect(manager.connects).toHaveLength(0);

    cleanup.resolve({
      archivePath: join(root, "runtime.tar.gz"),
      hash: runtimeHash,
      version: "1.0.0",
    });
    await expect(first).resolves.toBeUndefined();
    expect(settled).toBe(true);
    await expect(preparation).resolves.toEqual({ hash: runtimeHash, appVersion: "1.0.0" });
    expect(manager.disconnects).toContain(created.environmentId);
    expect(manager.disposeCalls).toBe(0);
    expect(() => composition.store.listPublic()).toThrow(/store is closed/u);
  });

  it("treats an abort-shaped preparation rejection as clean only after the work settles", async () => {
    const root = newRoot();
    const manager = new FakeSshManager();
    const cleanup = Promise.withResolvers<void>();
    const composition = await composeHarness({
      root,
      borrow: true,
      manager,
      prepareRuntimeBundle: (signal) =>
        cleanup.promise.then(() => {
          throw environmentAbortError(signal.reason);
        }),
    });
    const preparation = composition.prepareRuntime().catch((error: unknown) => error);
    const disposal = composition.dispose();
    let settled = false;
    void disposal.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);

    cleanup.resolve();
    await expect(disposal).resolves.toBeUndefined();
    await expect(preparation).resolves.toMatchObject({ name: "AbortError" });
    expect(() => composition.store.listPublic()).toThrow(/store is closed/u);
  });

  it("accepts the canonical cancelled code as an expected preparation end", async () => {
    const root = newRoot();
    const manager = new FakeSshManager();
    const composition = await composeHarness({
      root,
      borrow: true,
      manager,
      prepareRuntimeBundle: (signal) =>
        new Promise<SshRuntimeBundle>((_resolve, reject) => {
          const onAbort = (): void => reject(new EnvironmentRuntimeError("environment/cancelled"));
          if (signal.aborted) onAbort();
          else signal.addEventListener("abort", onAbort, { once: true });
        }),
    });
    const preparation = composition.prepareRuntime().catch((error: unknown) => error);
    await expect(composition.dispose()).resolves.toBeUndefined();
    await expect(preparation).resolves.toMatchObject({ code: "environment/cancelled" });
    expect(() => composition.store.listPublic()).toThrow(/store is closed/u);
  });

  it("retains an actual archive cleanup failure instead of releasing custody", async () => {
    const root = newRoot();
    const manager = new FakeSshManager();
    const cleanupFailure = new Error("runtime stage directory could not be removed");
    const observed: { signal: AbortSignal | null } = { signal: null };
    const composition = await composeHarness({
      root,
      borrow: true,
      manager,
      prepareRuntimeBundle: (signal) => {
        observed.signal = signal;
        return new Promise<SshRuntimeBundle>((_resolve, reject) => {
          const onAbort = (): void => reject(cleanupFailure);
          if (signal.aborted) onAbort();
          else signal.addEventListener("abort", onAbort, { once: true });
        });
      },
    });
    const preparation = composition.prepareRuntime().catch((error: unknown) => error);
    const firstFailure = await composition.dispose().catch((error: unknown) => error);
    expect(observed.signal?.aborted).toBe(true);
    expect(firstFailure).toBeInstanceOf(AggregateError);
    expect((firstFailure as AggregateError).errors).toContain(cleanupFailure);
    await expect(preparation).resolves.toBe(cleanupFailure);

    // The failed cleanup is retained: a retry re-reports it instead of
    // releasing the store as if the stage had joined.
    const secondFailure = await composition.dispose().catch((error: unknown) => error);
    expect(secondFailure).toBeInstanceOf(AggregateError);
    expect((secondFailure as AggregateError).errors).toContain(cleanupFailure);
    expect(composition.store.listPublic()).toHaveLength(0);
  });

  it("retains a borrowed manager and retries the join after a failed disconnect", async () => {
    const root = newRoot();
    const manager = new FakeSshManager();
    let failing = true;
    manager.disconnectImpl = async () => {
      if (failing) throw new Error("owned tunnel has not exited");
    };
    const composition = await composeHarness({
      root,
      borrow: true,
      manager,
    });
    const created = await composition.runtimeService.create({
      label: "Lab",
      target: "dev@host.example",
    });
    await composition.runtimeService.connect(created.environmentId);

    // The runtime service's own disposal outcome is not a join proof here; the
    // composition performs its own authoritative manager join and must not
    // release custody while that join is rejected.
    const firstFailure = await composition.dispose().catch((error: unknown) => error);
    expect(firstFailure).toBeInstanceOf(AggregateError);
    expect(manager.disposeCalls).toBe(0);
    expect(composition.store.getPublic(created.environmentId)).toBeDefined();

    failing = false;
    await expect(composition.dispose()).resolves.toBeUndefined();
    expect(manager.disposeCalls).toBe(0);
    expect(manager.disconnects).toContain(created.environmentId);
    expect(() => composition.store.listPublic()).toThrow(/store is closed/u);
  });

  it("retries a failed service disposal without repeating confirmed joins", async () => {
    const root = newRoot();
    const manager = new FakeSshManager();
    let stageCalls = 0;
    const composition = await composeHarness({
      root,
      borrow: true,
      manager,
      prepareRuntimeBundle: () => {
        stageCalls += 1;
        return Promise.resolve({
          archivePath: join(root, "runtime.tar.gz"),
          hash: runtimeHash,
          version: "1.0.0",
        });
      },
    });
    const created = await composition.runtimeService.create({
      label: "Lab",
      target: "dev@host.example",
    });
    let serviceDisposeCalls = 0;
    composition.runtimeService.dispose = async () => {
      serviceDisposeCalls += 1;
      if (serviceDisposeCalls === 1) throw new Error("service join is still outstanding");
    };

    const first = composition.dispose();
    const concurrent = composition.dispose();
    expect(concurrent).toBe(first);
    const firstFailure = await first.catch((error: unknown) => error);
    expect(firstFailure).toBeInstanceOf(AggregateError);
    expect(serviceDisposeCalls).toBe(1);
    expect(manager.disposeCalls).toBe(0);
    expect(manager.disconnects).toEqual([created.environmentId]);
    expect(composition.store.getPublic(created.environmentId)).toBeDefined();

    // Work stays refused after the failed attempt; preparation never runs.
    await expect(composition.start()).rejects.toMatchObject({ name: "AbortError" });
    await expect(composition.prepareRuntime()).rejects.toMatchObject({ name: "AbortError" });
    expect(stageCalls).toBe(0);

    await expect(composition.dispose()).resolves.toBeUndefined();
    expect(serviceDisposeCalls).toBe(2);
    expect(manager.disconnects).toEqual([created.environmentId]);
    expect(manager.disposeCalls).toBe(0);
    expect(() => composition.store.listPublic()).toThrow(/store is closed/u);
  });

  it("retries only the outstanding borrowed joins after a partial manager failure", async () => {
    const root = newRoot();
    const manager = new FakeSshManager();
    const composition = await composeHarness({ root, borrow: true, manager });
    const first = await composition.runtimeService.create({
      label: "One",
      target: "dev@one.example",
    });
    const second = await composition.runtimeService.create({
      label: "Two",
      target: "dev@two.example",
    });
    await composition.runtimeService.connect(first.environmentId);
    await composition.runtimeService.connect(second.environmentId);
    // Isolate the composition's authoritative manager join from the service's
    // own fan-out so the per-connection ledger is what is measured.
    composition.runtimeService.dispose = async () => {};
    let failing = true;
    const calls: string[] = [];
    manager.disconnectImpl = async (connectionId) => {
      calls.push(connectionId);
      if (connectionId === first.environmentId && failing) {
        throw new Error("tunnel has not exited");
      }
    };

    const firstFailure = await composition.dispose().catch((error: unknown) => error);
    expect(firstFailure).toBeInstanceOf(AggregateError);
    expect(manager.disposeCalls).toBe(0);
    expect(composition.store.getPublic(first.environmentId)).toBeDefined();

    failing = false;
    await expect(composition.dispose()).resolves.toBeUndefined();
    expect(calls.filter((id) => id === first.environmentId)).toHaveLength(2);
    expect(calls.filter((id) => id === second.environmentId)).toHaveLength(1);
    expect(manager.disposeCalls).toBe(0);
    expect(() => composition.store.listPublic()).toThrow(/store is closed/u);
  });

  it("joins an owned manager in full, once, and never targets individual connections", async () => {
    const root = newRoot();
    const manager = new FakeSshManager();
    const composition = await composeHarness({ root, borrow: false, manager });
    const created = await composition.runtimeService.create({
      label: "Lab",
      target: "dev@host.example",
    });
    await composition.runtimeService.connect(created.environmentId);
    composition.runtimeService.dispose = async () => {};

    await composition.dispose();
    await composition.dispose();
    expect(manager.disposeCalls).toBe(1);
    expect(manager.disconnects).toHaveLength(0);
    expect(() => composition.store.listPublic()).toThrow(/store is closed/u);
  });

  it("hands a borrowed manager back with every environment connection joined", async () => {
    const root = newRoot();
    const manager = new FakeSshManager();
    const composition = await composeHarness({
      root,
      borrow: true,
      manager,
    });
    const created = await composition.runtimeService.create({
      label: "Lab",
      target: "dev@host.example",
    });
    await composition.runtimeService.connect(created.environmentId);
    const liveConnectionId = manager.connects[0]!.connection.id;

    await composition.dispose();
    expect(manager.disposeCalls).toBe(0);
    expect(manager.disconnects).toContain(liveConnectionId);
    // The caller's manager is still usable after the handoff.
    await expect(
      manager.connect({
        connection: { id: randomUUID(), label: "later", target: "dev@later.example" },
      }),
    ).resolves.toMatchObject({ remotePort: 5555 });
    expect(composition.ownsSshManager).toBe(false);
  });

  it("joins the adopted legacy connection id the manager actually used", async () => {
    const root = newRoot();
    const manager = new FakeSshManager();
    const composition = await composeHarness({
      root,
      borrow: true,
      manager,
    });
    const legacyConnectionId = randomUUID();
    const created = await composition.runtimeService.create({
      label: "Lab",
      target: "dev@host.example",
      legacyConnectionId,
    });
    await composition.runtimeService.connect(created.environmentId);
    expect(manager.connects[0]!.connection.id).toBe(legacyConnectionId);

    await composition.dispose();
    expect(manager.disconnects).toContain(legacyConnectionId);
  });

  it("reconnects desired-enabled environments at startup with no client interest", async () => {
    const root = newRoot();
    const manager = new FakeSshManager();
    let transientFailures = 0;
    manager.connectImpl = async (input) => {
      if (input.connection.target.startsWith("flaky@") && transientFailures++ === 0) {
        throw new Error("transient connect failure");
      }
      return defaultResult(input);
    };
    const composition = await composeHarness({
      root,
      borrow: true,
      manager,
      startup: {
        concurrency: 2,
        maxAttempts: 3,
        backoffBaseMs: 1,
        backoffMaxMs: 2,
        sleep: async () => undefined,
      },
    });
    const steady = await composition.runtimeService.create({
      label: "Steady",
      target: "dev@steady.example",
    });
    const flaky = await composition.runtimeService.create({
      label: "Flaky",
      target: "flaky@transient.example",
    });
    expect(manager.connects).toHaveLength(0);

    await composition.start();
    expect([...new Set(manager.connects.map((input) => input.connection.id))].sort()).toEqual(
      [steady.environmentId, flaky.environmentId].sort(),
    );
    expect(
      manager.connects.filter((input) => input.connection.id === flaky.environmentId),
    ).toHaveLength(2);
    expect(composition.runtimeService.getPublic(steady.environmentId)!.state).toBe("connected");
    expect(composition.runtimeService.getPublic(flaky.environmentId)!.state).toBe("connected");
    await composition.dispose();
  });

  it("refuses a composition that both borrows and creates an SSH manager", async () => {
    const root = newRoot();
    const lease = headlessLease(root);
    await expect(
      composeHostEnvironments({
        lease,
        baseDir: root,
        inputs: { mainBundleDir: root, agentPluginsDir: root, wslHelpersDir: root },
        borrowSshManager: new FakeSshManager(),
        createSshManager: () => new FakeSshManager(),
      }),
    ).rejects.toThrow(/either borrows an SSH manager or creates one/u);
  });
});
