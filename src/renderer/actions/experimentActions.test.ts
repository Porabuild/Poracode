import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, PromptSegment } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { launchExperiment } from "./experimentActions";

const { bridge } = vi.hoisted(() => ({
  bridge: {
    gitAddWorktree: vi.fn<() => Promise<{ path: string }>>(),
    startThread: vi.fn<() => Promise<{ threadId: string }>>(),
    gitWatchWorktrees: vi.fn<() => Promise<void>>(),
  },
}));
const { refreshGitProject, getProjectActiveWorktreePaths } = vi.hoisted(() => ({
  refreshGitProject: vi.fn<() => void>(),
  getProjectActiveWorktreePaths: vi.fn<() => string[]>(),
}));
const { performWorktreeRemoval } = vi.hoisted(() => ({
  performWorktreeRemoval: vi.fn<() => Promise<void>>(),
}));
const { toast } = vi.hoisted(() => ({
  toast: {
    danger: vi.fn<() => void>(),
    success: vi.fn<() => void>(),
  },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("@/renderer/state/gitRefresh", () => ({
  refreshGitProject,
  getProjectActiveWorktreePaths,
}));

vi.mock("@/renderer/actions/worktreeActions", () => ({
  performWorktreeRemoval,
}));

vi.mock("@heroui/react", () => ({ toast }));

describe("experimentActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectActiveWorktreePaths.mockReturnValue([]);
    performWorktreeRemoval.mockResolvedValue(undefined);
    bridge.gitWatchWorktrees.mockResolvedValue(undefined);
    bridge.startThread.mockResolvedValue({ threadId: "thread" });
    useAppStore.setState((state) => ({
      ...state,
      projects: [],
      threads: [],
      experiments: {},
      view: { kind: "home" },
      lastRuntimeConfigByThreadId: {},
    }));
  });

  it("cleans up a partial launch instead of creating a one-candidate experiment", async () => {
    bridge.gitAddWorktree
      .mockResolvedValueOnce({ path: "/repo/.worktrees/a" })
      .mockRejectedValueOnce(new Error("branch exists"));

    const result = await launchExperiment({
      project: makeProject(),
      prompt: "fix the bug",
      candidates: [
        { agentKind: "codex", agentLabel: "Codex", config: { model: "gpt-5.4" } },
        { agentKind: "claude", agentLabel: "Claude", config: { model: "opus" } },
      ],
    });

    expect(result).toBeNull();
    expect(performWorktreeRemoval).toHaveBeenCalledWith(
      makeProject(),
      "/repo/.worktrees/a",
      expect.stringMatching(/^exp\//),
    );
    expect(useAppStore.getState().threads).toEqual([]);
    expect(useAppStore.getState().experiments).toEqual({});
    expect(bridge.startThread).not.toHaveBeenCalled();
  });

  it("starts candidates with the original structured prompt segments", async () => {
    bridge.gitAddWorktree
      .mockResolvedValueOnce({ path: "/repo/.worktrees/a" })
      .mockResolvedValueOnce({ path: "/repo/.worktrees/b" });
    const segments: PromptSegment[] = [
      { kind: "text", content: "fix " },
      { kind: "file", path: "src/app.ts" },
    ];

    const result = await launchExperiment({
      project: makeProject(),
      prompt: "fix @src/app.ts",
      segments,
      candidates: [
        { agentKind: "codex", agentLabel: "Codex", config: { model: "gpt-5.4" } },
        { agentKind: "claude", agentLabel: "Claude", config: { model: "opus" } },
      ],
    });

    expect(result).toEqual(expect.any(String));
    expect(bridge.startThread).toHaveBeenCalledTimes(2);
    expect(bridge.startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "fix @src/app.ts",
        segments,
      }),
    );
  });
});

function makeProject(): Project {
  return {
    id: "project-1",
    name: "Project",
    location: { kind: "posix", path: "/repo" },
    createdAt: "2026-06-15T00:00:00.000Z",
  };
}
