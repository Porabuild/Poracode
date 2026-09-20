import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultUpgradeIo,
  parseUpgradeCliOptions,
  upgradeServerPrefix,
  type UpgradeIo,
} from "./serverUpgrade";
import { writeCurrentSymlink } from "./serverNativeOverlay";

const dirs: string[] = [];
const envBackup = new Map<string, string | undefined>();

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  for (const [key, value] of envBackup) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  envBackup.clear();
});

function sandboxBaseDir(): string {
  const baseDir = mkdtempSync(join(tmpdir(), "poracode-upgrade-profile-"));
  dirs.push(baseDir);
  envBackup.set("PORACODE_BASE_DIR", process.env.PORACODE_BASE_DIR);
  process.env.PORACODE_BASE_DIR = baseDir;
  return baseDir;
}

function fakeIo(overrides: Partial<UpgradeIo> = {}): UpgradeIo {
  return {
    extract: (_tarball, destination) => {
      mkdirSync(join(destination, "lib"), { recursive: true });
      writeFileSync(join(destination, "lib", "server.cjs"), "ok\n");
    },
    npmInstall: () => {},
    doctor: () => ({ ok: true, detail: "ok" }),
    health: async () => true,
    restart: async () => {},
    ...overrides,
  };
}

describe("parseUpgradeCliOptions", () => {
  it("requires --from and defaults the prefix", () => {
    expect(parseUpgradeCliOptions(["--from", "/tmp/a.tar.gz"])).toEqual({
      from: "/tmp/a.tar.gz",
      prefix: "/opt/poracode",
      json: false,
    });
    expect(
      parseUpgradeCliOptions(["--from", "/tmp/a.tar.gz", "--prefix", "/opt/x", "--json"]),
    ).toEqual({
      from: "/tmp/a.tar.gz",
      prefix: "/opt/x",
      json: true,
    });
    expect(() => parseUpgradeCliOptions([])).toThrow(/upgrade --from/u);
  });
});

