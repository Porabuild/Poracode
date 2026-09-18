import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import { HOST_CONTROL_DISCOVERY_VERSION } from "@/shared/hostControlProtocol";
import { resolveHostRootPaths, type HostRootPaths } from "@/backend/ownership/hostRootPaths";
import {
  collectServerDoctorReport,
  probeLeaseKernelLock,
  redactDiagnosticLine,
  tailTextFile,
} from "./serverDoctor";

const DEAD_PID = 999_999_999;
const fixtures: string[] = [];

afterAll(() => {
  for (const path of fixtures) rmSync(path, { recursive: true, force: true });
});

interface ProfileFixture {
  readonly root: string;
  readonly namespace: string;
  readonly paths: HostRootPaths;
  readonly prefixLibDir: string;
  readonly secretKeyValue: string;
}

function writePrivate(path: string, content: string): void {
  writeFileSync(path, content, "utf8");
  chmodSync(path, 0o600);
}

function buildProfileFixture(options: { withRoot?: boolean } = {}): ProfileFixture {
  const root = mkdtempSync(join(tmpdir(), "poracode-doctor-"));
  fixtures.push(root);
  const namespace = join(root, "profile");
  mkdirSync(namespace, { recursive: true, mode: 0o700 });
  const paths = resolveHostRootPaths(namespace);
  const prefixLibDir = join(root, "install", "lib");
  mkdirSync(prefixLibDir, { recursive: true });
  mkdirSync(join(root, "install", "resources", "wsl-helpers"), { recursive: true });
  writeFileSync(join(root, "install", "package.json"), "{}\n", "utf8");

  if (options.withRoot === false) {
    return { root, namespace, paths, prefixLibDir, secretKeyValue: "A".repeat(43) + "=" };
  }
  mkdirSync(paths.dataRoot, { recursive: true, mode: 0o700 });
  const generation = randomUUID();
  const secretKeyValue = Buffer.alloc(32, 9).toString("base64");
  const fingerprint = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");

  writePrivate(
    join(paths.dataRoot, "host-root.json"),
    `${JSON.stringify(
      {
        layoutVersion: 1,
        profileNamespace: paths.profileNamespace,
        dataRoot: paths.dataRoot,
        createdAt: "2026-09-16T00:00:00.000Z",
        source: { kind: "empty", activation: "ready" },
      },
      null,
      2,
    )}\n`,
  );
  writePrivate(
    join(paths.dataRoot, "host-credentials.json"),
    `${JSON.stringify(
      {
        formatVersion: 1,
        profileNamespace: paths.profileNamespace,
        dataRoot: paths.dataRoot,
        mode: "headless-file",
        keyFingerprint: fingerprint,
      },
      null,
      2,
    )}\n`,
  );
  writePrivate(join(paths.dataRoot, "secret-key.headless"), `${secretKeyValue}\n`);
  const database = new Database(join(paths.dataRoot, "state.sqlite"));
  database.exec("CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT)");
  database.close();
  writePrivate(
    paths.ownerRecordPath,
    `${JSON.stringify({
      formatVersion: 1,
      profileNamespace: paths.profileNamespace,
      dataRoot: paths.dataRoot,
      generation,
      pid: DEAD_PID,
      kind: "headless",
      phase: "stopped",
      startedAt: "2026-09-16T00:00:00.000Z",
    })}\n`,
  );
  const lease = new Database(paths.leasePath);
  lease.exec("CREATE TABLE IF NOT EXISTS owner_epoch (generation TEXT NOT NULL)");
  lease.close();

  writePrivate(
    join(paths.dataRoot, "host-control.json"),
    `${JSON.stringify({
      formatVersion: HOST_CONTROL_DISCOVERY_VERSION,
      profileNamespace: paths.profileNamespace,
      dataRoot: paths.dataRoot,
      ownerGeneration: generation,
      transport: { kind: "http-loopback", port: 49199 },
      token: `${"A".repeat(42)}A`,
    })}\n`,
  );
  return { root, namespace, paths, prefixLibDir, secretKeyValue };
}

