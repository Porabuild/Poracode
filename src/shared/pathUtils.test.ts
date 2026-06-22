import { describe, it, expect } from "vitest";
import { getBasename, splitPath } from "./pathUtils";

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
