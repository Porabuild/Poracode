import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { type EnvironmentRuntime, type EnvironmentPublicProjection } from "@/shared/environments";
import type { SshConnectPayload, SshConnectResult, SshConnectionConfig } from "@/shared/ssh";
import type { SshConnectOptions } from "@/host/ssh/sshEnvironmentController";
import {
  sshKeyFingerprint,
  type SshHostKeyObservation,
  type SshHostKeyProbe,
  type SshKnownHostsPolicy,
  type SshResolvedTarget,
} from "@/host/ssh/sshHostKeyTrust";
import { EnvironmentStore, type EnvironmentStoreLease } from "./EnvironmentStore";
import { environmentsFilePath } from "./environmentStoreFile";
import { environmentKnownHostsPath } from "./environmentKnownHosts";
import type { EnvironmentTrustAuthority } from "./environmentTrustAuthority";
import {
  EnvironmentRuntimeService,
  type EnvironmentDescriptorReader,
  type EnvironmentSshTransport,
  type EnvironmentStartupOptions,
} from "./environmentRuntimeService";
import { EnvironmentRuntimeError } from "./environmentRuntimeErrors";
import type { EnvironmentCredentialResolver } from "./environmentCredentialCustody";

const runtimeHash = "a".repeat(64);
const upgradedRuntimeHash = "b".repeat(64);
const legacyIdA = "11111111-1111-4111-8111-111111111111";
const legacyIdB = "22222222-2222-4222-8222-222222222222";
const childDesktopId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const otherDesktopId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

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

function observation(seed: string): SshHostKeyObservation {
  const blob = Buffer.from(`ssh-ed25519 fixture ${seed}`).toString("base64");
  return {
    keyType: "ssh-ed25519",
    keyBlob: blob,
    fingerprint: sshKeyFingerprint(blob)!,
    hostField: "host.example",
  };
}

class FakeTrustAuthority implements EnvironmentTrustAuthority {
  resolved: SshResolvedTarget = {
    host: "host.example",
    port: 22,
    lookupName: "host.example",
  };
  observations: SshHostKeyObservation[] = [observation("A")];
  systemObservations: SshHostKeyObservation[] = [];
  probeError: Error | undefined;
  readonly written = new Map<string, readonly string[]>();
  probeCalls = 0;
  systemCalls = 0;

  async resolveTarget(): Promise<SshResolvedTarget> {
    return this.resolved;
  }

  async probe(_target: SshResolvedTarget, _signal?: AbortSignal): Promise<SshHostKeyProbe> {
    this.probeCalls += 1;
    if (this.probeError) throw this.probeError;
    const preferred = this.observations[0];
    if (preferred === undefined) throw new Error("no observation configured");
    return { target: this.resolved, observations: this.observations, preferred };
  }

  async readSystemTrust(): Promise<{
    readonly lookupName: string;
    readonly observations: readonly SshHostKeyObservation[];
  }> {
    this.systemCalls += 1;
    return { lookupName: this.resolved.lookupName, observations: this.systemObservations };
  }

  knownHostsLine(obs: SshHostKeyObservation, target: SshResolvedTarget): string {
    return `${target.lookupName} ${obs.keyType} ${obs.keyBlob}`;
  }

  async writeKnownHostsFile(path: string, lines: readonly string[]): Promise<void> {
    this.written.set(path, [...lines]);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, lines.join("\n") + "\n", "utf8");
  }
}

interface RecordedConnect {
  readonly connection: SshConnectionConfig;
  readonly pairing: boolean;
  readonly knownHosts: SshKnownHostsPolicy | undefined;
}

class FakeSshTransport implements EnvironmentSshTransport {
  readonly connects: RecordedConnect[] = [];
  readonly disconnects: string[] = [];
  readonly upgradeCalls: RecordedConnect[] = [];
  connectImpl:
    | ((input: SshConnectPayload, options?: SshConnectOptions) => Promise<SshConnectResult>)
    | undefined;
  disconnectImpl: ((connectionId: string) => Promise<void>) | undefined;
  private readonly listeners = new Set<(connectionId: string) => void>();
  active = 0;
  maxActive = 0;

  connect(input: SshConnectPayload, options?: SshConnectOptions): Promise<SshConnectResult> {
    this.connects.push({
      connection: input.connection,
      pairing: input.issuePairingCredential === true,
      knownHosts: options?.knownHosts,
    });
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    const result = this.connectImpl
      ? this.connectImpl(input, options)
      : Promise.resolve(this.defaultResult(input));
    return result.finally(() => {
      this.active -= 1;
    });
  }

  async disconnect(connectionId: string): Promise<void> {
    this.disconnects.push(connectionId);
    if (this.disconnectImpl) await this.disconnectImpl(connectionId);
  }