describe("collectServerDoctorReport", () => {
  it("reports profile, lease, credentials and discovery without secrets", async () => {
    const fixture = buildProfileFixture();
    const report = await collectServerDoctorReport({
      profileNamespace: fixture.namespace,
      controlTimeoutMs: 300,
      libDir: fixture.prefixLibDir,
      now: new Date("2026-09-16T12:00:00.000Z"),
    });

    expect(report.formatVersion).toBe(1);
    expect(report.profile).toMatchObject({
      namespaceInput: fixture.namespace,
      profileNamespace: fixture.paths.profileNamespace,
      dataRoot: fixture.paths.dataRoot,
      leasePath: fixture.paths.leasePath,
      dataRootPresent: true,
      stateDatabasePresent: true,
    });
    expect(report.rootManifest).toEqual({
      source: "empty",
      activation: "ready",
      createdAt: "2026-09-16T00:00:00.000Z",
    });
    expect(report.lease.ownerRecord).toMatchObject({
      kind: "headless",
      phase: "stopped",
      pid: DEAD_PID,
      pidAlive: false,
    });
    expect(report.lease.kernelLock.state).toBe("free");
    expect(report.credentials).toMatchObject({
      mode: "headless-file",
      keyFile: "secret-key.headless",
      fingerprintPrefix: expect.stringMatching(/^[a-f0-9]{8}$/u),
      environmentKeyConfigured: false,
      error: null,
    });
    expect(report.remoteAccess.discovery).toEqual({
      port: 49199,
      ownerGeneration: report.lease.ownerRecord!.generation,
    });
    expect(report.remoteAccess.liveStatus.reachable).toBe(false);
    expect(report.versions.layout).toMatchObject({ kind: "prefix" });
    expect(report.versions.remoteProtocolVersion).toBeGreaterThan(0);

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(fixture.secretKeyValue);
    const statuses = Object.fromEntries(report.checks.map((check) => [check.name, check.status]));
    expect(statuses["install-layout"]).toBe("ok");
    expect(statuses["owned-root"]).toBe("ok");
    expect(statuses["owner-lease"]).toBe("warn");
    expect(statuses["credentials"]).toBe("ok");
    expect(statuses["remote-access"]).toBe("warn");
    expect(statuses["recent-errors"]).toBe("warn");
  });

  it("includes a redacted log tail when a log file is passed", async () => {
    const fixture = buildProfileFixture();
    const logPath = join(fixture.root, "server.log");
    const token = Buffer.alloc(32, 3).toString("base64");
    writeFileSync(
      logPath,
      `[poracode-server] started\n[poracode-server] key ${token} rejected\n`,
      "utf8",
    );
    const report = await collectServerDoctorReport({
      profileNamespace: fixture.namespace,
      controlTimeoutMs: 300,
      logFile: logPath,
      libDir: fixture.prefixLibDir,
    });
    expect(report.recentErrors.source).toBe(logPath);
    expect(report.recentErrors.lines[0]).toBe("[poracode-server] started");
    expect(report.recentErrors.lines[1]).not.toContain(token);
    expect(report.recentErrors.lines[1]).toContain("[redacted]");
  });

  it("classifies a never-started profile without failing", async () => {
    const fixture = buildProfileFixture({ withRoot: false });
    const report = await collectServerDoctorReport({
      profileNamespace: fixture.namespace,
      controlTimeoutMs: 300,
      libDir: fixture.prefixLibDir,
    });
    expect(report.profile.dataRootPresent).toBe(false);
    expect(report.lease.ownerRecord).toBeNull();
    expect(report.lease.kernelLock.state).toBe("free");
    expect(report.credentials.mode).toBeNull();
    expect(report.rootManifest).toBeNull();
    const statuses = Object.fromEntries(report.checks.map((check) => [check.name, check.status]));
    expect(statuses["owned-root"]).toBe("warn");
    expect(statuses["owner-lease"]).toBe("ok");
    expect(statuses["credentials"]).toBe("warn");
  });

  it("reports an unsupported install layout as an error check", async () => {
    const fixture = buildProfileFixture();
    const report = await collectServerDoctorReport({
      profileNamespace: fixture.namespace,
      controlTimeoutMs: 300,
      libDir: fixture.root,
    });
    const layoutCheck = report.checks.find((check) => check.name === "install-layout");
    expect(layoutCheck?.status).toBe("error");
    expect(report.versions.layout).toMatchObject({
      error: expect.stringContaining("Supported layouts"),
    });
  });
});

