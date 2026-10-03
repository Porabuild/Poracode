// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import {
  isReorderNoOp,
  reorderIds,
  reorderThreadsAcrossProjects,
  reorderThreadsInProject,
} from "./reorder";

function makeThread(input: {
  id: string;
  projectId: string;
  title: string;
  updatedAt?: string;
}): Thread {
  return {
    id: input.id,
    projectId: input.projectId,
    title: input.title,
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-03-21T10:00:00.000Z",
  };
}

describe("reorderIds", () => {
  it("moves an item after the target", () => {
    expect(reorderIds(["a", "b", "c"], "a", "c", "after")).toEqual(["b", "c", "a"]);
  });

  it("moves an item before the target", () => {
    expect(reorderIds(["a", "b", "c"], "c", "a", "before")).toEqual(["c", "a", "b"]);
  });

  it("returns the same array for adjacent no-op placements", () => {
    const ids = ["a", "b", "c"];

    expect(reorderIds(ids, "a", "b", "before")).toBe(ids);
    expect(reorderIds(ids, "c", "b", "after")).toBe(ids);
  });
});

describe("isReorderNoOp", () => {
  it("detects equivalent reorder positions", () => {
    expect(isReorderNoOp(["a", "b", "c"], "a", "b", "before")).toBe(true);
    expect(isReorderNoOp(["a", "b", "c"], "c", "b", "after")).toBe(true);
    expect(isReorderNoOp(["a", "b", "c"], "a", "c", "after")).toBe(false);
  });
});

describe("reorderThreadsInProject", () => {
  it("reorders only the selected project's threads while preserving other projects", () => {
    const threads = [
      makeThread({ id: "a1", projectId: "alpha", title: "Alpha 1" }),
      makeThread({ id: "b1", projectId: "beta", title: "Beta 1" }),
      makeThread({ id: "a2", projectId: "alpha", title: "Alpha 2" }),
      makeThread({ id: "b2", projectId: "beta", title: "Beta 2" }),
    ];

    expect(
      reorderThreadsInProject(threads, "a2", "a1", "before").map((thread) => thread.id),
    ).toEqual(["a2", "b1", "a1", "b2"]);
  });

  it("ignores cross-project drops", () => {
    const threads = [
      makeThread({ id: "a1", projectId: "alpha", title: "Alpha 1" }),
      makeThread({ id: "b1", projectId: "beta", title: "Beta 1" }),
    ];

    expect(reorderThreadsInProject(threads, "a1", "b1", "after")).toBe(threads);
  });
});

describe("reorderThreadsAcrossProjects", () => {
  const threads = [
    makeThread({ id: "a1", projectId: "alpha", title: "Alpha 1" }),
    makeThread({ id: "b1", projectId: "beta", title: "Beta 1" }),
    makeThread({ id: "a2", projectId: "alpha", title: "Alpha 2" }),
    makeThread({ id: "b2", projectId: "beta", title: "Beta 2" }),
  ];

  it("moves a thread next to another project's thread", () => {
    expect(
      reorderThreadsAcrossProjects(threads, "b2", "a1", "after").map((thread) => thread.id),
    ).toEqual(["a1", "b2", "b1", "a2"]);
  });

  it("puts the thread right next to a same-project target", () => {
    expect(
      reorderThreadsAcrossProjects(threads, "a1", "a2", "after").map((thread) => thread.id),
    ).toEqual(["b1", "a2", "a1", "b2"]);
  });

  it("gives each project the same order as reorderThreadsInProject", () => {
    const projectOrder = (list: typeof threads, projectId: string) =>
      list.filter((thread) => thread.projectId === projectId).map((thread) => thread.id);

    const across = reorderThreadsAcrossProjects(threads, "a2", "a1", "before");
    const inProject = reorderThreadsInProject(threads, "a2", "a1", "before");

    expect(projectOrder(across, "alpha")).toEqual(projectOrder(inProject, "alpha"));
    expect(projectOrder(across, "beta")).toEqual(projectOrder(inProject, "beta"));
  });

  it("returns the same array for a no-op drop", () => {
    expect(reorderThreadsAcrossProjects(threads, "a1", "b1", "before")).toBe(threads);
    expect(reorderThreadsAcrossProjects(threads, "a1", "missing", "after")).toBe(threads);
  });
});