  onTunnelExit(listener: (connectionId: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emitTunnelExit(connectionId: string): void {
    for (const listener of [...this.listeners]) listener(connectionId);
  }

  protected defaultResult(input: SshConnectPayload): SshConnectResult {
    return {
      connectionId: input.connection.id,
      endpoint: "http://127.0.0.1:5555/",
      remotePort: 5555,
    };
  }
}

class UpgradeFakeSshTransport extends FakeSshTransport {
  upgradeImpl:
    | ((input: SshConnectPayload, options?: SshConnectOptions) => Promise<SshConnectResult>)
    | undefined;

  async upgrade(input: SshConnectPayload, options?: SshConnectOptions): Promise<SshConnectResult> {
    this.upgradeCalls.push({
      connection: input.connection,
      pairing: false,
      knownHosts: options?.knownHosts,
    });
    if (!this.upgradeImpl) throw new Error("upgrade not configured");
    return this.upgradeImpl(input, options);
  }
}

interface HarnessOptions {
  readonly transport?: FakeSshTransport;
  readonly trust?: FakeTrustAuthority;
  readonly runtimes?: () => EnvironmentRuntime;
  readonly startup?: EnvironmentStartupOptions;
  readonly credentials?: EnvironmentCredentialResolver;
}

interface Harness {
  readonly root: string;
  readonly lease: TestLease;
  readonly store: EnvironmentStore;
  readonly transport: FakeSshTransport;
  readonly trust: FakeTrustAuthority;
  readonly service: EnvironmentRuntimeService;
  readonly descriptorId: () => string;
  readonly descriptorCalls: () => number;
  setDescriptorId(value: string): void;
  create(input?: {
    target?: string;
    legacyConnectionId?: string;
  }): Promise<EnvironmentPublicProjection>;
  dispose(): Promise<void>;
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function openHarness(options: HarnessOptions = {}, existingRoot?: string): Promise<Harness> {
  const root = existingRoot ?? mkdtempSync(join(tmpdir(), "poracode-env-runtime-test-"));
  if (existingRoot === undefined) roots.push(root);
  const lease = new TestLease(root);
  const store = await EnvironmentStore.open({ lease });
  const transport = options.transport ?? new FakeSshTransport();
  const trust = options.trust ?? new FakeTrustAuthority();
  let descriptorId = childDesktopId;
  let descriptorCalls = 0;
  let runtime = options.runtimes?.() ?? { hash: runtimeHash };
  const descriptorReader: EnvironmentDescriptorReader = async () => {
    descriptorCalls += 1;
    return {
      protocolVersion: 12,
      hostMode: "helper",
      desktopId: descriptorId,
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
  };
  const service = new EnvironmentRuntimeService({
    store,
    ssh: transport,
    trust,
    credentials:
      options.credentials ??
      ({ resolve: async () => ({ kind: "system" }) } as EnvironmentCredentialResolver),
    descriptorReader,
    runtimeProvider: async () => {
      const current = options.runtimes ? options.runtimes() : runtime;
      runtime = current;
      return current;
    },
    startup: options.startup ?? {
      concurrency: 1,
      maxAttempts: 3,
      backoffBaseMs: 1,
      backoffMaxMs: 2,
    },
  });
  const harness: Harness = {
    root,
    lease,
    store,
    transport,
    trust,
    service,
    descriptorId: () => descriptorId,
    descriptorCalls: () => descriptorCalls,
    setDescriptorId: (value) => {
      descriptorId = value;
    },
    create: async (input = {}) => {
      const created = await service.create({
        label: "Lab",
        target: input.target ?? "dev@host.example",
        ...(input.legacyConnectionId === undefined
          ? {}
          : { legacyConnectionId: input.legacyConnectionId }),
      });
      return created;
    },
    dispose: async () => {
      await service.dispose();
      await store.close();
    },
  };
  return harness;
}

function readStore(root: string): string {
  const path = environmentsFilePath(root);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

describe("EnvironmentRuntimeService trust before provision", () => {
  it("creates an environment with the host's runtime and never accepts a client runtime", async () => {
    const harness = await openHarness();
    const created = await harness.create();
    expect(created.state).toBe("disconnected");
    expect(created.runtime.hash).toBe(runtimeHash);
    expect(created.desired).toBe("enabled");
    expect(created.credential).toBe("none");
    await expect(
      harness.service.create({
        label: "Bad",
        target: "dev@host.example",
        runtime: { hash: upgradedRuntimeHash },
      } as never),
    ).rejects.toThrow(/unrecognized key/i);
    await harness.dispose();
  });

  it("returns typed trust-required with the observed fingerprint and performs no exec", async () => {
    const harness = await openHarness();
    const created = await harness.create();
    const error = await harness.service.connect(created.environmentId).catch((cause) => cause);
    expect(error).toMatchObject({
      name: "EnvironmentRuntimeError",
      code: "environment/trust-required",
    });
    expect((error as { fingerprint?: string }).fingerprint).toBe(
      harness.trust.observations[0]!.fingerprint,
    );
    expect(harness.transport.connects).toHaveLength(0);
    expect(harness.trust.probeCalls).toBeGreaterThan(0);
    const projection = harness.service.getPublic(created.environmentId)!;
    expect(projection.state).toBe("trust-required");
    expect(projection.lastError?.fingerprint).toBe(harness.trust.observations[0]!.fingerprint);
    await harness.dispose();
  });

  it("adopts a trusted system known-hosts entry, connects with strict policy, and pins identity", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const harness = await openHarness({ trust });
    const created = await harness.create();
    const projection = await harness.service.connect(created.environmentId);
    expect(projection.state).toBe("connected");
    expect(harness.transport.connects).toHaveLength(1);
    const connect = harness.transport.connects[0]!;
    expect(connect.connection.id).toBe(created.environmentId);
    expect(connect.knownHosts).toEqual({
      userKnownHostsFile: environmentKnownHostsPath(harness.root, created.environmentId),
      strict: true,
    });
    const record = harness.store.getRecord(created.environmentId)!;
    expect(record.trust).toEqual({
      state: "observed",
      observedFingerprint: observation("system").fingerprint,
    });
    expect(record.childIdentity).toEqual({ desktopId: childDesktopId });
    // No local endpoint or credential material crosses the projection.
    const json = JSON.stringify(projection);
    expect(json).not.toContain("127.0.0.1");
    expect(json).not.toContain("credentialRef");
    // Observed runtime state never enters the durable file: only configuration,
    // desired, trust, and child identity are persisted. `trust.state` is trust
    // material, so assert on the runtime fields instead.
    const storeText = readStore(harness.root);
    const durable = JSON.parse(storeText) as {
      environments: readonly Record<string, unknown>[];
    };
    for (const environment of durable.environments) {
      expect(environment).not.toHaveProperty("state");
      expect(environment).not.toHaveProperty("lastError");
    }
    expect(storeText).not.toContain("endpoint");
    expect(storeText).not.toContain("127.0.0.1");
    await harness.dispose();
  });

  it("accepts only the fingerprint just observed and enforces the pin afterwards", async () => {
    const harness = await openHarness();
    const created = await harness.create();
    const probe = await harness.service.probeTrust(created.environmentId);
    const wrong = observation("wrong");
    await expect(
      harness.service.acceptTrust({
        environmentId: created.environmentId,
        expectedRevision: created.revision,
        fingerprint: wrong.fingerprint,
      }),
    ).rejects.toMatchObject({ code: "environment/trust-mismatch" });
    const accepted = await harness.service.acceptTrust({
      environmentId: created.environmentId,
      expectedRevision: created.revision,
      fingerprint: probe.fingerprint,
    });
    expect(accepted.trust).toMatchObject({
      state: "pinned",
      hostKeyFingerprint: probe.fingerprint,
    });
    await expect(harness.service.connect(created.environmentId)).resolves.toMatchObject({
      state: "connected",
    });

    // A rotated key contradicts the pin and fails closed before any exec.
    harness.trust.observations = [observation("rotated")];
    await expect(harness.service.disconnect(created.environmentId)).resolves.toBeDefined();
    await expect(harness.service.connect(created.environmentId)).rejects.toMatchObject({
      code: "environment/hostkey-mismatch",
      fingerprint: observation("rotated").fingerprint,
    });
    expect(harness.service.getPublic(created.environmentId)!.state).toBe("hostkey-mismatch");
    expect(harness.transport.connects).toHaveLength(1);
    await harness.dispose();
  });

  it("fails closed on a TOFU observation change and requires manage re-trust", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("first")];
    trust.observations = trust.systemObservations;
    const harness = await openHarness({ trust });
    const created = await harness.create();
    await harness.service.connect(created.environmentId);
    await harness.service.disconnect(created.environmentId);
    harness.trust.observations = [observation("second")];
    await expect(harness.service.connect(created.environmentId)).rejects.toMatchObject({
      code: "environment/trust-changed",
      fingerprint: observation("second").fingerprint,
    });
    expect(harness.service.getPublic(created.environmentId)!.state).toBe("needs-repair");
    await harness.dispose();
  });

  it("maps probe transport failures to a bounded error without SSH details", async () => {
    const harness = await openHarness();
    const created = await harness.create();
    harness.trust.probeError = new Error(
      "ssh-keyscan: /Users/secret/.ssh/known_hosts: Permission denied",
    );
    const error = await harness.service.connect(created.environmentId).catch((cause) => cause);
    expect(error).toMatchObject({ code: "environment/transport-error" });
    expect((error as Error).message).not.toContain("/Users/secret");
    await harness.dispose();
  });
});

describe("EnvironmentRuntimeService lifecycle", () => {
  it("closes a tunnel and refuses access when the child identity changes", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const harness = await openHarness({ trust });
    const created = await harness.create();
    await harness.service.connect(created.environmentId);
    const target = harness.service.getVerifiedTarget(created.environmentId);
    expect(target.childDesktopId).toBe(childDesktopId);
    await harness.service.disconnect(created.environmentId);

    harness.setDescriptorId(otherDesktopId);
    await expect(harness.service.connect(created.environmentId)).rejects.toMatchObject({
      code: "environment/identity-changed",
    });
    expect(harness.transport.disconnects).toContain(created.environmentId);
    expect(harness.store.getRecord(created.environmentId)!.childIdentity).toEqual({
      desktopId: childDesktopId,
    });
    expect(() => harness.service.getVerifiedTarget(created.environmentId)).toThrowError(
      /not connected/i,
    );
    await harness.dispose();
  });

  it("restores the same environment and child identity after a store restart", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const first = await openHarness({ trust });
    const created = await first.create();
    await first.service.connect(created.environmentId);
    await first.dispose();

    const second = await openHarness({ trust }, first.root);
    const projections = second.service.listPublic();
    expect(projections).toHaveLength(1);
    expect(projections[0]!.environmentId).toBe(created.environmentId);
    expect(projections[0]!.state).toBe("disconnected");
    const reconnected = await second.service.connect(created.environmentId);
    expect(reconnected.state).toBe("connected");
    expect(second.transport.connects[0]!.connection.id).toBe(created.environmentId);
    expect(second.store.getRecord(created.environmentId)!.childIdentity).toEqual({
      desktopId: childDesktopId,
    });
    await second.dispose();
  });

  it("cancels and joins an in-flight connect when the configuration changes", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new FakeSshTransport();
    let sawAbort = false;
    let signalConnected: () => void = () => undefined;
    const connected = new Promise<void>((resolve) => {
      signalConnected = resolve;
    });
    transport.connectImpl = (input, options) => {
      const result: SshConnectResult = {
        connectionId: input.connection.id,
        endpoint: "http://127.0.0.1:5555/",
        remotePort: 5555,
      };
      if (input.connection.target === "dev@other.example") return Promise.resolve(result);
      signalConnected();
      return new Promise<SshConnectResult>((_resolve, reject) => {
        const abort = (): void => {
          sawAbort = true;
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        };
        if (options?.signal?.aborted) {
          abort();
          return;
        }
        options?.signal?.addEventListener("abort", abort, { once: true });
      });
    };
    const harness = await openHarness({ transport, trust });
    const created = await harness.create();
    // Keep the in-flight caller's rejection observed while the update joins it.
    const pendingError = harness.service.connect(created.environmentId).then(
      () => undefined,
      (error: unknown) => error,
    );
    await connected;
    const updated = await harness.service.update({
      environmentId: created.environmentId,
      expectedRevision: harness.store.getRecord(created.environmentId)!.revision,
      patch: { target: "dev@other.example" },
    });
    expect(updated.target).toBe("dev@other.example");
    await expect(pendingError).resolves.toMatchObject({ code: "environment/cancelled" });
    expect(sawAbort).toBe(true);
    await harness.service.awaitIdle();
    expect(transport.connects.map((call) => call.connection.target)).toEqual([
      "dev@host.example",
      "dev@other.example",
    ]);
    expect(harness.service.getPublic(created.environmentId)!.state).toBe("connected");
    await harness.dispose();
  });

