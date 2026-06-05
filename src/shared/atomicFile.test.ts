import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileAtomic } from "./atomicFile";

describe("writeFileAtomic", () => {
  let dir: string;

  beforeEach(() => {
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
});
