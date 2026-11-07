// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@lingui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GitAddWorktreeResult,
  GitBranchListResult,
  GitFileChange,
  GitStatusResult,
  GitSwitchBranchResult,
  GitWorktreeInfo,
  GitWorktreeListResult,
  PrData,
  PrDetails,
  Project,
  ProjectLocation,
} from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore, type PrReviewContext } from "@/renderer/state/panelStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { PrDetailScopeProvider, type PrDetailScope } from "../prDetailScope";
import {
  makeTestScope,
  makeTestScopedSource,
  TEST_CACHE_KEY,
  TEST_PR_KEY,
  TEST_PROJECT_ID,
} from "../../testing/prDetailTestScope";
import {
  headMismatch,
  resolveCheckoutAvailability,
  usePrCheckout,
  type CheckoutAvailabilityInput,
} from "./usePrCheckout";

const mocks = vi.hoisted(() => ({
  gitFetch: vi.fn<(payload: { remote: string; prune: boolean }) => Promise<void>>(),
  gitListBranches: vi.fn<() => Promise<GitBranchListResult>>(),
  gitListWorktrees: vi.fn<() => Promise<GitWorktreeListResult>>(),
  gitAddWorktree:
    vi.fn<
      (payload: {
        branch?: string;
        startPoint?: string;
        createBranch: boolean;
      }) => Promise<GitAddWorktreeResult>
    >(),
  gitSwitchBranch:
    vi.fn<(payload: { branch: string; createNew: boolean }) => Promise<GitSwitchBranchResult>>(),
  getGitStatus:
    vi.fn<(payload: { projectLocation: ProjectLocation }) => Promise<GitStatusResult>>(),
  gitPull:
    vi.fn<(payload: { projectLocation: ProjectLocation; remote?: string }) => Promise<void>>(),
  gitRemoveWorktree:
    vi.fn<
      (payload: {
        path: string;
        force: boolean;
        deleteBranch: boolean;
        expectedBranch?: string;
      }) => Promise<void>
    >(),
  toastSuccess: vi.fn<(message: string) => void>(),
  toastDanger: vi.fn<(message: string) => void>(),
  initializeCreatedWorktree: vi.fn<(project: Project, path: string) => void>(),
  openNewThreadInWorktree: vi.fn<(input: { worktreePath: string }) => void>(),
  scope: { current: null as PrDetailScope | null },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    gitFetch: mocks.gitFetch,
    gitListBranches: mocks.gitListBranches,
    gitListWorktrees: mocks.gitListWorktrees,
    gitAddWorktree: mocks.gitAddWorktree,
    gitSwitchBranch: mocks.gitSwitchBranch,
    getGitStatus: mocks.getGitStatus,
    gitPull: mocks.gitPull,
    gitRemoveWorktree: mocks.gitRemoveWorktree,
  }),
}));

vi.mock("@heroui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@heroui/react")>()),
  toast: { success: mocks.toastSuccess, danger: mocks.toastDanger },
}));

vi.mock("@/renderer/actions/worktreeInitialization", () => ({
  initializeCreatedWorktree: mocks.initializeCreatedWorktree,
}));

vi.mock("@/renderer/actions/threadActions", () => ({
  openNewThreadInWorktree: mocks.openNewThreadInWorktree,
}));

const PROJECT_ID = TEST_PROJECT_ID;
const PR_KEY = TEST_PR_KEY;
const CACHE_KEY = TEST_CACHE_KEY;
const MAIN_WORKTREE: GitWorktreeInfo = { path: "/repo", branch: "main", commit: "a", isMain: true };
const FEATURE_WORKTREE: GitWorktreeInfo = {
  path: "/wt/feature-login",
  branch: "feature/login",
  commit: "b",
  isMain: false,
};

const project: Project = {
  id: PROJECT_ID,
  name: "Repo",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-01-01T00:00:00Z",
};

function status(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return {
    isRepo: true,
    branch: "main",
    tracking: "origin/main",
    hasRemote: true,
    remoteInfo: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    totalInsertions: 0,
    totalDeletions: 0,
    ...overrides,
  };
}

function change(path: string, staged: boolean): GitFileChange {
  return { path, status: "modified", staged, insertions: 1, deletions: 0 };
}

