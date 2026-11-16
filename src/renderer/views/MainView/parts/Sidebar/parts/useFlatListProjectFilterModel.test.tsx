import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { useWorkspaceStore } from "@/renderer/state/workspaceStore";
import { useFlatListProjectFilterModel } from "./useFlatListProjectFilterModel";

const layoutMock = vi.hoisted(() => ({ compact: false }));
vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => layoutMock.compact }));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({}),
  isWindows: () => true,
  isMac: () => false,
}));

const project = (id: string): Project =>
  ({
    id,
    name: id,
    location: { kind: "windows", path: `C:\\${id}` },
    createdAt: "2026-07-01T00:00:00.000Z",
    workspaceId: "w1",
  }) as Project;

const thread = (id: string, projectId: string, done: boolean): Thread =>
  ({
    id,
    projectId,
    title: id,
    status: "inactive",
    done,
    starred: false,
    archived: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    agentKind: "claude",
  }) as unknown as Thread;

describe("useFlatListProjectFilterModel Done view", () => {
  beforeEach(() => {
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useSharedSettings.setState({
      homeScopeEnabled: false,
      workspaces: [{ id: "w1", name: "W" }],
    } as never);
    useWorkspaceStore.setState({ activeWorkspaceId: "w1" });
    useSidebarUiStore.setState({ flatListProjectFilter: null, flatListShowDone: true });
    useAppStore.setState({
      projects: [project("a"), project("b")],
      threads: [thread("a1", "a", false), thread("a2", "a", true), thread("b1", "b", true)],
    });
  });

  it("narrows compact lists to the selected view and counts done threads in the project filter", () => {
    layoutMock.compact = true;
    const { result, rerender } = renderHook(() => useFlatListProjectFilterModel());
    expect(result.current.showDone).toBe(true);
    expect(result.current.visibleThreads.map((t) => t.id)).toEqual(["a2", "b1"]);
    expect(result.current.listableThreads).toHaveLength(3);
    expect(result.current.doneThreadCount).toBe(2);
    expect(result.current.threadCounts.get("a")).toBe(1);

    useSidebarUiStore.setState({ flatListProjectFilter: ["a"] });
    rerender();
    expect(result.current.doneThreadCount).toBe(1);

    useSidebarUiStore.setState({ flatListShowDone: false });
    rerender();
    expect(result.current.visibleThreads.map((t) => t.id)).toEqual(["a1"]);
  });

  it("never narrows outside the compact layout, so desktop lists keep their Done section", () => {
    layoutMock.compact = false;
    const { result } = renderHook(() => useFlatListProjectFilterModel());
    expect(result.current.showDone).toBe(false);
    expect(result.current.visibleThreads).toHaveLength(3);
    expect(result.current.doneThreadCount).toBe(0);
  });
});
