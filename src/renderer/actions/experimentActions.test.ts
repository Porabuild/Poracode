import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_EXPERIMENT_PROMPT_LENGTH,
  type Experiment,
  type Project,
  type Thread,
} from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadLiveWorkflowStore } from "@/renderer/state/threadLiveWorkflowStore";
import {
  crownExperiment,
  discardExperiment,
  launchExperiment,
  mergeExperimentWinner,
  retryExperimentCleanup,
} from "./experimentActions";

const mocks = vi.hoisted(() => ({
  judgeAgents: [] as Array<{
    kind: string;
    label: string;
    installed: boolean;
    authState: string;
    capabilities: { supportsOneShot: boolean; supportsTextOnlyOneShot: boolean };
  }>,
  bridge: {
    gitListBranches: vi.fn<
      (payload: unknown) => Promise<{
        current: string;
        branches: Array<{ name: string; current: boolean; commit: string; isRemote: boolean }>;
      }>
    >(),
    gitAddWorktree: vi.fn<(payload: unknown) => Promise<{ path: string }>>(),
    getExperimentCandidateDiff:
      vi.fn<(payload: unknown) => Promise<{ diff: string; headCommit: string }>>(),
    judgeExperiment:
      vi.fn<(payload: unknown) => Promise<{ winnerThreadId: string; rationale: string }>>(),
    getGitStatus:
      vi.fn<
        (payload: unknown) => Promise<{ branch: string; staged: unknown[]; unstaged: unknown[] }>
      >(),
    gitCommit: vi.fn<(payload: unknown) => Promise<{ hash: string; message: string }>>(),
    gitGetWorktreeSourceBranch: vi.fn<
      (payload: unknown) => Promise<{
        sourceBranch: string;
        ownerToken?: string | null;
        commitsAhead?: number;
        sourceAhead?: number;
      }>
    >(),
    gitGetWorktreeOwner: vi.fn<
      (payload: unknown) => Promise<{
        ownerToken: string | null;
      }>
    >(),
    gitListWorktrees: vi.fn<
      (payload: unknown) => Promise<{
        worktrees: Array<{ path: string; branch: string }>;
      }>
    >(),
    gitDeleteBranch: vi.fn<(payload: unknown) => Promise<void>>(),
    closeThread: vi.fn<(payload: unknown) => Promise<void>>(),
    dbSetState: vi.fn<(key: string, value: string) => Promise<void>>(),
    dbUpsertThread: vi.fn<(thread: Thread) => Promise<void>>(),
    dbDeleteThread: vi.fn<(threadId: string) => Promise<void>>(),
  },
  performInitialThreadLaunch: vi.fn<(input: unknown) => Promise<void>>(),
  performWorktreeRemoval:
    vi.fn<
      (project: unknown, path: string, branch?: string, ownerToken?: string) => Promise<boolean>
    >(),
  primeWorktreeGitState: vi.fn<(project: unknown, path: string) => Promise<void>>(),
  runWorktreeSetupScript: vi.fn<(project: unknown, path: string, script: string) => void>(),
  refreshGitProject: vi.fn<(...args: unknown[]) => void>(),
  runGitMergeToSource:
    vi.fn<(payload: unknown) => Promise<{ merged: boolean; fastForward: boolean }>>(),
  showGitOperationFailure: vi.fn<(result: unknown) => void>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => mocks.bridge,
}));
vi.mock("@/shared/agentStatus", () => ({
  getProjectAgentStatuses: () => mocks.judgeAgents,
}));
vi.mock("./threadLaunchActions", () => ({
  performInitialThreadLaunch: mocks.performInitialThreadLaunch,
}));
vi.mock("./worktreeActions", () => ({
  performWorktreeRemoval: mocks.performWorktreeRemoval,
}));
vi.mock("./worktreeLaunchActions", () => ({
  primeWorktreeGitState: mocks.primeWorktreeGitState,
  runWorktreeSetupScript: mocks.runWorktreeSetupScript,
}));
vi.mock("@/renderer/state/gitRefresh", () => ({
  refreshGitProject: mocks.refreshGitProject,
}));
vi.mock("./gitCommandRunner", () => ({
  runGitMergeToSource: mocks.runGitMergeToSource,
  showGitOperationFailure: mocks.showGitOperationFailure,
}));

