import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeFileAtomic } from "./atomicFile";

/**
 * Drives `renameSync` failures without touching the ESM namespace (which is
 * non-configurable and can't be `vi.spyOn`'d). `failCodes` is a queue of error
 * codes to throw — one per call, in order — before delegating to the real fs.
 */
const renameControl = vi.hoisted(() => ({
  failCodes: [] as string[],
  realRename: (() => {}) as (from: string, to: string) => void,
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  renameControl.realRename = actual.renameSync;
  return {
    ...actual,
    renameSync: vi.fn<(from: string, to: string) => void>((from, to) => {
      const code = renameControl.failCodes.shift();
      if (code) {
        throw Object.assign(new Error(`${code}: operation on file`), { code });
      }
      return renameControl.realRename(from, to);
    }),
  };
});

describe("writeFileAtomic", () => {
  let dir: string;

  beforeEach(() => {
    renameControl.failCodes = [];
    vi.mocked(renameSync).mockClear();
    dir = mkdtempSync(join(tmpdir(), "atomic-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes content to a new file", () => {
    const target = join(dir, "settings.json");
    writeFileAtomic(target, '{"a":1}', { encoding: "utf8" });
    expect(readFileSync(target, "utf8")).toBe('{"a":1}');
  });

  it("creates parent directories", () => {
    const target = join(dir, "nested", "deep", "file.txt");
    writeFileAtomic(target, "hello", { encoding: "utf8" });
    expect(readFileSync(target, "utf8")).toBe("hello");
  });

  it("overwrites an existing file", () => {
    const target = join(dir, "file.txt");
    writeFileSync(target, "old", "utf8");
    writeFileAtomic(target, "new", { encoding: "utf8" });
    expect(readFileSync(target, "utf8")).toBe("new");
  });

  it("leaves no temp file behind on success", () => {
    const target = join(dir, "file.txt");
    writeFileAtomic(target, "data", { encoding: "utf8" });
    const leftovers = readdirSync(dir).filter((name) => name.includes(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("preserves the existing target and cleans up the temp file when the rename fails", () => {
    // Renaming a regular file onto an existing directory fails on POSIX and
    // Windows alike (EISDIR/ENOTDIR/EPERM), so this exercises the real failure
    // path without mocking fs internals.
    const target = join(dir, "target-is-a-dir");
    mkdirSync(target);

    // The rename throws an fs error whose code varies by platform
    // (EISDIR/ENOTDIR/EPERM), so assert on the captured error rather than a message.
    let thrown: unknown;
    try {
      writeFileAtomic(target, "replacement", { encoding: "utf8" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);

    // The original entry is untouched (still a directory)…
    expect(statSync(target).isDirectory()).toBe(true);
    // …and the temp file was cleaned up rather than orphaned.
    const leftovers = readdirSync(dir).filter((name) => name.includes(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("writes Buffer data (e.g. binary/encoded secrets)", () => {
    const target = join(dir, "key.safe");
    const buf = Buffer.from("c2VjcmV0", "utf8");
    writeFileAtomic(target, buf);
    expect(readFileSync(target).equals(buf)).toBe(true);
    expect(existsSync(`${target}.${process.pid}.tmp`)).toBe(false);
  });

  it("retries a transient EPERM lock on the rename and succeeds", () => {
    renameControl.failCodes = ["EPERM", "EPERM"];

    const target = join(dir, "settings.json");
    writeFileAtomic(target, '{"a":1}', { encoding: "utf8" });

    // Two failed attempts + one successful call.
    expect(vi.mocked(renameSync)).toHaveBeenCalledTimes(3);
    expect(readFileSync(target, "utf8")).toBe('{"a":1}');
  });

  it("throws and cleans up the temp file when the lock does not clear", () => {
    // Exceed the retry budget so the write still fails.
    renameControl.failCodes = ["EPERM", "EPERM", "EPERM", "EPERM", "EPERM", "EPERM"];

    const target = join(dir, "settings.json");
    expect(() => writeFileAtomic(target, "data", { encoding: "utf8" })).toThrow(/EPERM/);

    // Temp file cleaned up rather than orphaned.
    const leftovers = readdirSync(dir).filter((name) => name.includes(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("does not retry a non-retryable rename error", () => {
    renameControl.failCodes = ["EISDIR"];

    const target = join(dir, "settings.json");
    expect(() => writeFileAtomic(target, "data", { encoding: "utf8" })).toThrow(/EISDIR/);

    // A non-retryable code aborts immediately after a single attempt.
    expect(vi.mocked(renameSync)).toHaveBeenCalledTimes(1);
  });
});
