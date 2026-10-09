import {
  generateCommitMessagePayloadSchema,
  generatePrSummaryPayloadSchema,
} from "@/shared/contracts/git";
import type { ModelSelection } from "@/shared/selectionBinding.schemas";
import { act } from "@testing-library/react";
import { useEffect } from "react";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, GitStatusResult, PrData, Project } from "@/shared/contracts";
import {
  useGitReviewActionStore,
  type GitActionPhase,
} from "@/renderer/state/gitReviewActionStore";
import { useGitReviewActions } from "./useGitReviewActions";

const bridgeMock = vi.hoisted(() => ({
  generateCommitMessage: vi.fn<(input: unknown) => Promise<{ message: string }>>(),
  generatePrSummary: vi.fn<(input: unknown) => Promise<{ title: string; description: string }>>(),
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
const utilityState = vi.hoisted(() => ({
  agents: [] as AgentStatus[],
  wslAgents: [] as AgentStatus[],
  settings: {
    commitGenProvider: "auto",
    commitGenModel: "stale",
    commitGenEffort: "stale",
    commitGenFast: true,
    commitGenSelection: undefined as ModelSelection | undefined,
    wslCommitGenProvider: "auto",
    wslCommitGenModel: "stale-wsl",
    wslCommitGenEffort: "stale",
    wslCommitGenFast: true,
    wslCommitGenSelection: undefined as ModelSelection | undefined,
    gitTextLanguage: "",
    locale: "en",
    prAutomationDefault: "off" as const,
  },
}));
vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: (selector: (state: unknown) => unknown) =>
    selector({ agentStatuses: utilityState.agents, wslAgentStatuses: utilityState.wslAgents }),
}));
vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: Object.assign(
    (selector: (state: typeof utilityState.settings) => unknown) => selector(utilityState.settings),
    { getState: () => utilityState.settings },
  ),
}));
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

function renderActions(location = project.location): { current: Actions } {
  const ref = { current: null as unknown as Actions };
  function Harness() {
    const actions = useGitReviewActions({
      project: { ...project, location },
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
    // Publish the latest actions after commit — assigning during render would
    // mutate the outer holder mid-render. Effects flush synchronously inside
    // renderWithI18n/act, so ref.current is fresh whenever a test reads it.
    useEffect(() => {
      ref.current = actions;
    }, [actions]);
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
    utilityState.agents = [];
    utilityState.wslAgents = [];
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

const utilityAgent = (kind: string, model: string): AgentStatus => ({
  kind,
  label: kind,
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [{ id: model, label: model }],
    efforts: ["high"],
    modelEfforts: {},
    defaultEffort: "high",
    supportsOneShot: true,
    modes: [],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    settingDefs: [],
  },
});

describe("utility caller transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGitReviewActionStore.setState({ panels: {} });
    utilityState.agents = [
      utilityAgent("fixture-a", "default-a"),
      utilityAgent("fixture-b", "default-b"),
    ];
    utilityState.wslAgents = [utilityAgent("fixture-wsl", "default-wsl")];
    utilityState.settings.commitGenSelection = undefined;
    utilityState.settings.wslCommitGenSelection = undefined;
    bridgeMock.generateCommitMessage.mockResolvedValue({ message: "generated" });
    bridgeMock.generatePrSummary.mockResolvedValue({ title: "generated", description: "body" });
  });

  it.each([
    { model: "uncatalogued" },
    { model: "uncatalogued", effort: "", fast: false, thinking: false, contextSize: "" },
    { model: "uncatalogued", effort: "unlisted", fast: true, thinking: true, contextSize: "large" },
    { model: "" },
  ])("transports the native canonical tuple through both generation events: %j", async (actual) => {
    const selection = {
      ...actual,
      selectionBinding: {
        version: 1 as const,
        kind: "family-member" as const,
        owner: { agentKind: "fixture-a", presentationMode: "terminal" as const },
        model: actual.model,
        inertValues: { fast: false },
      },
    };
    // Binding models must be nonempty; implicit intent has no binding.
    utilityState.settings.commitGenSelection = actual.model ? selection : actual;
    const expected = actual.model ? selection : { model: "default-a" };
    const actions = renderActions();
    await act(() => actions.current.handleGenerateMessage());
    await act(() => actions.current.handleGeneratePrSummary());
    const commit = generateCommitMessagePayloadSchema.parse(
      bridgeMock.generateCommitMessage.mock.calls[0]?.[0],
    );
    const summary = generatePrSummaryPayloadSchema.parse(
      bridgeMock.generatePrSummary.mock.calls[0]?.[0],
    );
    expect(commit.selection).toStrictEqual(expected);
    expect(summary.selection).toStrictEqual(expected);
  });

  it.each([true, false])("uses the WSL branch with canonical presence %s", async (modern) => {
    const actual = {
      model: "wsl-exact",
      effort: "",
      fast: false,
      thinking: false,
      contextSize: "large",
    };
    utilityState.settings.commitGenSelection = { model: "wrong-native" };
    utilityState.settings.wslCommitGenSelection = modern ? actual : undefined;
    const expected = modern ? actual : { model: "default-wsl", effort: "high", fast: false };
    const actions = renderActions({
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/repo",
      uncPath: String.raw`\\wsl$\Ubuntu\repo`,
    });
    await act(() => actions.current.handleGenerateMessage());
    await act(() => actions.current.handleGeneratePrSummary());
    for (const call of [
      bridgeMock.generateCommitMessage.mock.calls[0],
      bridgeMock.generatePrSummary.mock.calls[0],
    ]) {
      expect(call?.[0]).toMatchObject({ agentKind: "fixture-wsl", selection: expected });
    }
  });

  it.each([undefined, { model: "" }, { model: "exact", fast: false }])(
    "resolves each fallback candidate independently: %j",
    async (selection) => {
      utilityState.settings.commitGenSelection = selection;
      bridgeMock.generatePrSummary.mockRejectedValueOnce(new Error("unavailable"));
      const actions = renderActions();
      await act(() => actions.current.handleGeneratePrSummary());
      expect(bridgeMock.generatePrSummary).toHaveBeenCalledTimes(2);
      for (const [index, model] of ["default-a", "default-b"].entries()) {
        const parsed = generatePrSummaryPayloadSchema.parse(
          bridgeMock.generatePrSummary.mock.calls[index]?.[0],
        );
        expect(parsed.selection).toStrictEqual(
          selection === undefined
            ? { model, effort: "high", fast: false }
            : selection.model
              ? selection
              : { model },
        );
      }
    },
  );
});
