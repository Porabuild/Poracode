import { spawn } from "node:child_process";
import {
  existsSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acquireServerUpgradeLock,
  isServerUpgradeLockHolderAlive,
  readProcessIdentity,
  readServerUpgradeLockRecord,
  serverUpgradeLockPath,
  ServerUpgradeBusyError,
  ServerUpgradeLockLostError,
  ServerUpgradeLockUnreadableError,
  type ServerUpgradeLockFsOps,
  type ServerUpgradeLockRecord,
} from "./serverUpgradeLock";

const dirs: string[] = [];
const children: Array<ReturnType<typeof spawn>> = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill("SIGKILL");
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-upgrade-lock-"));
  dirs.push(dir);
  return dir;
}

function liveChild(): ReturnType<typeof spawn> {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  children.push(child);
  return child;
}

async function waitForPid(child: ReturnType<typeof spawn>): Promise<number> {
  const deadline = Date.now() + 5_000;
  while (child.pid === undefined && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (!child.pid) throw new Error("fixture child did not start");
  return child.pid;
}

function record(overrides: Partial<ServerUpgradeLockRecord>): ServerUpgradeLockRecord {
  return {
    formatVersion: 1,
    token: "token-000000000000000000000000",
    pid: 999_999_999,
    processIdentity: "dead-identity",
    hostname: "fixture",
    acquiredAt: new Date().toISOString(),
    releaseId: "release-fixture",
    ...overrides,
  };
}

describe("server upgrade lock (D4)", () => {
  it("serializes two upgraders and releases only for its owner", () => {
    const prefix = sandbox();
    const first = acquireServerUpgradeLock({ prefix, releaseId: "release-first" });
    expect(() => acquireServerUpgradeLock({ prefix, releaseId: "release-second" })).toThrow(
      ServerUpgradeBusyError,
    );
    first.assertHeld();
    first.release();
    expect(readServerUpgradeLockRecord(prefix)).toBeNull();
    const second = acquireServerUpgradeLock({ prefix, releaseId: "release-second" });
    second.release();
  });

  it("takes over a stale lock whose PID is gone", () => {
    const prefix = sandbox();
    writeFileSync(
      serverUpgradeLockPath(prefix),
      `${JSON.stringify(record({ pid: 999_999_999, processIdentity: "dead" }))}\n`,
    );
    const lock = acquireServerUpgradeLock({ prefix, releaseId: "release-next" });
    expect(lock.record.releaseId).toBe("release-next");
    lock.release();
  });

  it("does not steal a lock held by a live process whose identity is unreadable", () => {
    const prefix = sandbox();
    const child = liveChild();
    return waitForPid(child).then((pid) => {
      writeFileSync(
        serverUpgradeLockPath(prefix),
        `${JSON.stringify(record({ pid, processIdentity: null }))}\n`,
      );
      expect(() => acquireServerUpgradeLock({ prefix, releaseId: "release-next" })).toThrow(
        ServerUpgradeBusyError,
      );
      // The unrelated process was never signalled.
      expect(() => process.kill(pid, 0)).not.toThrow();
    });
  });

  it("takes over a lock whose recorded identity no longer matches a reused PID", async () => {
    const prefix = sandbox();
    const child = liveChild();
    const pid = await waitForPid(child);
    const actual = readProcessIdentity(pid);
    writeFileSync(
      serverUpgradeLockPath(prefix),
      `${JSON.stringify(record({ pid, processIdentity: "definitely-not-this-process" }))}\n`,
    );
    const lock = acquireServerUpgradeLock({
      prefix,
      releaseId: "release-next",
      readIdentity: () => actual ?? "fixture-identity",
    });
    expect(lock.record.releaseId).toBe("release-next");
    lock.release();
    expect(() => process.kill(pid, 0)).not.toThrow();
  });

  it("fences a holder whose lock was taken over", () => {
    const prefix = sandbox();
    const lock = acquireServerUpgradeLock({ prefix, releaseId: "release-first" });
    // Simulate an atomic stale takeover of a live-looking lock: replace the
    // record with a different token.
    writeFileSync(
      serverUpgradeLockPath(prefix),
      `${JSON.stringify(record({ token: "another-token-00000000000000" }))}\n`,
    );
    expect(() => lock.assertHeld()).toThrow(ServerUpgradeLockLostError);
    // Releasing a fenced-out lock never removes the new holder's file.
    lock.release();
    expect(readFileSync(serverUpgradeLockPath(prefix), "utf8")).toContain(
      "another-token-00000000000000",
    );
  });

  it("fails closed on a corrupt lock file", () => {
    const prefix = sandbox();
    writeFileSync(serverUpgradeLockPath(prefix), "{not json\n");
    expect(() => acquireServerUpgradeLock({ prefix, releaseId: "release-next" })).toThrow(
      ServerUpgradeLockUnreadableError,
    );
  });

  it("classifies liveness conservatively when identity cannot be read", () => {
    const live = record({ pid: process.pid, processIdentity: "not-our-identity" });
    expect(isServerUpgradeLockHolderAlive(live, () => null)).toBe(true);
    expect(isServerUpgradeLockHolderAlive(live, () => "not-our-identity")).toBe(true);
    expect(isServerUpgradeLockHolderAlive(live, () => "different")).toBe(false);
    expect(isServerUpgradeLockHolderAlive(record({ pid: 999_999_999 }), () => null)).toBe(false);
  });
});

function codeError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe("win32 process identity", () => {
  it("reads the process start ticks through PowerShell without wmic", () => {
    const run = vi.fn<() => string>(() => "638912345678901234\r\n");
    expect(readProcessIdentity(4321, { platform: "win32", run })).toBe("win32:638912345678901234");
    expect(run).toHaveBeenCalledExactlyOnceWith(
      "powershell.exe",
      ["-NoProfile", "-Command", "(Get-Process -Id 4321).StartTime.ToUniversalTime().Ticks"],
      5_000,
    );
  });

  it("returns null on failure, timeout or malformed output (conservative)", () => {
    const failing = () => {
      throw codeError("ETIMEDOUT");
    };
    expect(readProcessIdentity(4321, { platform: "win32", run: failing })).toBeNull();
    expect(readProcessIdentity(4321, { platform: "win32", run: () => "not ticks" })).toBeNull();
    expect(readProcessIdentity(4321, { platform: "win32", run: () => "" })).toBeNull();
    // A live holder with an unreadable identity is still treated as live.
    expect(
      isServerUpgradeLockHolderAlive(record({ pid: process.pid, processIdentity: "win32:1" }), () =>
        readProcessIdentity(process.pid, { platform: "win32", run: failing }),
      ),
    ).toBe(true);
  });

  it("rejects invalid PIDs without running anything", () => {
    const run = vi.fn<() => string>(() => "1");
    expect(readProcessIdentity(0, { platform: "win32", run })).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});

describe("lock file portability", () => {
  const passthrough = (
    overrides: Partial<ServerUpgradeLockFsOps>,
  ): Partial<ServerUpgradeLockFsOps> => ({
    sleep: () => undefined,
    ...overrides,
  });

  it("records the OS hostname", () => {
    const lock = acquireServerUpgradeLock({ prefix: sandbox(), releaseId: "r" });
    expect(lock.record.hostname).toBe(hostname());
    lock.release();
  });

  it("falls back to exclusive creation when hard links are unavailable", () => {
    const prefix = sandbox();
    const link = vi.fn<() => void>(() => {
      throw codeError("EPERM");
    });
    const lock = acquireServerUpgradeLock({
      prefix,
      releaseId: "release-fallback",
      fsOps: passthrough({ link }),
    });
    expect(link).toHaveBeenCalled();
    expect(readServerUpgradeLockRecord(prefix)?.token).toBe(lock.record.token);
    lock.assertHeld();
    lock.release();
    expect(existsSync(serverUpgradeLockPath(prefix))).toBe(false);
  });

  it("still reports busy when the fallback finds an existing lock", () => {
    const prefix = sandbox();
    const holder = liveChild();
    return waitForPid(holder).then((pid) => {
      writeFileSync(
        serverUpgradeLockPath(prefix),
        `${JSON.stringify(record({ pid, processIdentity: null }))}\n`,
      );
      expect(() =>
        acquireServerUpgradeLock({
          prefix,
          releaseId: "r",
          fsOps: passthrough({
            link: () => {
              throw codeError("EPERM");
            },
          }),
        }),
      ).toThrow(ServerUpgradeBusyError);
    });
  });

  it("does not mask an unrelated link failure with the fallback", () => {
    expect(() =>
      acquireServerUpgradeLock({
        prefix: sandbox(),
        releaseId: "r",
        fsOps: passthrough({
          link: () => {
            throw codeError("ENOSPC");
          },
        }),
      }),
    ).toThrow("ENOSPC");
  });

  it("retries a transient unlink failure on release and stale takeover rename", () => {
    const prefix = sandbox();
    writeFileSync(serverUpgradeLockPath(prefix), `${JSON.stringify(record({}))}\n`);
    let renameFailures = 2;
    let unlinkFailures = 2;
    const rename = vi.fn<(from: string, to: string) => void>((from, to) => {
      if (renameFailures-- > 0) throw codeError("EBUSY");
      renameSync(from, to);
    });
    const unlink = vi.fn<(path: string) => void>((path) => {
      if (path.endsWith("upgrade.lock") && unlinkFailures-- > 0) throw codeError("EACCES");
      rmSync(path, { force: true });
    });
    const sleep = vi.fn<(ms: number) => void>();
    const lock = acquireServerUpgradeLock({
      prefix,
      releaseId: "r",
      fsOps: { rename, unlink, sleep, link: linkSync },
    });
    expect(rename).toHaveBeenCalledTimes(3);
    lock.release();
    expect(existsSync(serverUpgradeLockPath(prefix))).toBe(false);
    expect(sleep).toHaveBeenCalledTimes(4);
  });

  it("gives up after a bounded number of transient failures and leaves other codes alone", () => {
    const prefix = sandbox();
    writeFileSync(serverUpgradeLockPath(prefix), `${JSON.stringify(record({}))}\n`);
    const rename = vi.fn<() => void>(() => {
      throw codeError("EPERM");
    });
    expect(() =>
      acquireServerUpgradeLock({ prefix, releaseId: "r", fsOps: passthrough({ rename }) }),
    ).toThrow("EPERM");
    expect(rename).toHaveBeenCalledTimes(6);
  });
});
