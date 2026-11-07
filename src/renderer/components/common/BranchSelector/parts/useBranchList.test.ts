import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { getActiveWorktreeBranchNames, useBranchList } from "./useBranchList";

function makeThread(overrides: Partial<Thread> & Pick<Thread, "id" | "projectId">): Thread {
  return {
    title: "Thread",
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("getActiveWorktreeBranchNames", () => {
  it("returns sorted unique active worktree branches for the project", () => {
    const threads = [
      makeThread({ id: "t1", projectId: "p1", worktreeBranch: "feature/b" }),
      makeThread({ id: "t2", projectId: "p1", worktreeBranch: "feature/a" }),
      makeThread({ id: "thread-three", projectId: "p1", worktreeBranch: "feature/a" }),
      makeThread({ id: "t4", projectId: "p2", worktreeBranch: "feature/c" }),
      makeThread({ id: "t5", projectId: "p1", archived: true, worktreeBranch: "feature/d" }),
      makeThread({ id: "t6", projectId: "p1" }),
    ];

    expect(getActiveWorktreeBranchNames(threads, "p1")).toEqual(["feature/a", "feature/b"]);
  });

  it("ignores status-only thread updates", () => {
    const threads = [
      makeThread({ id: "t1", projectId: "p1", worktreeBranch: "feature/a" }),
      makeThread({ id: "t2", projectId: "p1", worktreeBranch: "feature/b" }),
    ];
    const updatedThreads = threads.map((thread) =>
      thread.id === "t1" ? { ...thread, status: "working" as const } : thread,
    );

    expect(getActiveWorktreeBranchNames(updatedThreads, "p1")).toEqual(
      getActiveWorktreeBranchNames(threads, "p1"),
    );
  });
});

describe("useBranchList pinned branches", () => {
  it("lists pinned branches first in pin order and filters them by search", () => {
    useAppStore.setState({
      projects: [
        {
          id: "p1",
          name: "Repo",
          location: { kind: "posix", path: "/repo" },
          createdAt: "2026-01-01T00:00:00.000Z",
          pinnedBranches: ["release", "develop", "gone"],
        },
      ],
      threads: [],
    });
    useGitStore.setState({
      branches: {
        p1: {
          current: "main",
          branches: [
            { name: "main", current: true, commit: "a", isRemote: false },
            { name: "develop", current: false, commit: "b", isRemote: false },
            { name: "release", current: false, commit: "c", isRemote: true, remote: "origin" },
            { name: "feature", current: false, commit: "d", isRemote: true, remote: "origin" },
          ],
        },
      },
    });

    const { result, rerender } = renderHook(
      ({ search }) => useBranchList({ projectId: "p1", search }),
      {
        initialProps: { search: "" },
      },
    );
    expect(result.current.items.map((item) => item.id)).toEqual([
      "header-pinned",
      "release",
      "develop",
      "header-local",
      "main",
      "header-remote",
      "feature",
    ]);

    rerender({ search: "dev" });
    expect(result.current.items.map((item) => item.id)).toEqual(["header-pinned", "develop"]);
  });
});
