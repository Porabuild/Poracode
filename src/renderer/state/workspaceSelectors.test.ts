import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread, Workspace } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { useSharedSettings } from "./sharedSettingsStore";
import { useWorkspaceStore } from "./workspaceStore";
import { useWorkspaceProjectFilter, useWorkspaceThreadFilter } from "./workspaceSelectors";
import { resetAdaptiveLayoutForTest } from "@/renderer/adaptiveLayout";

const workspaces: Workspace[] = [
  { id: "w1", name: "Work", createdAt: "2026-01-01T00:00:00.000Z", icon: "briefcase" },
  { id: "w2", name: "Side Hustle", createdAt: "2026-01-01T00:00:00.000Z", icon: "rocket" },
];

function makeThread(input: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Thread",
    agentKind: "claude",
    config: { model: "sonnet" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...input,
  };
}

function threadFilter(): (thread: Thread) => boolean {
  return renderHook(() => useWorkspaceThreadFilter()).result.current;
}

describe("useWorkspaceThreadFilter", () => {
  afterEach(() => {
    resetAdaptiveLayoutForTest();
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    localStorage.clear();
    useSharedSettings.setState({ workspaces });
    useWorkspaceStore.setState({ activeWorkspaceId: "w1" });
  });

  it("passes real-project threads regardless of their tag", () => {
    const isVisible = threadFilter();
    expect(isVisible(makeThread())).toBe(true);
    expect(isVisible(makeThread({ workspaceId: "w2" }))).toBe(true);
  });

  it("scopes Home threads to the active workspace, keeping untagged and dangling ones", () => {
    const isVisible = threadFilter();
    expect(isVisible(makeThread({ projectId: HOME_PROJECT_ID, workspaceId: "w1" }))).toBe(true);
    expect(isVisible(makeThread({ projectId: HOME_PROJECT_ID, workspaceId: "w2" }))).toBe(false);
    expect(isVisible(makeThread({ projectId: HOME_PROJECT_ID }))).toBe(true);
    expect(isVisible(makeThread({ projectId: HOME_PROJECT_ID, workspaceId: "w-gone" }))).toBe(true);
  });

  it("shows every group on compact web and restores desktop filtering after resize", () => {
    let compact = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", (query: string) => ({
      get matches() {
        return query.includes("max-width") && compact;
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }));
    resetAdaptiveLayoutForTest();
    const { result } = renderHook(() => ({
      project: useWorkspaceProjectFilter(),
      thread: useWorkspaceThreadFilter(),
    }));
    const project: Project = {
      id: "project-2",
      name: "Side project",
      workspaceId: "w2",
      location: { kind: "posix", path: "/side-project" },
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const homeThread = makeThread({ projectId: HOME_PROJECT_ID, workspaceId: "w2" });
    expect(result.current.project(project)).toBe(false);
    expect(result.current.thread(homeThread)).toBe(false);
    act(() => {
      compact = true;
      for (const listener of listeners) listener();
    });
    expect(result.current.project(project)).toBe(true);
    expect(result.current.thread(homeThread)).toBe(true);
    act(() => {
      compact = false;
      for (const listener of listeners) listener();
    });
    expect(result.current.project(project)).toBe(false);
    expect(result.current.thread(homeThread)).toBe(false);
  });
});
