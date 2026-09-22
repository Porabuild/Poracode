import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SshConnectionConfig } from "@/shared/ssh";
import * as sshBootstrap from "@/shared/sshBootstrap";
import { SshConnectionManager, type SshConnectionManagerOptions } from "./SshConnectionManager";
import { isSshOperationAbortError } from "./sshEnvironmentController";
import type { SshRuntimeBundle } from "./runtimeBundleShared";

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function connection(overrides: Partial<SshConnectionConfig> = {}): SshConnectionConfig {
  return {
    id: "1a2f655a-e274-4213-9a2b-029f29062fd7",
    label: "Build host",
    target: "dev@example.com",
    port: 2222,
    ...overrides,
  };
}

function fakeTunnelChild() {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    kill: ReturnType<typeof vi.fn>;
  };
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn<(signal?: NodeJS.Signals | number) => boolean>(() => {
    child.exitCode = 0;
    child.emit("exit", 0, null);
    return true;
  });
  return child;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface ManagerFixture {
  readonly manager: SshConnectionManager;
  readonly bundleSignals: AbortSignal[];
  completeBundle(hash?: string): void;
}

/**
 * A manager whose runtime-bundle provider is fully controllable. The provider
 * observes the operation signal like the real async builder does, so abort
 * paths join instead of leaking.
 */
function createManager(overrides: Partial<SshConnectionManagerOptions> = {}): ManagerFixture {
  const root = mkdtempSync(join(tmpdir(), "poracode-ssh-lifecycle-"));
  tempDirs.push(root);
  const bundleSignals: AbortSignal[] = [];
  let resolveBundle: (bundle: SshRuntimeBundle) => void = () => undefined;
  const options: SshConnectionManagerOptions = {
    mainBundleDir: join(root, "main"),
    agentPluginsDir: join(root, "agent-plugins"),
    wslHelpersDir: join(root, "wsl-helpers"),
    cacheDir: join(root, "cache"),
    bundleProvider: (signal) => {
      bundleSignals.push(signal);
      return new Promise<SshRuntimeBundle>((resolve, reject) => {
        const onAbort = () =>
          reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
        resolveBundle = resolve;
      });
    },
    ...overrides,
  };
  const manager = new SshConnectionManager(options);
  return {
    manager,
    bundleSignals,
    completeBundle: (hash = "a".repeat(64)) => {
      resolveBundle({ archivePath: join(root, "runtime.tar.gz"), hash, version: "1.0.0" });
    },
  };
}

/** Real subprocess startup may exceed vi.waitFor's 1s default under full-suite load.
 * Cancellation still has to join the owned child before the ESRCH assertion. */
async function withRunningChild(
  fixture: ManagerFixture,
  pidFile: string,
  verify: (connecting: Promise<unknown>, pid: number) => Promise<void>,
) {
  const connecting = fixture.manager.connect({ connection: connection() });
  void connecting.catch(() => undefined);
  try {
    await vi.waitFor(() => expect(fixture.bundleSignals).toHaveLength(1));
    fixture.completeBundle();
    const pid = await vi.waitFor(
      () => {
        const value = Number.parseInt(readFileSync(pidFile, "utf8").trim(), 10);
        expect(Number.isInteger(value) && value > 0).toBe(true);
        return value;
      },
      { timeout: 5_000 },
    );
    await verify(connecting, pid);
  } finally {
    // Failed readiness/assertions must also join children before temp-dir cleanup.
    await fixture.manager.dispose();
  }
}

function readyBootstrap() {
  return vi.spyOn(sshBootstrap, "bootstrapRemoteRuntime").mockResolvedValue({
    remotePort: 49153,
    reusedOwner: false,
    ownerRuntimeHash: "a".repeat(64),
    ownerAppVersion: "1.0.0",
  });
}

