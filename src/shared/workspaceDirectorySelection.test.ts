import { describe, expect, it } from "vitest";
import { threadSchema, startThreadPayloadSchema } from "./contracts/thread";
import {
  MAX_WORKSPACE_DIRECTORY_ENTRIES,
  MAX_WORKSPACE_DIRECTORY_SERIALIZED_CHARS,
  MAX_WORKSPACE_EXECUTION_PATH_CHARS,
  parseSavedWorkspaceDirectories,
  workspaceDirectorySelectionSchema,
  workspaceGrantRevisionSchema,
} from "./workspaceDirectorySelection";

const root = { kind: "posix", path: "/extra" };
describe("workspace directory structural admission", () => {
  it("preserves complete order, duplicates and explicit clear without canonicalizing", () => {
    expect(
      workspaceDirectorySelectionSchema.parse([root, { ...root, path: "/other/../x" }, root]),
    ).toEqual([root, { ...root, path: "/other/../x" }, root]);
    expect(workspaceDirectorySelectionSchema.parse([])).toEqual([]);
    expect(
      workspaceDirectorySelectionSchema.safeParse(
        Array(MAX_WORKSPACE_DIRECTORY_ENTRIES + 1).fill(root),
      ).success,
    ).toBe(false);
  });
  it("bounds execution paths and serialized WSL metadata including UNC copies", () => {
    expect(
      workspaceDirectorySelectionSchema.safeParse([
        { ...root, path: "x".repeat(MAX_WORKSPACE_EXECUTION_PATH_CHARS) },
      ]).success,
    ).toBe(true);
    expect(
      workspaceDirectorySelectionSchema.safeParse([
        { ...root, path: "x".repeat(MAX_WORKSPACE_EXECUTION_PATH_CHARS + 1) },
      ]).success,
    ).toBe(false);
    expect(
      workspaceDirectorySelectionSchema.safeParse([
        {
          kind: "wsl",
          linuxPath: "/x",
          distro: "x",
          uncPath: "x".repeat(MAX_WORKSPACE_DIRECTORY_SERIALIZED_CHARS),
        },
      ]).success,
    ).toBe(false);
    expect(
      workspaceDirectorySelectionSchema.safeParse([
        { ...root, remoteServerId: "x".repeat(MAX_WORKSPACE_DIRECTORY_SERIALIZED_CHARS) },
      ]).success,
    ).toBe(false);
    expect(
      workspaceDirectorySelectionSchema.safeParse(
        Array(16).fill({ ...root, path: "x".repeat(4096) }),
      ).success,
    ).toBe(false);
  });
  it("refuses malformed persisted authorization and unsafe revisions", () => {
    for (const value of [
      "",
      "null",
      "{}",
      "[{}]",
      '[{"kind":"posix","path":""}]',
      " ".repeat(32769) + "[]",
    ]) {
      expect(() => parseSavedWorkspaceDirectories(value)).toThrow(Error);
    }
    for (const value of [-1, 0.1, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(workspaceGrantRevisionSchema.safeParse(value).success).toBe(false);
  });
  it("adds optional read projections only; legacy start has no grant field", () => {
    const projection = threadSchema.pick({
      additionalDirectories: true,
      workspaceGrantRevision: true,
    });
    expect(projection.parse({})).toEqual({});
    expect(projection.parse({ additionalDirectories: [root], workspaceGrantRevision: 2 })).toEqual({
      additionalDirectories: [root],
      workspaceGrantRevision: 2,
    });
    expect(Object.keys(startThreadPayloadSchema.shape)).not.toContain("additionalDirectories");
    expect(Object.keys(startThreadPayloadSchema.shape)).not.toContain("workspaceGrantRevision");
  });
});
