import { describe, it, expect } from "vitest";
import { getBasename, isSameFolderPath, splitPath } from "./pathUtils";

describe("isSameFolderPath", () => {
  it("ignores a trailing separator and the separator style", () => {
    expect(isSameFolderPath("F:\\repo", "F:/repo/", false)).toBe(true);
    expect(isSameFolderPath("/home/u/repo/", "/home/u/repo", false)).toBe(true);
  });

  it("folds case only when the caller asks for it", () => {
    expect(isSameFolderPath("F:\\Repo", "f:\\repo", true)).toBe(true);
    expect(isSameFolderPath("/home/u/Repo", "/home/u/repo", false)).toBe(false);
  });

  it("never matches a missing path", () => {
    expect(isSameFolderPath(undefined, "F:\\repo", true)).toBe(false);
    expect(isSameFolderPath("F:\\repo", undefined, true)).toBe(false);
  });

  it("does not treat a different folder as the same one", () => {
    expect(isSameFolderPath("F:\\repo", "F:\\repo2", true)).toBe(false);
  });
});

describe("getBasename", () => {
  it("returns last segment of a forward-slash path", () => {
    expect(getBasename("src/main/db.ts")).toBe("db.ts");
  });

  it("returns last segment of a backslash path", () => {
    expect(getBasename("C:\\Users\\admin\\file.txt")).toBe("file.txt");
  });

  it("returns the string itself when no separators", () => {
    expect(getBasename("file.txt")).toBe("file.txt");
  });

  it("handles trailing slash", () => {
    expect(getBasename("src/main/")).toBe("");
  });

  it("handles mixed separators", () => {
    expect(getBasename("src/main\\utils/helper.ts")).toBe("helper.ts");
  });
});

describe("splitPath", () => {
  it("splits a typical unix path", () => {
    expect(splitPath("src/main/db.ts")).toEqual({
      dirWithSlash: "src/main/",
      basename: "db.ts",
    });
  });

  it("splits a windows path", () => {
    expect(splitPath("C:\\Users\\file.txt")).toEqual({
      dirWithSlash: "C:\\Users\\",
      basename: "file.txt",
    });
  });

  it("returns empty dir for bare filename", () => {
    expect(splitPath("file.txt")).toEqual({
      dirWithSlash: "",
      basename: "file.txt",
    });
  });

  it("handles root-only path", () => {
    expect(splitPath("/file.txt")).toEqual({
      dirWithSlash: "/",
      basename: "file.txt",
    });
  });
});