  it("delete cancels operations, stops the tunnel, removes state, and clears trust material", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const harness = await openHarness({ trust });
    const created = await harness.create();
    await harness.service.connect(created.environmentId);
    const knownHosts = environmentKnownHostsPath(harness.root, created.environmentId);
    expect(existsSync(knownHosts)).toBe(true);
    await harness.service.delete({
      environmentId: created.environmentId,
      expectedRevision: harness.store.getRecord(created.environmentId)!.revision,
    });
    expect(harness.store.getRecord(created.environmentId)).toBeUndefined();
    expect(harness.service.getPublic(created.environmentId)).toBeUndefined();
    expect(harness.transport.disconnects).toContain(created.environmentId);
    expect(existsSync(knownHosts)).toBe(false);
    await harness.dispose();
  });

  it("dispose joins in-flight work and is idempotent; client aborts do not stop the service", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new FakeSshTransport();
    transport.connectImpl = (_input, options) =>
      new Promise<SshConnectResult>((_resolve, reject) => {
        const abort = (): void =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (options?.signal?.aborted) {
          abort();
          return;
        }
        options?.signal?.addEventListener("abort", abort, { once: true });
      });
    const harness = await openHarness({ transport, trust });
    const created = await harness.create();
    const controller = new AbortController();
    const pending = harness.service.connect(created.environmentId, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort("client closed");
    // A caller's own abort rejects that caller (bounded to `cancelled`) and
    // detaches it; the service continues.
    await expect(pending).rejects.toMatchObject({ code: "environment/cancelled" });
    expect(harness.store.getRecord(created.environmentId)!.desired).toBe("enabled");

    const second = harness.service.connect(created.environmentId);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await harness.service.dispose();
    await expect(second).rejects.toMatchObject({ code: "environment/cancelled" });
    await harness.service.dispose();
    await harness.dispose();
  });

  it("keeps the pairing credential transient and never persists it", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new FakeSshTransport();
    transport.connectImpl = (input) =>
      Promise.resolve({
        connectionId: input.connection.id,
        endpoint: "http://127.0.0.1:5555/",
        remotePort: 5555,
        ...(input.issuePairingCredential ? { pairingCredential: "one-time-credential" } : {}),
      });
    const harness = await openHarness({ transport, trust });
    const created = await harness.create();
    await harness.service.connect(created.environmentId);
    const pairing = await harness.service.pairing(created.environmentId);
    expect(pairing).toEqual({
      environmentId: created.environmentId,
      endpoint: `/api/environments/${created.environmentId}/proxy/`,
      pairingCredential: "one-time-credential",
      childDesktopId,
    });
    expect(harness.transport.connects.filter((call) => call.pairing)).toHaveLength(1);
    const storeText = readStore(harness.root);
    expect(storeText).not.toContain("one-time-credential");
    const projection = harness.service.getPublic(created.environmentId)!;
    expect(JSON.stringify(projection)).not.toContain("one-time-credential");
    await harness.dispose();
  });
});

