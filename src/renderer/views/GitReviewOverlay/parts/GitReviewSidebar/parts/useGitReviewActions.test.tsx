import { act } from "@testing-library/react";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult, PrData, Project } from "@/shared/contracts";
import {
  useGitReviewActionStore,
  type GitActionPhase,
} from "@/renderer/state/gitReviewActionStore";
import { useGitReviewActions } from "./useGitReviewActions";

const bridgeMock = vi.hoisted(() => ({
  gitCommit: vi.fn<() => Promise<Record<string, never>>>(),
  gitFetch: vi.fn<() => Promise<void>>(),
  ghCreatePr: vi.fn<() => Promise<PrData>>(),
}));
const runGitSyncCommandMock = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock("@heroui/react", () => ({
  toast: {
    danger: vi.fn<() => void>(),
    success: vi.fn<() => void>(),
    warning: vi.fn<() => void>(),
  },
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridgeMock, isWindows: () => false }));
vi.mock("@/renderer/actions/gitCommandRunner", () => ({
  runGitSyncCommand: runGitSyncCommandMock,
  runGitMergeToSource: vi.fn<() => Promise<void>>(),
  runGitPullFromSource: vi.fn<() => Promise<void>>(),
  refreshGitStatusForWorktree: vi.fn<() => Promise<void>>(),
  showGitActionError: vi.fn<() => void>(),
  showGitOperationFailure: vi.fn<() => void>(),
}));
vi.mock("@/renderer/components/providers/commitGen", () => ({
  generateCommitMessageWithFallbackDetails: vi.fn<() => Promise<never>>(),
  getCommitGenCandidates: () => [],
  resolveCommitGenConfig: () => ({ model: "", effort: "", availableEfforts: [] }),
}));
vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: (selector: (state: unknown) => unknown) =>
    selector({ agentStatuses: [], wslAgentStatuses: [] }),
}));
vi.mock("@/renderer/state/sharedSettingsStore", () => {
  const sharedSettings = {
    commitGenProvider: "auto",
    commitGenModel: "",
    commitGenEffort: "",
    commitGenFast: false,
    wslCommitGenProvider: "auto",
    wslCommitGenModel: "",
    wslCommitGenEffort: "",
    wslCommitGenFast: false,
    gitTextLanguage: "",
    locale: "en",
    prAutomationDefault: "off" as const,
  };
  const useSharedSettings = (selector: (state: typeof sharedSettings) => unknown) =>
    selector(sharedSettings);
  useSharedSettings.getState = () => sharedSettings;
  return { useSharedSettings };
});
vi.mock("@/renderer/analytics/productAnalytics", () => ({
  captureProductEvent: vi.fn<() => void>(),
}));
vi.mock("@/renderer/state/usageRecorder", () => ({ recordAiAction: vi.fn<() => void>() }));
vi.mock("@/renderer/state/gitRefresh", () => ({
  startPostPushPrStatusRefresh: vi.fn<() => void>(),
}));
vi.mock("@/renderer/actions/prAutomationActions", () => ({
  applyDefaultPrAutomation: vi.fn<() => Promise<null>>().mockResolvedValue(null),
}));
vi.mock("@/renderer/hooks/usePrWriteActions", () => ({
  usePrWriteActions: () => ({
    prLoading: false,
    pendingAction: null,
    isRefreshing: false,
    handleMergePr: vi.fn<() => Promise<void>>(),
    handleClosePr: vi.fn<() => Promise<void>>(),
    handleMarkPrReady: vi.fn<() => Promise<void>>(),
    handleUpdatePrBranch: vi.fn<() => Promise<void>>(),
    handleRefreshPr: vi.fn<() => Promise<void>>(),
  }),
}));

const STORE_KEY = "pipeline-panel";
const project: Project = {
  id: "project-1",
  name: "Poracode",
  createdAt: "2026-08-18T00:00:00.000Z",
  location: { kind: "windows", path: "C:\\repo" },
};
const gitStatus: GitStatusResult = {
  isRepo: true,
  branch: "feature/pipeline",
  tracking: "origin/feature/pipeline",
  hasRemote: true,
  remoteInfo: {
    url: "https://github.com/example/poracode.git",
    platform: "github",
    owner: "example",
    repo: "poracode",
  },
  ahead: 1,
  behind: 0,
  staged: [{ path: "a.ts", status: "M", staged: true, insertions: 1, deletions: 0 }],
  unstaged: [],
  totalInsertions: 1,
  totalDeletions: 0,
};

type Actions = ReturnType<typeof useGitReviewActions>;

function renderActions(): { current: Actions } {
  const ref = { current: null as unknown as Actions };
  function Harness() {
    ref.current = useGitReviewActions({
      project,
      gitStatus,
      worktreeBranch: undefined,
      worktreePath: undefined,
      storeKey: STORE_KEY,
      isWorktreeStatus: false,
      onRefresh: () => undefined,
      onMergeAndRemove: undefined,
      effectiveBranch: "feature/pipeline",
      effectivePrKey: "project-1:feature/pipeline",
      sourceBranch: "master",
      defaultPrTargetBranch: "master",
    });
    return null;
  }
  renderWithI18n(<Harness />);
  return ref;
}

