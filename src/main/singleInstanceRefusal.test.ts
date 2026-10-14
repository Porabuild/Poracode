import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  describeSingleInstanceRefusal,
  isProcessAlive,
  parseSingletonLockTarget,
  readSingletonLockTarget,
} from "./singleInstanceRefusal";

describe("parseSingletonLockTarget", () => {
  it("parses the Chromium hostname-PID symlink target", () => {
    expect(parseSingletonLockTarget("H1FCM6T4GX-714")).toEqual({
      hostname: "H1FCM6T4GX",
      pid: 714,
    });
  });

  it("parses hostnames that themselves contain dashes", () => {
    expect(parseSingletonLockTarget("my-macbook-pro.local-4242")).toEqual({
      hostname: "my-macbook-pro.local",
      pid: 4242,
    });
  });

  it("takes the LAST dash-number run as the PID (AWS-style hostnames)", () => {
    // A leftmost-shortest match would extract pid 10 here and misreport a
    // live holder as a stale lock.
    expect(parseSingletonLockTarget("ip-10-0-0-1-12345")).toEqual({
      hostname: "ip-10-0-0-1",
      pid: 12345,
    });
    expect(parseSingletonLockTarget("weird-12-34-56")).toEqual({
      hostname: "weird-12-34",
      pid: 56,
    });
  });

  it("tolerates a trailing token segment for future Chromium formats", () => {
    expect(parseSingletonLockTarget("host-99-abcdef01")).toEqual({
      hostname: "host",
      pid: 99,
    });
  });

  it.each(["", "justahostname", "host-notanumber", "host-0", "-12", "host-12 trailing space"])(
    "rejects %j as a lock target",
    (target) => {
      expect(parseSingletonLockTarget(target)).toBeNull();
    },
  );
});

describe("isProcessAlive", () => {
  it("reports the current process as alive", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it("reports an unschedulable PID as dead", () => {
    expect(isProcessAlive(Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});

describe("readSingletonLockTarget", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "poracode-single-instance-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads the SingletonLock symlink target", () => {
    symlinkSync("somehost-4242", join(dir, "SingletonLock"));
    expect(readSingletonLockTarget(dir)).toBe("somehost-4242");
  });

  it("returns null when there is no lock symlink", () => {
    expect(readSingletonLockTarget(dir)).toBeNull();
  });
});

describe("describeSingleInstanceRefusal", () => {
  it("discloses a live holder with PID, hostname, and the profile path", () => {
    const line = describeSingleInstanceRefusal("/profiles/poracode", {
      readTarget: () => "H1FCM6T4GX-714",
      isAlive: (pid) => pid === 714,
    });
    expect(line).toMatch(/^\[poracode\] Another Poracode instance is already running/);
    expect(line).toContain("PID 714 on H1FCM6T4GX");
    expect(line).toContain("quitting");
    expect(line).toContain("/profiles/poracode");
    expect(line).not.toContain("stale");
  });

  it("discloses a stale lock when the holding PID is gone", () => {
    const line = describeSingleInstanceRefusal("/profiles/poracode", {
      readTarget: () => "host-99",
      isAlive: () => false,
    });
    expect(line).toContain("PID 99 on host");
    expect(line).toContain("stale");
    expect(line).toContain("quitting");
  });

  it("still discloses (without holder detail) when the lock cannot be read", () => {
    const line = describeSingleInstanceRefusal("/profiles/poracode", {
      readTarget: () => null,
      isAlive: () => true,
    });
    expect(line).toContain("appears to hold");
    expect(line).toContain("could not be read");
    expect(line).toContain("/profiles/poracode");
  });

  it("includes the raw target when it does not parse as hostname-PID", () => {
    const line = describeSingleInstanceRefusal("/profiles/poracode", {
      readTarget: () => "garbage-lock",
      isAlive: () => false,
    });
    expect(line).toContain("garbage-lock");
    expect(line).toContain("/profiles/poracode");
  });
});
