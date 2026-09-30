import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_EXPERIMENT_PROMPT_LENGTH,
  experimentSchema,
  type Experiment,
  type Project,
  type RemoteExperimentCommand,
  type Thread,
} from "@/shared/contracts";
import { RemoteClientError } from "@/shared/remote/client";
import { hydrateManagedExperimentState } from "@/renderer/state/managedRootCatalog/rootExperimentAuthority";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadLiveWorkflowStore } from "@/renderer/state/threadLiveWorkflowStore";
import { __resetManagedRootLaunchMetadataCapabilityForTest } from "@/renderer/state/managedRootCatalog/rootLaunchMetadataCapability";
import {
  crownExperiment,
  createExperimentCandidatePr,
  discardExperiment,
  launchExperiment,
  mergeExperimentWinner,
  retryExperimentCleanup,
  renameExperimentWithAuthority,
} from "./experimentActions";

const mocks = vi.hoisted(() => ({
  judgeAgents: [] as Array<{
    kind: string;
    label: string;
    installed: boolean;
    authState: string;
    capabilities: {
      models: Array<{ id: string; label: string }>;
      supportsOneShot: boolean;
      supportsTextOnlyOneShot: boolean;
    };
  }>,
  authority: {
    activationSeq: 0,
    revisionSeq: 0,
    activation: null as null | {
      readonly seq: number;
      readonly client: {
        environment(): Promise<unknown>;
        experimentState(): Promise<{ revision: string; experiments: Record<string, Experiment> }>;
        sendExperimentCommand(
          command: RemoteExperimentCommand,
          options: { readonly commandId: string },
        ): Promise<{ ok: true; revision: string }>;
      };
    },
    sendExperimentCommand:
      vi.fn<
        (
          command: RemoteExperimentCommand,
          options: { readonly commandId: string },
        ) => Promise<{ ok: true; revision: string }>
      >(),
  },
  bridge: {
    createExperimentWorktrees: vi.fn<(payload: any) => Promise<any>>(),
    removeExperimentWorktrees: vi.fn<(payload: any) => Promise<any>>(),
    captureExperimentSnapshot: vi.fn<(payload: any) => Promise<any>>(),
    judgeExperimentSnapshot: vi.fn<(payload: any) => Promise<any>>(),
    onSupervisorEvent: vi.fn<(listener: (event: any) => void) => () => void>(),
    supervisorListeners: [] as Array<(event: any) => void>,
    gitListBranches: vi.fn<
      (payload: unknown) => Promise<{
        current: string;
        branches: Array<{ name: string; current: boolean; commit: string; isRemote: boolean }>;
      }>
    >(),
    gitAddWorktree: vi.fn<(payload: unknown) => Promise<{ path: string }>>(),
    getExperimentCandidateDiff: vi.fn<
      (payload: unknown) => Promise<{
        diff: string;
        headCommit: string;
        omittedFiles?: number;
      }>
    >(),
    judgeExperiment: vi.fn<
      (payload: unknown) => Promise<{
        winnerThreadId: string;
        rationale: string;
        assessments?: Array<{ threadId: string; rationale: string }>;
      }>
    >(),
    getGitStatus:
      vi.fn<
        (payload: unknown) => Promise<{ branch: string; staged: unknown[]; unstaged: unknown[] }>
      >(),
    gitCommit: vi.fn<(payload: unknown) => Promise<{ hash: string; message: string }>>(),
    gitPush: vi.fn<(payload: unknown) => Promise<void>>(),
    generatePrSummary:
      vi.fn<(payload: unknown) => Promise<{ title: string; description: string }>>(),
    ghCreatePr: vi.fn<(payload: unknown) => Promise<{ number: number }>>(),
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
    dbGetThreadRuntimeItemsPage:
      vi.fn<
        (input: {
          threadId: string;
          limit: number;
          beforePosition?: number;
        }) => Promise<{ items: any[]; nextCursor: number | null }>
      >(),
  },
  performInitialThreadLaunch: vi.fn<(input: unknown) => Promise<void>>(),
  performWorktreeRemoval:
    vi.fn<
      (project: unknown, path: string, branch?: string, ownerToken?: string) => Promise<boolean>
    >(),
  prepareWorktreeRemoval: vi.fn<(project: unknown, path: string) => Promise<void>>(),
  primeWorktreeGitState: vi.fn<(project: unknown, path: string) => Promise<void>>(),
  runWorktreeSetupScript:
    vi.fn<
      (
        project: unknown,
        path: string,
        script: string,
        options?: { openTerminalPanel?: boolean },
      ) => Promise<void>
    >(),
  refreshGitProject: vi.fn<(...args: unknown[]) => void>(),
  runGitMergeToSource:
    vi.fn<(payload: unknown) => Promise<{ merged: boolean; fastForward: boolean }>>(),
  showGitOperationFailure: vi.fn<(result: unknown) => void>(),
  generateTitleWithFallback: vi.fn<(input: unknown) => Promise<string>>(),
  requestGeneratedTitle: vi.fn<() => Promise<string> | undefined>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => mocks.bridge,
}));
// The real authority module drives the REAL command construction; only the
// managed-loopback activation behind it is a stubbed transport, so these tests
// prove actual client dispatch (command ids, bodies, ordering) end to end.
vi.mock("@/renderer/hostTransport/loopbackHttpWsTransport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/hostTransport/loopbackHttpWsTransport")>()),
  readManagedLoopbackActivation: () => mocks.authority.activation,
}));
vi.mock("@/renderer/utils/titleGen", () => ({
  requestGeneratedTitle: mocks.requestGeneratedTitle,
}));
vi.mock("@/shared/agentStatus", () => ({
  getProjectAgentStatuses: () => mocks.judgeAgents,
}));
vi.mock("./threadLaunchActions", () => ({
  performInitialThreadLaunch: mocks.performInitialThreadLaunch,
}));
vi.mock("./worktreeActions", () => ({
  performWorktreeRemoval: mocks.performWorktreeRemoval,
  prepareWorktreeRemoval: mocks.prepareWorktreeRemoval,
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
        capabilities: {
          models: [{ id: "gpt-5.5", label: "GPT-5.5" }],
          supportsOneShot: true,
          supportsTextOnlyOneShot: true,
        },
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
    useSharedSettings.setState({ disabledAgents: [], titleGenProvider: "disabled" });
    useThreadLiveWorkflowStore.setState({ liveThreadIds: new Set<string>() });
    mocks.runWorktreeSetupScript.mockReset().mockResolvedValue(undefined);
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
    mocks.bridge.createExperimentWorktrees.mockImplementation(async (payload) => ({
      candidates: await Promise.all(
        payload.candidates.map(async (candidate: any) => {
          try {
            const result = await mocks.bridge.gitAddWorktree({
              projectLocation: payload.projectLocation,
              branch: candidate.branch,
              startPoint: payload.baseCommit,
              sourceBranch: payload.sourceBranch,
              ownerToken: candidate.ownerToken,
            });
            return { ...candidate, path: result.path };
          } catch (error) {
            return {
              ...candidate,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }),
      ),
    }));
    mocks.performInitialThreadLaunch.mockResolvedValue(undefined);
    mocks.performWorktreeRemoval.mockResolvedValue(true);
    mocks.prepareWorktreeRemoval.mockResolvedValue(undefined);
    mocks.bridge.closeThread.mockResolvedValue(undefined);
    mocks.bridge.gitDeleteBranch.mockResolvedValue(undefined);
    mocks.bridge.gitPush.mockResolvedValue(undefined);
    mocks.bridge.generatePrSummary.mockResolvedValue({
      title: "Candidate pull request",
      description: "Candidate summary",
    });
    mocks.bridge.ghCreatePr.mockResolvedValue({ number: 328 });
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
    mocks.bridge.dbGetThreadRuntimeItemsPage.mockReset().mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    mocks.authority.sendExperimentCommand.mockReset().mockImplementation(async (command) => {
      if (command.kind === "remove") {
        useExperimentStore.getState().removeExperiment(command.experimentId);
      } else {
        useExperimentStore.getState().upsertExperiment(experimentSchema.parse(command.record));
      }
      return { ok: true as const, revision: `rev-${(mocks.authority.revisionSeq += 1)}` };
    });
    mocks.authority.activation = {
      seq: (mocks.authority.activationSeq += 1),
      client: {
        environment: async () => ({ capabilities: { experiments: { versions: [1] } } }),
        experimentState: async () => ({
          revision: `rev-${(mocks.authority.revisionSeq += 1)}`,
          experiments: useExperimentStore.getState().experiments,
        }),
        sendExperimentCommand: mocks.authority.sendExperimentCommand,
      },
    };
    __resetManagedRootLaunchMetadataCapabilityForTest();
    mocks.generateTitleWithFallback.mockResolvedValue("AI experiment title");
    mocks.requestGeneratedTitle.mockResolvedValue("AI experiment title");
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
    const captureSnapshot = async (payload: any, emitProgress: boolean) => {
      const snapshots = await Promise.all(
        payload.candidates.map(async (candidate: any) => {
          const path = candidate.worktreePath;
          if (!path) throw new Error("candidate worktree unavailable");
          const status = await mocks.bridge.getGitStatus({
            projectLocation: { kind: project.location.kind, path },
          });
          if (status.branch !== candidate.branch) {
            throw new Error("candidate branch changed");
          }
          const result = await mocks.bridge.getExperimentCandidateDiff({
            projectLocation: { kind: project.location.kind, path },
            baseRef: payload.baseCommit,
          });
          return {
            threadId: candidate.threadId,
            headCommit: result.headCommit,
            diff: result.diff,
            files: result.diff ? 1 : 0,
            insertions: result.diff ? 1 : 0,
            deletions: 0,
            ...(result.omittedFiles ? { omittedFiles: result.omittedFiles } : {}),
          };
        }),
      );
      if (emitProgress) {
        for (const snapshot of snapshots) {
          for (const listener of mocks.bridge.supervisorListeners) {
            listener({
              type: "experiment-judge-progress",
              experimentId: payload.experimentId,
              progress: {
                kind: "captured",
                threadId: snapshot.threadId,
                files: snapshot.files,
                insertions: snapshot.insertions,
                deletions: snapshot.deletions,
                ...(snapshot.omittedFiles ? { omittedFiles: snapshot.omittedFiles } : {}),
              },
            });
          }
        }
      }
      return {
        hash: snapshots.map((snapshot) => snapshot.diff).join("|"),
        candidates: snapshots,
      };
    };
    mocks.bridge.captureExperimentSnapshot.mockImplementation((payload) =>
      captureSnapshot(payload, false),
    );
    mocks.bridge.judgeExperimentSnapshot.mockImplementation(async (payload) => {
      const snapshot = await captureSnapshot(payload, true);
      for (const listener of mocks.bridge.supervisorListeners) {
        listener({
          type: "experiment-judge-progress",
          experimentId: payload.experimentId,
          progress: { kind: "judging" },
        });
      }
      const judgement = await mocks.bridge.judgeExperiment({
        projectLocation: payload.projectLocation,
        agentKind: payload.agentKind,
        ...(payload.model ? { model: payload.model } : {}),
        ...(payload.effort ? { effort: payload.effort } : {}),
        ...(payload.fast !== undefined ? { fast: payload.fast } : {}),
        prompt: payload.prompt,
        candidates: snapshot.candidates.map((candidate: any) => ({
          threadId: candidate.threadId,
          diff: candidate.diff,
        })),
      });
      return {
        ...snapshot,
        ...judgement,
        assessments:
          judgement.assessments ??
          snapshot.candidates.map((candidate: any) => ({
            threadId: candidate.threadId,
            rationale: `Assessment for ${candidate.threadId}`,
          })),
      };
    });
    mocks.bridge.supervisorListeners.length = 0;
    mocks.bridge.onSupervisorEvent.mockImplementation((listener) => {
      mocks.bridge.supervisorListeners.push(listener);
      return () => {
        const index = mocks.bridge.supervisorListeners.indexOf(listener);
        if (index >= 0) mocks.bridge.supervisorListeners.splice(index, 1);
      };
    });
    mocks.bridge.removeExperimentWorktrees.mockImplementation(async (payload) => {
      const { worktrees } = await mocks.bridge.gitListWorktrees({
        projectLocation: payload.projectLocation,
      });
      return {
        candidates: await Promise.all(
          payload.candidates.map(async (candidate: any) => {
            const worktree = worktrees.find((item) => item.branch === candidate.branch);
            const conflicting = worktrees.find(
              (item) => item.path === candidate.worktreePath && item.branch !== candidate.branch,
            );
            if (conflicting) return { ...candidate, error: "candidate branch changed" };
            if (worktree) {
              const removed = await mocks.performWorktreeRemoval(
                project,
                worktree.path,
                candidate.branch,
                candidate.ownerToken,
              );
              return removed
                ? { ...candidate, path: worktree.path }
                : { ...candidate, path: worktree.path, error: "removal failed" };
            }
            await mocks.bridge.gitDeleteBranch({
              projectLocation: project.location,
              branch: candidate.branch,
              force: true,
              expectedOwnerToken: candidate.ownerToken,
            });
            return { ...candidate };
          }),
        ),
      };
    });
  });

  it("refuses to launch on a mirrored project before any local bridge work", async () => {
    useAppStore.setState((state) => ({
      ...state,
      projects: [{ ...project, remoteServerId: "desktop-1" }],
    }));

    const id = await launchExperiment({
      projectId: project.id,
      prompt: "Implement it",
      baseBranch: "main",
      candidates: [
        { agentKind: "codex", config: { model: "gpt-5" }, presentationMode: "gui" },
        { agentKind: "claude", config: { model: "opus" }, presentationMode: "gui" },
      ],
    });

    expect(id).toBeNull();
    expect(mocks.bridge.gitListBranches).not.toHaveBeenCalled();
    expect(mocks.bridge.createExperimentWorktrees).not.toHaveBeenCalled();
    expect(mocks.authority.sendExperimentCommand).not.toHaveBeenCalled();
    expect(useAppStore.getState().threads).toHaveLength(0);
    expect(useExperimentStore.getState().experiments).toEqual({});
  });

  it("refuses before any local effect when the host does not advertise experiments", async () => {
    mocks.authority.activation = {
      seq: (mocks.authority.activationSeq += 1),
      client: {
        environment: async () => ({ capabilities: {} }),
        experimentState: async () => ({ revision: "rev", experiments: {} }),
        sendExperimentCommand: mocks.authority.sendExperimentCommand,
      },
    };

    const id = await launchExperiment({
      projectId: project.id,
      prompt: "Implement it",
      baseBranch: "main",
      candidates: [
        { agentKind: "codex", config: { model: "gpt-5" }, presentationMode: "gui" },
        { agentKind: "claude", config: { model: "opus" }, presentationMode: "gui" },
      ],
    });

    expect(id).toBeNull();
    expect(mocks.bridge.gitListBranches).not.toHaveBeenCalled();
    expect(mocks.bridge.gitAddWorktree).not.toHaveBeenCalled();
    expect(mocks.authority.sendExperimentCommand).not.toHaveBeenCalled();
    expect(useAppStore.getState().threads).toHaveLength(0);
    expect(useExperimentStore.getState().experiments).toEqual({});
  });

  it.each(["offline", "unsupported"])(
    "does not paint a rename when authority is %s",
    async (state) => {
      const existing = experiment();
      useExperimentStore.getState().addExperiment(existing);
      useAppStore.setState({
        threads: [
          {
            ...thread("thread-1", "/repo/one", "poracode/one"),
            groupId: existing.id,
            groupName: existing.title,
          },
        ],
      });
      if (state === "offline") mocks.authority.activation = null;
      else mocks.authority.activation!.client.environment = async () => ({ capabilities: {} });
      await renameExperimentWithAuthority(existing.id, "Unsaved name");
      expect(useExperimentStore.getState().experiments[existing.id]?.title).toBe(existing.title);
      expect(useAppStore.getState().threads[0]?.groupName).toBe(existing.title);
      expect(mocks.authority.sendExperimentCommand).not.toHaveBeenCalled();
    },
  );

  it("projects confirmed experiment names only onto owned candidate rows", async () => {
    const existing = experiment();
    useExperimentStore.getState().addExperiment(existing);
    useAppStore.setState({
      threads: [
        {
          ...thread("thread-1", "/repo/one", "poracode/one"),
          groupId: existing.id,
          groupName: existing.title,
        },
        {
          ...thread("unrelated", "/repo/other", "poracode/other"),
          groupId: "another-group",
          groupName: "Other group",
        },
      ],
    });
    await renameExperimentWithAuthority(existing.id, "Confirmed name");
    expect(useExperimentStore.getState().experiments[existing.id]?.title).toBe("Confirmed name");
    expect(useAppStore.getState().threads.map((row) => row.groupName)).toEqual([
      "Confirmed name",
      "Other group",
    ]);
    expect(mocks.authority.sendExperimentCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "replace",
        rows: existing.candidates.map((candidate) => ({
          threadId: candidate.threadId,
          groupName: "Confirmed name",
        })),
      }),
      expect.anything(),
    );
  });

  it("refuses before any local effect when the loopback leg is down", async () => {
    mocks.authority.activation = null;

    const id = await launchExperiment({
      projectId: project.id,
      prompt: "Implement it",
      baseBranch: "main",
      candidates: [
        { agentKind: "codex", config: { model: "gpt-5" }, presentationMode: "gui" },
        { agentKind: "claude", config: { model: "opus" }, presentationMode: "gui" },
      ],
    });

    expect(id).toBeNull();
    expect(mocks.authority.sendExperimentCommand).not.toHaveBeenCalled();
    expect(useAppStore.getState().threads).toHaveLength(0);
    expect(useExperimentStore.getState().experiments).toEqual({});
  });

  it("keeps the local create and skips worktrees and launches when the create outcome is uncertain", async () => {
    mocks.authority.sendExperimentCommand.mockRejectedValue(
      new RemoteClientError("connection dropped after dispatch", 0, "network", {
        requestMayHaveCommitted: true,
      }),
    );

    const id = await launchExperiment({
      projectId: project.id,
      prompt: "Implement it",
      baseBranch: "main",
      candidates: [
        { agentKind: "codex", config: { model: "gpt-5" }, presentationMode: "gui" },
        { agentKind: "claude", config: { model: "opus" }, presentationMode: "gui" },
      ],
    });

    expect(id).toBeNull();
    // The exact original command id and body are retried; no fresh destructive
    // intent is issued.
    expect(mocks.authority.sendExperimentCommand).toHaveBeenCalledTimes(3);
    const [first, second, third] = mocks.authority.sendExperimentCommand.mock.calls;
    expect(first?.[1].commandId).toBe(second?.[1].commandId);
    expect(second?.[1].commandId).toBe(third?.[1].commandId);
    expect(second?.[0]).toEqual(first?.[0]);
    expect(third?.[0]).toEqual(first?.[0]);
    // A possibly-committed create must not be deleted locally, and no worktree
    // or provider effect may start.
    expect(useExperimentStore.getState().experiments).not.toEqual({});
    expect(useAppStore.getState().threads).toHaveLength(2);
    expect(mocks.bridge.gitAddWorktree).not.toHaveBeenCalled();
    expect(mocks.bridge.createExperimentWorktrees).not.toHaveBeenCalled();
    expect(mocks.performInitialThreadLaunch).not.toHaveBeenCalled();
  });

  it("confirms the candidate worktree row update before launching candidates", async () => {
    await launchExperiment({
      projectId: project.id,
      prompt: "Implement it",
      baseBranch: "main",
      candidates: [
        { agentKind: "codex", config: { model: "gpt-5" }, presentationMode: "gui" },
        { agentKind: "claude", config: { model: "opus" }, presentationMode: "gui" },
      ],
    });

    const replaceCallIndex = mocks.authority.sendExperimentCommand.mock.calls.findIndex(
      ([command]) => command.kind === "replace" && command.rows?.some((row) => row.worktree),
    );
    const replaceCommand = mocks.authority.sendExperimentCommand.mock.calls[replaceCallIndex]?.[0];
    expect(replaceCommand).toMatchObject({
      kind: "replace",
      rows: [
        {
          threadId: expect.any(String),
          worktree: { path: "/repo/one", branch: expect.stringMatching(/^poracode\/experiment-/) },
        },
        {
          threadId: expect.any(String),
          worktree: { path: "/repo/two", branch: expect.stringMatching(/^poracode\/experiment-/) },
        },
      ],
    });
    expect(
      mocks.authority.sendExperimentCommand.mock.invocationCallOrder[replaceCallIndex]!,
    ).toBeLessThan(mocks.performInitialThreadLaunch.mock.invocationCallOrder[0]!);
  });

  it.each([false, true])(
    "does not launch when the prepared worktrees are unconfirmed (uncertain=%s)",
    async (uncertain) => {
      const error = new RemoteClientError(
        "worktree update failed",
        uncertain ? 0 : 403,
        uncertain ? "network" : "forbidden",
        { requestMayHaveCommitted: uncertain },
      );
      const normalSend = mocks.authority.sendExperimentCommand.getMockImplementation()!;
      mocks.authority.sendExperimentCommand.mockImplementation(async (command, options) => {
        if (command.kind === "replace" && command.rows?.some((row) => row.worktree)) throw error;
        return normalSend(command, options);
      });
      const id = await launchExperiment({
        projectId: project.id,
        prompt: "Implement it",
        baseBranch: "main",
        candidates: [
          { agentKind: "codex", config: { model: "gpt-5" }, presentationMode: "gui" },
          { agentKind: "claude", config: { model: "opus" }, presentationMode: "gui" },
        ],
      });
      expect(id).not.toBeNull();
      expect(mocks.bridge.createExperimentWorktrees).toHaveBeenCalledTimes(1);
      expect(mocks.performInitialThreadLaunch).not.toHaveBeenCalled();
      expect(mocks.runWorktreeSetupScript).not.toHaveBeenCalled();
      expect(mocks.bridge.removeExperimentWorktrees).not.toHaveBeenCalled();
      const updates = mocks.authority.sendExperimentCommand.mock.calls.filter(
        ([command]) => command.kind === "replace" && command.rows?.some((row) => row.worktree),
      );
      expect(updates).toHaveLength(uncertain ? 3 : 1);
      for (const update of updates) expect(update).toEqual(updates[0]);
      expect(
        mocks.authority.sendExperimentCommand.mock.calls.some(
          ([command]) => command.kind === "remove",
        ),
      ).toBe(false);
    },
  );

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
    // The atomic create+specs command is confirmed BEFORE any worktree is
    // prepared or any provider is launched.
    const createCommand = mocks.authority.sendExperimentCommand.mock.calls[0]?.[0];
    expect(createCommand).toMatchObject({
      kind: "create",
      experimentId: id,
      record: {
        id,
        status: "running",
        candidates: [
          expect.objectContaining({ worktreeState: "pending" }),
          expect.objectContaining({ worktreeState: "pending" }),
        ],
      },
      threads: [
        expect.objectContaining({ projectId: project.id, worktreeBranch: expect.any(String) }),
        expect.objectContaining({ projectId: project.id, worktreeBranch: expect.any(String) }),
      ],
    });
    expect(mocks.authority.sendExperimentCommand.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.bridge.gitAddWorktree.mock.invocationCallOrder[0]!,
    );
    expect(mocks.authority.sendExperimentCommand.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.performInitialThreadLaunch.mock.invocationCallOrder[0]!,
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
    expect(
      Object.fromEntries(
        useAppStore.getState().threads.map((item) => [item.agentKind, item.title]),
      ),
    ).toEqual({
      codex: "gpt-5 · High · Codex",
      claude: "opus · Claude",
    });
    expect(mocks.performInitialThreadLaunch).toHaveBeenCalledTimes(2);
    expect(
      mocks.performInitialThreadLaunch.mock.calls.map(
        (call) => (call[0] as { thread: Thread }).thread.worktreePath,
      ),
    ).toEqual(["/repo/one", "/repo/two"]);
    expect(mocks.runWorktreeSetupScript).toHaveBeenCalledTimes(2);
    expect(mocks.runWorktreeSetupScript).toHaveBeenNthCalledWith(
      1,
      project,
      "/repo/one",
      "pnpm install",
      { openTerminalPanel: false },
    );
    expect(mocks.runWorktreeSetupScript).toHaveBeenNthCalledWith(
      2,
      project,
      "/repo/two",
      "pnpm install",
      { openTerminalPanel: false },
    );
    expect(Math.max(...mocks.performInitialThreadLaunch.mock.invocationCallOrder)).toBeLessThan(
      Math.min(...mocks.runWorktreeSetupScript.mock.invocationCallOrder),
    );
    expect(useExperimentStore.getState().experiments[id!]).toMatchObject({
      baseBranch: "main",
      baseCommit: BASE_COMMIT,
      segments: [{ kind: "text", content: "Implement it" }],
      status: "running",
    });
    expect(useAppStore.getState().view).toEqual({
      kind: "experiment",
      experimentId: id,
      projectId: project.id,
    });
  });

  it("creates candidate worktrees in parallel without changing candidate order", async () => {
    const pending: Array<(result: { path: string }) => void> = [];
    mocks.bridge.gitAddWorktree.mockReset().mockImplementation(
      () =>
        new Promise<{ path: string }>((resolve) => {
          pending.push(resolve);
        }),
    );

    const launching = launchExperiment({
      projectId: project.id,
      prompt: "Implement it",
      baseBranch: "main",
      candidates: [
        { agentKind: "codex", config: { model: "gpt-5" }, presentationMode: "gui" },
        { agentKind: "claude", config: { model: "opus" }, presentationMode: "terminal" },
        { agentKind: "grok", config: { model: "grok-4" }, presentationMode: "terminal" },
      ],
    });

    await vi.waitFor(() => expect(pending).toHaveLength(3));
    pending[2]!({ path: "/repo/three" });
    pending[0]!({ path: "/repo/one" });
    pending[1]!({ path: "/repo/two" });

    const experimentId = await launching;
    expect(
      useExperimentStore
        .getState()
        .experiments[experimentId!]!.candidates.map((candidate) => candidate.worktreePath),
    ).toEqual(["/repo/one", "/repo/two", "/repo/three"]);
  });

  it("starts candidates without waiting for hidden setup tabs", async () => {
    mocks.runWorktreeSetupScript.mockImplementation(() => new Promise<void>(() => undefined));

    await expect(
      launchExperiment({
        projectId: project.id,
        prompt: "Implement it",
        baseBranch: "main",
        candidates: [
          { agentKind: "codex", config: { model: "gpt-5" }, presentationMode: "gui" },
          { agentKind: "claude", config: { model: "opus" }, presentationMode: "terminal" },
        ],
      }),
    ).resolves.toBeTruthy();

    expect(mocks.runWorktreeSetupScript).toHaveBeenCalledTimes(2);
    expect(mocks.performInitialThreadLaunch).toHaveBeenCalledTimes(2);
  });

  it("replaces the prompt fallback with an AI-generated experiment title", async () => {
    useSharedSettings.setState({ titleGenProvider: "codex" });

    const experimentId = await launchExperiment({
      projectId: project.id,
      prompt: "Implement it",
      baseBranch: "main",
      candidates: [
        { agentKind: "codex", config: { model: "gpt-5" }, presentationMode: "gui" },
        { agentKind: "claude", config: { model: "opus" }, presentationMode: "terminal" },
      ],
    });

    expect(mocks.requestGeneratedTitle).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(useExperimentStore.getState().experiments[experimentId!]?.title).toBe(
        "AI experiment title",
      ),
    );
    expect(
      useAppStore
        .getState()
        .threads.filter((candidateThread) => candidateThread.groupId === experimentId)
        .every((candidateThread) => candidateThread.groupName === "AI experiment title"),
    ).toBe(true);
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
    expect(mocks.authority.sendExperimentCommand).not.toHaveBeenCalled();
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

  it("reports parallel candidate snapshots in experiment order", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        thread("thread-1", "/repo/one", "poracode/one"),
        thread("thread-2", "/repo/two", "poracode/two"),
      ],
    }));
    useExperimentStore.getState().addExperiment(experiment());
    const pending: Array<
      (result: { diff: string; headCommit: string; omittedFiles?: number }) => void
    > = [];
    mocks.bridge.getExperimentCandidateDiff.mockReset().mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
    );
    mocks.bridge.judgeExperiment.mockResolvedValue({
      winnerThreadId: "thread-1",
      rationale: "Solution 1 is safer.",
    });
    const captured: Array<{ threadId: string; omittedFiles?: number }> = [];

    const judging = crownExperiment("experiment-1", undefined, (event) => {
      if (event.kind === "captured") {
        captured.push({
          threadId: event.threadId,
          ...(event.omittedFiles ? { omittedFiles: event.omittedFiles } : {}),
        });
      }
    });
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[1]!({ diff: "second", headCommit: CANDIDATE_COMMIT });
    pending[0]!({ diff: "first", headCommit: CANDIDATE_COMMIT, omittedFiles: 83 });

    await expect(judging).resolves.toBe(true);
    expect(captured).toEqual([
      { threadId: "thread-1", omittedFiles: 83 },
      { threadId: "thread-2" },
    ]);
  });

  it("uses an installed one-shot judge even when it is not a candidate provider", async () => {
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
        capabilities: {
          models: [{ id: "claude-sonnet-5", label: "Sonnet 5" }],
          supportsOneShot: true,
          supportsTextOnlyOneShot: false,
        },
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

  it("uses the explicitly selected judge configuration", async () => {
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
      crownExperiment("experiment-1", {
        agentKind: "codex",
        model: "gpt-5-mini",
        effort: "low",
        fast: false,
      }),
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

  it("compares chat responses without capturing candidate files", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        thread("thread-1", "/repo/one", "poracode/one"),
        thread("thread-2", "/repo/two", "poracode/two"),
      ],
    }));
    useExperimentStore.getState().addExperiment(experiment());
    // R1: the judge pages the bounded runtime-items route; the walk resolves
    // with one complete page per candidate.
    mocks.bridge.dbGetThreadRuntimeItemsPage.mockImplementation(async (input) => ({
      items: [
        {
          id: `${input.threadId}-answer`,
          type: "assistant_message",
          state: "completed",
          payload: {
            content: [
              {
                kind: "text",
                text: input.threadId === "thread-1" ? "First answer" : "Second answer",
              },
            ],
          },
          streams: {},
        },
      ],
      nextCursor: null,
    }));
    mocks.bridge.judgeExperimentSnapshot.mockResolvedValueOnce({
      hash: "response-hash",
      winnerThreadId: "thread-2",
      rationale: "The second answer is more complete.",
      assessments: [
        { threadId: "thread-1", rationale: "Brief." },
        { threadId: "thread-2", rationale: "Complete." },
      ],
    });

    await expect(
      crownExperiment("experiment-1", {
        agentKind: "codex",
        model: "gpt-5-mini",
        effort: "low",
        fast: false,
        mode: "responses",
      }),
    ).resolves.toBe(true);

    expect(mocks.bridge.judgeExperimentSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "responses",
        responses: [
          { threadId: "thread-1", response: "Assistant:\nFirst answer" },
          { threadId: "thread-2", response: "Assistant:\nSecond answer" },
        ],
      }),
    );
    expect(mocks.bridge.getExperimentCandidateDiff).not.toHaveBeenCalled();
    expect(useExperimentStore.getState().experiments["experiment-1"]?.crown).toMatchObject({
      threadId: "thread-2",
      source: "ai",
      comparisonMode: "responses",
    });
    expect(useExperimentStore.getState().experiments["experiment-1"]?.crown).not.toHaveProperty(
      "snapshotHash",
    );
  });

  it("does not invoke an unavailable one-shot judge", async () => {
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
        capabilities: {
          models: [{ id: "gpt-5", label: "GPT-5" }],
          supportsOneShot: true,
          supportsTextOnlyOneShot: true,
        },
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
    mocks.bridge.getGitStatus.mockImplementation(async (payload) => {
      const path = (payload as { projectLocation: { path: string } }).projectLocation.path;
      return {
        branch: path.endsWith("/two") ? "poracode/two" : "poracode/one",
        staged: [],
        unstaged: path.endsWith("/one") ? [{ path: "src/a.ts" }] : [],
      };
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

  it("removes the experiment and ungroups its candidates after opening a pull request", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        thread("thread-1", "/repo/one", "poracode/one"),
        thread("thread-2", "/repo/two", "poracode/two"),
      ],
      view: { kind: "experiment", experimentId: "experiment-1", projectId: project.id },
    }));
    useExperimentStore.getState().addExperiment(experiment());

    await expect(createExperimentCandidatePr("experiment-1", "thread-1")).resolves.toBe(true);

    expect(mocks.bridge.ghCreatePr).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "poracode/one",
        baseBranch: "main",
        title: "Candidate pull request",
      }),
    );
    expect(useExperimentStore.getState().experiments["experiment-1"]).toBeUndefined();
    expect(useAppStore.getState().view).toEqual({ kind: "home" });
    expect(useAppStore.getState().threads).toEqual([
      expect.objectContaining({ id: "thread-1", worktreePath: "/repo/one" }),
      expect.objectContaining({ id: "thread-2", worktreePath: "/repo/two" }),
    ]);
    expect(useAppStore.getState().threads.every((item) => item.groupId === undefined)).toBe(true);
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
    mocks.bridge.getGitStatus.mockImplementation(async (payload) => {
      const path = (payload as { projectLocation: { path: string } }).projectLocation.path;
      return {
        branch: path.endsWith("/two") ? "poracode/two" : "poracode/one",
        staged: [],
        unstaged: [],
      };
    });
    mocks.bridge.gitGetWorktreeSourceBranch.mockImplementation(async (payload) => ({
      sourceBranch: "release",
      ownerToken: ownerTokenForBranch((payload as { branch: string }).branch),
    }));

    await expect(mergeExperimentWinner("experiment-1")).resolves.toBe(false);

    expect(mocks.runGitMergeToSource).not.toHaveBeenCalled();
  });

  it("stops and discards candidates with a live background workflow", async () => {
    const runningThread = thread("thread-1", "/repo/one", "poracode/one");
    runningThread.status = "working";
    useAppStore.setState((state) => ({
      ...state,
      threads: [runningThread, thread("thread-2", "/repo/two", "poracode/two")],
    }));
    useExperimentStore.getState().addExperiment(experiment());
    useThreadLiveWorkflowStore.setState({ liveThreadIds: new Set(["thread-1"]) });

    await expect(discardExperiment("experiment-1")).resolves.toBe(true);

    expect(mocks.bridge.closeThread).toHaveBeenCalledTimes(2);
    expect(mocks.performWorktreeRemoval).toHaveBeenCalledTimes(2);
    expect(useExperimentStore.getState().experiments["experiment-1"]).toBeUndefined();
    expect(useAppStore.getState().threads).toEqual([]);
  });

  it("projects the removal only after the host confirms it and discard cleanup finishes", async () => {
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
    let finishRemoval!: (removed: boolean) => void;
    mocks.performWorktreeRemoval.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishRemoval = resolve;
        }),
    );

    const discard = discardExperiment("experiment-1");

    // The record only disappears after the confirmed removal + cleanup: a
    // local delete before the host committed would resurrect from projection.
    expect(useExperimentStore.getState().experiments["experiment-1"]).toBeDefined();

    await vi.waitFor(() => expect(mocks.performWorktreeRemoval).toHaveBeenCalledTimes(2));
    finishRemoval(true);
    await expect(discard).resolves.toBe(true);
    expect(useExperimentStore.getState().experiments["experiment-1"]).toBeUndefined();
    expect(useAppStore.getState().view).toEqual({ kind: "home" });
    expect(useAppStore.getState().threads).toEqual([]);
    expect(mocks.authority.sendExperimentCommand).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "remove", candidateDisposition: "delete" }),
      expect.objectContaining({ commandId: expect.any(String) }),
    );
  });

  it("waits for an earlier operation before the confirmed removal", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        thread("thread-1", "/repo/one", "poracode/one"),
        thread("thread-2", "/repo/two", "poracode/two"),
      ],
      view: { kind: "experiment", experimentId: "experiment-1", projectId: project.id },
    }));
    useExperimentStore.getState().addExperiment(experiment());
    let finishPush!: () => void;
    mocks.bridge.gitPush.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishPush = resolve;
        }),
    );

    const createPr = createExperimentCandidatePr("experiment-1", "thread-1");
    await vi.waitFor(() => expect(mocks.bridge.gitPush).toHaveBeenCalledOnce());
    const discard = discardExperiment("experiment-1");

    // The PR release is still in flight; discard must not start cleanup or a
    // competing removal before it settles.
    expect(mocks.performWorktreeRemoval).not.toHaveBeenCalled();

    finishPush();
    await expect(createPr).resolves.toBe(true);
    await expect(discard).resolves.toBe(true);
    expect(mocks.performWorktreeRemoval).toHaveBeenCalledTimes(2);
    expect(useExperimentStore.getState().experiments["experiment-1"]).toBeUndefined();
  });

  it("keeps the experiment removed when discard cleanup is partial", async () => {
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

    expect(useExperimentStore.getState().experiments["experiment-1"]).toBeUndefined();
    expect(useAppStore.getState().threads).toEqual([]);
    expect(useAppStore.getState().view).toEqual({ kind: "home" });
  });

  it("continues parallel cleanup when one candidate runtime cannot be stopped", async () => {
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

    expect(mocks.performWorktreeRemoval).toHaveBeenCalledExactlyOnceWith(
      project,
      "/repo/two",
      "poracode/two",
      "experiment-1:thread-2",
    );
    expect(useExperimentStore.getState().experiments["experiment-1"]).toBeUndefined();
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

  it("keeps the experiment removed when a recorded candidate worktree switched branches", async () => {
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
    expect(mocks.prepareWorktreeRemoval).not.toHaveBeenCalledWith(project, "/repo/one");
    expect(useExperimentStore.getState().experiments["experiment-1"]).toBeUndefined();
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
    mocks.bridge.getGitStatus.mockImplementation(async (payload) => {
      const path = (payload as { projectLocation: { path: string } }).projectLocation.path;
      return {
        branch: path.endsWith("/two") ? "poracode/two" : "poracode/one",
        staged: [],
        unstaged: [],
      };
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

  it("confirms the cleanup on the host before reporting success and survives a fresh projection", async () => {
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
      winnerThreadId: "thread-1",
      status: "decided",
    });

    await expect(retryExperimentCleanup("experiment-1")).resolves.toBe(true);

    const replaceCalls = mocks.authority.sendExperimentCommand.mock.calls.filter(
      ([command]) => command.kind === "replace",
    );
    expect(replaceCalls).toHaveLength(1);
    const replaceCommand = replaceCalls[0]![0] as Extract<
      RemoteExperimentCommand,
      { kind: "replace" }
    >;
    expect(replaceCommand.rows).toEqual([
      { threadId: "thread-1", worktree: null, retire: "done" },
      { threadId: "thread-2", worktree: null, retire: "done" },
    ]);
    expect(replaceCalls[0]![1].commandId).toEqual(expect.any(String));
    expect(replaceCommand.record.crown).toMatchObject({ threadId: "thread-1" });
    expect(replaceCommand.record.winnerThreadId).toBe("thread-1");
    // A fresh authoritative read projects the same removed candidates: the
    // cleanup can never resurrect as a stale owned row.
    await expect(hydrateManagedExperimentState()).resolves.toBe(true);
    expect(
      useExperimentStore
        .getState()
        .experiments["experiment-1"]?.candidates.map(
          (candidate) => [candidate.worktreeState, "worktreePath" in candidate] as const,
        ),
    ).toEqual([
      ["removed", false],
      ["removed", false],
    ]);
    expect(
      useAppStore.getState().threads.find((item) => item.id === "thread-1"),
    ).not.toHaveProperty("worktreePath");
  });

  it("persists partial cleanup for exactly the candidates that were removed", async () => {
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
      winnerThreadId: "thread-1",
      status: "decided",
    });
    mocks.performWorktreeRemoval.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(retryExperimentCleanup("experiment-1")).resolves.toBe(false);

    const replaceEntry = mocks.authority.sendExperimentCommand.mock.calls.find(
      ([command]) => command.kind === "replace",
    );
    const replaceCommand = replaceEntry?.[0] as
      | Extract<RemoteExperimentCommand, { kind: "replace" }>
      | undefined;
    expect(replaceCommand).toMatchObject({
      rows: [{ threadId: "thread-1", worktree: null, retire: "done" }],
    });
    expect(replaceCommand?.record.candidates.map((candidate) => candidate.worktreeState)).toEqual([
      "removed",
      "owned",
    ]);
    expect(replaceCommand?.record.candidates[1]).toMatchObject({ worktreePath: "/repo/two" });
    await expect(hydrateManagedExperimentState()).resolves.toBe(true);
    expect(
      useExperimentStore
        .getState()
        .experiments["experiment-1"]?.candidates.map((candidate) => candidate.worktreeState),
    ).toEqual(["removed", "owned"]);
    expect(useAppStore.getState().threads.find((item) => item.id === "thread-2")).toHaveProperty(
      "worktreePath",
      "/repo/two",
    );
  });

  it.each(["offline", "unsupported"])(
    "starts no cleanup effect when the authority is %s",
    async (state) => {
      useAppStore.setState((state_) => ({
        ...state_,
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
        winnerThreadId: "thread-1",
        status: "decided",
      });
      if (state === "offline") mocks.authority.activation = null;
      else mocks.authority.activation!.client.environment = async () => ({ capabilities: {} });

      await expect(retryExperimentCleanup("experiment-1")).resolves.toBe(false);

      expect(mocks.bridge.closeThread).not.toHaveBeenCalled();
      expect(mocks.bridge.gitListWorktrees).not.toHaveBeenCalled();
      expect(mocks.bridge.removeExperimentWorktrees).not.toHaveBeenCalled();
      expect(mocks.authority.sendExperimentCommand).not.toHaveBeenCalled();
      expect(
        useExperimentStore
          .getState()
          .experiments["experiment-1"]?.candidates.every(
            (candidate) => candidate.worktreeState === "owned",
          ),
      ).toBe(true);
    },
  );

  it.each([false, true])(
    "reports no success while the cleanup record stays unconfirmed (uncertain=%s)",
    async (uncertain) => {
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
        winnerThreadId: "thread-1",
        status: "decided",
      });
      const error = new RemoteClientError(
        "cleanup update failed",
        uncertain ? 0 : 403,
        uncertain ? "network" : "forbidden",
        { requestMayHaveCommitted: uncertain },
      );
      const normalSend = mocks.authority.sendExperimentCommand.getMockImplementation()!;
      mocks.authority.sendExperimentCommand.mockImplementation(async (command, options) => {
        if (command.kind === "replace") throw error;
        return normalSend(command, options);
      });

      await expect(retryExperimentCleanup("experiment-1")).resolves.toBe(false);

      // The physical cleanup already happened and nothing was rolled back.
      expect(mocks.performWorktreeRemoval).toHaveBeenCalledTimes(2);
      const attempts = mocks.authority.sendExperimentCommand.mock.calls.filter(
        ([command]) => command.kind === "replace",
      );
      expect(attempts).toHaveLength(uncertain ? 3 : 1);
      for (const attempt of attempts) {
        expect(attempt[1].commandId).toBe(attempts[0]![1].commandId);
        expect(attempt[0]).toEqual(attempts[0]![0]);
      }
    },
  );

  it("keeps the reconciled state and skips the setup script when a candidate start is uncertain", async () => {
    mocks.performInitialThreadLaunch.mockRejectedValue(
      new RemoteClientError("connection dropped after dispatch", 0, "network", {
        requestMayHaveCommitted: true,
      }),
    );

    const id = await launchExperiment({
      projectId: project.id,
      prompt: "Implement it",
      baseBranch: "main",
      candidates: [
        { agentKind: "codex", config: { model: "gpt-5" }, presentationMode: "gui" },
        { agentKind: "claude", config: { model: "opus" }, presentationMode: "gui" },
      ],
    });

    expect(id).toBeTruthy();
    expect(mocks.performInitialThreadLaunch).toHaveBeenCalledTimes(2);
    // No definite error paint for a possibly-committed start, and no setup
    // continuation for the uncertain launches: the optimistic launch state
    // (and whatever the bounded reconcile projected) is preserved.
    expect(useAppStore.getState().threads.map((item) => item.status)).toEqual([
      "launching",
      "launching",
    ]);
    expect(mocks.runWorktreeSetupScript).not.toHaveBeenCalled();
  });

  it("paints a definite candidate launch failure and still runs its setup script", async () => {
    mocks.performInitialThreadLaunch.mockRejectedValueOnce(new Error("provider refused"));

    const id = await launchExperiment({
      projectId: project.id,
      prompt: "Implement it",
      baseBranch: "main",
      candidates: [
        { agentKind: "codex", config: { model: "gpt-5" }, presentationMode: "gui" },
        { agentKind: "claude", config: { model: "opus" }, presentationMode: "gui" },
      ],
    });

    expect(id).toBeTruthy();
    expect(
      useAppStore
        .getState()
        .threads.map((item) => item.status)
        .sort(),
    ).toEqual(["error", "launching"]);
    // Definite failures keep the pre-existing behavior: paint the error and
    // continue with the setup script; only the uncertain launch skips it.
    expect(mocks.runWorktreeSetupScript).toHaveBeenCalledTimes(2);
  });
});
