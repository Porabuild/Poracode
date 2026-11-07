import { compareFilesByDirThenName } from "@/renderer/utils/gitHelpers";

export interface FileNode {
  kind: "file";
  name: string;
  path: string;
}

export interface DirNode {
  kind: "dir";
  /** One segment, or several joined with `/` when a chain of single-child folders was folded. */
  name: string;
  /** Full path of the innermost folder; unique, so it keys the collapsed set. */
  path: string;
  children: TreeNode[];
}

export type TreeNode = FileNode | DirNode;

function compress(node: DirNode): DirNode {
  let current = node;
  for (;;) {
    const only = current.children.length === 1 ? current.children[0] : undefined;
    if (only?.kind !== "dir") break;
    current = {
      kind: "dir",
      name: `${current.name}/${only.name}`,
      path: only.path,
      children: only.children,
    };
  }
  return { ...current, children: current.children.map(finish) };
}

function finish(node: TreeNode): TreeNode {
  return node.kind === "dir" ? compress(node) : node;
}

/**
 * Folder tree of changed paths: files before folders in each folder, siblings in
 * `compareFilesByDirThenName` order, single-child folder chains folded into one row.
 */
export function buildFileTree(paths: readonly string[]): TreeNode[] {
  const root: DirNode = { kind: "dir", name: "", path: "", children: [] };
  const dirs = new Map<string, DirNode>([["", root]]);
  const sorted = paths.toSorted((a, b) => compareFilesByDirThenName({ path: a }, { path: b }));
  for (const path of sorted) {
    const slash = path.lastIndexOf("/");
    let parent = root;
    if (slash >= 0) {
      let prefix = "";
      for (const segment of path.slice(0, slash).split("/")) {
        prefix = prefix ? `${prefix}/${segment}` : segment;
        let dir = dirs.get(prefix);
        if (!dir) {
          dir = { kind: "dir", name: segment, path: prefix, children: [] };
          dirs.set(prefix, dir);
          parent.children.push(dir);
        }
        parent = dir;
      }
    }
    parent.children.push({ kind: "file", name: path.slice(slash + 1), path });
  }
  for (const dir of dirs.values()) {
    dir.children = [
      ...dir.children.filter((child) => child.kind === "file"),
      ...dir.children.filter((child) => child.kind === "dir"),
    ];
  }
  return root.children.map(finish);
}

/** File paths in the order the tree shows them (the order the diff cards follow). */
export function flattenTree(nodes: readonly TreeNode[]): string[] {
  return nodes.flatMap((node) => (node.kind === "file" ? [node.path] : flattenTree(node.children)));
}