describe("EnvironmentRuntimeService legacy adoption", () => {
  it("uses the adopted legacy id as the remote connection id and never merges identities", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const harness = await openHarness({ trust });
    const adopted = await harness.create({ legacyConnectionId: legacyIdA });
    await harness.service.connect(adopted.environmentId);
    expect(harness.transport.connects[0]!.connection.id).toBe(legacyIdA);

    const normal = await harness.create();
    await harness.service.connect(normal.environmentId);
    expect(harness.transport.connects[1]!.connection.id).toBe(normal.environmentId);

    // The same legacy id can never be adopted twice, and one environment can
    // never adopt a second legacy identity.
    await expect(
      harness.service.create({
        label: "Other",
        target: "dev@other.example",
        legacyConnectionId: legacyIdA,
      }),
    ).rejects.toMatchObject({ code: "environment/invalid-input" });
    await expect(
      harness.service.adoptLegacy({
        environmentId: adopted.environmentId,
        expectedRevision: harness.store.getRecord(adopted.environmentId)!.revision,
        legacyConnectionId: legacyIdB,
      }),
    ).rejects.toMatchObject({ code: "environment/invalid-input" });
    await harness.dispose();
  });
});

describe("EnvironmentRuntimeService startup reconnect", () => {
  it("reconnects desired-enabled environments with bounded concurrency and backoff", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new FakeSshTransport();
    const attempts = new Map<string, number>();
    transport.connectImpl = (input) => {
      const id = input.connection.id;
      const attempt = (attempts.get(id) ?? 0) + 1;
      attempts.set(id, attempt);
      if (input.connection.target === "dev@flaky.example" && attempt < 3) {
        return Promise.reject(new Error("temporarily unreachable"));
      }
      return Promise.resolve({
        connectionId: id,
        endpoint: "http://127.0.0.1:5555/",
        remotePort: 5555,
      });
    };
    const harness = await openHarness({
      transport,
      trust,
      startup: {
        concurrency: 1,
        maxAttempts: 3,
        backoffBaseMs: 1,
        backoffMaxMs: 2,
        sleep: async () => undefined,
      },
    });
    const flaky = await harness.create({ target: "dev@flaky.example" });
    const healthy = await harness.create({ target: "dev@healthy.example" });
    const disabled = await harness.create({ target: "dev@disabled.example" });
    await harness.service.update({
      environmentId: disabled.environmentId,
      expectedRevision: disabled.revision,
      patch: { desired: "disabled" },
    });

    await harness.service.start();
    await harness.service.awaitIdle();

    expect(attempts.get(flaky.environmentId)).toBe(3);
    expect(attempts.get(healthy.environmentId)).toBe(1);
    expect(attempts.has(disabled.environmentId)).toBe(false);
    expect(transport.maxActive).toBeLessThanOrEqual(1);
    expect(harness.service.getPublic(healthy.environmentId)!.state).toBe("connected");
    expect(harness.service.getPublic(disabled.environmentId)!.state).toBe("disconnected");
    await harness.dispose();
  });

  it("keeps one bounded reconnect owner per environment across repeated updates", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new FakeSshTransport();
    transport.connectImpl = () => Promise.reject(new Error("temporarily unreachable"));
    const sleeps: Array<() => void> = [];
    const harness = await openHarness({
      transport,
      trust,
      startup: {
        concurrency: 1,
        maxAttempts: 3,
        backoffBaseMs: 1,
        backoffMaxMs: 2,
        sleep: () =>
          new Promise<void>((resolve) => {
            sleeps.push(resolve);
          }),
      },
    });
    const created = await harness.create();
    const revision = () => harness.store.getRecord(created.environmentId)!.revision;
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const waitForSleep = async (): Promise<void> => {
      const deadline = Date.now() + 2_000;
      while (sleeps.length === 0 && Date.now() < deadline) await tick();
    };
    const releaseOne = async (): Promise<void> => {
      await waitForSleep();
      sleeps.shift()?.();
      await tick();
    };
    await harness.service.update({
      environmentId: created.environmentId,
      expectedRevision: revision(),
      patch: { target: "dev@t1.example" },
    });
    await waitForSleep();
    // These land while the single owner loop is already backing off: they must
    // join it, not start overlapping loops with fresh retry budgets.
    await harness.service.update({
      environmentId: created.environmentId,
      expectedRevision: revision(),
      patch: { target: "dev@t2.example" },
    });
    await harness.service.update({
      environmentId: created.environmentId,
      expectedRevision: revision(),
      patch: { target: "dev@t3.example" },
    });
    await releaseOne();
    await releaseOne();
    await harness.service.awaitIdle();
    expect(transport.connects.length).toBeLessThanOrEqual(3);
    await harness.dispose();
  });

  it("never queues a retry behind the mutation that cancels it", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new UpgradeFakeSshTransport();
    transport.connectImpl = () => Promise.reject(new Error("temporarily unreachable"));
    transport.upgradeImpl = (input) =>
      Promise.resolve({
        connectionId: input.connection.id,
        endpoint: "http://127.0.0.1:5556/",
        remotePort: 5556,
      });
    const sleeps: Array<() => void> = [];
    let releaseProbe: () => void = () => undefined;
    const probeGate = new Promise<void>((resolve) => {
      releaseProbe = resolve;
    });
    let probeStarted: () => void = () => undefined;
    const probeReached = new Promise<void>((resolve) => {
      probeStarted = resolve;
    });
    let gateProbes = false;
    trust.probe = async (
      target: SshResolvedTarget,
      _signal?: AbortSignal,
    ): Promise<SshHostKeyProbe> => {
      if (gateProbes) {
        probeStarted();
        await probeGate;
      }
      const preferred = trust.observations[0];
      if (preferred === undefined) throw new Error("no observation configured");
      return { target, observations: trust.observations, preferred };
    };
    const harness = await openHarness({
      transport,
      trust,
      startup: {
        concurrency: 1,
        maxAttempts: 3,
        backoffBaseMs: 1,
        backoffMaxMs: 2,
        sleep: (_ms, signal) =>
          new Promise<void>((resolve, reject) => {
            const onAbort = (): void =>
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            if (signal.aborted) {
              onAbort();
              return;
            }
            signal.addEventListener("abort", onAbort, { once: true });
            sleeps.push(() => {
              signal.removeEventListener("abort", onAbort);
              resolve();
            });
          }),
      },
    });
    const created = await harness.create();
    await harness.service.update({
      environmentId: created.environmentId,
      expectedRevision: harness.store.getRecord(created.environmentId)!.revision,
      patch: { target: "dev@t1.example" },
    });
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const deadline = Date.now() + 2_000;
    while (sleeps.length === 0 && Date.now() < deadline) await tick();

    // The owner is backing off. An upgrade admits a mutation and then blocks in
    // trust preparation before it cancels the owner. Waking the owner in that
    // window must not queue a retry behind the mutation: the mutation's later
    // join would wait on that queued retry, which waits on the mutation.
    gateProbes = true;
    const upgrading = harness.service.upgrade({ environmentId: created.environmentId });
    await probeReached;
    const attemptsBefore = transport.connects.length;
    sleeps.shift()?.();
    await tick();
    expect(transport.connects.length).toBe(attemptsBefore);
    releaseProbe();
    await expect(upgrading).resolves.toMatchObject({ state: "connected" });
    await harness.dispose();
  });
});