/** Every value the phase slot takes, in order, including the idle nulls. */
function recordPhases(): { seen: (GitActionPhase | null)[]; stop: () => void } {
  const seen: (GitActionPhase | null)[] = [];
  const stop = useGitReviewActionStore.subscribe(() => {
    const phase = useGitReviewActionStore.getState().panels[STORE_KEY]?.actionPhase ?? null;
    if (seen.at(-1) !== phase) seen.push(phase);
  });
  return { seen, stop };
}

describe("useGitReviewActions action phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGitReviewActionStore.setState({ panels: {} });
    bridgeMock.gitCommit.mockResolvedValue({});
    bridgeMock.gitFetch.mockResolvedValue(undefined);
    bridgeMock.ghCreatePr.mockResolvedValue({
      number: 7,
      state: "open",
      title: "Pipeline",
      url: "https://github.com/example/poracode/pull/7",
      baseBranch: "master",
      isDraft: false,
      updatedAt: "2026-08-18T00:00:00.000Z",
    });
    runGitSyncCommandMock.mockResolvedValue(undefined);
  });

  // "Commit & Create PR" is one user action, so the status line has to walk
  // commit, push and PR without dropping to idle in between — a gap there
  // re-enables every button mid-flow.
  it("keeps one continuous phase across commit, push and PR creation", async () => {
    const actions = renderActions();
    act(() => {
      useGitReviewActionStore.getState().patch(STORE_KEY, { commitMessage: "feat: pipeline" });
    });
    const { seen, stop } = recordPhases();

    await act(async () => {
      await actions.current.handleCommitAndCreatePr(false);
    });
    stop();

    expect(seen).toEqual(["committing", "pushing", "creating-pr", null]);
    expect(bridgeMock.ghCreatePr).toHaveBeenCalledTimes(1);
  });

  // A failed commit must release the slot, or the panel stays locked out.
  it("clears the phase when the chained flow fails at the commit step", async () => {
    bridgeMock.gitCommit.mockRejectedValue(new Error("commit failed"));
    const actions = renderActions();
    act(() => {
      useGitReviewActionStore.getState().patch(STORE_KEY, { commitMessage: "feat: pipeline" });
    });

    await act(async () => {
      await actions.current.handleCommitAndCreatePr(false);
    });

    expect(useGitReviewActionStore.getState().panels[STORE_KEY]?.actionPhase).toBeNull();
    expect(bridgeMock.ghCreatePr).not.toHaveBeenCalled();
  });

  // "Push & Create PR" is the same single-user-action chain for an
  // already-committed branch: one continuous status walk, and never a PR
  // attempt after a failed push.
  it("keeps one continuous phase across push and PR creation", async () => {
    const actions = renderActions();
    const { seen, stop } = recordPhases();

    await act(async () => {
      await actions.current.handlePushAndCreatePr();
    });
    stop();

    expect(seen).toEqual(["pushing", "creating-pr", null]);
    expect(bridgeMock.ghCreatePr).toHaveBeenCalledTimes(1);
  });

  // A failed push must release the slot and hold off on creating the PR.
  it("clears the phase when the chained flow fails at the push step", async () => {
    runGitSyncCommandMock.mockRejectedValueOnce(new Error("push failed"));
    const actions = renderActions();

    await act(async () => {
      await actions.current.handlePushAndCreatePr();
    });

    expect(useGitReviewActionStore.getState().panels[STORE_KEY]?.actionPhase).toBeNull();
    expect(bridgeMock.ghCreatePr).not.toHaveBeenCalled();
  });

  // Every sync-menu entry reports a phase, so none of them can race a commit.
  it.each([
    ["pull", "pulling"],
    ["pullRebase", "pulling"],
    ["push", "pushing"],
    ["sync", "syncing"],
    ["syncRebase", "syncing"],
  ] as const)("reports %s as the %s phase", async (command, expected) => {
    const actions = renderActions();
    const { seen, stop } = recordPhases();

    await act(async () => {
      await actions.current.handleSyncAction(command);
    });
    stop();

    expect(seen).toEqual([expected, null]);
  });

  it("refuses a second action while one already owns the phase slot", async () => {
    const actions = renderActions();
    let releasePush!: () => void;
    runGitSyncCommandMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releasePush = resolve;
        }),
    );

    let pushDone!: Promise<void>;
    act(() => {
      pushDone = actions.current.handleSyncAction("push");
    });
    expect(useGitReviewActionStore.getState().panels[STORE_KEY]?.actionPhase).toBe("pushing");

    await act(async () => {
      await actions.current.handleSyncAction("pull");
    });
    expect(runGitSyncCommandMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      releasePush();
      await pushDone;
    });
    expect(useGitReviewActionStore.getState().panels[STORE_KEY]?.actionPhase).toBeNull();
  });
});
