import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { Project } from "@/shared/contracts";
import { resolveSearchScope } from "./searchScope";
const a: Project = {
  id: "a",
  name: "A",
  location: { kind: "windows", path: "C:/a" },
  createdAt: "2026-07-15T00:00:00.000Z",
};
const b: Project = { ...a, id: "b", name: "B", location: { kind: "windows", path: "C:/b" } };
const input: Parameters<typeof resolveSearchScope>[0] = {
  projects: [a, b],
  viewProjectId: "a",
  thread: { worktreePath: "C:/a/worktree", worktreeBranch: "feature-a" },
  editorRoot: null,
  editorMode: null,
  filesPanel: null,
  origin: null,
};

describe("search file scope", () => {
  it("searches the open file tree from Home without an editor overlay", () => {
    const scope = resolveSearchScope({
      ...input,
      viewProjectId: undefined,
      thread: undefined,
      editorRoot: { projectId: "b" },
      filesPanel: { projectId: "b", projectName: "B", rootLabel: "B" },
    });
    expect(scope.project?.id).toBe("b");
    expect(scope.worktreePath).toBeUndefined();
  });
  it("uses a visible editor's project/worktree ahead of the thread behind it", () => {
    const scope = resolveSearchScope({
      ...input,
      editorRoot: { projectId: "b", worktreePath: "C:/b/worktree" },
      editorMode: "modal",
    });
    expect(scope.project?.id).toBe("b");
    expect(scope.worktreePath).toBe("C:/b/worktree");
  });
  it("uses a focused tree ahead of the underlying view", () => {
    const tree = document.createElement("div");
    tree.setAttribute("data-poracode-find-scope", "tree");
    const filter = document.createElement("input");
    tree.append(filter);
    const scope = resolveSearchScope({
      ...input,
      origin: filter,
      filesPanel: {
        projectId: "b",
        projectName: "B",
        rootLabel: "B",
        worktreePath: "C:/b/worktree",
      },
    });
    expect(scope.project?.id).toBe("b");
    expect(scope.worktreePath).toBe("C:/b/worktree");
  });
  it("ignores a closed stale editor and preserves the focused thread worktree", () => {
    const scope = resolveSearchScope({
      ...input,
      editorRoot: { projectId: "b", worktreePath: "C:/b/worktree" },
    });
    expect(scope.project?.id).toBe("a");
    expect(scope.worktreePath).toBe("C:/a/worktree");
    expect(scope.worktreeBranch).toBe("feature-a");
  });
  it("preserves split-draft project scope without inventing a worktree", () => {
    const scope = resolveSearchScope({ ...input, viewProjectId: "b", thread: undefined });
    expect(scope.project?.id).toBe("b");
    expect(scope.worktreePath).toBeUndefined();
  });
});
