import { describe, it, expect } from "vitest";
import { LOCK_FILES, isLockFile } from "./gitUtils";

describe("LOCK_FILES", () => {
  it("contains common lock files", () => {
    expect(LOCK_FILES).toContain("pnpm-lock.yaml");
    expect(LOCK_FILES).toContain("package-lock.json");
    expect(LOCK_FILES).toContain("yarn.lock");
    expect(LOCK_FILES).toContain("Cargo.lock");
    expect(LOCK_FILES).toContain("go.sum");
  });
});

describe("isLockFile", () => {
  it("returns true for a bare lock file name", () => {
    expect(isLockFile("pnpm-lock.yaml")).toBe(true);
  });

  it("returns true for a lock file with a path prefix", () => {
    expect(isLockFile("packages/foo/package-lock.json")).toBe(true);
  });

  it("returns true for windows-style path", () => {
    expect(isLockFile("C:\\project\\yarn.lock")).toBe(true);
  });

  it("returns false for a regular file", () => {
    expect(isLockFile("src/index.ts")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isLockFile("")).toBe(false);
  });

  it("returns false for a file that contains lock in the name but is not a lock file", () => {
    expect(isLockFile("lockfile-parser.ts")).toBe(false);
  });

  it("returns true for bun.lockb", () => {
    expect(isLockFile("bun.lockb")).toBe(true);
  });

  it("returns true for Gemfile.lock", () => {
    expect(isLockFile("path/to/Gemfile.lock")).toBe(true);
  });
});
