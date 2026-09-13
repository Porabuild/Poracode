import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote";
import {
  sshRuntimeManifestFileName,
  SSH_RUNTIME_MANIFEST_VERSION,
  type SshRuntimeEntryName,
} from "@/shared/sshRuntimeManifest";
import { sshConnectionConfigSchema, type SshConnectionConfig } from "@/shared/ssh";
import * as sshBootstrap from "@/shared/sshBootstrap";
import { waitForRemoteEndpoint } from "@/shared/sshBootstrap";
import {
  buildScpArgs,
  buildSshBaseArgs,
  parseSshConfigHosts,
  SshConnectionManager,
} from "./SshConnectionManager";
import { ensureSshRuntimeBundle } from "./runtimeBundle";
import { RUNTIME_BUILD_SOURCE_HASH } from "@/shared/runtimeBuildIdentity";

vi.mock("@/shared/runtimeBuildIdentity", () => ({ RUNTIME_BUILD_SOURCE_HASH: "d".repeat(64) }));

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function connection() {
  return {
    id: "1a2f655a-e274-4213-9a2b-029f29062fd7",
    label: "Build host",
    target: "dev@example.com",
    port: 2222,
    identityFile: "/keys/id_ed25519",
  } as const;
}

function tunnelConnection(): SshConnectionConfig {
  const value = connection();
  return {
    id: value.id,
    label: value.label,
    target: value.target,
    port: value.port,
  };
}

const runtimeDependencies = ["better-sqlite3", "node-pty", "ws", "yaml"] as const;

function writeRuntimeManifest(
  mainBundleDir: string,
  entry: SshRuntimeEntryName,
  files: readonly string[],
): void {
  writeFileSync(
    join(mainBundleDir, sshRuntimeManifestFileName(entry)),
    `${JSON.stringify({
      version: SSH_RUNTIME_MANIFEST_VERSION,
      entry,
      sourceHash: RUNTIME_BUILD_SOURCE_HASH,
      captureProtocolVersion: 1,
      settingsServiceVersion: 0,
      resources: [],
      files: files.map((path) => {
        const bytes = readFileSync(join(mainBundleDir, path));
        return {
          path,
          format: path.endsWith(".mjs") ? "module" : "commonjs",
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        };
      }),
      dependencies: runtimeDependencies,
    })}\n`,
    "utf8",
  );
}

function createRuntimeFixture(): {
  readonly mainBundleDir: string;
  readonly agentPluginsDir: string;
  readonly wslHelpersDir: string;
  readonly cacheDir: string;
} {
  const root = mkdtempSync(join(tmpdir(), "poracode-ssh-bundle-test-"));
  tempDirs.push(root);
  const mainBundleDir = join(root, "main");
  const agentPluginsDir = join(root, "agent-plugins");
  const wslHelpersDir = join(root, "wsl-helpers");
  const cacheDir = join(root, "cache");
  mkdirSync(mainBundleDir, { recursive: true });
  mkdirSync(agentPluginsDir, { recursive: true });
  mkdirSync(wslHelpersDir, { recursive: true });
  writeFileSync(join(mainBundleDir, "server.cjs"), "server", "utf8");
  writeFileSync(join(mainBundleDir, "supervisor.cjs"), "supervisor", "utf8");
  writeFileSync(join(mainBundleDir, "claudeSdkProbeWorker.mjs"), "worker", "utf8");
  writeFileSync(join(mainBundleDir, "cursorSdkWorker.mjs"), "worker", "utf8");
  writeRuntimeManifest(mainBundleDir, "server", ["server.cjs"]);
  writeRuntimeManifest(mainBundleDir, "supervisor", ["supervisor.cjs"]);
  writeRuntimeManifest(mainBundleDir, "claudeSdkProbeWorker", ["claudeSdkProbeWorker.mjs"]);
  writeRuntimeManifest(mainBundleDir, "cursorSdkWorker", ["cursorSdkWorker.mjs"]);
  writeFileSync(join(agentPluginsDir, "plugin.json"), "{}", "utf8");
  writeFileSync(join(wslHelpersDir, "bridge.mjs"), "", "utf8");
  return { mainBundleDir, agentPluginsDir, wslHelpersDir, cacheDir };
}

