import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ScratchKind } from "@/shared/createProject";
import { createProjectDirectory, describeMkdirError } from "./projectDirectory";

describe("createProjectDirectory", () => {
  let root: string;
  const nativeKind: ScratchKind = process.platform === "win32" ? "windows" : "posix";

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lc-create-project-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("creates the folder under the parent and returns its path", async () => {
    const result = await createProjectDirectory({
      parent: root,
      name: "new-app",
      kind: nativeKind,
    });

    const expected = join(root, "new-app");
    expect(result.path).toBe(expected);
    expect(existsSync(expected)).toBe(true);
    expect(statSync(expected).isDirectory()).toBe(true);
  });

  test("throws when a folder with that name already exists", async () => {
    await createProjectDirectory({ parent: root, name: "dup", kind: nativeKind });

    await expect(
      createProjectDirectory({ parent: root, name: "dup", kind: nativeKind }),
    ).rejects.toThrow(/already exists/i);
  });

  test("surfaces a friendly message when the parent does not exist", async () => {
    await expect(
      createProjectDirectory({ parent: join(root, "missing"), name: "app", kind: nativeKind }),
    ).rejects.toThrow(/no longer exists/i);
  });
});

describe("describeMkdirError", () => {
  test("maps permission errors", () => {
    expect(describeMkdirError({ code: "EACCES" }, "x")).toMatch(/permission/i);
    expect(describeMkdirError({ code: "EPERM" }, "x")).toMatch(/permission/i);
  });

  test("maps out-of-space, missing-parent and not-a-directory codes", () => {
    expect(describeMkdirError({ code: "ENOSPC" }, "x")).toMatch(/disk space/i);
    expect(describeMkdirError({ code: "ENOENT" }, "x")).toMatch(/no longer exists/i);
    expect(describeMkdirError({ code: "ENOTDIR" }, "x")).toMatch(/not a folder/i);
  });

  test("falls back to the raw error message", () => {
    expect(describeMkdirError(new Error("boom"), "x")).toBe("boom");
  });
});
