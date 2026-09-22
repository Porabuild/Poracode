import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireServerUpgradeLock,
  isServerUpgradeLockHolderAlive,
  readProcessIdentity,
  readServerUpgradeLockRecord,
  serverUpgradeLockPath,
  ServerUpgradeBusyError,
  ServerUpgradeLockLostError,
  ServerUpgradeLockUnreadableError,
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