describe("EnvironmentRuntimeService verified target and upgrade", () => {
  it("invalidates the verified target when the tunnel exits", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const harness = await openHarness({ trust });
    const created = await harness.create();
    await harness.service.connect(created.environmentId);
    const target = harness.service.getVerifiedTarget(created.environmentId);
    harness.transport.emitTunnelExit(created.environmentId);
    expect(target.invalidation.aborted).toBe(true);
    expect(() => target.assertCurrent()).toThrowError(/not connected/i);
    expect(harness.service.getPublic(created.environmentId)!.state).toBe("disconnected");
    await harness.dispose();
  });

  it("refuses a typed upgrade-unavailable when the transport has no upgrade verb", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const harness = await openHarness({ trust });
    const created = await harness.create();
    await harness.service.connect(created.environmentId);
    const error = await harness.service
      .upgrade({ environmentId: created.environmentId })
      .catch((cause) => cause);
    expect(error).toMatchObject({ code: "environment/upgrade-unavailable" });
    expect((error as Error).message).toContain("upgrade");
    expect(harness.transport.connects).toHaveLength(1);
    expect(harness.service.getPublic(created.environmentId)!.state).toBe("needs-repair");
    await harness.dispose();
  });

  it("runs an explicit upgrade with the host runtime and re-verifies identity", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new UpgradeFakeSshTransport();
    transport.upgradeImpl = (input) =>
      Promise.resolve({
        connectionId: input.connection.id,
        endpoint: "http://127.0.0.1:5556/",
        remotePort: 5556,
      });
    const first = await openHarness({ transport, trust });
    const created = await first.create();
    await first.service.connect(created.environmentId);
    await first.dispose();

    const upgrading = await openHarness(
      { transport, trust, runtimes: () => ({ hash: upgradedRuntimeHash }) },
      first.root,
    );
    const upgraded = await upgrading.service.upgrade({
      environmentId: created.environmentId,
    });
    expect(upgraded.state).toBe("connected");
    expect(upgraded.runtime.hash).toBe(upgradedRuntimeHash);
    expect(transport.upgradeCalls).toHaveLength(1);
    expect(transport.upgradeCalls[0]!.connection.id).toBe(created.environmentId);
    expect(transport.upgradeCalls[0]!.knownHosts?.strict).toBe(true);
    expect(upgrading.store.getRecord(created.environmentId)!.childIdentity).toEqual({
      desktopId: childDesktopId,
    });
    expect(upgrading.store.getRecord(created.environmentId)!.runtime.hash).toBe(
      upgradedRuntimeHash,
    );
    await upgrading.dispose();
  });

  it("fails an upgrade closed when the child identity changed, without updating the runtime", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new UpgradeFakeSshTransport();
    transport.upgradeImpl = (input) =>
      Promise.resolve({
        connectionId: input.connection.id,
        endpoint: "http://127.0.0.1:5556/",
        remotePort: 5556,
      });
    const harness = await openHarness({ transport, trust });
    const created = await harness.create();
    await harness.service.connect(created.environmentId);
    harness.setDescriptorId(otherDesktopId);
    await expect(
      harness.service.upgrade({ environmentId: created.environmentId }),
    ).rejects.toMatchObject({ code: "environment/identity-changed" });
    expect(harness.store.getRecord(created.environmentId)!.runtime.hash).toBe(runtimeHash);
    expect(harness.transport.disconnects).toContain(created.environmentId);
    await harness.dispose();
  });

  it("maps raw transport failures to bounded errors without SSH stderr or private paths", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new FakeSshTransport();
    transport.connectImpl = () =>
      Promise.reject(
        new Error(
          "ssh: connect to host 10.1.2.3 port 22: Permission denied (/home/dev/.ssh/id_ed25519)",
        ),
      );
    const harness = await openHarness({ transport, trust });
    const created = await harness.create();
    const error = await harness.service.connect(created.environmentId).catch((cause) => cause);
    expect(error).toMatchObject({ code: "environment/transport-error" });
    expect((error as Error).message).not.toContain("10.1.2.3");
    expect((error as Error).message).not.toContain("id_ed25519");
    const lastError = harness.service.getPublic(created.environmentId)!.lastError;
    expect(lastError?.message).not.toContain("10.1.2.3");
    expect(lastError?.message).not.toContain("id_ed25519");
    await harness.dispose();
  });

  it("accepts any observed key and writes only that key's material", async () => {
    const harness = await openHarness();
    const created = await harness.create();
    const preferred = observation("A");
    const alternate = observation("B");
    harness.trust.observations = [preferred, alternate];
    const accepted = await harness.service.acceptTrust({
      environmentId: created.environmentId,
      expectedRevision: created.revision,
      fingerprint: alternate.fingerprint,
    });
    expect(accepted.trust).toMatchObject({
      state: "pinned",
      hostKeyFingerprint: alternate.fingerprint,
    });
    const text = readFileSync(
      environmentKnownHostsPath(harness.root, created.environmentId),
      "utf8",
    );
    expect(text).toContain(alternate.keyBlob);
    expect(text).not.toContain(preferred.keyBlob);
    // A pin on a non-preferred offered key is still enforced on connect.
    await expect(harness.service.connect(created.environmentId)).resolves.toMatchObject({
      state: "connected",
    });
    await harness.dispose();
  });

  it("regenerates a missing known-hosts file from the recorded pin only", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const harness = await openHarness({ trust });
    const created = await harness.create();
    await harness.service.connect(created.environmentId);
    await harness.service.disconnect(created.environmentId);
    const path = environmentKnownHostsPath(harness.root, created.environmentId);
    rmSync(path, { force: true });
    const extra = observation("extra");
    harness.trust.observations = [observation("system"), extra];
    await harness.service.connect(created.environmentId);
    const text = readFileSync(path, "utf8");
    expect(text).toContain(observation("system").keyBlob);
    expect(text).not.toContain(extra.keyBlob);
    await harness.dispose();
  });

  it("prunes stale trust material on a verified connect", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const harness = await openHarness({ trust });
    const created = await harness.create();
    await harness.service.connect(created.environmentId);
    await harness.service.disconnect(created.environmentId);
    const path = environmentKnownHostsPath(harness.root, created.environmentId);
    const stale = observation("stale");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      [
        harness.trust.knownHostsLine(observation("system"), harness.trust.resolved),
        harness.trust.knownHostsLine(stale, harness.trust.resolved),
        "",
      ].join("\n"),
      "utf8",
    );
    await harness.service.connect(created.environmentId);
    const text = readFileSync(path, "utf8");
    expect(text).not.toContain(stale.keyBlob);
    expect(text).toContain(observation("system").keyBlob);
    await harness.dispose();
  });

  it("adopts one trusted system observation and never the whole offered set", async () => {
    const trust = new FakeTrustAuthority();
    const first = observation("first");
    const second = observation("second");
    trust.systemObservations = [first, second];
    trust.observations = trust.systemObservations;
    const harness = await openHarness({ trust });
    const created = await harness.create();
    await harness.service.connect(created.environmentId);
    const record = harness.store.getRecord(created.environmentId)!;
    expect(record.trust).toEqual({
      state: "observed",
      observedFingerprint: first.fingerprint,
    });
    const text = readFileSync(
      environmentKnownHostsPath(harness.root, created.environmentId),
      "utf8",
    );
    expect(text).toContain(first.keyBlob);
    expect(text).not.toContain(second.keyBlob);
    await harness.dispose();
  });

  it("keeps credential-missing typed and out of the public message", async () => {
    const harness = await openHarness({
      credentials: {
        resolve: async () => {
          throw new EnvironmentRuntimeError("environment/credential-missing");
        },
      },
    });
    const created = await harness.service.create({
      label: "Lab",
      target: "dev@host.example",
      credentialRef: "file:work-key",
    });
    const error = await harness.service.connect(created.environmentId).catch((cause) => cause);
    expect(error).toMatchObject({ code: "environment/credential-missing" });
    expect(harness.service.getPublic(created.environmentId)!.state).toBe("credential-missing");
    await harness.dispose();
  });
});

