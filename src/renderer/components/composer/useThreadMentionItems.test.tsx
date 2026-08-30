import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useWorkspaceStore } from "@/renderer/state/workspaceStore";
import type { Project, Thread } from "@/shared/contracts";
import { useThreadMentionItems } from "./useThreadMentionItems";

function makeThread(overrides: Partial<Thread> & { id: string }): Thread {
  const now = "2026-08-29T12:00:00.000Z";
  return {
    projectId: "project-1",
    title: `Thread ${overrides.id}`,
    agentKind: "claude",
    config: { model: "model-1" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeProject(id: string): Project {
  return {
    id,
    name: `Project ${id}`,
    location: { kind: "windows", path: `C:\\${id}` },
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

describe("useThreadMentionItems", () => {
  beforeEach(() => {
    useSharedSettings.setState({
      workspaces: [],
      disabledBuiltInMcpServers: {},
      disabledBuiltInMcpTools: {},
    });
    useWorkspaceStore.getState().setActiveWorkspaceId(null);
    useAppStore.setState({
      projects: [makeProject("project-1"), makeProject("project-2")],
      threads: [],
      pendingSteerByThreadId: {},
    });
  });

  it("does not re-render on unrelated store commits", () => {
    useAppStore.setState({
      threads: [makeThread({ id: "a", updatedAt: "2026-08-29T12:00:00.000Z" })],
    });
    let renders = 0;
    const hook = renderHook(() => {
      renders += 1;
      return useThreadMentionItems({ kind: "project", projectId: "project-1" });
    });
    expect(hook.result.current).toHaveLength(1);
    const rendersAfterMount = renders;

    // A commit in an unrelated slice must not re-run the consumer: the hook
    // subscribes to stable refs (threads/projects), not a derived array.
    act(() => {
      useAppStore.setState({
        pendingSteerByThreadId: { other: { id: "s", prompt: "p", stagedAt: 1 } },
      });
    });
    expect(renders).toBe(rendersAfterMount);

    // A real thread change still re-renders with fresh content.
    act(() => {
      useAppStore.setState({
        threads: [
          makeThread({ id: "a", updatedAt: "2026-08-29T12:00:00.000Z" }),
          makeThread({ id: "b", updatedAt: "2026-08-29T13:00:00.000Z" }),
        ],
      });
    });
    expect(hook.result.current.map((item) => item.threadId)).toEqual(["b", "a"]);
    expect(renders).toBeGreaterThan(rendersAfterMount);
    hook.unmount();
  });

  it("orders by recency, caps nothing at the hook level, and excludes archived/current threads", () => {
    useAppStore.setState({
      threads: [
        makeThread({ id: "old", updatedAt: "2026-08-01T00:00:00.000Z" }),
        makeThread({ id: "archived", archived: true, updatedAt: "2026-08-29T00:00:00.000Z" }),
        makeThread({ id: "new", updatedAt: "2026-08-29T23:00:00.000Z" }),
        makeThread({ id: "other-project", projectId: "project-2" }),
      ],
    });

    const hook = renderHook(() =>
      useThreadMentionItems({ kind: "project", projectId: "project-1" }, "new"),
    );

    expect(hook.result.current.map((item) => item.threadId)).toEqual(["old"]);
    hook.unmount();
  });

  it("hides Home threads partitioned into another workspace in project scope", () => {
    useSharedSettings.setState({
      workspaces: [
        {
          id: "ws-active",
          name: "Active",
          icon: "briefcase",
          createdAt: "2026-08-01T00:00:00.000Z",
        },
        { id: "ws-other", name: "Other", icon: "rocket", createdAt: "2026-08-01T00:00:00.000Z" },
      ],
    });
    useWorkspaceStore.getState().setActiveWorkspaceId("ws-active");
    useAppStore.setState({
      threads: [
        makeThread({ id: "home-visible", projectId: HOME_PROJECT_ID }),
        makeThread({ id: "home-hidden", projectId: HOME_PROJECT_ID, workspaceId: "ws-other" }),
      ],
    });

    const hook = renderHook(() =>
      useThreadMentionItems({ kind: "project", projectId: HOME_PROJECT_ID }),
    );

    expect(hook.result.current.map((item) => item.threadId)).toEqual(["home-visible"]);
    hook.unmount();
  });

  it("offers no mentions when the app-controls server or its read_thread tool is disabled", () => {
    useAppStore.setState({
      threads: [makeThread({ id: "a" })],
    });

    const serverDisabled = renderHook(() =>
      useThreadMentionItems({ kind: "project", projectId: "project-1" }),
    );
    expect(serverDisabled.result.current).toHaveLength(1);
    serverDisabled.unmount();

    act(() => {
      useSharedSettings.setState({ disabledBuiltInMcpServers: { "app-controls": true } });
    });
    const hidden = renderHook(() =>
      useThreadMentionItems({ kind: "project", projectId: "project-1" }),
    );
    expect(hidden.result.current).toHaveLength(0);
    hidden.unmount();

    act(() => {
      useSharedSettings.setState({
        disabledBuiltInMcpServers: {},
        disabledBuiltInMcpTools: { "app-controls": ["read_thread"] },
      });
    });
    const toolDisabled = renderHook(() =>
      useThreadMentionItems({ kind: "project", projectId: "project-1" }),
    );
    expect(toolDisabled.result.current).toHaveLength(0);
    toolDisabled.unmount();
  });

  it("uses live-session tool availability instead of changed global settings", () => {
    useAppStore.setState({ threads: [makeThread({ id: "a" })] });
    useSharedSettings.setState({ disabledBuiltInMcpServers: { "app-controls": true } });

    const launchedWithTool = renderHook(() =>
      useThreadMentionItems({ kind: "project", projectId: "project-1" }, undefined, true),
    );
    expect(launchedWithTool.result.current).toHaveLength(1);
    launchedWithTool.unmount();

    useSharedSettings.setState({ disabledBuiltInMcpServers: {} });
    const launchedWithoutTool = renderHook(() =>
      useThreadMentionItems({ kind: "project", projectId: "project-1" }, undefined, false),
    );
    expect(launchedWithoutTool.result.current).toHaveLength(0);
    launchedWithoutTool.unmount();
  });

  it("prioritizes worktree threads over non-worktree threads and resolves full worktree name", () => {
    useAppStore.setState({
      threads: [
        makeThread({
          id: "main-recent",
          updatedAt: "2026-08-29T20:00:00.000Z",
        }),
        makeThread({
          id: "worktree-older",
          worktreePath: "C:\\worktrees\\feature-gpu",
          worktreeBranch: "feature/gpu-support",
          updatedAt: "2026-08-29T10:00:00.000Z",
        }),
        makeThread({
          id: "worktree-newer",
          worktreePath: "C:\\worktrees\\feature-audio",
          worktreeBranch: "feature/audio-driver",
          updatedAt: "2026-08-29T15:00:00.000Z",
        }),
      ],
    });

    const hook = renderHook(() =>
      useThreadMentionItems({ kind: "project", projectId: "project-1" }),
    );

    expect(hook.result.current.map((item) => item.threadId)).toEqual([
      "worktree-newer",
      "worktree-older",
      "main-recent",
    ]);
    expect(hook.result.current[0]?.worktreeName).toBe("feature/audio-driver");
    expect(hook.result.current[1]?.worktreeName).toBe("feature/gpu-support");
    expect(hook.result.current[2]?.worktreeName).toBeUndefined();
    hook.unmount();
  });

  it("falls back to the worktree folder name for threads without a recorded branch", () => {
    useAppStore.setState({
      threads: [
        makeThread({
          id: "branchless-worktree",
          worktreePath: "C:\\worktrees\\feature-gpu",
          updatedAt: "2026-08-29T10:00:00.000Z",
        }),
      ],
    });

    const hook = renderHook(() =>
      useThreadMentionItems({ kind: "project", projectId: "project-1" }),
    );

    expect(hook.result.current).toHaveLength(1);
    expect(hook.result.current[0]?.worktreeName).toBe("feature-gpu");
    hook.unmount();
  });

  it("prioritizes current worktree threads first when currentWorktreePath is provided", () => {
    useAppStore.setState({
      threads: [
        makeThread({
          id: "main-thread",
          updatedAt: "2026-08-29T20:00:00.000Z",
        }),
        makeThread({
          id: "other-worktree",
          worktreePath: "C:\\worktrees\\other-branch",
          worktreeBranch: "feature/other",
          updatedAt: "2026-08-29T18:00:00.000Z",
        }),
        makeThread({
          id: "current-worktree",
          worktreePath: "C:\\worktrees\\my-current-worktree",
          worktreeBranch: "feature/my-worktree",
          updatedAt: "2026-08-29T10:00:00.000Z",
        }),
      ],
    });

    const hook = renderHook(() =>
      useThreadMentionItems({
        kind: "project",
        projectId: "project-1",
        currentWorktreePath: "C:/worktrees/my-current-worktree",
      }),
    );

    expect(hook.result.current.map((item) => item.threadId)).toEqual([
      "current-worktree",
      "other-worktree",
      "main-thread",
    ]);
    hook.unmount();
  });
});
