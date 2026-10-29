import { describe, expect, it } from "vitest";
import { buildFileTree, flattenTree, type TreeNode } from "./fileTree";

function outline(nodes: readonly TreeNode[], depth = 0): string[] {
  return nodes.flatMap((node) =>
    node.kind === "file"
      ? [`${"  ".repeat(depth)}${node.name}`]
      : [`${"  ".repeat(depth)}${node.name}/`, ...outline(node.children, depth + 1)],
  );
}

describe("buildFileTree", () => {
  it("lists files before folders and folds single-child folder chains", () => {
    const tree = buildFileTree([
      "src/renderer/views/A.tsx",
      "README.md",
      "src/renderer/views/B.tsx",
      "src/shared/x.ts",
      "src/index.ts",
      "package.json",
    ]);
    expect(outline(tree)).toEqual([
      "package.json",
      "README.md",
      "src/",
      "  index.ts",
      "  renderer/views/",
      "    A.tsx",
      "    B.tsx",
      "  shared/",
      "    x.ts",
    ]);
  });

  it("keeps the innermost folder path as the folder key", () => {
    const tree = buildFileTree(["a/b/c/one.ts", "a/b/c/two.ts"]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ kind: "dir", name: "a/b/c", path: "a/b/c" });
  });

  it("does not fold a folder that also holds a file", () => {
    const tree = buildFileTree(["a/top.ts", "a/b/deep.ts"]);
    expect(outline(tree)).toEqual(["a/", "  top.ts", "  b/", "    deep.ts"]);
  });

  it("flattens in the order the tree shows the files", () => {
    const paths = ["z/last.ts", "a/b/deep.ts", "a/top.ts", "root.ts"];
    expect(flattenTree(buildFileTree(paths))).toEqual([
      "root.ts",
      "a/top.ts",
      "a/b/deep.ts",
      "z/last.ts",
    ]);
  });

  it("returns an empty tree for no files", () => {
    expect(buildFileTree([])).toEqual([]);
  });
});
