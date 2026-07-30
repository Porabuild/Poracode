import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sshConnectionConfigSchema } from "@/shared/ssh";
import { waitForRemoteEndpoint } from "@/shared/sshBootstrap";
import { buildScpArgs, buildSshBaseArgs, parseSshConfigHosts } from "./SshConnectionManager";
import { ensureSshRuntimeBundle } from "./runtimeBundle";

const tempDirs: string[] = [];

afterEach(() => {
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
  it("includes generated supervisor chunks and every external runtime dependency", () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-ssh-bundle-test-"));
    tempDirs.push(root);
    const mainBundleDir = join(root, "main");
    const agentPluginsDir = join(root, "agent-plugins");
    const wslHelpersDir = join(root, "wsl-helpers");
    const cacheDir = join(root, "cache");
    mkdirSync(mainBundleDir, { recursive: true });
    mkdirSync(agentPluginsDir, { recursive: true });
    mkdirSync(wslHelpersDir, { recursive: true });
    for (const file of [
      "server.cjs",
      "supervisor.cjs",
      "claudeSdkProbeWorker.mjs",
      "transcriptReader-generated.cjs",
    ]) {
      writeFileSync(join(mainBundleDir, file), file, "utf8");
    }
    writeFileSync(join(agentPluginsDir, "plugin.json"), "{}", "utf8");
    writeFileSync(join(wslHelpersDir, "bridge.mjs"), "", "utf8");

    const bundle = ensureSshRuntimeBundle({
      mainBundleDir,
      agentPluginsDir,
      wslHelpersDir,
      cacheDir,
    });
    // Name the archive relative to its dir (cwd) so GNU tar on Windows doesn't
    // read the `C:\…` path as an rsh `host:file` spec — matching how
    // ensureSshRuntimeBundle writes it.
    const tar = process.platform === "win32" ? "tar.exe" : "tar";
    const archiveDir = cacheDir;
    const archiveName = basename(bundle.archivePath);
    const entries = execFileSync(tar, ["-tzf", archiveName], { cwd: archiveDir }).toString("utf8");
    expect(entries).toContain("transcriptReader-generated.cjs");
    const packageEntry = execFileSync(tar, ["-xOf", archiveName, "./package.json"], {
      cwd: archiveDir,
    }).toString("utf8");
    const packageJson = JSON.parse(packageEntry) as { dependencies: Record<string, string> };
    expect(packageJson.dependencies).toMatchObject({
      "better-sqlite3": expect.any(String),
      "node-pty": expect.any(String),
      ws: expect.any(String),
    });
    expect(readFileSync(bundle.archivePath).byteLength).toBeGreaterThan(0);
  });

  it("rejects an Electron-bound standalone helper bundle", () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-ssh-electron-bundle-test-"));
    tempDirs.push(root);
    const mainBundleDir = join(root, "main");
    const agentPluginsDir = join(root, "agent-plugins");
    const wslHelpersDir = join(root, "wsl-helpers");
    mkdirSync(mainBundleDir, { recursive: true });
    mkdirSync(agentPluginsDir, { recursive: true });
    mkdirSync(wslHelpersDir, { recursive: true });
    writeFileSync(join(mainBundleDir, "server.cjs"), 'require("electron");', "utf8");
    writeFileSync(join(mainBundleDir, "supervisor.cjs"), "", "utf8");
    writeFileSync(join(mainBundleDir, "claudeSdkProbeWorker.mjs"), "", "utf8");

    expect(() =>
      ensureSshRuntimeBundle({
        mainBundleDir,
        agentPluginsDir,
        wslHelpersDir,
        cacheDir: join(root, "cache"),
      }),
    ).toThrow("Poracode Helper cannot include Electron");
  });
});

describe("SSH helper readiness", () => {
  function descriptor(hostMode: "desktop" | "helper") {
    return {
      protocolVersion: 1,
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
    ).resolves.toBeUndefined();
  });

  it("does not mistake a desktop-hosted server for the SSH helper", async () => {
    await expect(
      waitForRemoteEndpoint(endpoint("desktop"), "http://127.0.0.1:49152/", 1),
    ).rejects.toThrow("Timed out waiting for Poracode Helper");
  });
});