describe("EnvironmentRuntimeService stale CAS safety", () => {
  async function connectedHarness(): Promise<{
    harness: Harness;
    environmentId: string;
    revision: number;
  }> {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const harness = await openHarness({ trust });
    const created = await harness.create();
    await harness.service.connect(created.environmentId);
    return {
      harness,
      environmentId: created.environmentId,
      revision: harness.store.getRecord(created.environmentId)!.revision,
    };
  }

  it("rejects a stale-revision update before any side effect and keeps the verified target", async () => {
    const { harness, environmentId, revision } = await connectedHarness();
    await expect(
      harness.service.update({
        environmentId,
        expectedRevision: revision - 1,
        patch: { target: "dev@other.example" },
      }),
    ).rejects.toMatchObject({ code: "environment/revision-conflict" });
    expect(harness.transport.disconnects).toHaveLength(0);
    expect(() => harness.service.getVerifiedTarget(environmentId)).not.toThrow();
    expect(harness.service.getPublic(environmentId)!.state).toBe("connected");
    expect(harness.store.getRecord(environmentId)!.target).toBe("dev@host.example");
    await harness.dispose();
  });

  it("rejects stale-revision delete and adoption before any side effect", async () => {
    const { harness, environmentId, revision } = await connectedHarness();
    await expect(
      harness.service.delete({ environmentId, expectedRevision: revision - 1 }),
    ).rejects.toMatchObject({ code: "environment/revision-conflict" });
    await expect(
      harness.service.adoptLegacy({
        environmentId,
        expectedRevision: revision - 1,
        legacyConnectionId: legacyIdA,
      }),
    ).rejects.toMatchObject({ code: "environment/revision-conflict" });
    expect(harness.transport.disconnects).toHaveLength(0);
    expect(harness.store.getRecord(environmentId)).toBeDefined();
    expect(() => harness.service.getVerifiedTarget(environmentId)).not.toThrow();
    await harness.dispose();
  });

  it("reports a truthful state and keeps custody when a valid update cannot join its tunnel", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new FakeSshTransport();
    transport.disconnectImpl = async () => {
      throw new Error("utility process is not reapable");
    };
    const harness = await openHarness({ transport, trust });
    const created = await harness.create();
    await harness.service.connect(created.environmentId);
    const revision = harness.store.getRecord(created.environmentId)!.revision;
    await expect(
      harness.service.update({
        environmentId: created.environmentId,
        expectedRevision: revision,
        patch: { target: "dev@other.example" },
      }),
    ).rejects.toMatchObject({ code: "environment/transport-error" });
    const record = harness.store.getRecord(created.environmentId)!;
    expect(record.target).toBe("dev@host.example");
    expect(record.revision).toBe(revision);
    const projection = harness.service.getPublic(created.environmentId)!;
    expect(projection.state).not.toBe("connected");
    expect(projection.lastError?.code).toBe("environment/transport-error");
    expect(() => harness.service.getVerifiedTarget(created.environmentId)).toThrow(
      /not connected/i,
    );
    // The retained custody is joined on dispose; the failed join is visible
    // and a later dispose retries it.
    await expect(harness.service.dispose()).rejects.toBeInstanceOf(AggregateError);
    transport.disconnectImpl = undefined;
    await expect(harness.service.dispose()).resolves.toBeUndefined();
    await harness.store.close();
  });
});

