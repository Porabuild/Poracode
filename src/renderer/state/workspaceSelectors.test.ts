import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Thread, Workspace } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { useSharedSettings } from "./sharedSettingsStore";
import { useWorkspaceStore } from "./workspaceStore";
import { useWorkspaceThreadFilter } from "./workspaceSelectors";

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
});