const project: Project = {
  id: "project-1",
  name: "Project",
  location: { kind: "posix", path: "/repo" },
  scripts: {
    actions: [],
    setupScript: "pnpm install",
    worktreeCopyPatterns: [".env.example"],
  },
  createdAt: "2026-07-13T00:00:00.000Z",
};

const BASE_COMMIT = "a".repeat(40);
const CANDIDATE_COMMIT = "c".repeat(40);

function ownerTokenForBranch(branch: string): string | null {
  if (branch === "poracode/one") return "experiment-1:thread-1";
  if (branch === "poracode/two") return "experiment-1:thread-2";
  return null;
}

function thread(id: string, worktreePath: string, worktreeBranch: string): Thread {
  return {
    id,
    projectId: project.id,
    title: id,
    agentKind: "codex",
    config: { model: "gpt-5", effort: "high", fast: true },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    worktreePath,
    worktreeBranch,
    groupId: "experiment-1",
    groupName: "Experiment",
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
  };
}

function experiment(): Experiment {
  return {
    id: "experiment-1",
    projectId: project.id,
    title: "Experiment",
    prompt: "Implement it",
    baseBranch: "main",
    baseCommit: BASE_COMMIT,
    candidates: [
      {
        threadId: "thread-1",
        agentKind: "codex",
        model: "gpt-5",
        effort: "high",
        fast: true,
        worktreePath: "/repo/one",
        worktreeBranch: "poracode/one",
        worktreeOwnerToken: "experiment-1:thread-1",
        worktreeState: "owned",
      },
      {
        threadId: "thread-2",
        agentKind: "codex",
        model: "gpt-5",
        worktreePath: "/repo/two",
        worktreeBranch: "poracode/two",
        worktreeOwnerToken: "experiment-1:thread-2",
        worktreeState: "owned",
      },
    ],
    status: "running",
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
  };
}

