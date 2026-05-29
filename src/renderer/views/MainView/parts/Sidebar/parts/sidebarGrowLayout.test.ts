import { describe, expect, it } from "vitest";
import {
  resolveGrowableProjectId,
  resolveProjectThreadListMaxHeight,
  SIDEBAR_THREAD_LIST_MAX_HEIGHT_PX,
} from "./sidebarGrowLayout";

describe("resolveGrowableProjectId", () => {
  it("returns the only expanded project", () => {
    expect(
      resolveGrowableProjectId({
        projectExpansionTokens: ["project-a", 0],
        collapsedProjects: {},
        collapsedWorktrees: {},
        homeScopeEnabled: false,
        sortMode: "manual",
        threads: [],
      }),
    ).toBe("project-a");
  });

  it("returns the single overflowing project when multiple are expanded", () => {
    const threads = Array.from({ length: 20 }, (_, index) => ({
      id: `thread-${index}`,
      projectId: "project-b",
      archived: false,
    })) as never[];

    expect(
      resolveGrowableProjectId({
        projectExpansionTokens: ["project-a", 0, "project-b", 0],
        collapsedProjects: {},
        collapsedWorktrees: {},
        homeScopeEnabled: false,
        sortMode: "manual",
        threads,
      }),
    ).toBe("project-b");
  });

  it("returns null when multiple expanded projects overflow", () => {
    const threads = [
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `a-${index}`,
        projectId: "project-a",
        archived: false,
      })),
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `b-${index}`,
        projectId: "project-b",
        archived: false,
      })),
    ] as never[];

    expect(
      resolveGrowableProjectId({
        projectExpansionTokens: ["project-a", 0, "project-b", 0],
        collapsedProjects: {},
        collapsedWorktrees: {},
        homeScopeEnabled: false,
        sortMode: "manual",
        threads,
      }),
    ).toBeNull();
  });

  it("returns null when multiple expanded projects fit within the cap", () => {
    const threads = [
      { id: "a-1", projectId: "project-a", archived: false },
      { id: "b-1", projectId: "project-b", archived: false },
    ] as never[];

    expect(
      resolveGrowableProjectId({
        projectExpansionTokens: ["project-a", 0, "project-b", 0],
        collapsedProjects: {},
        collapsedWorktrees: {},
        homeScopeEnabled: false,
        sortMode: "manual",
        threads,
      }),
    ).toBeNull();
  });
});

describe("resolveProjectThreadListMaxHeight", () => {
  it("uses natural height for short lists", () => {
    expect(
      resolveProjectThreadListMaxHeight({
        growableProjectId: "project-a",
        projectId: "project-a",
        itemContentHeightPx: 30,
      }),
    ).toBeUndefined();
  });

  it("caps non-grow targets at the default max height", () => {
    expect(
      resolveProjectThreadListMaxHeight({
        growableProjectId: "project-b",
        projectId: "project-a",
        itemContentHeightPx: SIDEBAR_THREAD_LIST_MAX_HEIGHT_PX + 40,
      }),
    ).toBe(`${SIDEBAR_THREAD_LIST_MAX_HEIGHT_PX}px`);
  });

  it("expands grow targets to the measured item height", () => {
    expect(
      resolveProjectThreadListMaxHeight({
        growableProjectId: "project-b",
        projectId: "project-b",
        itemContentHeightPx: SIDEBAR_THREAD_LIST_MAX_HEIGHT_PX + 40,
      }),
    ).toBe(`${SIDEBAR_THREAD_LIST_MAX_HEIGHT_PX + 40}px`);
  });
});