describe("upgradeServerPrefix", () => {
  it("upgrades a running install by swapping the current symlink", async () => {
    const prefix = mkdtempSync(join(tmpdir(), "poracode-upgrade-"));
    dirs.push(prefix);
    const previous = join(prefix, "releases", "old");
    mkdirSync(previous, { recursive: true });
    writeFileSync(join(previous, "marker"), "old");
    writeCurrentSymlink(prefix, previous);

    const result = await upgradeServerPrefix(
      { from: "/tmp/next.tar.gz", prefix, json: true },
      fakeIo(),
    );
    expect(result.ok).toBe(true);
    expect(result.rolledBack).toBe(false);
    expect(readFileSync(join(prefix, "current", "lib", "server.cjs"), "utf8")).toBe("ok\n");
  });

  it("rolls back a broken upgrade when health fails", async () => {
    const prefix = mkdtempSync(join(tmpdir(), "poracode-upgrade-"));
    dirs.push(prefix);
    const previous = join(prefix, "releases", "old");
    mkdirSync(previous, { recursive: true });
    writeFileSync(join(previous, "marker"), "old");
    writeCurrentSymlink(prefix, previous);

    const result = await upgradeServerPrefix(
      { from: "/tmp/broken.tar.gz", prefix, json: true, healthTimeoutMs: 500 },
      fakeIo({ health: async () => false }),
    );
    expect(result.ok).toBe(false);
    expect(result.rolledBack).toBe(true);
    expect(result.detail).toContain("rolled back");
    expect(readFileSync(join(prefix, "current", "marker"), "utf8")).toBe("old");
  });

  it("restarts the previous release when restarting the upgrade throws", async () => {
    const prefix = mkdtempSync(join(tmpdir(), "poracode-upgrade-restart-error-"));
    dirs.push(prefix);
    const previous = join(prefix, "releases", "old");
    mkdirSync(previous, { recursive: true });
    writeFileSync(join(previous, "marker"), "old");
    writeCurrentSymlink(prefix, previous);
    const restart = vi.fn<() => Promise<void>>(async () => {
      expect(readFileSync(join(prefix, "current", "marker"), "utf8")).toBe("old");
    });
    restart.mockRejectedValueOnce(new Error("new daemon failed to spawn"));
    const health = vi.fn<() => Promise<boolean>>(async () => true);

    await expect(
      upgradeServerPrefix(
        { from: "/tmp/next.tar.gz", prefix, json: true },
        fakeIo({ restart, health }),
      ),
    ).rejects.toThrow("new daemon failed to spawn");
    expect(restart).toHaveBeenCalledTimes(2);
    expect(health).toHaveBeenCalledOnce();
    expect(readFileSync(join(prefix, "current", "marker"), "utf8")).toBe("old");
  });

  it("does not restart the running release when staging fails", async () => {
    const prefix = mkdtempSync(join(tmpdir(), "poracode-upgrade-stage-error-"));
    dirs.push(prefix);
    const previous = join(prefix, "releases", "old");
    mkdirSync(previous, { recursive: true });
    writeFileSync(join(previous, "marker"), "old");
    writeCurrentSymlink(prefix, previous);
    const restart = vi.fn<() => Promise<void>>(async () => {});
    await expect(
      upgradeServerPrefix(
        { from: "/tmp/next.tar.gz", prefix, json: true },
        fakeIo({
          npmInstall: () => {
            throw new Error("install failed");
          },
          restart,
        }),
      ),
    ).rejects.toThrow("install failed");
    expect(restart).not.toHaveBeenCalled();
    expect(readFileSync(join(prefix, "current", "marker"), "utf8")).toBe("old");
  });

  it("restarts a live lease-holding process and rolls back when health dies", async () => {
    const prefix = mkdtempSync(join(tmpdir(), "poracode-upgrade-live-"));
    dirs.push(prefix);
    const previous = join(prefix, "releases", "old");
    mkdirSync(join(previous, "lib"), { recursive: true });
    writeFileSync(join(previous, "lib", "server.cjs"), "old\n");
    writeCurrentSymlink(prefix, previous);

    const { createServer } = await import("node:http");
    const { spawn } = await import("node:child_process");
    const server = createServer((req, res) => {
      const healthy = existsSync(join(prefix, "healthy"));
      res.statusCode = healthy ? 200 : 503;
      res.end(healthy ? "ok" : "down");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no listen port");
    writeFileSync(join(prefix, "health.url"), `http://127.0.0.1:${address.port}/healthz\n`);
    writeFileSync(join(prefix, "healthy"), "1");
    const holder = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    if (!holder.pid) throw new Error("lease holder failed to start");
    writeFileSync(join(prefix, "poracode-server.pid"), `${holder.pid}\n`);

    const restarts: string[] = [];
    try {
      const result = await upgradeServerPrefix(
        { from: "/tmp/next.tar.gz", prefix, json: true, healthTimeoutMs: 500 },
        fakeIo({
          restart: async (target) => {
            restarts.push(target);
            rmSync(join(prefix, "healthy"), { force: true });
          },
          health: async () => {
            const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
            return response.ok;
          },
        }),
      );
      expect(restarts.length).toBeGreaterThanOrEqual(2);
      expect(result.ok).toBe(false);
      expect(result.rolledBack).toBe(true);
      expect(readFileSync(join(prefix, "current", "lib", "server.cjs"), "utf8")).toBe("old\n");
    } finally {
      holder.kill("SIGTERM");
      server.close();
    }
  });

  it("refuses a stale unauthenticated owner and ignores its persisted pid file", async () => {
    sandboxBaseDir();
    const prefix = mkdtempSync(join(tmpdir(), "poracode-upgrade-lease-"));
    dirs.push(prefix);
    const previous = join(prefix, "releases", "old");
    mkdirSync(join(previous, "lib"), { recursive: true });
    writeFileSync(join(previous, "lib", "server.cjs"), "old\n");
    writeCurrentSymlink(prefix, previous);

    const { spawn } = await import("node:child_process");
    const { resolveDesktopHostRootPaths } = await import("@/backend/ownership/hostRootPaths");
    const holder = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    if (!holder.pid) throw new Error("lease holder failed to start");
    dirs.push(prefix);
    try {
      // A real owner record: the daemon started outside an upgrade is
      // discoverable only through its lease lifecycle record (V6 D.4).
      const paths = resolveDesktopHostRootPaths(process.env.PORACODE_BASE_DIR!);
      writeFileSync(
        paths.ownerRecordPath,
        `${JSON.stringify({
          formatVersion: 1,
          profileNamespace: paths.profileNamespace,
          dataRoot: paths.dataRoot,
          generation: "generation-1",
          pid: holder.pid,
          kind: "headless",
          phase: "ready",
          startedAt: new Date().toISOString(),
        })}\n`,
      );

      writeFileSync(join(prefix, "poracode-server.pid"), `${holder.pid}\n`);
      await expect(defaultUpgradeIo.restart(prefix)).rejects.toThrow("Stop the daemon manually");
      expect(() => process.kill(holder.pid!, 0)).not.toThrow();
    } finally {
      holder.kill("SIGKILL");
    }
  });

  it("ignores a desktop-owned or stopped lease record", async () => {
    sandboxBaseDir();
    const prefix = mkdtempSync(join(tmpdir(), "poracode-upgrade-desktop-"));
    dirs.push(prefix);
    const previous = join(prefix, "releases", "old");
    mkdirSync(join(previous, "lib"), { recursive: true });
    writeFileSync(join(previous, "lib", "server.cjs"), "old\n");
    writeCurrentSymlink(prefix, previous);

    const { spawn } = await import("node:child_process");
    const { resolveDesktopHostRootPaths } = await import("@/backend/ownership/hostRootPaths");
    const paths = resolveDesktopHostRootPaths(process.env.PORACODE_BASE_DIR!);
    const holder = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    if (!holder.pid) throw new Error("lease holder failed to start");
    const record = (kind: string, phase: string) =>
      `${JSON.stringify({
        formatVersion: 1,
        profileNamespace: paths.profileNamespace,
        dataRoot: paths.dataRoot,
        generation: "generation-1",
        pid: holder.pid,
        kind,
        phase,
        startedAt: new Date().toISOString(),
      })}\n`;

    try {
      const io = {
        ...fakeIo(),
        // Real restart so the lease-record filtering is actually exercised.
        restart: defaultUpgradeIo.restart,
      };
      writeFileSync(paths.ownerRecordPath, record("desktop", "ready"));
      const desktop = mkdtempSync(join(tmpdir(), "poracode-upgrade-desktop-run-"));
      dirs.push(desktop);
      writeFileSync(join(desktop, "poracode-server.pid"), `${holder.pid}\n`);
      const desktopResult = await upgradeServerPrefix(
        { from: "/tmp/next.tar.gz", prefix: desktop, json: true, healthTimeoutMs: 500 },
        io,
      );
      expect(desktopResult.ok).toBe(true);
      let holderAlive = true;
      try {
        process.kill(holder.pid, 0);
      } catch {
        holderAlive = false;
      }
      expect(holderAlive).toBe(true);

      writeFileSync(paths.ownerRecordPath, record("headless", "stopped"));
      const stopped = mkdtempSync(join(tmpdir(), "poracode-upgrade-stopped-run-"));
      dirs.push(stopped);
      writeFileSync(join(stopped, "poracode-server.pid"), `${holder.pid}\n`);
      const stoppedResult = await upgradeServerPrefix(
        { from: "/tmp/next.tar.gz", prefix: stopped, json: true, healthTimeoutMs: 500 },
        io,
      );
      expect(stoppedResult.ok).toBe(true);
      try {
        process.kill(holder.pid, 0);
      } catch {
        throw new Error("a stopped lease record must not be signalled");
      }
    } finally {
      holder.kill("SIGKILL");
    }
  });
});