describe("EnvironmentRuntimeService caller abort detaches", () => {
  it("does not cancel the host-owned connect and joins a second caller to it", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new FakeSshTransport();
    let hostAborted = false;
    let hostAttempts = 0;
    transport.connectImpl = (_input, options) =>
      new Promise<SshConnectResult>((_resolve, reject) => {
        hostAttempts += 1;
        const abort = (): void => {
          hostAborted = true;
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        };
        if (options?.signal?.aborted) {
          abort();
          return;
        }
        options?.signal?.addEventListener("abort", abort, { once: true });
      });
    const harness = await openHarness({ transport, trust });
    const created = await harness.create();
    const controller = new AbortController();
    const pending = harness.service.connect(created.environmentId, { signal: controller.signal });
    const waitForHostAttempt = async (): Promise<void> => {
      const deadline = Date.now() + 2_000;
      while (Date.now() < deadline) {
        if (hostAttempts > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    };
    await waitForHostAttempt();
    expect(hostAttempts).toBe(1);
    controller.abort("client closed");
    await expect(pending).rejects.toMatchObject({ code: "environment/cancelled" });
    expect(harness.service.getPublic(created.environmentId)!.state).not.toBe("error");
    expect(hostAborted).toBe(false);
    const second = harness.service.connect(created.environmentId);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(hostAttempts).toBe(1);
    const disposing = harness.dispose();
    await expect(second).rejects.toMatchObject({ code: "environment/cancelled" });
    await disposing;
    expect(hostAborted).toBe(true);
  });
});

describe("EnvironmentRuntimeService pairing identity", () => {
  it("re-verifies the pairing connection and returns the fresh child identity", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new FakeSshTransport();
    const harness = await openHarness({ transport, trust });
    const created = await harness.create();
    await harness.service.connect(created.environmentId);
    const callsAfterConnect = harness.descriptorCalls();
    transport.connectImpl = (input) => {
      if (input.issuePairingCredential === true) {
        transport.emitTunnelExit(input.connection.id);
        return Promise.resolve({
          connectionId: input.connection.id,
          endpoint: "http://127.0.0.1:5556/",
          remotePort: 5556,
          pairingCredential: "one-time-credential",
        });
      }
      return Promise.resolve({
        connectionId: input.connection.id,
        endpoint: "http://127.0.0.1:5555/",
        remotePort: 5555,
      });
    };
    const pairing = await harness.service.pairing(created.environmentId);
    expect(pairing.childDesktopId).toBe(childDesktopId);
    expect(pairing.pairingCredential).toBe("one-time-credential");
    // One descriptor read for the pairing connect and one for the
    // re-verification that binds the credential to the actual connection.
    expect(harness.descriptorCalls() - callsAfterConnect).toBeGreaterThan(1);
    expect(harness.service.getPublic(created.environmentId)!.state).toBe("connected");
    expect(harness.service.getVerifiedTarget(created.environmentId).childDesktopId).toBe(
      childDesktopId,
    );
    await harness.dispose();
  });

  it("refuses the credential when the re-verified child identity changed", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new FakeSshTransport();
    const harness = await openHarness({ transport, trust });
    const created = await harness.create();
    await harness.service.connect(created.environmentId);
    transport.connectImpl = (input) =>
      Promise.resolve({
        connectionId: input.connection.id,
        endpoint: "http://127.0.0.1:5555/",
        remotePort: 5555,
        ...(input.issuePairingCredential ? { pairingCredential: "one-time-credential" } : {}),
      });
    harness.setDescriptorId(otherDesktopId);
    await expect(harness.service.pairing(created.environmentId)).rejects.toMatchObject({
      code: "environment/identity-changed",
    });
    expect(harness.transport.disconnects).toContain(created.environmentId);
    await harness.dispose();
  });
});

describe("EnvironmentRuntimeService disconnect custody", () => {
  it("a failed disconnect keeps delete custody; dispose reports it and retries the join", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new FakeSshTransport();
    transport.disconnectImpl = async () => {
      throw new Error("utility process is not reapable; refusing to start another");
    };
    const harness = await openHarness({ transport, trust });
    const created = await harness.create();
    await harness.service.connect(created.environmentId);
    const revision = harness.store.getRecord(created.environmentId)!.revision;
    await expect(
      harness.service.delete({ environmentId: created.environmentId, expectedRevision: revision }),
    ).rejects.toMatchObject({ code: "environment/transport-error" });
    expect(harness.store.getRecord(created.environmentId)).toBeDefined();
    expect(harness.service.getPublic(created.environmentId)!.lastError?.code).toBe(
      "environment/transport-error",
    );
    const attemptsBeforeDispose = transport.disconnects.length;
    await expect(harness.service.dispose()).rejects.toBeInstanceOf(AggregateError);
    expect(transport.disconnects.length).toBe(attemptsBeforeDispose + 1);
    transport.disconnectImpl = undefined;
    await expect(harness.service.dispose()).resolves.toBeUndefined();
    expect(transport.disconnects.length).toBe(attemptsBeforeDispose + 2);
    await harness.store.close();
  });

  it("a retried disconnect lets the delete complete", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new FakeSshTransport();
    transport.disconnectImpl = async () => {
      throw new Error("utility process is not reapable");
    };
    const harness = await openHarness({ transport, trust });
    const created = await harness.create();
    await harness.service.connect(created.environmentId);
    const revision = harness.store.getRecord(created.environmentId)!.revision;
    await expect(
      harness.service.delete({ environmentId: created.environmentId, expectedRevision: revision }),
    ).rejects.toMatchObject({ code: "environment/transport-error" });
    transport.disconnectImpl = undefined;
    await expect(
      harness.service.delete({ environmentId: created.environmentId, expectedRevision: revision }),
    ).resolves.toBeUndefined();
    expect(harness.store.getRecord(created.environmentId)).toBeUndefined();
    await harness.dispose();
  });
});

