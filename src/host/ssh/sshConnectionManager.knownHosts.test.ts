import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SshConnectionConfig } from "@/shared/ssh";
import * as sshBootstrap from "@/shared/sshBootstrap";
import * as sshRuntimeInstall from "./sshRuntimeInstall";
import {
  buildScpArgs,
  buildSshBaseArgs,
  SshConnectionManager,
  sshTunnelConfigKey,
} from "./SshConnectionManager";

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

let identityFile = "";

beforeEach(() => {
  const identityDir = mkdtempSync(join(tmpdir(), "poracode-manager-key-"));
  roots.push(identityDir);
  identityFile = join(identityDir, "id_ed25519");
  writeFileSync(identityFile, "private", "utf8");
});

function connection(): SshConnectionConfig {
  return {
    id: "1a2f655a-e274-4213-9a2b-029f29062fd7",
    label: "Build host",
    target: "dev@example.com",
    port: 2222,
    identityFile,
  };
}

const knownHosts = {
  userKnownHostsFile: "/data/environments/env.known_hosts",
  strict: true,
} as const;
const bundle = { archivePath: "/cache/runtime.tar.gz", hash: "a".repeat(64), version: "1.0.0" };

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

function createManager(): SshConnectionManager {
  const cacheDir = mkdtempSync(join(tmpdir(), "poracode-manager-trust-"));
  roots.push(cacheDir);
  return new SshConnectionManager({
    mainBundleDir: cacheDir,
    agentPluginsDir: cacheDir,
    wslHelpersDir: cacheDir,
    cacheDir,
    bundleProvider: async () => bundle,
  });
}

describe("known-hosts policy plumbing", () => {
  it("pins strict checking to the per-environment file for ssh and scp", () => {
    const base = buildSshBaseArgs(connection(), undefined, knownHosts);
    expect(base).toEqual([
      "-T",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "-o",
      "ForwardAgent=no",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      `UserKnownHostsFile=${knownHosts.userKnownHostsFile}`,
      "-o",
      `GlobalKnownHostsFile=${process.platform === "win32" ? "NUL" : "/dev/null"}`,
      "-o",
      "UpdateHostKeys=no",
      "-p",
      "2222",
      "-i",
      identityFile,
    ]);
    const scp = buildScpArgs(
      connection(),
      "/tmp/a.tar.gz",
      ".poracode/a.tar.gz",
      undefined,
      knownHosts,
    );
    expect(scp).toContain("StrictHostKeyChecking=yes");
    expect(scp).toContain(`UserKnownHostsFile=${knownHosts.userKnownHostsFile}`);
    expect(scp).toContain(
      `GlobalKnownHostsFile=${process.platform === "win32" ? "NUL" : "/dev/null"}`,
    );
    expect(scp).toContain("UpdateHostKeys=no");
    // Absent policy keeps the device-local default exactly as before.
    expect(buildSshBaseArgs(connection())).not.toContain("StrictHostKeyChecking=yes");
  });

  it("refuses to ignore a configured host-key fingerprint without a trust policy", async () => {
    const manager = createManager();
    const pinned: SshConnectionConfig = {
      ...connection(),
      hostKeyFingerprint: `SHA256:${"A".repeat(43)}`,
    };
    await expect(manager.connect({ connection: pinned })).rejects.toThrow(
      /known-hosts trust policy/i,
    );
    await manager.dispose();
  });

  it("passes the policy to every ssh script, scp upload, and tunnel command", async () => {
    const manager = createManager();
    vi.spyOn(sshBootstrap, "bootstrapRemoteRuntime").mockResolvedValue({
      remotePort: 49154,
      reusedOwner: false,
      ownerRuntimeHash: bundle.hash,
      ownerAppVersion: bundle.version,
    });
    const child = fakeTunnelChild();
    const scriptRunner = vi.spyOn(
      manager as unknown as {
        scriptRunner(
          connection: SshConnectionConfig,
          signal: AbortSignal,
          policy?: unknown,
        ): unknown;
      },
      "scriptRunner",
    );
    const openTunnel = vi
      .spyOn(
        manager as unknown as {
          openTunnel(
            connection: SshConnectionConfig,
            localPort: number,
            remotePort: number,
            endpoint: string,
            signal?: AbortSignal,
            policy?: unknown,
          ): Promise<never>;
        },
        "openTunnel",
      )
      .mockResolvedValue(child as never);

    await manager.connect({ connection: connection() }, { knownHosts });
    expect(scriptRunner).toHaveBeenCalledWith(expect.anything(), expect.anything(), knownHosts);
    expect(openTunnel).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Number),
      49154,
      expect.any(String),
      expect.anything(),
      knownHosts,
    );
    await manager.dispose();
  });
});

