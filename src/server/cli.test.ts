import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireDataDirLock } from "./cli";

describe("acquireDataDirLock", () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "lc-lock-"));
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("writes a lockfile containing the current pid", () => {
    const lock = acquireDataDirLock(baseDir);
    expect(lock.path).toBe(join(baseDir, "server.lock"));
    expect(readFileSync(lock.path, "utf8").trim()).toBe(String(process.pid));
    lock.release();
  });

  it("throws when the dir is held by a live process", () => {
    const first = acquireDataDirLock(baseDir);
    // Second acquire against a lock whose pid reports as alive must fail fast.
    expect(() => acquireDataDirLock(baseDir, () => true)).toThrow(
      /is in use by another Lightcode process/,
    );
    // The clear message names LIGHTCODE_BASE_DIR as the escape hatch.
    expect(() => acquireDataDirLock(baseDir, () => true)).toThrow(/LIGHTCODE_BASE_DIR/);
    first.release();
  });

  it("reclaims a stale lock whose process is dead", () => {
    // Simulate a crashed server that left its lockfile behind.
    writeFileSync(join(baseDir, "server.lock"), "999999", "utf8");
    const lock = acquireDataDirLock(baseDir, () => false);
    expect(readFileSync(lock.path, "utf8").trim()).toBe(String(process.pid));
    lock.release();
  });

  it("reclaims an unparseable/empty lockfile", () => {
    writeFileSync(join(baseDir, "server.lock"), "not-a-pid", "utf8");
    // isAlive is never consulted for an unreadable pid; reclaim regardless.
    const lock = acquireDataDirLock(baseDir, () => true);
    expect(readFileSync(lock.path, "utf8").trim()).toBe(String(process.pid));
    lock.release();
  });

  it("allows re-acquiring after release", () => {
    acquireDataDirLock(baseDir, () => true).release();
    // Once released the lockfile is gone, so a fresh live-pid check is moot.
    const lock = acquireDataDirLock(baseDir, () => true);
    expect(readFileSync(lock.path, "utf8").trim()).toBe(String(process.pid));
    lock.release();
  });

  it("release is idempotent", () => {
    const lock = acquireDataDirLock(baseDir);
    lock.release();
    expect(() => lock.release()).not.toThrow();
  });
});