describe("EnvironmentRuntimeService disposal custody", () => {
  it("rejects a failed owned join, retains the handle, and retries only it on a later dispose", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new FakeSshTransport();
    const harness = await openHarness({ transport, trust });
    const created = await harness.create();
    await harness.service.connect(created.environmentId);
    transport.disconnects.length = 0;
    transport.disconnectImpl = async () => {
      throw new Error("owned tunnel has not exited");
    };

    // The rejected join is visible and the exact handle is retained.
    await expect(harness.service.dispose()).rejects.toBeInstanceOf(AggregateError);
    expect(transport.disconnects).toEqual([created.environmentId]);
    await expect(harness.service.dispose()).rejects.toBeInstanceOf(AggregateError);
    expect(transport.disconnects).toEqual([created.environmentId, created.environmentId]);

    // Once the join confirms, the retained handle is released and a later
    // dispose never repeats it.
    transport.disconnectImpl = undefined;
    await expect(harness.service.dispose()).resolves.toBeUndefined();
    expect(transport.disconnects).toEqual([
      created.environmentId,
      created.environmentId,
      created.environmentId,
    ]);
    await expect(harness.service.dispose()).resolves.toBeUndefined();
    expect(transport.disconnects).toHaveLength(3);
    await harness.store.close();
  });

  it("attempts every owned join, retries only the failed handle, and never repeats a confirmed join", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new FakeSshTransport();
    const harness = await openHarness({ transport, trust });
    const first = await harness.create();
    const second = await harness.create({ legacyConnectionId: legacyIdA });
    await harness.service.connect(first.environmentId);
    await harness.service.connect(second.environmentId);
    transport.disconnects.length = 0;
    transport.disconnectImpl = async (connectionId) => {
      if (connectionId === first.environmentId) throw new Error("first tunnel has not exited");
    };

    await expect(harness.service.dispose()).rejects.toBeInstanceOf(AggregateError);
    expect(transport.disconnects).toEqual([first.environmentId, legacyIdA]);

    transport.disconnectImpl = undefined;
    transport.disconnects.length = 0;
    await expect(harness.service.dispose()).resolves.toBeUndefined();
    expect(transport.disconnects).toEqual([first.environmentId]);
    await expect(harness.service.dispose()).resolves.toBeUndefined();
    expect(transport.disconnects).toEqual([first.environmentId]);
    await harness.store.close();
  });

  it("single-flights concurrent disposals and shares the visible rejection", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new FakeSshTransport();
    const harness = await openHarness({ transport, trust });
    const created = await harness.create();
    await harness.service.connect(created.environmentId);
    transport.disconnects.length = 0;
    transport.disconnectImpl = async () => {
      throw new Error("owned tunnel has not exited");
    };

    const first = harness.service.dispose();
    const second = harness.service.dispose();
    expect(second).toBe(first);
    await expect(first).rejects.toBeInstanceOf(AggregateError);
    await expect(second).rejects.toBeInstanceOf(AggregateError);
    expect(transport.disconnects).toEqual([created.environmentId]);

    transport.disconnectImpl = undefined;
    await expect(harness.service.dispose()).resolves.toBeUndefined();
    expect(transport.disconnects).toEqual([created.environmentId, created.environmentId]);
    await harness.store.close();
  });

  it("retains a connection whose aborted connect cleanup join failed", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new FakeSshTransport();
    let releaseConnect: (() => void) | undefined;
    let signalConnected: () => void = () => undefined;
    const connected = new Promise<void>((resolve) => {
      signalConnected = resolve;
    });
    transport.connectImpl = (input) => {
      signalConnected();
      return new Promise<SshConnectResult>((resolve) => {
        releaseConnect = () =>
          resolve({
            connectionId: input.connection.id,
            endpoint: "http://127.0.0.1:5555/",
            remotePort: 5555,
          });
      });
    };
    const harness = await openHarness({ transport, trust });
    const created = await harness.create();
    const pending = harness.service.connect(created.environmentId).then(
      () => undefined,
      (error: unknown) => error,
    );
    await connected;
    expect(transport.connects).toHaveLength(1);
    transport.disconnects.length = 0;
    transport.disconnectImpl = async () => {
      throw new Error("abandoned tunnel has not exited");
    };

    // The connect promise is aborted, but the tunnel child it created is not
    // joined by that abort: the cleanup join fails and dispose must not claim
    // an unconfirmed join.
    const disposing = harness.service.dispose();
    releaseConnect?.();
    await expect(pending).resolves.toMatchObject({ code: "environment/cancelled" });
    await expect(disposing).rejects.toBeInstanceOf(AggregateError);
    expect(transport.disconnects).toHaveLength(2);

    transport.disconnectImpl = undefined;
    await expect(harness.service.dispose()).resolves.toBeUndefined();
    expect(transport.disconnects).toHaveLength(3);
    await expect(harness.service.dispose()).resolves.toBeUndefined();
    expect(transport.disconnects).toHaveLength(3);
    await harness.store.close();
  });

  it("refuses new work once disposal starts and still joins the owned connection", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const transport = new FakeSshTransport();
    const harness = await openHarness({ transport, trust });
    const created = await harness.create();
    await harness.service.connect(created.environmentId);
    let releaseJoin: () => void = () => undefined;
    transport.disconnectImpl = () =>
      new Promise<void>((resolve) => {
        releaseJoin = resolve;
      });
    transport.disconnects.length = 0;
    const connectsBefore = transport.connects.length;
    const probesBefore = harness.trust.probeCalls;

    const disposing = harness.service.dispose();
    await expect(harness.service.connect(created.environmentId)).rejects.toMatchObject({
      code: "environment/cancelled",
    });
    await expect(
      harness.service.create({ label: "Late", target: "dev@late.example" }),
    ).rejects.toMatchObject({ code: "environment/cancelled" });
    await expect(harness.service.probeTrust(created.environmentId)).rejects.toMatchObject({
      code: "environment/cancelled",
    });
    await expect(
      harness.service.update({
        environmentId: created.environmentId,
        expectedRevision: harness.store.getRecord(created.environmentId)!.revision,
        patch: { target: "dev@late.example" },
      }),
    ).rejects.toMatchObject({ code: "environment/cancelled" });
    expect(transport.connects).toHaveLength(connectsBefore);
    expect(harness.trust.probeCalls).toBe(probesBefore);
    expect(harness.store.listRecords()).toHaveLength(1);

    releaseJoin();
    await expect(disposing).resolves.toBeUndefined();
    await harness.store.close();
  });
});

describe("EnvironmentRuntimeService legacy id namespace", () => {
  it("refuses a legacy id that collides with an environment id", async () => {
    const harness = await openHarness();
    const first = await harness.create();
    await expect(harness.create({ legacyConnectionId: first.environmentId })).rejects.toMatchObject(
      { code: "environment/invalid-input" },
    );
    await expect(
      harness.service.adoptLegacy({
        environmentId: first.environmentId,
        expectedRevision: first.revision,
        legacyConnectionId: first.environmentId,
      }),
    ).rejects.toMatchObject({ code: "environment/invalid-input" });
    expect(harness.transport.disconnects).toHaveLength(0);
    await harness.dispose();
  });

  it("a tunnel exit invalidates only the environment that owns the adopted id", async () => {
    const trust = new FakeTrustAuthority();
    trust.systemObservations = [observation("system")];
    trust.observations = trust.systemObservations;
    const harness = await openHarness({ trust });
    const first = await harness.create();
    const adopted = await harness.create({ legacyConnectionId: legacyIdA });
    await harness.service.connect(first.environmentId);
    await harness.service.connect(adopted.environmentId);
    harness.transport.emitTunnelExit(legacyIdA);
    expect(harness.service.getPublic(first.environmentId)!.state).toBe("connected");
    expect(harness.service.getPublic(adopted.environmentId)!.state).toBe("disconnected");
    await harness.dispose();
  });
});
