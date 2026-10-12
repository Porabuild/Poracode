import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EnvironmentPublicProjection } from "@/shared/environments";
import * as sshBootstrap from "@/shared/sshBootstrap";
import { SshConnectionManager } from "@/host/ssh/SshConnectionManager";
import { EnvironmentStore, type EnvironmentStoreLease } from "./EnvironmentStore";
import { environmentsFilePath } from "./environmentStoreFile";
import type { EnvironmentTrustAuthority } from "./environmentTrustAuthority";
import { EnvironmentRuntimeService } from "./environmentRuntimeService";
import {
  sshKeyFingerprint,
  type SshHostKeyObservation,
  type SshHostKeyProbe,
  type SshResolvedTarget,
} from "@/host/ssh/sshHostKeyTrust";

/**
 * Service lifecycle against the real SshConnectionManager. The remote side is
 * mocked at the bootstrap/openTunnel boundary exactly as the manager's own
 * suite does, so manager cancellation, tunnel custody, and registration are
 * real while no ssh process runs.
 */

const runtimeHash = "a".repeat(64);
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

function observation(): SshHostKeyObservation {
  const blob = Buffer.from("ssh-ed25519 manager fixture").toString("base64");
  return {
    keyType: "ssh-ed25519",
    keyBlob: blob,
    fingerprint: sshKeyFingerprint(blob)!,
    hostField: "host.example",
  };
}

class SystemTrustAuthority implements EnvironmentTrustAuthority {
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

  async writeKnownHostsFile(): Promise<void> {
    // The service only needs the strict policy path; material is not exercised here.
  }
}

function descriptor(appVersion: string, desktopId: string) {
  return {
    protocolVersion: 12,
    hostMode: "helper",
    desktopId,
    label: "Remote test",
    appVersion,
    platform: "linux",
    auth: {
      policy: "remote-reachable",
      bootstrapMethods: ["one-time-token"],
      sessionMethods: ["bearer-access-token"],
      scopes: ["session:read"],
    },
    endpoints: {
      httpBaseUrl: "http://127.0.0.1:49152/",
      wsBaseUrl: "ws://127.0.0.1:49152/",
    },
  };
}

function descriptorFetch(desktopId: string): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(descriptor("1.0.0", desktopId)), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

function fakeTunnelChild() {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    kill: ReturnType<typeof vi.fn>;
  };
  child.exitCode = null;
  child.kill = vi.fn<() => boolean>(() => {
    child.exitCode = 0;
    child.emit("exit", 0, null);
    return true;
  });
  return child;
}

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function openManagerHarness(options: { readonly desktopId?: () => string } = {}): Promise<{
  readonly root: string;
  readonly manager: SshConnectionManager;
  readonly service: EnvironmentRuntimeService;
  readonly store: EnvironmentStore;
  readonly tunnel: ReturnType<typeof fakeTunnelChild>;
  readonly bootstrap: ReturnType<typeof vi.spyOn>;
  dispose(): Promise<void>;
}> {
  const root = mkdtempSync(join(tmpdir(), "poracode-env-manager-test-"));
  roots.push(root);
  const manager = new SshConnectionManager({
    mainBundleDir: root,
    agentPluginsDir: root,
    wslHelpersDir: root,
    cacheDir: root,
    bundleProvider: async () => ({
      archivePath: join(root, "runtime.tar.gz"),
      hash: runtimeHash,
      version: "1.0.0",
    }),
    fetchImpl: descriptorFetch(childDesktopId),
  });
  const bootstrap = vi.spyOn(sshBootstrap, "bootstrapRemoteRuntime").mockResolvedValue({
    remotePort: 49153,
    reusedOwner: false,
    ownerRuntimeHash: runtimeHash,
    ownerAppVersion: "1.0.0",
  });
  const tunnel = fakeTunnelChild();
  vi.spyOn(
    manager as unknown as { openTunnel(...args: unknown[]): Promise<never> },
    "openTunnel",
  ).mockResolvedValue(tunnel as never);
  const store = await EnvironmentStore.open({ lease: new TestLease(root) });
  const service = new EnvironmentRuntimeService({
    store,
    ssh: manager,
    trust: new SystemTrustAuthority(),
    runtimeProvider: async () => ({ hash: runtimeHash }),
    descriptorReader: async () =>
      descriptor("1.0.0", options.desktopId ? options.desktopId() : childDesktopId) as never,
  });
  return {
    root,
    manager,
    service,
    store,
    tunnel,
    bootstrap,
    dispose: async () => {
      await service.dispose();
      await manager.dispose();
      await store.close();
    },
  };
}