function prData(overrides: Partial<PrData> = {}): PrData {
  return {
    number: 42,
    state: "open",
    title: "Login",
    url: "https://example.test/pr/42",
    baseBranch: "main",
    isDraft: false,
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function details(headBranch = "feature/login"): PrDetails {
  return {
    number: 42,
    title: "Login",
    body: "",
    baseBranch: "main",
    headBranch,
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    commits: [],
    comments: [],
    reviews: [],
    checks: [],
  };
}

const baseInput: CheckoutAvailabilityInput = {
  headBranch: "feature/login",
  isCrossRepository: false,
  readOnly: false,
  unreachable: false,
  worktrees: [MAIN_WORKTREE],
  status: status(),
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider i18n={i18n}>
      <PrDetailScopeProvider value={mocks.scope.current}>{children}</PrDetailScopeProvider>
    </I18nProvider>
  );
}

function seedStores(options: {
  worktrees?: GitWorktreeInfo[];
  status?: GitStatusResult;
  pr?: Partial<PrData>;
  project?: Project;
}) {
  useAppStore.setState({ projects: [options.project ?? project] });
  useGitStore.setState({
    prDetails: { [CACHE_KEY]: details() },
    prData: { [PR_KEY]: prData(options.pr) },
    worktrees: { [PROJECT_ID]: options.worktrees ?? [MAIN_WORKTREE] },
    statuses: { [PROJECT_ID]: options.status ?? status() },
    branches: {},
  });
}

const existingContext: PrReviewContext = {
  projectId: PROJECT_ID,
  prNumber: 42,
  prKey: PR_KEY,
  skipLocalSync: true,
};

describe("resolveCheckoutAvailability", () => {
  it("offers a new worktree and the repository checkout on a clean main checkout", () => {
    const result = resolveCheckoutAvailability(baseInput);
    expect(result.existingWorktree).toBeUndefined();
    expect(result.newWorktree).toEqual({ enabled: true });
    expect(result.inRepository).toEqual({ enabled: true });
  });

  it("offers the existing non-main worktree and blocks duplicates of it", () => {
    const result = resolveCheckoutAvailability({
      ...baseInput,
      worktrees: [MAIN_WORKTREE, FEATURE_WORKTREE],
    });
    expect(result.existingWorktree).toEqual(FEATURE_WORKTREE);
    expect(result.openExisting).toEqual({ enabled: true });
    expect(result.newWorktree).toEqual({ enabled: false, reason: "worktree-exists" });
    expect(result.inRepository).toEqual({ enabled: false, reason: "checked-out-in-worktree" });
  });

  it("ignores the main worktree even when it has the head branch", () => {
    const result = resolveCheckoutAvailability({
      ...baseInput,
      worktrees: [{ ...MAIN_WORKTREE, branch: "feature/login" }],
      status: status({ branch: "feature/login" }),
    });
    expect(result.existingWorktree).toBeUndefined();
    expect(result.inRepository).toEqual({ enabled: false, reason: "already-current" });
  });

  it("disables only the repository checkout for a dirty tree", () => {
    const dirty = resolveCheckoutAvailability({
      ...baseInput,
      status: status({ unstaged: [change("a.ts", false)] }),
    });
    expect(dirty.newWorktree).toEqual({ enabled: true });
    expect(dirty.inRepository).toEqual({ enabled: false, reason: "dirty" });
    const merging = resolveCheckoutAvailability({
      ...baseInput,
      status: status({ mergeInProgress: true }),
    });
    expect(merging.inRepository).toEqual({ enabled: false, reason: "dirty" });
    const unknown = resolveCheckoutAvailability({ ...baseInput, status: undefined });
    expect(unknown.inRepository).toEqual({ enabled: false, reason: "status-unknown" });
  });

  it.each([
    ["cross-repository", { isCrossRepository: true }],
    ["read-only", { readOnly: true }],
    ["unreachable", { unreachable: true }],
    ["no-head-branch", { headBranch: undefined }],
  ] as const)("disables every action: %s", (reason, patch) => {
    const result = resolveCheckoutAvailability({
      ...baseInput,
      worktrees: [MAIN_WORKTREE, FEATURE_WORKTREE],
      ...patch,
    });
    const blocked = { enabled: false, reason };
    expect(result.openExisting).toEqual(blocked);
    expect(result.newWorktree).toEqual(blocked);
    expect(result.inRepository).toEqual(blocked);
  });

  it("reports cross-repository first when several reasons apply", () => {
    const result = resolveCheckoutAvailability({
      ...baseInput,
      isCrossRepository: true,
      readOnly: true,
    });
    expect(result.newWorktree).toEqual({ enabled: false, reason: "cross-repository" });
  });
});

describe("usePrCheckout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scope.current = makeTestScope();
    mocks.gitFetch.mockResolvedValue(undefined);
    mocks.gitListBranches.mockResolvedValue({
      current: "main",
      branches: [
        { name: "main", current: true, commit: "a", isRemote: false },
        { name: "origin/feature/login", current: false, commit: "b", isRemote: true },
      ],
    });
    mocks.gitListWorktrees.mockResolvedValue({ worktrees: [MAIN_WORKTREE, FEATURE_WORKTREE] });
    mocks.gitAddWorktree.mockResolvedValue({ path: FEATURE_WORKTREE.path });
    mocks.gitSwitchBranch.mockResolvedValue({
      branch: "feature/login",
      created: false,
      tracking: "origin/feature/login",
      ahead: 0,
      behind: 0,
    });
    mocks.getGitStatus.mockImplementation(() => Promise.resolve(status()));
    mocks.gitPull.mockResolvedValue(undefined);
    mocks.gitRemoveWorktree.mockResolvedValue(undefined);
    usePanelStore.getState().setPrReviewContext({ ...existingContext });
    seedStores({});
  });

  afterEach(() => {
    usePanelStore.getState().setPrReviewContext(null);
    useRemoteServersStore.setState({ runtime: {} });
  });

  it("re-reads the worktrees when a review opens, so one removed outside the app leaves the menu", async () => {
    seedStores({ worktrees: [MAIN_WORKTREE, FEATURE_WORKTREE] });
    mocks.gitListWorktrees.mockResolvedValue({ worktrees: [MAIN_WORKTREE] });
    const { result } = renderHook(() => usePrCheckout(), { wrapper });
    expect(result.current.availability.existingWorktree?.path).toBe(FEATURE_WORKTREE.path);

    await waitFor(() => expect(result.current.availability.existingWorktree).toBeUndefined());
    expect(mocks.gitListWorktrees).toHaveBeenCalledTimes(1);
  });

  it("does not read git for a project whose server is unreachable", () => {
    useRemoteServersStore.setState({
      runtime: { mac: { status: "offline", projects: [], threads: [] } },
    });
    useAppStore.setState({
      projects: [{ ...useAppStore.getState().projects[0]!, remoteServerId: "mac" }],
    });
    renderHook(() => usePrCheckout(), { wrapper });
    expect(mocks.gitListWorktrees).not.toHaveBeenCalled();
  });

  it("selects an existing worktree and keeps the other review context fields", () => {
    seedStores({ worktrees: [MAIN_WORKTREE, FEATURE_WORKTREE] });
    usePanelStore
      .getState()
      .setPrReviewContext({ ...existingContext, skipLocalSync: false, prKey: "custom-key" });
    const { result } = renderHook(() => usePrCheckout(), { wrapper });
    act(() => result.current.openExistingWorktree());
    expect(usePanelStore.getState().prReviewContext).toEqual({
      projectId: PROJECT_ID,
      prNumber: 42,
      prKey: PR_KEY,
      worktreePath: FEATURE_WORKTREE.path,
      skipLocalSync: true,
    });
    expect(mocks.gitFetch).not.toHaveBeenCalled();
  });

  it("fetches, then creates the worktree from the remote branch, then selects it", async () => {
    const order: string[] = [];
    mocks.gitFetch.mockImplementation(async () => {
      order.push("fetch");
    });
    mocks.gitAddWorktree.mockImplementation(async () => {
      order.push("add");
      return { path: FEATURE_WORKTREE.path };
    });
    mocks.scope.current = makeTestScope({
      source: { ...makeTestScopedSource(), remote: "upstream" },
    });
    const { result } = renderHook(() => usePrCheckout(), { wrapper });

    await act(() => result.current.checkoutInNewWorktree());

    expect(order).toEqual(["fetch", "add"]);
    expect(mocks.gitFetch).toHaveBeenCalledWith(expect.objectContaining({ remote: "upstream" }));
    expect(mocks.gitAddWorktree).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "feature/login",
        startPoint: "upstream/feature/login",
        createBranch: true,
      }),
    );
    // The worktree has no thread, so the host refuses (403) any read addressed to it.
    expect(mocks.initializeCreatedWorktree).toHaveBeenCalledWith(project, FEATURE_WORKTREE.path, {
      trackGitState: false,
    });
    expect(mocks.getGitStatus).not.toHaveBeenCalled();
    expect(mocks.gitPull).not.toHaveBeenCalled();
    expect(usePanelStore.getState().prReviewContext).toMatchObject({
      worktreePath: FEATURE_WORKTREE.path,
      skipLocalSync: true,
    });
    expect(useGitStore.getState().worktrees[PROJECT_ID]).toEqual([MAIN_WORKTREE, FEATURE_WORKTREE]);
    expect(result.current.busy).toBeNull();
  });

  it("reuses an existing local branch instead of recreating it", async () => {
    mocks.gitListBranches.mockResolvedValue({
      current: "main",
      branches: [{ name: "feature/login", current: false, commit: "b", isRemote: false }],
    });
    const { result } = renderHook(() => usePrCheckout(), { wrapper });
    await act(() => result.current.checkoutInNewWorktree());
    const payload = mocks.gitAddWorktree.mock.calls[0]?.[0];
    expect(payload?.createBranch).toBe(false);
    expect(payload?.startPoint).toBeUndefined();
  });

  it("leaves the context untouched when the fetch fails", async () => {
    mocks.gitFetch.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => usePrCheckout(), { wrapper });
    await act(() => result.current.checkoutInNewWorktree());
    expect(mocks.gitAddWorktree).not.toHaveBeenCalled();
    expect(usePanelStore.getState().prReviewContext).toEqual(existingContext);
    expect(mocks.toastDanger).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBeNull();
  });

  it("leaves the context untouched when creating the worktree fails", async () => {
    mocks.gitAddWorktree.mockRejectedValue(new Error("worktree exists"));
    const { result } = renderHook(() => usePrCheckout(), { wrapper });
    await act(() => result.current.checkoutInNewWorktree());
    expect(usePanelStore.getState().prReviewContext).toEqual(existingContext);
    expect(mocks.initializeCreatedWorktree).not.toHaveBeenCalled();
    expect(mocks.toastDanger).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("does not select the worktree when the user moved to another review", async () => {
    const { result } = renderHook(() => usePrCheckout(), { wrapper });
    mocks.gitAddWorktree.mockImplementation(async () => {
      usePanelStore.getState().setPrReviewContext({ ...existingContext, prNumber: 99 });
      return { path: FEATURE_WORKTREE.path };
    });
    await act(() => result.current.checkoutInNewWorktree());
    expect(usePanelStore.getState().prReviewContext?.prNumber).toBe(99);
    expect(usePanelStore.getState().prReviewContext?.worktreePath).toBeUndefined();
  });

  it("switches the main checkout to the head branch after a fetch", async () => {
    const order: string[] = [];
    mocks.gitFetch.mockImplementation(async () => {
      order.push("fetch");
    });
    mocks.gitSwitchBranch.mockImplementation(async (payload) => {
      order.push("switch");
      return {
        branch: payload.branch,
        created: false,
        tracking: "origin/feature/login",
        ahead: 1,
        behind: 2,
      };
    });
    const { result } = renderHook(() => usePrCheckout(), { wrapper });
    await act(() => result.current.checkoutInRepository());
    expect(order).toEqual(["fetch", "switch"]);
    expect(mocks.gitSwitchBranch).toHaveBeenCalledWith(
      expect.objectContaining({ branch: "feature/login", createNew: false }),
    );
    expect(useGitStore.getState().statuses[PROJECT_ID]).toMatchObject({
      branch: "feature/login",
      ahead: 1,
      behind: 2,
    });
    expect(usePanelStore.getState().prReviewContext).toEqual(existingContext);
  });

  it("refuses the repository checkout on a dirty tree without calling git", async () => {
    seedStores({ status: status({ staged: [change("a.ts", true)] }) });
    const { result } = renderHook(() => usePrCheckout(), { wrapper });
    expect(result.current.availability.inRepository).toEqual({ enabled: false, reason: "dirty" });
    await act(() => result.current.checkoutInRepository());
    expect(mocks.gitFetch).not.toHaveBeenCalled();
    expect(mocks.gitSwitchBranch).not.toHaveBeenCalled();
  });

  it("surfaces a failed repository switch and changes nothing", async () => {
    mocks.gitSwitchBranch.mockRejectedValue(new Error("would overwrite local changes"));
    const { result } = renderHook(() => usePrCheckout(), { wrapper });
    await act(() => result.current.checkoutInRepository());
    expect(mocks.toastDanger).toHaveBeenCalledTimes(1);
    expect(useGitStore.getState().statuses[PROJECT_ID]?.branch).toBe("main");
  });

  it("refuses every write for a cross-repository pull request", async () => {
    seedStores({ pr: { isCrossRepository: true }, worktrees: [MAIN_WORKTREE, FEATURE_WORKTREE] });
    const { result } = renderHook(() => usePrCheckout(), { wrapper });
    act(() => result.current.openExistingWorktree());
    await act(() => result.current.checkoutInNewWorktree());
    await act(() => result.current.checkoutInRepository());
    expect(mocks.gitFetch).not.toHaveBeenCalled();
    expect(usePanelStore.getState().prReviewContext).toEqual(existingContext);
  });

  it("refuses every write while the review is read-only", async () => {
    mocks.scope.current = makeTestScope({ readOnly: true });
    const { result } = renderHook(() => usePrCheckout(), { wrapper });
    await act(() => result.current.checkoutInNewWorktree());
    expect(mocks.gitFetch).not.toHaveBeenCalled();
    expect(result.current.availability.newWorktree).toEqual({
      enabled: false,
      reason: "read-only",
    });
  });

  it("disables everything for a project whose server is unreachable", () => {
    const remote: Project = { ...project, remoteServerId: "server-1" };
    seedStores({ project: remote });
    useRemoteServersStore.setState({
      runtime: { "server-1": { status: "offline", projects: [], threads: [] } },
    });
    const { result } = renderHook(() => usePrCheckout(), { wrapper });
    expect(result.current.availability.newWorktree).toEqual({
      enabled: false,
      reason: "unreachable",
    });
    expect(result.current.canOpenInApp).toBe(false);
  });

  it("re-reads the live status after the fetch and refuses when the tree became dirty", async () => {
    // The store still holds the clean status that was cached before the fetch.
    mocks.getGitStatus.mockImplementation(() =>
      Promise.resolve(status({ unstaged: [change("edited.ts", false)] })),
    );
    const { result } = renderHook(() => usePrCheckout(), { wrapper });
    expect(result.current.availability.inRepository).toEqual({ enabled: true });
    await act(() => result.current.checkoutInRepository());
    expect(mocks.getGitStatus).toHaveBeenCalledTimes(1);
    expect(mocks.gitSwitchBranch).not.toHaveBeenCalled();
    expect(mocks.toastDanger).toHaveBeenCalledWith(
      "Commit or stash your uncommitted changes first",
    );
    expect(useGitStore.getState().statuses[PROJECT_ID]?.unstaged).toHaveLength(1);
    expect(result.current.busy).toBeNull();
  });

  it("reads the live status between the fetch and the switch", async () => {
    const order: string[] = [];
    mocks.gitFetch.mockImplementation(async () => {
      order.push("fetch");
    });
    mocks.getGitStatus.mockImplementation(async () => {
      order.push("status");
      return status();
    });
    mocks.gitSwitchBranch.mockImplementation(async () => {
      order.push("switch");
      return { branch: "feature/login", created: false, tracking: "", ahead: 0, behind: 0 };
    });
    const { result } = renderHook(() => usePrCheckout(), { wrapper });
    await act(() => result.current.checkoutInRepository());
    expect(order).toEqual(["fetch", "status", "switch"]);
  });

  it("does not switch when the live status cannot be read", async () => {
    mocks.getGitStatus.mockRejectedValue(new Error("status failed"));
    const { result } = renderHook(() => usePrCheckout(), { wrapper });
    await act(() => result.current.checkoutInRepository());
    expect(mocks.gitSwitchBranch).not.toHaveBeenCalled();
    expect(mocks.toastDanger).toHaveBeenCalledTimes(1);
  });

  it("shows an operation only on the review it started on", async () => {
    let finishAdd: (value: GitAddWorktreeResult) => void = () => {};
    mocks.gitAddWorktree.mockImplementation(
      () =>
        new Promise<GitAddWorktreeResult>((resolve) => {
          finishAdd = resolve;
        }),
    );
    const first = makeTestScope();
    const second = makeTestScope({
      prNumber: 43,
      cacheKey: `${PROJECT_ID}#43`,
      prKey: `${PR_KEY}-43`,
    });
    useGitStore.setState({
      prDetails: { [CACHE_KEY]: details(), [second.cacheKey]: details("feature/other") },
      prData: { [PR_KEY]: prData(), [second.prKey]: prData({ number: 43 }) },
    });
    mocks.scope.current = first;
    const { result, rerender } = renderHook(() => usePrCheckout(), { wrapper });
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.checkoutInNewWorktree();
    });
    await waitFor(() => expect(result.current.busy).toBe("worktree"));

    mocks.scope.current = second;
    rerender();
    expect(result.current.busy).toBeNull();
    expect(result.current.availability.newWorktree).toEqual({ enabled: true });
    // Back on the first review the operation is still shown, and cannot start twice.
    mocks.scope.current = first;
    rerender();
    expect(result.current.busy).toBe("worktree");
    await act(() => result.current.checkoutInNewWorktree());
    expect(mocks.gitFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishAdd({ path: FEATURE_WORKTREE.path });
      await pending;
    });
    expect(result.current.busy).toBeNull();
  });

  describe("a local branch that is not at the review head", () => {
    const LOCAL_TIP = "1111111aaaa";
    const HEAD = "abcdef1234567";

    function branchesWithStaleLocal(remoteTip = HEAD): GitBranchListResult {
      return {
        current: "main",
        branches: [
          { name: "main", current: true, commit: "a", isRemote: false },
          { name: "feature/login", current: false, commit: LOCAL_TIP, isRemote: false },
          { name: "origin/feature/login", current: false, commit: remoteTip, isRemote: true },
        ],
      };
    }

    beforeEach(() => {
      mocks.gitListBranches.mockResolvedValue(branchesWithStaleLocal());
    });

    it.each([
      ["lags behind the fetched head", HEAD],
      ["has diverged from the fetched head", "2222222bbbb"],
    ])("refuses a local branch that %s before creating a worktree", async (_name, remoteTip) => {
      mocks.gitListBranches.mockResolvedValue(branchesWithStaleLocal(remoteTip));
      const { result } = renderHook(() => usePrCheckout(), { wrapper });
      await act(() => result.current.checkoutInNewWorktree());

      // Advancing the branch would need git inside a worktree that has no thread, which
      // the host refuses (403), so nothing is created and nothing needs undoing.
      expect(mocks.gitAddWorktree).not.toHaveBeenCalled();
      expect(mocks.gitRemoveWorktree).not.toHaveBeenCalled();
      expect(mocks.getGitStatus).not.toHaveBeenCalled();
      expect(mocks.gitPull).not.toHaveBeenCalled();
      expect(mocks.initializeCreatedWorktree).not.toHaveBeenCalled();
      expect(usePanelStore.getState().prReviewContext).toEqual(existingContext);
      expect(mocks.toastSuccess).not.toHaveBeenCalled();
      const message = mocks.toastDanger.mock.calls[0]?.[0] ?? "";
      expect(message).toContain(
        '"git fetch origin && git switch feature/login && git merge --ff-only origin/feature/login"',
      );
      expect(message).toContain('"git branch -m feature/login feature/login-old"');
      expect(message).toContain("nothing was changed");
      expect(result.current.busy).toBeNull();
    });

    it("creates the worktree on a local branch that already is the head", async () => {
      mocks.gitListBranches.mockResolvedValue({
        current: "main",
        branches: [
          { name: "main", current: true, commit: "a", isRemote: false },
          { name: "feature/login", current: false, commit: HEAD, isRemote: false },
          { name: "origin/feature/login", current: false, commit: HEAD, isRemote: true },
        ],
      });
      const { result } = renderHook(() => usePrCheckout(), { wrapper });
      await act(() => result.current.checkoutInNewWorktree());
      expect(mocks.gitAddWorktree).toHaveBeenCalledWith(
        expect.objectContaining({ branch: "feature/login", createBranch: false }),
      );
      expect(mocks.toastDanger).not.toHaveBeenCalled();
    });

    it("refuses without creating anything when the remote branch is not the head either", async () => {
      mocks.gitListBranches.mockResolvedValue(branchesWithStaleLocal("2222222bbbb"));
      const { result } = renderHook(() => usePrCheckout(), { wrapper });
      await act(() => result.current.checkoutInNewWorktree());
      expect(mocks.gitAddWorktree).not.toHaveBeenCalled();
      expect(mocks.gitRemoveWorktree).not.toHaveBeenCalled();
      expect(mocks.toastDanger).toHaveBeenCalledTimes(1);
    });

    it("refuses the repository checkout with the exact commands and changes nothing", async () => {
      const { result } = renderHook(() => usePrCheckout(), { wrapper });
      await act(() => result.current.checkoutInRepository());
      expect(mocks.getGitStatus).not.toHaveBeenCalled();
      expect(mocks.gitSwitchBranch).not.toHaveBeenCalled();
      const message = mocks.toastDanger.mock.calls[0]?.[0] ?? "";
      expect(message).toContain(
        '"git fetch origin && git switch feature/login && git merge --ff-only origin/feature/login"',
      );
      expect(message).toContain('"git branch -m feature/login feature/login-old"');
    });

    it("does not print commands for a branch name a shell could interpret", async () => {
      const unsafe = "feature/$(touch pwned)";
      useGitStore.setState({ prDetails: { [CACHE_KEY]: details(unsafe) } });
      mocks.gitListBranches.mockResolvedValue({
        current: "main",
        branches: [
          { name: unsafe, current: false, commit: LOCAL_TIP, isRemote: false },
          { name: `origin/${unsafe}`, current: false, commit: HEAD, isRemote: true },
        ],
      });
      const { result } = renderHook(() => usePrCheckout(), { wrapper });
      await act(() => result.current.checkoutInRepository());
      const message = mocks.toastDanger.mock.calls[0]?.[0] ?? "";
      expect(message).toContain(unsafe);
      expect(message).not.toContain("git switch");
      expect(message).not.toContain("git branch -m");
    });
  });

  it("starts a thread in the worktree and leaves the overlay", () => {
    seedStores({ worktrees: [MAIN_WORKTREE, FEATURE_WORKTREE] });
    const scope = makeTestScope();
    mocks.scope.current = scope;
    const { result } = renderHook(() => usePrCheckout(), { wrapper });
    expect(result.current.canOpenInApp).toBe(true);
    act(() => result.current.openWorktreeInApp());
    expect(mocks.openNewThreadInWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: FEATURE_WORKTREE.path }),
    );
    expect(scope.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("headMismatch", () => {
  const branches = (list: { name: string; commit: string; isRemote: boolean }[]) =>
    ({
      current: "main",
      branches: list.map((branch) => ({ current: false, ...branch })),
    }) as GitBranchListResult;

  it("accepts a branch whose tip is the review head, abbreviated or not", () => {
    const list = branches([{ name: "origin/fix", commit: "abcdef1234567", isRemote: true }]);
    expect(headMismatch(list, "fix", "origin", "abcdef1234567890")).toBeNull();
    expect(headMismatch(list, "fix", "origin", "abcdef1")).toBeNull();
  });

  it("flags a remote branch that is not the head, such as a fork's same-named branch", () => {
    const list = branches([{ name: "origin/fix", commit: "1111111aaaa", isRemote: true }]);
    expect(headMismatch(list, "fix", "origin", "abcdef1234567")).toBe("remote");
  });

  it("prefers the local branch and flags a stale one", () => {
    const list = branches([
      { name: "fix", commit: "1111111aaaa", isRemote: false },
      { name: "origin/fix", commit: "abcdef1234567", isRemote: true },
    ]);
    expect(headMismatch(list, "fix", "origin", "abcdef1234567")).toBe("local");
  });

  it("does not guess when the head or the branch is unknown", () => {
    const list = branches([{ name: "origin/fix", commit: "1111111aaaa", isRemote: true }]);
    expect(headMismatch(list, "fix", "origin", undefined)).toBeNull();
    expect(headMismatch(list, "other", "origin", "abcdef1234567")).toBeNull();
    expect(headMismatch(undefined, "fix", "origin", "abcdef1234567")).toBeNull();
  });
});

describe("resolveCheckoutAvailability option-like branch names", () => {
  it("refuses a head branch git would read as an option", () => {
    const result = resolveCheckoutAvailability({
      headBranch: "--discard-changes",
      isCrossRepository: false,
      readOnly: false,
      unreachable: false,
      worktrees: [],
      status: undefined,
    });
    expect(result.inRepository.enabled).toBe(false);
    expect(result.newWorktree.enabled).toBe(false);
  });
});