describe("experimentActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.judgeAgents = [
      {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: { supportsOneShot: true, supportsTextOnlyOneShot: true },
      },
    ];
    localStorage.clear();
    useAppStore.setState((state) => ({
      ...state,
      projects: [project],
      threads: [],
      view: { kind: "home" },
    }));
    useExperimentStore.setState({ experiments: {} });
    useSharedSettings.setState({ disabledAgents: [] });
    useThreadLiveWorkflowStore.setState({ liveThreadIds: new Set<string>() });
    mocks.bridge.gitListBranches.mockResolvedValue({
      current: "main",
      branches: [{ name: "main", current: true, commit: BASE_COMMIT, isRemote: false }],
    });
    mocks.bridge.gitListWorktrees.mockResolvedValue({
      worktrees: [
        { path: "/repo/one", branch: "poracode/one" },
        { path: "/repo/two", branch: "poracode/two" },
      ],
    });
    mocks.bridge.gitAddWorktree
      .mockResolvedValueOnce({ path: "/repo/one" })
      .mockResolvedValueOnce({ path: "/repo/two" });
    mocks.performInitialThreadLaunch.mockResolvedValue(undefined);
    mocks.performWorktreeRemoval.mockResolvedValue(true);
    mocks.bridge.closeThread.mockResolvedValue(undefined);
    mocks.bridge.gitDeleteBranch.mockResolvedValue(undefined);
    mocks.bridge.gitGetWorktreeSourceBranch.mockReset().mockImplementation(async (payload) => ({
      sourceBranch: "main",
      ownerToken: ownerTokenForBranch((payload as { branch: string }).branch),
    }));
    mocks.bridge.gitGetWorktreeOwner.mockReset().mockImplementation(async (payload) => ({
      ownerToken: ownerTokenForBranch((payload as { branch: string }).branch),
    }));
    mocks.bridge.dbSetState.mockResolvedValue(undefined);
    mocks.bridge.dbUpsertThread.mockResolvedValue(undefined);
    mocks.bridge.dbDeleteThread.mockResolvedValue(undefined);
    mocks.bridge.getExperimentCandidateDiff.mockResolvedValue({
      diff: "",
      headCommit: CANDIDATE_COMMIT,
    });
    mocks.bridge.getGitStatus.mockImplementation(async (payload) => {
      const path = (payload as { projectLocation: { path: string } }).projectLocation.path;
      return {
        branch: path.endsWith("/two") ? "poracode/two" : "poracode/one",
        staged: [],
        unstaged: [],
      };
    });
  });

  it("fans out from one frozen commit using normal thread creation and launch semantics", async () => {
    const id = await launchExperiment({
      projectId: project.id,
      prompt: "Implement it",
      segments: [{ kind: "text", content: "Implement it" }],
      baseBranch: "main",
      candidates: [
        {
          agentKind: "codex",
          agentLabel: "Codex",
          config: { model: "gpt-5", effort: "high" },
          presentationMode: "gui",
        },
        {
          agentKind: "claude",
          agentLabel: "Claude",
          config: { model: "opus" },
          presentationMode: "terminal",
        },
      ],
    });

    expect(id).toBeTruthy();
    expect(mocks.bridge.gitAddWorktree).toHaveBeenCalledTimes(2);
    expect(mocks.bridge.dbSetState.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.bridge.gitAddWorktree.mock.invocationCallOrder[0]!,
    );
    expect(mocks.bridge.dbUpsertThread.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.bridge.dbSetState.mock.invocationCallOrder[0]!,
    );
    expect(mocks.bridge.dbUpsertThread.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.bridge.gitAddWorktree.mock.invocationCallOrder[0]!,
    );
    expect(
      mocks.bridge.gitAddWorktree.mock.calls.map(
        (call) => (call[0] as { startPoint: string }).startPoint,
      ),
    ).toEqual([BASE_COMMIT, BASE_COMMIT]);
    expect(
      mocks.bridge.gitAddWorktree.mock.calls.map(
        (call) => (call[0] as { sourceBranch: string }).sourceBranch,
      ),
    ).toEqual(["main", "main"]);
    const ownerTokens = mocks.bridge.gitAddWorktree.mock.calls.map(
      (call) => (call[0] as { ownerToken: string }).ownerToken,
    );
    expect(ownerTokens.every((ownerToken) => ownerToken.startsWith(`${id}:`))).toBe(true);
    expect(new Set(ownerTokens).size).toBe(2);
    expect(useAppStore.getState().threads).toHaveLength(2);
    expect(mocks.performInitialThreadLaunch).toHaveBeenCalledTimes(2);
    expect(
      mocks.performInitialThreadLaunch.mock.calls.map(
        (call) => (call[0] as { thread: Thread }).thread.worktreePath,
      ),
    ).toEqual(["/repo/one", "/repo/two"]);
    expect(mocks.runWorktreeSetupScript).toHaveBeenCalledTimes(2);
    expect(useExperimentStore.getState().experiments[id!]).toMatchObject({
      baseBranch: "main",
      baseCommit: BASE_COMMIT,
      status: "running",
    });
    expect(useAppStore.getState().view).toEqual({
      kind: "experiment",
      experimentId: id,
      projectId: project.id,
    });
  });

  it("rejects an overlong prompt before creating threads or worktrees", async () => {
    await expect(
      launchExperiment({
        projectId: project.id,
        prompt: "x".repeat(MAX_EXPERIMENT_PROMPT_LENGTH + 1),
        baseBranch: "main",
        candidates: [
          { agentKind: "codex", config: { model: "gpt-5" }, presentationMode: "gui" },
          { agentKind: "claude", config: { model: "opus" }, presentationMode: "terminal" },
        ],
      }),
    ).resolves.toBeNull();

    expect(mocks.bridge.gitListBranches).not.toHaveBeenCalled();
    expect(mocks.bridge.gitAddWorktree).not.toHaveBeenCalled();
    expect(mocks.bridge.dbUpsertThread).not.toHaveBeenCalled();
    expect(mocks.bridge.dbSetState).not.toHaveBeenCalled();
    expect(mocks.performInitialThreadLaunch).not.toHaveBeenCalled();
    expect(useAppStore.getState().threads).toEqual([]);
    expect(useExperimentStore.getState().experiments).toEqual({});
  });

  it("does not delete an unproven worktree when worktree creation rejects", async () => {
    mocks.bridge.gitAddWorktree
      .mockReset()
      .mockResolvedValueOnce({ path: "/repo/one" })
      .mockResolvedValueOnce({ path: "/repo/two" })
      .mockRejectedValueOnce(new Error("metadata rollback failed"));
    mocks.bridge.gitListWorktrees.mockImplementation(async () => ({
      worktrees: [
        {
          path: "/repo/orphan",
          branch: (mocks.bridge.gitAddWorktree.mock.calls[2]![0] as { branch: string }).branch,
        },
      ],
    }));

    const id = await launchExperiment({
      projectId: project.id,
      prompt: "Implement it",
      baseBranch: "main",
      candidates: [
        { agentKind: "codex", config: { model: "gpt-5" }, presentationMode: "gui" },
        { agentKind: "claude", config: { model: "opus" }, presentationMode: "terminal" },
        { agentKind: "grok", config: { model: "grok-4" }, presentationMode: "terminal" },
      ],
    });

    const orphanBranch = (mocks.bridge.gitAddWorktree.mock.calls[2]![0] as { branch: string })
      .branch;
    expect(id).toBeTruthy();
    expect(
      mocks.performWorktreeRemoval.mock.calls.some(([, path]) => path === "/repo/orphan"),
    ).toBe(false);
    expect(useExperimentStore.getState().experiments[id!]?.candidates).toHaveLength(3);
    expect(
      useExperimentStore
        .getState()
        .experiments[id!]?.candidates.find(
          (candidate) => candidate.worktreeBranch === orphanBranch,
        ),
    ).toMatchObject({ worktreeState: "pending" });
    expect(useAppStore.getState().threads).toHaveLength(3);
  });

  it("stops cleanly when the base branches cannot be loaded", async () => {
    mocks.bridge.gitListBranches.mockRejectedValueOnce(new Error("Git unavailable"));

    await expect(
      launchExperiment({
        projectId: project.id,
        prompt: "Implement it",
        baseBranch: "main",
        candidates: [
          {
            agentKind: "codex",
            config: { model: "gpt-5" },
            presentationMode: "gui",
          },
          {
            agentKind: "claude",
            config: { model: "opus" },
            presentationMode: "terminal",
          },
        ],
      }),
    ).resolves.toBeNull();
    expect(mocks.bridge.gitAddWorktree).not.toHaveBeenCalled();
    expect(useExperimentStore.getState().experiments).toEqual({});
  });

  it("opens the experiment board while candidate launches are still starting", async () => {
    const launchResolvers: Array<() => void> = [];
    mocks.performInitialThreadLaunch.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          launchResolvers.push(resolve);
        }),
    );

    const launch = launchExperiment({
      projectId: project.id,
      prompt: "Implement it",
      baseBranch: "main",
      candidates: [
        { agentKind: "codex", config: { model: "gpt-5" }, presentationMode: "gui" },
        { agentKind: "claude", config: { model: "opus" }, presentationMode: "terminal" },
      ],
    });

    await vi.waitFor(() => expect(useAppStore.getState().view.kind).toBe("experiment"));
    const experimentId = Object.keys(useExperimentStore.getState().experiments)[0];
    expect(useAppStore.getState().view).toEqual({
      kind: "experiment",
      experimentId,
      projectId: project.id,
    });
    await vi.waitFor(() => expect(launchResolvers).toHaveLength(2));
    for (const resolve of launchResolvers) resolve();
    const id = await launch;
    expect(id).toBe(experimentId);
  });

  it("judges the complete frozen-base candidate patches and records the winning snapshot", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        thread("thread-1", "/repo/one", "poracode/one"),
        thread("thread-2", "/repo/two", "poracode/two"),
      ],
    }));
    useExperimentStore.getState().addExperiment(experiment());
    mocks.bridge.getExperimentCandidateDiff
      .mockResolvedValueOnce({ diff: "diff --git a/one b/one", headCommit: CANDIDATE_COMMIT })
      .mockResolvedValueOnce({ diff: "diff --git a/two b/two", headCommit: CANDIDATE_COMMIT });
    mocks.bridge.judgeExperiment.mockResolvedValue({
      winnerThreadId: "thread-2",
      rationale: "The second solution is simpler.",
    });

    await expect(crownExperiment("experiment-1")).resolves.toBe(true);

    expect(mocks.bridge.getExperimentCandidateDiff).toHaveBeenNthCalledWith(1, {
      projectLocation: { kind: "posix", path: "/repo/one" },
      baseRef: BASE_COMMIT,
    });
    expect(mocks.bridge.judgeExperiment).toHaveBeenCalledWith(
      expect.objectContaining({
        effort: "high",
        fast: true,
        candidates: [
          { threadId: "thread-1", diff: "diff --git a/one b/one" },
          { threadId: "thread-2", diff: "diff --git a/two b/two" },
        ],
      }),
    );
    expect(useExperimentStore.getState().experiments["experiment-1"]?.crown).toMatchObject({
      threadId: "thread-2",
      source: "ai",
      rationale: "The second solution is simpler.",
    });
  });

  it("uses an installed text-only judge even when it is not a candidate provider", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        thread("thread-1", "/repo/one", "poracode/one"),
        thread("thread-2", "/repo/two", "poracode/two"),
      ],
    }));
    useExperimentStore.getState().addExperiment(experiment());
    mocks.judgeAgents = [
      {
        kind: "claude",
        label: "Claude",
        installed: true,
        authState: "authenticated",
        capabilities: { supportsOneShot: true, supportsTextOnlyOneShot: true },
      },
    ];
    mocks.bridge.getExperimentCandidateDiff
      .mockResolvedValueOnce({ diff: "first", headCommit: CANDIDATE_COMMIT })
      .mockResolvedValueOnce({ diff: "second", headCommit: CANDIDATE_COMMIT });
    mocks.bridge.judgeExperiment.mockResolvedValue({
      winnerThreadId: "thread-1",
      rationale: "The first solution is safer.",
    });

    await expect(crownExperiment("experiment-1")).resolves.toBe(true);

    expect(mocks.bridge.judgeExperiment).toHaveBeenCalledWith(
      expect.objectContaining({ agentKind: "claude" }),
    );
    expect(mocks.bridge.judgeExperiment.mock.calls[0]?.[0]).not.toHaveProperty("model");
  });

  it("uses the explicitly selected candidate configuration for judging", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        thread("thread-1", "/repo/one", "poracode/one"),
        {
          ...thread("thread-2", "/repo/two", "poracode/two"),
          config: { model: "gpt-5-mini", effort: "low", fast: false },
        },
      ],
    }));
    useExperimentStore.getState().addExperiment(experiment());
    mocks.bridge.getExperimentCandidateDiff
      .mockResolvedValueOnce({ diff: "first", headCommit: CANDIDATE_COMMIT })
      .mockResolvedValueOnce({ diff: "second", headCommit: CANDIDATE_COMMIT });
    mocks.bridge.judgeExperiment.mockResolvedValue({
      winnerThreadId: "thread-1",
      rationale: "The first solution is safer.",
    });

    await expect(
      crownExperiment("experiment-1", { agentKind: "codex", threadId: "thread-2" }),
    ).resolves.toBe(true);

    expect(mocks.bridge.judgeExperiment).toHaveBeenCalledWith(
      expect.objectContaining({
        agentKind: "codex",
        model: "gpt-5-mini",
        effort: "low",
        fast: false,
      }),
    );
  });

  it("does not invoke an unavailable text-only judge", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        thread("thread-1", "/repo/one", "poracode/one"),
        thread("thread-2", "/repo/two", "poracode/two"),
      ],
    }));
    useExperimentStore.getState().addExperiment(experiment());
    mocks.judgeAgents = [
      {
        kind: "codex",
        label: "Codex",
        installed: false,
        authState: "missing",
        capabilities: { supportsOneShot: true, supportsTextOnlyOneShot: true },
      },
    ];
    mocks.bridge.getExperimentCandidateDiff
      .mockResolvedValueOnce({ diff: "first", headCommit: CANDIDATE_COMMIT })
      .mockResolvedValueOnce({ diff: "second", headCommit: CANDIDATE_COMMIT });

    await expect(crownExperiment("experiment-1")).resolves.toBe(false);

    expect(mocks.bridge.judgeExperiment).not.toHaveBeenCalled();
  });

  it("commits dirty winner changes before merging and removes all candidate resources", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        thread("thread-1", "/repo/one", "poracode/one"),
        thread("thread-2", "/repo/two", "poracode/two"),
      ],
    }));
    useExperimentStore.getState().addExperiment({
      ...experiment(),
      crown: {
        threadId: "thread-1",
        source: "user",
        createdAt: "2026-07-13T00:01:00.000Z",
      },
    });
    mocks.bridge.getGitStatus.mockResolvedValue({
      branch: "poracode/one",
      staged: [],
      unstaged: [{ path: "src/a.ts" }],
    });
    mocks.bridge.gitCommit.mockResolvedValue({ hash: "def456", message: "" });
    mocks.bridge.gitGetWorktreeSourceBranch.mockImplementation(async (payload) => ({
      sourceBranch: "main",
      ownerToken: ownerTokenForBranch((payload as { branch: string }).branch),
    }));
    mocks.runGitMergeToSource.mockResolvedValue({ merged: true, fastForward: true });

    await expect(mergeExperimentWinner("experiment-1")).resolves.toBe(true);

    expect(mocks.bridge.gitCommit).toHaveBeenCalledWith({
      projectLocation: { kind: "posix", path: "/repo/one" },
      message: "chore: apply experiment winner",
      addAll: true,
    });
    expect(mocks.runGitMergeToSource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceBranch: "main",
        worktreeBranch: "poracode/one",
        expectedWorktreeCommit: CANDIDATE_COMMIT,
      }),
    );
    expect(mocks.performWorktreeRemoval).toHaveBeenNthCalledWith(
      1,
      project,
      "/repo/one",
      "poracode/one",
      "experiment-1:thread-1",
    );
    expect(mocks.performWorktreeRemoval).toHaveBeenNthCalledWith(
      2,
      project,
      "/repo/two",
      "poracode/two",
      "experiment-1:thread-2",
    );
    expect(useExperimentStore.getState().experiments["experiment-1"]).toMatchObject({
      status: "decided",
      winnerThreadId: "thread-1",
    });
    expect(
      useAppStore.getState().threads.find((item) => item.id === "thread-1"),
    ).not.toHaveProperty("worktreePath");
    expect(
      useAppStore.getState().threads.find((item) => item.id === "thread-2"),
    ).not.toHaveProperty("worktreePath");
    expect(
      useExperimentStore
        .getState()
        .experiments["experiment-1"]?.candidates.map((candidate) => candidate.worktreeState),
    ).toEqual(["removed", "removed"]);
  });

  it("rejects an AI winner when any candidate changed after judging", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        thread("thread-1", "/repo/one", "poracode/one"),
        thread("thread-2", "/repo/two", "poracode/two"),
      ],
    }));
    useExperimentStore.getState().addExperiment(experiment());
    mocks.bridge.getExperimentCandidateDiff
      .mockResolvedValueOnce({ diff: "first", headCommit: CANDIDATE_COMMIT })
      .mockResolvedValueOnce({ diff: "second", headCommit: CANDIDATE_COMMIT });
    mocks.bridge.judgeExperiment.mockResolvedValue({
      winnerThreadId: "thread-1",
      rationale: "The first solution is better.",
    });
    await crownExperiment("experiment-1");
    mocks.bridge.getExperimentCandidateDiff
      .mockResolvedValueOnce({ diff: "first", headCommit: CANDIDATE_COMMIT })
      .mockResolvedValueOnce({ diff: "second changed", headCommit: CANDIDATE_COMMIT });

    await expect(mergeExperimentWinner("experiment-1")).resolves.toBe(false);

    expect(mocks.bridge.gitCommit).not.toHaveBeenCalled();
    expect(mocks.runGitMergeToSource).not.toHaveBeenCalled();
  });

  it("rejects comparison when a candidate leaves its recorded branch", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        thread("thread-1", "/repo/one", "poracode/one"),
        thread("thread-2", "/repo/two", "poracode/two"),
      ],
    }));
    useExperimentStore.getState().addExperiment(experiment());
    mocks.bridge.getGitStatus.mockResolvedValueOnce({
      branch: "other",
      staged: [],
      unstaged: [],
    });

    await expect(crownExperiment("experiment-1")).resolves.toBe(false);
    expect(mocks.bridge.judgeExperiment).not.toHaveBeenCalled();
  });

  it("rejects merging when worktree metadata points at a different source branch", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        thread("thread-1", "/repo/one", "poracode/one"),
        thread("thread-2", "/repo/two", "poracode/two"),
      ],
    }));
    useExperimentStore.getState().addExperiment({
      ...experiment(),
      crown: {
        threadId: "thread-1",
        source: "user",
        createdAt: "2026-07-13T00:01:00.000Z",
      },
    });
    mocks.bridge.getGitStatus.mockResolvedValue({
      branch: "poracode/one",
      staged: [],
      unstaged: [],
    });
    mocks.bridge.gitGetWorktreeSourceBranch.mockImplementation(async (payload) => ({
      sourceBranch: "release",
      ownerToken: ownerTokenForBranch((payload as { branch: string }).branch),
    }));

    await expect(mergeExperimentWinner("experiment-1")).resolves.toBe(false);

    expect(mocks.runGitMergeToSource).not.toHaveBeenCalled();
  });

  it("does not discard candidates with a live background workflow", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        thread("thread-1", "/repo/one", "poracode/one"),
        thread("thread-2", "/repo/two", "poracode/two"),
      ],
    }));
    useExperimentStore.getState().addExperiment(experiment());
    useThreadLiveWorkflowStore.setState({ liveThreadIds: new Set(["thread-1"]) });

    await expect(discardExperiment("experiment-1")).resolves.toBe(false);

    expect(mocks.bridge.closeThread).not.toHaveBeenCalled();
    expect(mocks.performWorktreeRemoval).not.toHaveBeenCalled();
  });

  it("keeps the complete experiment record when discard cleanup is partial", async () => {
    const threads = [
      thread("thread-1", "/repo/one", "poracode/one"),
      thread("thread-2", "/repo/two", "poracode/two"),
    ];
    useAppStore.setState((state) => ({
      ...state,
      threads,
      view: { kind: "experiment", experimentId: "experiment-1", projectId: project.id },
    }));
    useExperimentStore.getState().addExperiment(experiment());
    mocks.performWorktreeRemoval.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(discardExperiment("experiment-1")).resolves.toBe(false);

    expect(useExperimentStore.getState().experiments["experiment-1"]?.candidates).toHaveLength(2);
    expect(useAppStore.getState().threads.map((item) => item.id)).toEqual(["thread-1", "thread-2"]);
    expect(useAppStore.getState().view).toEqual({
      kind: "experiment",
      experimentId: "experiment-1",
      projectId: project.id,
    });
  });

  it("does not remove worktrees when a candidate runtime cannot be stopped", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        thread("thread-1", "/repo/one", "poracode/one"),
        thread("thread-2", "/repo/two", "poracode/two"),
      ],
    }));
    useExperimentStore.getState().addExperiment(experiment());
    mocks.bridge.closeThread.mockRejectedValueOnce(new Error("runtime did not stop"));

    await expect(discardExperiment("experiment-1")).resolves.toBe(false);

    expect(mocks.performWorktreeRemoval).not.toHaveBeenCalled();
    expect(useExperimentStore.getState().experiments["experiment-1"]).toBeDefined();
  });

  it("recovers candidate worktree paths from their branches after an interrupted launch", async () => {
    const first = thread("thread-1", "/repo/one", "poracode/one");
    const second = thread("thread-2", "/repo/two", "poracode/two");
    delete first.worktreePath;
    delete second.worktreePath;
    useAppStore.setState((state) => ({ ...state, threads: [first, second] }));
    const record = experiment();
    for (const candidate of record.candidates) delete candidate.worktreePath;
    useExperimentStore.getState().addExperiment(record);
    mocks.bridge.gitListWorktrees.mockResolvedValue({
      worktrees: [
        { path: "/repo/one", branch: "poracode/one" },
        { path: "/repo/two", branch: "poracode/two" },
      ],
    });

    await expect(discardExperiment("experiment-1")).resolves.toBe(true);

    expect(mocks.performWorktreeRemoval).toHaveBeenNthCalledWith(
      1,
      project,
      "/repo/one",
      "poracode/one",
      "experiment-1:thread-1",
    );
    expect(mocks.performWorktreeRemoval).toHaveBeenNthCalledWith(
      2,
      project,
      "/repo/two",
      "poracode/two",
      "experiment-1:thread-2",
    );
  });

  it("removes owner-marked branches left behind without worktrees", async () => {
    const first = thread("thread-1", "/repo/one", "poracode/one");
    const second = thread("thread-2", "/repo/two", "poracode/two");
    delete first.worktreePath;
    delete second.worktreePath;
    useAppStore.setState((state) => ({ ...state, threads: [first, second] }));
    const record = experiment();
    for (const candidate of record.candidates) delete candidate.worktreePath;
    useExperimentStore.getState().addExperiment(record);
    mocks.bridge.gitListWorktrees.mockResolvedValue({ worktrees: [] });

    await expect(discardExperiment("experiment-1")).resolves.toBe(true);

    expect(mocks.performWorktreeRemoval).not.toHaveBeenCalled();
    expect(mocks.bridge.gitDeleteBranch).toHaveBeenCalledWith({
      projectLocation: project.location,
      branch: "poracode/one",
      force: true,
      expectedOwnerToken: "experiment-1:thread-1",
    });
    expect(mocks.bridge.gitDeleteBranch).toHaveBeenCalledWith({
      projectLocation: project.location,
      branch: "poracode/two",
      force: true,
      expectedOwnerToken: "experiment-1:thread-2",
    });
  });

  it("cleans a pending worktree only when its owner marker matches", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        thread("thread-1", "/repo/one", "poracode/one"),
        thread("thread-2", "/repo/two", "poracode/two"),
      ],
    }));
    useExperimentStore.getState().addExperiment({
      ...experiment(),
      candidates: experiment().candidates.map((candidate) => ({
        ...candidate,
        worktreeState: "pending",
      })),
    });

    await expect(discardExperiment("experiment-1")).resolves.toBe(true);

    expect(mocks.performWorktreeRemoval).toHaveBeenCalledWith(
      project,
      "/repo/one",
      "poracode/one",
      "experiment-1:thread-1",
    );
    expect(mocks.performWorktreeRemoval).toHaveBeenCalledWith(
      project,
      "/repo/two",
      "poracode/two",
      "experiment-1:thread-2",
    );
  });

  it("recovers candidate worktrees by branch when their stored paths are stale", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        thread("thread-1", "/repo/stale-one", "poracode/one"),
        thread("thread-2", "/repo/stale-two", "poracode/two"),
      ],
    }));
    useExperimentStore.getState().addExperiment(experiment());
    mocks.bridge.gitListWorktrees.mockResolvedValue({
      worktrees: [
        { path: "/repo/moved-one", branch: "poracode/one" },
        { path: "/repo/moved-two", branch: "poracode/two" },
      ],
    });

    await expect(discardExperiment("experiment-1")).resolves.toBe(true);

    expect(mocks.performWorktreeRemoval).toHaveBeenNthCalledWith(
      1,
      project,
      "/repo/moved-one",
      "poracode/one",
      "experiment-1:thread-1",
    );
    expect(mocks.performWorktreeRemoval).toHaveBeenNthCalledWith(
      2,
      project,
      "/repo/moved-two",
      "poracode/two",
      "experiment-1:thread-2",
    );
  });

  it("retains the experiment when a recorded candidate worktree switched branches", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        thread("thread-1", "/repo/one", "poracode/one"),
        thread("thread-2", "/repo/two", "poracode/two"),
      ],
    }));
    useExperimentStore.getState().addExperiment(experiment());
    mocks.bridge.gitListWorktrees.mockResolvedValue({
      worktrees: [
        { path: "/repo/one", branch: "feature/other" },
        { path: "/repo/two", branch: "poracode/two" },
      ],
    });

    await expect(discardExperiment("experiment-1")).resolves.toBe(false);

    expect(mocks.performWorktreeRemoval.mock.calls.some(([, path]) => path === "/repo/one")).toBe(
      false,
    );
    expect(useExperimentStore.getState().experiments["experiment-1"]).toBeDefined();
  });

  it("retries cleanup for a winner worktree after the winner was merged", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        thread("thread-1", "/repo/one", "poracode/one"),
        thread("thread-2", "/repo/two", "poracode/two"),
      ],
    }));
    useExperimentStore.getState().addExperiment({
      ...experiment(),
      crown: {
        threadId: "thread-1",
        source: "user",
        createdAt: "2026-07-13T00:01:00.000Z",
      },
    });
    mocks.bridge.getGitStatus.mockResolvedValue({
      branch: "poracode/one",
      staged: [],
      unstaged: [],
    });
    mocks.bridge.gitGetWorktreeSourceBranch.mockImplementation(async (payload) => ({
      sourceBranch: "main",
      ownerToken: ownerTokenForBranch((payload as { branch: string }).branch),
    }));
    mocks.runGitMergeToSource.mockResolvedValue({ merged: true, fastForward: true });
    mocks.performWorktreeRemoval.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await expect(mergeExperimentWinner("experiment-1")).resolves.toBe(true);
    expect(
      useAppStore.getState().threads.find((item) => item.id === "thread-1")?.worktreePath,
    ).toBe("/repo/one");
    expect(
      useAppStore.getState().threads.find((item) => item.id === "thread-2"),
    ).not.toHaveProperty("worktreePath");

    mocks.performWorktreeRemoval.mockResolvedValueOnce(true);
    await expect(retryExperimentCleanup("experiment-1")).resolves.toBe(true);
    expect(mocks.performWorktreeRemoval).toHaveBeenLastCalledWith(
      project,
      "/repo/one",
      "poracode/one",
      "experiment-1:thread-1",
    );
    expect(
      useAppStore.getState().threads.find((item) => item.id === "thread-1"),
    ).not.toHaveProperty("worktreePath");
  });
});