describe("probeLeaseKernelLock", () => {
  it("refuses to open the leased inode from the holding process", () => {
    const fixture = buildProfileFixture();
    const probe = probeLeaseKernelLock(fixture.paths, process.pid);
    expect(probe.state).toBe("skipped-same-process");
  });

  it("classifies a free lease by reading the epoch", () => {
    const fixture = buildProfileFixture();
    const probe = probeLeaseKernelLock(fixture.paths, DEAD_PID);
    expect(probe.state).toBe("free");
  });

  it("classifies a kernel-locked lease from another process", async () => {
    const fixture = buildProfileFixture();
    const child = spawn(
      process.execPath,
      [
        "-e",
        `const Database=require("better-sqlite3");
         const db=new Database(process.argv[1],{timeout:0});
         db.pragma("locking_mode = EXCLUSIVE");
         db.exec("BEGIN EXCLUSIVE");
         process.stdout.write("ready\\n");
         setInterval(()=>{},1000);`,
        fixture.paths.leasePath,
      ],
      { cwd: process.cwd(), stdio: ["ignore", "pipe", "inherit"] },
    );
    try {
      await new Promise<void>((resolve, reject) => {
        child.stdout!.on("data", (chunk: Buffer) => {
          if (chunk.toString().includes("ready")) resolve();
        });
        child.once("error", reject);
      });
      const probe = probeLeaseKernelLock(fixture.paths, DEAD_PID);
      expect(probe.state).toBe("locked");
    } finally {
      child.kill("SIGKILL");
    }
  }, 15_000);
});

describe("redactDiagnosticLine", () => {
  it("masks pairing URLs, bearers, key material and long tokens", () => {
    const token = Buffer.alloc(32, 5).toString("base64");
    expect(redactDiagnosticLine("pair at poracode://pair/device?t=abc")).toBe(
      "pair at poracode://[redacted]",
    );
    expect(redactDiagnosticLine("authorization: Bearer abcdef123")).toBe(
      "authorization: Bearer [redacted]",
    );
    expect(redactDiagnosticLine(`PORACODE_SECRET_STORAGE_KEY=${token} refused`)).toBe(
      "PORACODE_SECRET_STORAGE_KEY=[redacted] refused",
    );
    expect(redactDiagnosticLine(`bad key ${token} in request`)).toBe(
      "bad key [redacted] in request",
    );
  });

  it("keeps ordinary prose and paths intact", () => {
    const line = "[poracode-server] failed to open /Users/dev/work/Poracode/dist/main/server.cjs";
    expect(redactDiagnosticLine(line)).toBe(line);
  });
});

describe("tailTextFile", () => {
  it("returns null for absent or non-regular files", () => {
    expect(tailTextFile(join(tmpdir(), "poracode-doctor-absent-log"))).toBeNull();
  });

  it("returns small files whole and flags truncated large ones", () => {
    const fixture = fixtures[0];
    if (!fixture) throw new Error("fixture missing");
    const path = join(fixture, "tail.log");
    writeFileSync(path, `${"a".repeat(100)}\n${"b".repeat(100)}\n`, "utf8");
    const whole = tailTextFile(path, 65_536);
    expect(whole).toMatchObject({ truncated: false, totalBytes: 202 });
    const bounded = tailTextFile(path, 100);
    expect(bounded?.truncated).toBe(true);
    expect(bounded?.text).toMatch(/^b+\n?$/u);
    expect(bounded?.text).not.toContain("a");
  });
});