function helperDescriptor(appVersion: string) {
  return {
    protocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
    hostMode: "helper",
    desktopId: "remote-test",
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

function descriptorEndpoint(appVersion: string): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(helperDescriptor(appVersion)), {
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
  child.kill = vi.fn<(signal?: NodeJS.Signals | number) => boolean>(() => {
    child.exitCode = 0;
    child.emit("exit", 0, null);
    return true;
  });
  return child;
}

function installTunnel(
  manager: SshConnectionManager,
  remoteConnection: SshConnectionConfig,
  runtimeHash: string,
  child: ReturnType<typeof fakeTunnelChild>,
): void {
  const tunnels = (
    manager as unknown as {
      tunnels: Map<string, unknown>;
    }
  ).tunnels;
  tunnels.set(remoteConnection.id, {
    configKey: JSON.stringify({
      target: remoteConnection.target,
      port: remoteConnection.port ?? null,
      identityFile: remoteConnection.identityFile ?? null,
    }),
    connection: remoteConnection,
    endpoint: "http://127.0.0.1:49152/",
    localPort: 49152,
    remotePort: 49153,
    runtimeHash,
    child,
  });
}

describe("SSH command construction", () => {
  it("passes user input as OpenSSH arguments with non-interactive safety options", () => {
    expect(buildSshBaseArgs(connection(), "isolated.conf")).toEqual([
      "-T",
      "-F",
      "isolated.conf",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "-o",
      "ForwardAgent=no",
      "-p",
      "2222",
      "-i",
      "/keys/id_ed25519",
    ]);
    expect(buildScpArgs(connection(), "/tmp/runtime.tar.gz", ".poracode/upload.tar.gz")).toEqual([
      "-q",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "-o",
      "ForwardAgent=no",
      "-P",
      "2222",
      "-i",
      "/keys/id_ed25519",
      "/tmp/runtime.tar.gz",
      "dev@example.com:.poracode/upload.tar.gz",
    ]);
  });

  it("discovers concrete SSH aliases and ignores wildcard host blocks", () => {
    expect(
      parseSshConfigHosts(`
Host *.internal
  User dev
Host build staging # environments
Host -invalid ?
Host build
`),
    ).toEqual([{ alias: "build" }, { alias: "staging" }]);
  });

  it("rejects targets that could be interpreted as options or shell syntax", () => {
    for (const target of ["-oProxyCommand=bad", "host;touch /tmp/x", "a@b@c", "host:22"]) {
      expect(() => sshConnectionConfigSchema.parse({ ...connection(), target })).toThrow(
        /Enter an SSH host/,
      );
    }
  });
});

describe("SSH runtime bundle", () => {
  it("includes every manifest-declared chunk and runtime dependency", () => {
    const options = createRuntimeFixture();
    const { mainBundleDir, cacheDir } = options;
    writeFileSync(
      join(mainBundleDir, "supervisor.cjs"),
      `const example = "require('./not-a-runtime-file.cjs')";`,
      "utf8",
    );
    writeFileSync(
      join(mainBundleDir, "runtime-generated.cjs"),
      "require('./transcriptReader-generated.cjs');",
      "utf8",
    );
    writeFileSync(join(mainBundleDir, "transcriptReader-generated.cjs"), "reader", "utf8");
    writeFileSync(join(mainBundleDir, "main.cjs"), "unrelated desktop entry", "utf8");
    writeRuntimeManifest(mainBundleDir, "supervisor", [
      "supervisor.cjs",
      "runtime-generated.cjs",
      "transcriptReader-generated.cjs",
    ]);

    const bundle = ensureSshRuntimeBundle(options);
    // Name the archive relative to its dir (cwd) so GNU tar on Windows doesn't
    // read the `C:\…` path as an rsh `host:file` spec — matching how
    // ensureSshRuntimeBundle writes it.
    const tar = process.platform === "win32" ? "tar.exe" : "tar";
    const archiveDir = cacheDir;
    const archiveName = basename(bundle.archivePath);
    const entries = execFileSync(tar, ["-tzf", archiveName], { cwd: archiveDir }).toString("utf8");
    expect(entries).toContain("runtime-generated.cjs");
    expect(entries).toContain("transcriptReader-generated.cjs");
    expect(entries).toContain("cursorSdkWorker.mjs");
    expect(entries).toContain("supervisor.ssh-runtime-manifest.json");
    expect(entries).not.toContain("main.cjs");
    const packageEntry = execFileSync(tar, ["-xOf", archiveName, "./package.json"], {
      cwd: archiveDir,
    }).toString("utf8");
    const packageJson = JSON.parse(packageEntry) as { dependencies: Record<string, string> };
    expect(packageJson.dependencies).toMatchObject({
      "better-sqlite3": expect.any(String),
      "node-pty": expect.any(String),
      ws: expect.any(String),
      yaml: expect.any(String),
    });
    expect(readFileSync(bundle.archivePath).byteLength).toBeGreaterThan(0);
  });

  it("rejects an Electron-bound standalone helper bundle", () => {
    const options = createRuntimeFixture();
    const { mainBundleDir } = options;
    writeFileSync(join(mainBundleDir, "server.cjs"), 'require("electron");', "utf8");

    expect(() => ensureSshRuntimeBundle(options)).toThrow(
      "Poracode Helper cannot include Electron",
    );
  });

  it.each([2, 3])(
    "refuses a predecessor manifest v%i before a warm archive cache can hide it",
    (version) => {
      const options = createRuntimeFixture();
      ensureSshRuntimeBundle(options);
      const path = join(options.mainBundleDir, sshRuntimeManifestFileName("supervisor"));
      const manifest = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      writeFileSync(path, JSON.stringify({ ...manifest, version }));
      expect(() => ensureSshRuntimeBundle(options)).toThrow(/manifest/i);
    },
  );

  it("refuses a mixed source declaration before either archive cache lookup", () => {
    const options = createRuntimeFixture();
    ensureSshRuntimeBundle(options);
    const path = join(options.mainBundleDir, sshRuntimeManifestFileName("supervisor"));
    const manifest = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    writeFileSync(path, JSON.stringify({ ...manifest, sourceHash: "e".repeat(64) }));
    expect(() => ensureSshRuntimeBundle(options)).toThrow(/manifest/i);
  });

  it("rebuilds a same-path archive when declared bytes change with unchanged size and mtime", () => {
    const options = createRuntimeFixture();
    const path = join(options.mainBundleDir, "supervisor.cjs");
    const manifestPath = join(options.mainBundleDir, sshRuntimeManifestFileName("supervisor"));
    const original = statSync(path);
    const originalManifest = statSync(manifestPath);
    const first = ensureSshRuntimeBundle(options);
    writeFileSync(path, "SUPERvisor");
    writeRuntimeManifest(options.mainBundleDir, "supervisor", ["supervisor.cjs"]);
    utimesSync(path, original.atime, original.mtime);
    utimesSync(manifestPath, originalManifest.atime, originalManifest.mtime);
    expect(statSync(path).size).toBe(original.size);
    expect(statSync(manifestPath).size).toBe(originalManifest.size);
    const second = ensureSshRuntimeBundle(options);
    expect(second.hash).not.toBe(first.hash);
    const code = execFileSync(
      process.platform === "win32" ? "tar.exe" : "tar",
      ["-xOf", basename(second.archivePath), "./supervisor.cjs"],
      { cwd: options.cacheDir, encoding: "utf8" },
    );
    expect(code).toBe("SUPERvisor");
  });

  it("does not reuse an actual predecessor archive through a legacy disk cache marker", () => {
    const options = createRuntimeFixture();
    const current = ensureSshRuntimeBundle(options);
    const markerPath = join(options.cacheDir, "bundle-manifest.json");
    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as { signature: string };
    const oldStage = join(options.cacheDir, "predecessor");
    mkdirSync(oldStage);
    writeFileSync(join(oldStage, "supervisor.cjs"), "predecessor runtime");
    writeFileSync(
      join(oldStage, "supervisor.ssh-runtime-manifest.json"),
      JSON.stringify({ version: 2, files: ["supervisor.cjs"], dependencies: [] }),
    );
    const oldHash = "b".repeat(64);
    const tar = process.platform === "win32" ? "tar.exe" : "tar";
    execFileSync(tar, ["-czf", `${oldHash}.tar.gz`, "-C", oldStage, "."], {
      cwd: options.cacheDir,
    });
    writeFileSync(
      markerPath,
      JSON.stringify({
        key: JSON.stringify([
          options.mainBundleDir,
          options.agentPluginsDir,
          options.wslHelpersDir,
          null,
          null,
          options.cacheDir,
          null,
        ]),
        signature: marker.signature,
        hash: oldHash,
      }),
    );
    // Evict only the in-memory entry by building another owned fixture. The
    // original call must now decide whether the persisted predecessor is valid.
    ensureSshRuntimeBundle(createRuntimeFixture());
    const rebuilt = ensureSshRuntimeBundle(options);
    expect(rebuilt.hash).toBe(current.hash);
    expect(rebuilt.hash).not.toBe(oldHash);
    const packaged = JSON.parse(
      execFileSync(
        tar,
        ["-xOf", basename(rebuilt.archivePath), "./supervisor.ssh-runtime-manifest.json"],
        { cwd: options.cacheDir, encoding: "utf8" },
      ),
    ) as { version: number; sourceHash: string };
    expect(packaged).toMatchObject({
      version: SSH_RUNTIME_MANIFEST_VERSION,
      sourceHash: RUNTIME_BUILD_SOURCE_HASH,
    });
  });

  it("refuses a dependency inherited from Object.prototype", () => {
    const options = createRuntimeFixture();
    const path = join(options.mainBundleDir, sshRuntimeManifestFileName("supervisor"));
    const manifest = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    writeFileSync(path, JSON.stringify({ ...manifest, dependencies: ["constructor"] }));
    expect(() => ensureSshRuntimeBundle(options)).toThrow(/dependency/);
  });
});

describe("SSH tunnel lifecycle", () => {
  it("reuses a healthy tunnel running the current runtime", async () => {
    const options = createRuntimeFixture();
    const bundle = ensureSshRuntimeBundle(options);
    const manager = new SshConnectionManager({
      ...options,
      fetchImpl: descriptorEndpoint(bundle.version),
    });
    const child = fakeTunnelChild();
    const remoteConnection = tunnelConnection();
    installTunnel(manager, remoteConnection, bundle.hash, child);

    await expect(manager.connect({ connection: remoteConnection })).resolves.toEqual({
      connectionId: remoteConnection.id,
      endpoint: "http://127.0.0.1:49152/",
      remotePort: 49153,
    });
    expect(child.kill).not.toHaveBeenCalled();

    await manager.dispose();
  });

  it("disconnects an unreachable stale tunnel and performs a full rebootstrap", async () => {
    const options = createRuntimeFixture();
    const bundle = ensureSshRuntimeBundle(options);
    const manager = new SshConnectionManager({
      ...options,
      fetchImpl: (async () => {
        throw new Error("helper offline");
      }) as typeof fetch,
    });
    const staleChild = fakeTunnelChild();
    const replacementChild = fakeTunnelChild();
    const remoteConnection = tunnelConnection();
    installTunnel(manager, remoteConnection, bundle.hash, staleChild);
    const bootstrap = vi.spyOn(sshBootstrap, "bootstrapRemoteRuntime").mockResolvedValue(49154);
    const openTunnel = vi
      .spyOn(
        manager as unknown as {
          openTunnel(
            connection: SshConnectionConfig,
            localPort: number,
            remotePort: number,
            endpoint: string,
          ): Promise<never>;
        },
        "openTunnel",
      )
      .mockResolvedValue(replacementChild as never);

    const result = await manager.connect({ connection: remoteConnection });

    expect(staleChild.kill).toHaveBeenCalledOnce();
    expect(bootstrap).toHaveBeenCalledOnce();
    expect(openTunnel).toHaveBeenCalledOnce();
    expect(result.remotePort).toBe(49154);

    await manager.dispose();
  });

  it.each(["0.1.0", "f00ba47c0ffee"])(
    "upgrades a reachable helper advertising stale version %s",
    async (remoteVersion) => {
      const options = createRuntimeFixture();
      const bundle = ensureSshRuntimeBundle(options);
      const manager = new SshConnectionManager({
        ...options,
        fetchImpl: descriptorEndpoint(remoteVersion),
      });
      const oldChild = fakeTunnelChild();
      const replacementChild = fakeTunnelChild();
      const remoteConnection = tunnelConnection();
      installTunnel(manager, remoteConnection, bundle.hash, oldChild);
      const bootstrap = vi.spyOn(sshBootstrap, "bootstrapRemoteRuntime").mockResolvedValue(49154);
      vi.spyOn(
        manager as unknown as {
          openTunnel(
            connection: SshConnectionConfig,
            localPort: number,
            remotePort: number,
            endpoint: string,
          ): Promise<never>;
        },
        "openTunnel",
      ).mockResolvedValue(replacementChild as never);

      await manager.connect({ connection: remoteConnection });

      expect(oldChild.kill).toHaveBeenCalledOnce();
      expect(bootstrap).toHaveBeenCalledOnce();

      await manager.dispose();
    },
  );
});

describe("SSH helper readiness", () => {
  function descriptor(hostMode: "desktop" | "helper") {
    return {
      protocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
      hostMode,
      desktopId: "remote-test",
      label: "Remote test",
      appVersion: "test",
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

  function endpoint(hostMode: "desktop" | "helper"): typeof fetch {
    return (async () =>
      new Response(JSON.stringify(descriptor(hostMode)), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
  }

  it("accepts the shared server in helper mode", async () => {
    await expect(
      waitForRemoteEndpoint(endpoint("helper"), "http://127.0.0.1:49152/"),
    ).resolves.toMatchObject({ hostMode: "helper", appVersion: "test" });
  });

  it("does not mistake a desktop-hosted server for the SSH helper", async () => {
    await expect(
      waitForRemoteEndpoint(endpoint("desktop"), "http://127.0.0.1:49152/", 1),
    ).rejects.toThrow("Timed out waiting for Poracode Helper");
  });
});
