import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitPullFromSourceResult, Project } from "@/shared/contracts";

const project = vi.hoisted(
  (): Project => ({
    id: "project-1",
    name: "Poracode",
    createdAt: "2026-07-21T00:00:00.000Z",
    location: { kind: "posix", path: "/repo" },
  }),
);

const bridgeMock = vi.hoisted(() => ({
  gitGetWorktreeSourceBranch:
    vi.fn<
      () => Promise<{ sourceBranch: string | null; commitsAhead: number; sourceAhead: number }>
    >(),
}));

const runnerMock = vi.hoisted(() => ({
  runGitMergeToSource: vi.fn<(payload: unknown) => Promise<unknown>>(),
  runGitPullFromSource: vi.fn<() => Promise<GitPullFromSourceResult>>(),
  runGitSyncCommand: vi.fn<(payload: unknown) => Promise<void>>(),
  refreshGitStatusForWorktree: vi.fn<() => Promise<void>>(),
  showGitActionError: vi.fn<(error: unknown) => void>(),
  showGitOperationFailure: vi.fn<(result: unknown) => void>(),
}));

const panelMock = vi.hoisted(() => ({
  setGitReviewContext: vi.fn<(context: { projectId: string; worktreePath: string }) => void>(),
  setGitReviewAsPanel: vi.fn<(open: boolean) => void>(),
  setGitOverlayOpen: vi.fn<(open: boolean) => void>(),
}));

vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridgeMock }));
vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: {
    getState: () => ({ projects: [project], threads: [] }),
  },
}));
vi.mock("@/renderer/state/experimentStore", () => ({ findExperimentByWorktree: () => null }));
vi.mock("@/renderer/state/gitRefresh", () => ({
  startPostPushPrStatusRefresh: vi.fn<(input: unknown) => void>(),
}));
vi.mock("@/renderer/state/panelStore", () => ({
  usePanelStore: { getState: () => panelMock },
}));
vi.mock("@/renderer/state/pullFromSourceDialogStore", () => ({
  usePullFromSourceDialogStore: {
    getState: () => ({ setDialog: vi.fn<(dialog: unknown) => void>() }),
  },
}));
vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: { getState: () => ({ gitReviewMode: "overlay" }) },
}));
vi.mock("@/renderer/utils/gitHelpers", () => ({
  resolveWorktreeBranch: () => "feature/worktree",
}));
vi.mock("@/renderer/utils/shellUtils", () => ({
  closeThreads: vi.fn<(threadIds: string[]) => Promise<void>>(),
}));
vi.mock("./gitCommandRunner", () => runnerMock);
vi.mock("./worktreeActions", () => ({
  performWorktreeRemoval:
    vi.fn<(project: Project, path: string, branch: string) => Promise<void>>(),
}));

import { gitPullFromSource } from "./gitActions";

describe("gitActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMock.gitGetWorktreeSourceBranch.mockResolvedValue({
      sourceBranch: "main",
      commitsAhead: 0,
      sourceAhead: 1,
    });
    runnerMock.refreshGitStatusForWorktree.mockResolvedValue(undefined);
  });

  it("refreshes a conflicted remote worktree before opening Git Review", async () => {
    runnerMock.runGitPullFromSource.mockResolvedValue({
      merged: false,
      fastForward: false,
      conflicting: true,
      conflictFiles: ["src/conflict.ts"],
    });

    gitPullFromSource(project.id, "/repo-worktree");

    await vi.waitFor(() => expect(panelMock.setGitOverlayOpen).toHaveBeenCalledWith(true));
    expect(runnerMock.refreshGitStatusForWorktree).toHaveBeenCalledWith(
      { kind: "posix", path: "/repo-worktree" },
      "/repo-worktree",
    );
    expect(runnerMock.refreshGitStatusForWorktree.mock.invocationCallOrder[0]).toBeLessThan(
      panelMock.setGitReviewContext.mock.invocationCallOrder[0]!,
    );
  });
});