async function createConnected(
  harness: Awaited<ReturnType<typeof openManagerHarness>>,
): Promise<EnvironmentPublicProjection> {
  const created = await harness.service.create({
    label: "Lab",
    target: "dev@host.example",
  });
  return harness.service.connect(created.environmentId);
}

describe("EnvironmentRuntimeService over the real SshConnectionManager", () => {
  it("connects, verifies the target, and disconnects by joining the real tunnel", async () => {
    const harness = await openManagerHarness();
    const connected = await createConnected(harness);
    expect(connected.state).toBe("connected");
    const target = harness.service.getVerifiedTarget(connected.environmentId);
    expect(target.endpoint).toContain("127.0.0.1");
    expect(target.childDesktopId).toBe(childDesktopId);

    await harness.service.disconnect(connected.environmentId);
    expect(harness.tunnel.kill).toHaveBeenCalledOnce();
    expect(harness.service.getPublic(connected.environmentId)!.state).toBe("disconnected");
    await harness.dispose();
  });

  it("cancels an in-flight connect on update and reconnects with the new target", async () => {
    const harness = await openManagerHarness();
    const created = await harness.service.create({
      label: "Lab",
      target: "dev@host.example",
    });
    const firstCall = vi.spyOn(sshBootstrap, "bootstrapRemoteRuntime");
    let releaseFirst: () => void = () => undefined;
    const firstStarted = new Promise<void>((resolve) => {
      firstCall.mockImplementationOnce(() => {
        resolve();
        return new Promise((res) => {
          releaseFirst = () =>
            res({
              remotePort: 49153,
              reusedOwner: false,
              ownerRuntimeHash: runtimeHash,
              ownerAppVersion: "1.0.0",
            });
        });
      });
    });
    const connectError = harness.service.connect(created.environmentId).then(
      () => undefined,
      (error: unknown) => error,
    );
    await firstStarted;
    const updatePromise = harness.service.update({
      environmentId: created.environmentId,
      expectedRevision: harness.store.getRecord(created.environmentId)!.revision,
      patch: { target: "dev@other.example" },
    });
    releaseFirst();
    const updated = await updatePromise;
    expect(updated.target).toBe("dev@other.example");
    await expect(connectError).resolves.toMatchObject({ code: "environment/cancelled" });
    await harness.service.awaitIdle();
    expect(harness.service.getPublic(created.environmentId)!.state).toBe("connected");
    expect(firstCall).toHaveBeenCalledTimes(2);
    await harness.dispose();
  });

  it("closes the real tunnel and fails closed when the child identity changes", async () => {
    let desktopId = childDesktopId;
    const harness = await openManagerHarness({ desktopId: () => desktopId });
    const connected = await createConnected(harness);
    await harness.service.disconnect(connected.environmentId);
    desktopId = otherDesktopId;
    const tunnel = harness.tunnel;
    const error = await harness.service.connect(connected.environmentId).catch((cause) => cause);
    expect(error).toMatchObject({ code: "environment/identity-changed" });
    expect(tunnel.kill).toHaveBeenCalledOnce();
    expect(harness.store.getRecord(connected.environmentId)!.childIdentity).toEqual({
      desktopId: childDesktopId,
    });
    await harness.dispose();
  });

  it("mints a pairing credential through the verified tunnel and never persists it", async () => {
    const harness = await openManagerHarness();
    vi.spyOn(sshBootstrap, "issueRemotePairingCredential").mockResolvedValue("real-one-time");
    const connected = await createConnected(harness);
    const pairing = await harness.service.pairing(connected.environmentId);
    expect(pairing.pairingCredential).toBe("real-one-time");
    expect(pairing.endpoint).toBe(`/api/environments/${connected.environmentId}/proxy/`);
    const storeText = readFileSync(environmentsFilePath(harness.root), "utf8");
    expect(storeText).not.toContain("real-one-time");
    await harness.dispose();
  });

  it("refuses upgrade through the controller surface when the manager lacks the verb", async () => {
    const harness = await openManagerHarness();
    const connected = await createConnected(harness);
    const managerWithoutUpgrade = {
      connect: harness.manager.connect.bind(harness.manager),
      disconnect: harness.manager.disconnect.bind(harness.manager),
      onTunnelExit: harness.manager.onTunnelExit.bind(harness.manager),
    };
    const store = harness.store;
    const service = new EnvironmentRuntimeService({
      store,
      ssh: managerWithoutUpgrade,
      trust: new SystemTrustAuthority(),
      runtimeProvider: async () => ({ hash: runtimeHash }),
      descriptorReader: async () => descriptor("1.0.0", childDesktopId) as never,
    });
    await expect(service.upgrade({ environmentId: connected.environmentId })).rejects.toMatchObject(
      { code: "environment/upgrade-unavailable" },
    );
    await service.dispose();
    await harness.dispose();
  });
});
