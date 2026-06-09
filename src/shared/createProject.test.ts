import { describe, expect, test } from "vitest";
import {
  buildScratchTargetPath,
  deriveLocationFromPath,
  parentDirOf,
  runtimeKeyForChoice,
  runtimeKeyForLocation,
  scratchKindForChoice,
  splitPathLeaf,
  validateProjectName,
  validateScratchParent,
  wslHomeDir,
  type RuntimeChoice,
} from "./createProject";

describe("deriveLocationFromPath", () => {
  test("derives a wsl location from a wsl.localhost UNC path", () => {
    expect(deriveLocationFromPath("\\\\wsl.localhost\\Ubuntu\\home\\me\\repo", "win32")).toEqual({
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/me/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
    });
  });

  test("derives a wsl location from a legacy wsl$ UNC path", () => {
    expect(deriveLocationFromPath("\\\\wsl$\\Debian\\srv\\app", "win32")).toEqual({
      kind: "wsl",
      distro: "Debian",
      linuxPath: "/srv/app",
      uncPath: "\\\\wsl$\\Debian\\srv\\app",
    });
  });

  test("derives a windows location for a native path on win32", () => {
    expect(deriveLocationFromPath("C:\\Users\\me\\repo", "win32")).toEqual({
      kind: "windows",
      path: "C:\\Users\\me\\repo",
    });
  });

  test("derives a posix location for a native path off win32", () => {
    expect(deriveLocationFromPath("/Users/me/repo", "darwin")).toEqual({
      kind: "posix",
      path: "/Users/me/repo",
    });
  });

  test("derives a wsl location for a bare distro-root UNC path", () => {
    expect(deriveLocationFromPath("\\\\wsl.localhost\\Ubuntu", "win32")).toEqual({
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/",
      uncPath: "\\\\wsl.localhost\\Ubuntu",
    });
  });
});

describe("validateProjectName", () => {
  test("accepts a normal name", () => {
    expect(validateProjectName("my-app")).toBeNull();
  });

  test("rejects an empty / whitespace name", () => {
    expect(validateProjectName("")).not.toBeNull();
    expect(validateProjectName("   ")).not.toBeNull();
  });

  test("rejects names with path separators", () => {
    expect(validateProjectName("a/b")).not.toBeNull();
    expect(validateProjectName("a\\b")).not.toBeNull();
  });

  test("rejects names with characters illegal on Windows", () => {
    for (const ch of [":", "*", "?", '"', "<", ">", "|"]) {
      expect(validateProjectName(`bad${ch}name`)).not.toBeNull();
    }
  });

  test("rejects . and ..", () => {
    expect(validateProjectName(".")).not.toBeNull();
    expect(validateProjectName("..")).not.toBeNull();
  });
});

describe("buildScratchTargetPath", () => {
  test("joins posix parent and name with a forward slash", () => {
    expect(buildScratchTargetPath("/Users/me/code", "new-app", "posix")).toBe(
      "/Users/me/code/new-app",
    );
  });

  test("joins windows parent and name with a backslash", () => {
    expect(buildScratchTargetPath("C:\\code", "new-app", "windows")).toBe("C:\\code\\new-app");
  });

  test("joins wsl UNC parent and name with a backslash", () => {
    expect(buildScratchTargetPath("\\\\wsl.localhost\\Ubuntu\\home\\me", "app", "wsl")).toBe(
      "\\\\wsl.localhost\\Ubuntu\\home\\me\\app",
    );
  });

  test("does not double the separator when the parent has a trailing slash", () => {
    expect(buildScratchTargetPath("/Users/me/code/", "app", "posix")).toBe("/Users/me/code/app");
    expect(buildScratchTargetPath("C:\\code\\", "app", "windows")).toBe("C:\\code\\app");
  });
});

