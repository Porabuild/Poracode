// @vitest-environment node

import { describe, expect, it } from "vitest";
import { parseProjectPathRef } from "./parseProjectPathRef";

describe("parseProjectPathRef", () => {
  it("recognizes a file path with extension", () => {
    expect(parseProjectPathRef("src/foo/bar.ts")).toEqual({
      kind: "file",
      path: "src/foo/bar.ts",
    });
  });

  it("recognizes a file path with line suffix", () => {
    expect(parseProjectPathRef("src/foo/bar.ts:42")).toEqual({
      kind: "file",
      path: "src/foo/bar.ts",
      line: 42,
    });
  });

  it("recognizes a file path with line range suffix", () => {
    expect(parseProjectPathRef("src/foo/bar.ts:42-57")).toEqual({
      kind: "file",
      path: "src/foo/bar.ts",
      line: 42,
      endLine: 57,
    });
  });

  it("recognizes a folder path with trailing separator", () => {
    expect(parseProjectPathRef("src/foo/")).toEqual({ kind: "folder", path: "src/foo" });
  });

  it("recognizes a folder path with no extension", () => {
    expect(parseProjectPathRef("src/foo/bar")).toEqual({ kind: "folder", path: "src/foo/bar" });
  });

  it("rejects whitespace, urls, and bare words", () => {
    expect(parseProjectPathRef("not a path")).toBeNull();
    expect(parseProjectPathRef("https://example.com/foo")).toBeNull();
    expect(parseProjectPathRef("hello")).toBeNull();
  });

  it.each([
    "/var/...",
    "/private/var/...",
    "/var/.../report.ts:12",
    "src/…/report.ts",
    "src/..../report.ts",
    "src/…/",
  ])("leaves abbreviated paths as text: %s", (path) => {
    expect(parseProjectPathRef(path)).toBeNull();
  });

  it.each(["src/.", "src/.."])("recognizes dot directories as folders: %s", (path) => {
    expect(parseProjectPathRef(path)).toEqual({ kind: "folder", path });
  });

  it.each(["src/.env", "src/.gitignore", "src/../main.ts", "./src/main.ts"])(
    "still recognizes concrete dotfile and relative paths: %s",
    (path) => {
      expect(parseProjectPathRef(path)).toEqual({ kind: "file", path });
    },
  );

  describe("with rootNames validation", () => {
    const rootNames = new Set(["src", "package.json", "scripts"]);

    it("accepts a path whose first segment is a known root", () => {
      expect(parseProjectPathRef("src/foo/bar.ts", { rootNames })).toEqual({
        kind: "file",
        path: "src/foo/bar.ts",
      });
    });

    it("rejects a path whose first segment is unknown (npm scoped pkg)", () => {
      expect(parseProjectPathRef("@tanstack/react-virtual", { rootNames })).toBeNull();
      expect(parseProjectPathRef("@heroui/react", { rootNames })).toBeNull();
    });

    it("rejects a slashed token whose first segment is just unknown", () => {
      expect(parseProjectPathRef("foo/bar.ts", { rootNames })).toBeNull();
    });

    it("does not enforce root-name check for tokens without a separator", () => {
      // Single-segment tokens with an extension can still be recognized; the
      // root-name guard only applies when a directory separator is present.
      expect(parseProjectPathRef("README.md", { rootNames })).toEqual({
        kind: "file",
        path: "README.md",
      });
    });

    it("accepts absolute POSIX file paths without enforcing root-name check", () => {
      // File extensions and `:line` suffixes are strong enough signals to chip
      // even outside the project; downstream normalization converts them to
      // project-relative paths when possible.
      expect(parseProjectPathRef("/home/me/repo/src/foo.ts", { rootNames })).toEqual({
        kind: "file",
        path: "/home/me/repo/src/foo.ts",
      });
      expect(parseProjectPathRef("/home/me/repo/src/foo.ts:42", { rootNames })).toEqual({
        kind: "file",
        path: "/home/me/repo/src/foo.ts",
        line: 42,
      });
    });

    it("rejects absolute folder candidates whose first segment isn't a project root", () => {
      // Slash commands like `/plan` and `/p` have first segment "plan"/"p",
      // which won't be a real top-level project entry, so they must not chip.
      expect(parseProjectPathRef("/plan", { rootNames })).toBeNull();
      expect(parseProjectPathRef("/p", { rootNames })).toBeNull();
      expect(parseProjectPathRef("/review", { rootNames })).toBeNull();
      // Absolute folder paths outside the project are also rejected here;
      // callers normalize to a project-relative path before re-parsing.
      expect(parseProjectPathRef("/Users/me/repo/src/foo", { rootNames })).toBeNull();
    });

    it("accepts absolute folder candidates whose first segment is a project root", () => {
      expect(parseProjectPathRef("/src/foo", { rootNames })).toEqual({
        kind: "folder",
        path: "/src/foo",
      });
    });

    it("still recognizes explicit folder paths (trailing slash) regardless of root", () => {
      // The trailing slash is itself a strong folder signal; keep it permissive.
      expect(parseProjectPathRef("/plan/", { rootNames })).toEqual({
        kind: "folder",
        path: "/plan",
      });
    });
  });
});