describe("SSH connection manager lifecycle", () => {
  it("disconnect cancels and joins an in-flight connect before it resolves", async () => {
    const fixture = createManager();
    const bootstrap = readyBootstrap();
    const connecting = fixture.manager.connect({ connection: connection() });
    void connecting.catch(() => undefined);
    await vi.waitFor(() => expect(fixture.bundleSignals).toHaveLength(1));

    await fixture.manager.disconnect(connection().id);

    expect(fixture.bundleSignals[0]!.aborted).toBe(true);
    await expect(connecting).rejects.toSatisfy(isSshOperationAbortError);
    expect(bootstrap).not.toHaveBeenCalled();
    await fixture.manager.dispose();
  });

  it("dispose joins a connect that resolves its tunnel after cancellation", async () => {
    const fixture = createManager();
    readyBootstrap();
    const tunnelChild = fakeTunnelChild();
    const openTunnel = deferred<never>();
    const openTunnelCalls: unknown[] = [];
    vi.spyOn(
      fixture.manager as unknown as {
        openTunnel(...args: unknown[]): Promise<never>;
      },
      "openTunnel",
    ).mockImplementation((...args: unknown[]) => {
      openTunnelCalls.push(args);
      return openTunnel.promise;
    });

    const connecting = fixture.manager.connect({ connection: connection() });
    void connecting.catch(() => undefined);
    await vi.waitFor(() => expect(fixture.bundleSignals).toHaveLength(1));
    fixture.completeBundle();
    await vi.waitFor(() => expect(openTunnelCalls).toHaveLength(1));

    const disposing = fixture.manager.dispose();
    // The tunnel settles after dispose began: it must be joined, not registered.
    openTunnel.resolve(tunnelChild as never);
    await disposing;

    expect(tunnelChild.kill).toHaveBeenCalledOnce();
    expect((fixture.manager as unknown as { tunnels: Map<string, unknown> }).tunnels.size).toBe(0);
    await expect(connecting).rejects.toSatisfy(isSshOperationAbortError);
  });

  it("never returns the previous configuration's result after a config change", async () => {
    const fixture = createManager();
    readyBootstrap();
    const tunnelChild = fakeTunnelChild();
    vi.spyOn(
      fixture.manager as unknown as {
        openTunnel(...args: unknown[]): Promise<never>;
      },
      "openTunnel",
    ).mockResolvedValue(tunnelChild as never);

    const first = fixture.manager.connect({ connection: connection({ port: 2222 }) });
    void first.catch(() => undefined);
    await vi.waitFor(() => expect(fixture.bundleSignals).toHaveLength(1));

    const second = fixture.manager.connect({ connection: connection({ port: 2200 }) });
    // The first operation is cancelled; the changed config gets a fresh result.
    await expect(first).rejects.toSatisfy(isSshOperationAbortError);
    expect(fixture.bundleSignals[0]!.aborted).toBe(true);
    await vi.waitFor(() => expect(fixture.bundleSignals).toHaveLength(2));
    fixture.completeBundle();

    await expect(second).resolves.toMatchObject({ connectionId: connection().id });
    const entry = (
      fixture.manager as unknown as { tunnels: Map<string, { configKey: string }> }
    ).tunnels.get(connection().id);
    expect(entry?.configKey).toContain("2200");
    await fixture.manager.dispose();
  });

  it("does not cancel an operation another waiter still owns", async () => {
    const fixture = createManager();
    readyBootstrap();
    const tunnelChild = fakeTunnelChild();
    vi.spyOn(
      fixture.manager as unknown as {
        openTunnel(...args: unknown[]): Promise<never>;
      },
      "openTunnel",
    ).mockResolvedValue(tunnelChild as never);

    const controller = new AbortController();
    const aborted = fixture.manager.connect(
      { connection: connection() },
      { signal: controller.signal },
    );
    void aborted.catch(() => undefined);
    const kept = fixture.manager.connect({ connection: connection() });
    await vi.waitFor(() => expect(fixture.bundleSignals).toHaveLength(1));

    controller.abort();
    await expect(aborted).rejects.toSatisfy(isSshOperationAbortError);
    // The remaining waiter owns the operation: its work must continue.
    expect(fixture.bundleSignals[0]!.aborted).toBe(false);

    fixture.completeBundle();
    await expect(kept).resolves.toMatchObject({ connectionId: connection().id });
    expect(tunnelChild.kill).not.toHaveBeenCalled();
    await fixture.manager.dispose();
  });

  it("cancels the operation when the last waiter aborts", async () => {
    const fixture = createManager();
    readyBootstrap();
    const controller = new AbortController();
    const connecting = fixture.manager.connect(
      { connection: connection() },
      { signal: controller.signal },
    );
    void connecting.catch(() => undefined);
    await vi.waitFor(() => expect(fixture.bundleSignals).toHaveLength(1));

    controller.abort();
    await expect(connecting).rejects.toSatisfy(isSshOperationAbortError);
    expect(fixture.bundleSignals[0]!.aborted).toBe(true);
    await fixture.manager.dispose();
  });

  it.skipIf(process.platform === "win32")(
    "abort during an archive upload kills and joins the owned scp subprocess",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "poracode-ssh-scp-"));
      tempDirs.push(root);
      const pidFile = join(root, "scp.pid");
      const fakeScp = join(root, "fake-scp.sh");
      writeFileSync(fakeScp, `#!/bin/sh\necho $$ > "${pidFile}"\nsleep 30\n`, "utf8");
      chmodSync(fakeScp, 0o755);
      const fixture = createManager({ scpCommand: fakeScp });
      vi.spyOn(sshBootstrap, "bootstrapRemoteRuntime").mockImplementation(async (transport) => {
        await transport.deliverArchive(".poracode/ssh/uploads/runtime.tar.gz");
        return {
          remotePort: 49153,
          reusedOwner: false,
          ownerRuntimeHash: "a".repeat(64),
          ownerAppVersion: "1.0.0",
        };
      });

      await withRunningChild(fixture, pidFile, async (connecting, pid) => {
        await fixture.manager.dispose();
        await expect(connecting).rejects.toSatisfy(isSshOperationAbortError);
        expect(() => process.kill(pid, 0)).toThrow(/ESRCH/);
      });
    },
  );

  it.skipIf(process.platform === "win32")(
    "abort while the tunnel is coming up kills and joins the owned ssh subprocess",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "poracode-ssh-tunnel-"));
      tempDirs.push(root);
      const pidFile = join(root, "tunnel.pid");
      const fakeSsh = join(root, "fake-tunnel-ssh.sh");
      writeFileSync(fakeSsh, `#!/bin/sh\necho $$ > "${pidFile}"\nsleep 30\n`, "utf8");
      chmodSync(fakeSsh, 0o755);
      const fixture = createManager({ sshCommand: fakeSsh });
      readyBootstrap();

      await withRunningChild(fixture, pidFile, async (connecting, pid) => {
        await fixture.manager.dispose();
        await expect(connecting).rejects.toSatisfy(isSshOperationAbortError);
        expect(() => process.kill(pid, 0)).toThrow(/ESRCH/);
      });
    },
  );

  it("rejects new connects after dispose and repeats dispose safely", async () => {
    const fixture = createManager();
    await fixture.manager.dispose();
    await expect(fixture.manager.connect({ connection: connection() })).rejects.toSatisfy(
      isSshOperationAbortError,
    );
    await expect(fixture.manager.dispose()).resolves.toBeUndefined();
  });

  it.skipIf(process.platform === "win32")(
    "abort during a remote script kills and joins the owned subprocess",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "poracode-ssh-child-"));
      tempDirs.push(root);
      const pidFile = join(root, "ssh.pid");
      const fakeSsh = join(root, "fake-ssh.sh");
      writeFileSync(fakeSsh, `#!/bin/sh\necho $$ > "${pidFile}"\nsleep 30\n`, "utf8");
      chmodSync(fakeSsh, 0o755);
      const fixture = createManager({ sshCommand: fakeSsh });
      vi.spyOn(sshBootstrap, "bootstrapRemoteRuntime").mockImplementation(async (transport) => {
        await transport.runScript("probe", [], 60_000);
        return {
          remotePort: 49153,
          reusedOwner: false,
          ownerRuntimeHash: "a".repeat(64),
          ownerAppVersion: "1.0.0",
        };
      });

      await withRunningChild(fixture, pidFile, async (connecting, pid) => {
        await fixture.manager.dispose();
        await expect(connecting).rejects.toSatisfy(isSshOperationAbortError);
        expect(() => process.kill(pid, 0)).toThrow(/ESRCH/);
      });
    },
  );
});