describe("parentDirOf", () => {
  test("returns the parent of a posix path", () => {
    expect(parentDirOf("/Users/me/code/app", "posix")).toBe("/Users/me/code");
  });

  test("returns the parent of a windows path", () => {
    expect(parentDirOf("C:\\code\\app", "windows")).toBe("C:\\code");
  });

  test("returns the parent of a wsl UNC path", () => {
    expect(parentDirOf("\\\\wsl.localhost\\Ubuntu\\home\\me\\app", "wsl")).toBe(
      "\\\\wsl.localhost\\Ubuntu\\home\\me",
    );
  });

  test("returns the posix root for a project directly under it", () => {
    expect(parentDirOf("/proj", "posix")).toBe("/");
  });

  test("returns the windows drive root for a project directly under it", () => {
    expect(parentDirOf("C:\\proj", "windows")).toBe("C:\\");
  });
});

describe("splitPathLeaf", () => {
  test("splits a posix path into head and last segment", () => {
    expect(splitPathLeaf("/Users/me/work/scripts/url-thing")).toEqual({
      head: "/Users/me/work/scripts",
      tail: "/url-thing",
    });
  });

  test("splits a windows path on the last backslash", () => {
    expect(splitPathLeaf("C:\\code\\app")).toEqual({ head: "C:\\code", tail: "\\app" });
  });

  test("keeps the whole value as the tail when there is no separator", () => {
    expect(splitPathLeaf("noseparator")).toEqual({ head: "", tail: "noseparator" });
  });

  test("handles a root-adjacent leaf", () => {
    expect(splitPathLeaf("/leaf")).toEqual({ head: "", tail: "/leaf" });
  });
});

describe("runtime keys", () => {
  test("runtimeKeyForChoice maps native and wsl", () => {
    expect(runtimeKeyForChoice({ kind: "native" })).toBe("native");
    expect(runtimeKeyForChoice({ kind: "wsl", distro: "Ubuntu" })).toBe("Ubuntu");
  });

  test("runtimeKeyForLocation maps location kinds to a key", () => {
    expect(runtimeKeyForLocation({ kind: "windows", path: "C:\\x" })).toBe("native");
    expect(runtimeKeyForLocation({ kind: "posix", path: "/x" })).toBe("native");
    expect(
      runtimeKeyForLocation({
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/x",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\x",
      }),
    ).toBe("Ubuntu");
  });
});

describe("scratchKindForChoice", () => {
  test("native resolves to windows on win32 and posix elsewhere", () => {
    expect(scratchKindForChoice({ kind: "native" }, "win32")).toBe("windows");
    expect(scratchKindForChoice({ kind: "native" }, "darwin")).toBe("posix");
    expect(scratchKindForChoice({ kind: "native" }, "linux")).toBe("posix");
  });

  test("wsl always resolves to wsl", () => {
    expect(scratchKindForChoice({ kind: "wsl", distro: "Ubuntu" }, "win32")).toBe("wsl");
  });
});

describe("validateScratchParent", () => {
  const native: RuntimeChoice = { kind: "native" };
  const wsl: RuntimeChoice = { kind: "wsl", distro: "Ubuntu" };

  test("native rejects a WSL UNC parent", () => {
    expect(validateScratchParent("\\\\wsl.localhost\\Ubuntu\\home", native)).not.toBeNull();
  });

  test("native accepts a non-UNC parent", () => {
    expect(validateScratchParent("C:\\code", native)).toBeNull();
    expect(validateScratchParent("/Users/me/code", native)).toBeNull();
  });

  test("wsl requires a WSL UNC parent", () => {
    expect(validateScratchParent("C:\\code", wsl)).not.toBeNull();
    expect(validateScratchParent("\\\\wsl.localhost\\Ubuntu\\home", wsl)).toBeNull();
  });

  test("wsl accepts the bare distro root as a parent", () => {
    expect(validateScratchParent("\\\\wsl.localhost\\Ubuntu", wsl)).toBeNull();
  });

  test("rejects an empty parent", () => {
    expect(validateScratchParent("", native)).not.toBeNull();
  });
});

describe("wslHomeDir", () => {
  test("returns the distro home UNC path", () => {
    expect(wslHomeDir("Ubuntu")).toBe("\\\\wsl.localhost\\Ubuntu\\home");
  });
});