describe("explicit upgrade", () => {
  it("installs the host bundle, drains through the C2 upgrade, then opens a strict tunnel", async () => {
    const manager = createManager();
    const install = vi
      .spyOn(sshRuntimeInstall, "ensureRemoteRuntimeInstalled")
      .mockResolvedValue({ installed: true });
    const upgrade = vi.spyOn(sshBootstrap, "upgradeRemoteRuntime").mockResolvedValue({
      remotePort: 49155,
      reusedOwner: false,
      ownerRuntimeHash: bundle.hash,
      ownerAppVersion: bundle.version,
    });
    const child = fakeTunnelChild();
    const openTunnel = vi
      .spyOn(
        manager as unknown as {
          openTunnel(
            connection: SshConnectionConfig,
            localPort: number,
            remotePort: number,
            endpoint: string,
            signal?: AbortSignal,
            policy?: unknown,
          ): Promise<never>;
        },
        "openTunnel",
      )
      .mockResolvedValue(child as never);

    const result = await manager.upgrade({ connection: connection() }, { knownHosts });
    expect(result.remotePort).toBe(49155);
    expect(install).toHaveBeenCalledWith(expect.anything(), bundle.hash, expect.anything());
    expect(upgrade).toHaveBeenCalledWith(
      expect.anything(),
      connection().id,
      bundle.hash,
      expect.anything(),
    );
    expect(install.mock.invocationCallOrder[0]).toBeLessThan(upgrade.mock.invocationCallOrder[0]!);
    expect(openTunnel).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Number),
      49155,
      expect.any(String),
      expect.anything(),
      knownHosts,
    );
    await manager.dispose();
  });

  it("stops an existing tunnel before replacing the owner", async () => {
    const manager = createManager();
    vi.spyOn(sshRuntimeInstall, "ensureRemoteRuntimeInstalled").mockResolvedValue({
      installed: false,
    });
    vi.spyOn(sshBootstrap, "upgradeRemoteRuntime").mockResolvedValue({
      remotePort: 49155,
      reusedOwner: false,
      ownerRuntimeHash: bundle.hash,
      ownerAppVersion: bundle.version,
    });
    const existing = fakeTunnelChild();
    const replacement = fakeTunnelChild();
    const tunnels = (manager as unknown as { tunnels: Map<string, unknown> }).tunnels;
    tunnels.set(connection().id, {
      configKey: sshTunnelConfigKey(connection()),
      connection: connection(),
      endpoint: "http://127.0.0.1:49152/",
      localPort: 49152,
      remotePort: 49153,
      runtimeHash: bundle.hash,
      child: existing,
    });
    vi.spyOn(
      manager as unknown as {
        openTunnel(...args: unknown[]): Promise<never>;
      },
      "openTunnel",
    ).mockResolvedValue(replacement as never);

    await manager.upgrade({ connection: connection() }, { knownHosts });
    expect(existing.kill).toHaveBeenCalledOnce();
    expect(replacement.kill).not.toHaveBeenCalled();
    await manager.dispose();
  });

  it("does not reuse a tunnel established under a different trust policy", async () => {
    const manager = createManager();
    const bootstrap = vi.spyOn(sshBootstrap, "bootstrapRemoteRuntime").mockResolvedValue({
      remotePort: 49154,
      reusedOwner: false,
      ownerRuntimeHash: bundle.hash,
      ownerAppVersion: bundle.version,
    });
    const first = fakeTunnelChild();
    const second = fakeTunnelChild();
    vi.spyOn(manager as unknown as { openTunnel(...args: unknown[]): Promise<never> }, "openTunnel")
      .mockResolvedValueOnce(first as never)
      .mockResolvedValueOnce(second as never);
    const reTrusted = {
      userKnownHostsFile: `${knownHosts.userKnownHostsFile}.re-trust`,
      strict: true as const,
    };

    await manager.connect({ connection: connection() }, { knownHosts });
    await manager.connect({ connection: connection() }, { knownHosts: reTrusted });

    // Trust identity is part of the dedupe key: the old tunnel is stopped and
    // a fresh owner is dialed under the new policy, never silently reused.
    expect(first.kill).toHaveBeenCalledOnce();
    expect(second.kill).not.toHaveBeenCalled();
    expect(bootstrap).toHaveBeenCalledTimes(2);
    await manager.dispose();
  });

  it("includes the trust identity in the tunnel config key", () => {
    const pinned: SshConnectionConfig = {
      ...connection(),
      hostKeyFingerprint: `SHA256:${"A".repeat(43)}`,
    };
    expect(sshTunnelConfigKey(connection())).not.toBe(sshTunnelConfigKey(connection(), knownHosts));
    expect(sshTunnelConfigKey(pinned, knownHosts)).not.toBe(
      sshTunnelConfigKey(connection(), knownHosts),
    );
    expect(sshTunnelConfigKey(connection(), knownHosts)).toBe(
      sshTunnelConfigKey(connection(), { ...knownHosts }),
    );
  });

  it("notifies tunnel-exit listeners so environment targets can be invalidated", async () => {
    const manager = createManager();
    vi.spyOn(sshBootstrap, "bootstrapRemoteRuntime").mockResolvedValue({
      remotePort: 49154,
      reusedOwner: false,
      ownerRuntimeHash: bundle.hash,
      ownerAppVersion: bundle.version,
    });
    const child = fakeTunnelChild();
    vi.spyOn(
      manager as unknown as {
        openTunnel(...args: unknown[]): Promise<never>;
      },
      "openTunnel",
    ).mockResolvedValue(child as never);
    const exits: string[] = [];
    const detach = manager.onTunnelExit((connectionId) => exits.push(connectionId));

    await manager.connect({ connection: connection() });
    child.exitCode = 1;
    child.emit("exit", 1, null);
    expect(exits).toEqual([connection().id]);
    detach();
    await manager.dispose();
  });
});
