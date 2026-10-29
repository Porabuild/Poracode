import type { ReactElement } from "react";
import { vi } from "vitest";
import type { RenderResult } from "@testing-library/react";
import type {
  ForgeAccountRef,
  ForgeRepository,
  ForgeReviewCapabilities,
  PrData,
  PrDetails,
} from "@/shared/contracts";
import type { UsePrWriteActionsResult } from "@/renderer/hooks/usePrWriteActions";
import { useGitStore } from "@/renderer/state/gitStore";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import type { PrAskChatSession } from "../chat/prAskSession";
import { PrAskChatContext, type PrAskChat } from "../detail/prAskChat";
import { PrDetailNavProvider, usePrDetailNav } from "../detail/prDetailNav";
import { PrDetailScopeProvider, type PrDetailScope } from "../detail/prDetailScope";

export const TEST_PROJECT_ID = "project-1";
export const TEST_PR_NUMBER = 42;
export const TEST_PR_KEY = `${TEST_PROJECT_ID}:feature/test`;
export const TEST_CACHE_KEY = `${TEST_PROJECT_ID}#${TEST_PR_NUMBER}`;
export const TEST_ACCOUNT: ForgeAccountRef = {
  forge: "github",
  host: "https://github.com",
  login: "viewer",
};

/** Capabilities of a host that can do everything the overlay offers. */
export function makeTestCapabilities(
  overrides: Partial<ForgeReviewCapabilities> = {},
): ForgeReviewCapabilities {
  return {
    mergeMethods: ["merge", "squash", "rebase"],
    reviewDecisions: ["approve", "request-changes", "comment"],
    draft: true,
    reopen: true,
    updateBranch: true,
    rebaseBranch: true,
    edit: true,
    checks: true,
    reviewThreads: true,
    expectedHeadMerge: true,
    autoMerge: true,
    autoFix: true,
    adminMerge: true,
    labels: true,
    reviewRequests: true,
    convertToDraft: true,
    commitDiffs: true,
    reactions: ["+1", "-1", "laugh", "hooray", "confused", "heart", "rocket", "eyes"],
    reviewDrafts: true,
    ...overrides,
  };
}

/** A repository with a pinned account, as `PrDetailScope.scoped` carries it. */
export function makeTestScopedSource(
  capabilities: Partial<ForgeReviewCapabilities> = {},
): ForgeRepository & { account: ForgeAccountRef } {
  return {
    forge: "github",
    host: "https://github.com",
    repository: "owner/repo",
    remote: "origin",
    account: TEST_ACCOUNT,
    capabilities: makeTestCapabilities(capabilities),
  };
}

export function makeTestDetails(overrides: Partial<PrDetails> = {}): PrDetails {
  return {
    source: makeTestScopedSource(),
    number: TEST_PR_NUMBER,
    title: "Improve the overlay",
    body: "",
    author: { login: "author" },
    baseBranch: "main",
    headBranch: "feature/test",
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    mergedAt: null,
    mergedBy: null,
    closedAt: null,
    commits: [],
    comments: [],
    reviews: [],
    checks: [],
    ...overrides,
  };
}

export function makeTestPrData(overrides: Partial<PrData> = {}): PrData {
  return {
    number: TEST_PR_NUMBER,
    state: "open",
    title: "Improve the overlay",
    url: "https://github.com/owner/repo/pull/42",
    baseBranch: "main",
    isDraft: false,
    updatedAt: "2026-07-13T12:00:00Z",
    ...overrides,
  };
}

export function makeTestActions(
  overrides: Partial<UsePrWriteActionsResult> = {},
): UsePrWriteActionsResult {
  return {
    prLoading: false,
    pendingAction: null,
    isRefreshing: false,
    handleMergePr: vi.fn<UsePrWriteActionsResult["handleMergePr"]>(() => Promise.resolve()),
    handleClosePr: vi.fn<UsePrWriteActionsResult["handleClosePr"]>(() => Promise.resolve()),
    handleMarkPrReady: vi.fn<UsePrWriteActionsResult["handleMarkPrReady"]>(() => Promise.resolve()),
    handleReopenPr: vi.fn<UsePrWriteActionsResult["handleReopenPr"]>(() => Promise.resolve()),
    handleConvertPrToDraft: vi.fn<UsePrWriteActionsResult["handleConvertPrToDraft"]>(() =>
      Promise.resolve(),
    ),
    handleUpdatePrBranch: vi.fn<UsePrWriteActionsResult["handleUpdatePrBranch"]>(() =>
      Promise.resolve(),
    ),
    handleEditPr: vi.fn<UsePrWriteActionsResult["handleEditPr"]>(() => Promise.resolve(true)),
    handleRefreshPr: vi.fn<UsePrWriteActionsResult["handleRefreshPr"]>(() => Promise.resolve()),
    ...overrides,
  };
}

/**
 * A scope for a review on a fully capable host, writable and loaded. Pass
 * `scoped: undefined` for an unscoped source, or `readOnly: true` for offline.
 */
export function makeTestScope(overrides: Partial<PrDetailScope> = {}): PrDetailScope {
  const scoped = "scoped" in overrides ? overrides.scoped : makeTestScopedSource();
  return {
    projectId: TEST_PROJECT_ID,
    prKey: TEST_PR_KEY,
    cacheKey: TEST_CACHE_KEY,
    prNumber: TEST_PR_NUMBER,
    location: { kind: "posix", path: "/repo" },
    worktreePath: undefined,
    source: scoped,
    headSha: "abcdef1234567",
    loading: false,
    contentReady: true,
    loadError: null,
    draftKey: TEST_CACHE_KEY,
    readOnly: false,
    cached: false,
    reload: vi.fn<() => void>(),
    onClose: vi.fn<() => void>(),
    actions: makeTestActions(),
    viewed: {
      storage: "device",
      loading: false,
      refresh: () => Promise.resolve(),
      state: () => "unread",
      mark: () => undefined,
      clear: () => undefined,
      absorb: () => undefined,
    },
    viewedLabel: "Viewed here",
    ...overrides,
    scoped,
  };
}

export function makeTestAskChat(overrides: Partial<PrAskChat> = {}): PrAskChat {
  return {
    open: false,
    setOpen: vi.fn<(open: boolean) => void>(),
    ask: vi.fn<(prompt: string, context?: string) => void>(),
    send: vi.fn<(prompt: string, context?: string) => Promise<boolean>>(() =>
      Promise.resolve(true),
    ),
    available: true,
    ...overrides,
  };
}

/**
 * The session the overlay shell hands to the chat panel. Its draft is a plain
 * value with a spy setter: a test that types wraps the panel in its own state.
 */
export function makeTestAskSession(overrides: Partial<PrAskChatSession> = {}): PrAskChatSession {
  return {
    ...makeTestAskChat({ open: true }),
    threadId: undefined,
    starting: false,
    busy: false,
    error: undefined,
    draft: "",
    setDraft: vi.fn<(value: string) => void>(),
    retry: vi.fn<() => void>(),
    openAsThread: vi.fn<() => void>(),
    ...overrides,
  };
}

export interface RenderInPrDetailOptions {
  /** Seeds `prDetails[scope.cacheKey]`; `null` leaves it empty. Defaults to `makeTestDetails()`. */
  details?: PrDetails | null;
  /** Seeds `prData[scope.prKey]` (row-level state). Defaults to an open review. */
  prData?: PrData | null;
  chat?: PrAskChat;
}

/** Shows the active tab so a test can assert a tab switch without a spy. */
function NavProbe() {
  const { tab, commitScope, focusedFile } = usePrDetailNav();
  return (
    <output
      data-testid="pr-nav"
      data-tab={tab}
      data-commit={commitScope ?? ""}
      data-file={focusedFile?.path ?? ""}
      data-line={focusedFile?.line ?? ""}
      data-side={focusedFile?.side ?? ""}
    />
  );
}

/**
 * Renders `ui` as a tab sees it inside the pull-request detail: a scope, the
 * navigation provider (with a `data-testid="pr-nav"` probe exposing the tab,
 * commit scope and focused file) and the ask-chat context. The git store is
 * seeded with the review's details and row data. Returns the Testing Library
 * result plus the scope and chat so a test can assert on their mocks.
 */
export function renderInPrDetail(
  ui: ReactElement,
  overrides: Partial<PrDetailScope> = {},
  options: RenderInPrDetailOptions = {},
): RenderResult & { scope: PrDetailScope; chat: PrAskChat } {
  const scope = makeTestScope(overrides);
  const chat = options.chat ?? makeTestAskChat();
  const details = options.details === undefined ? makeTestDetails() : options.details;
  const prData = options.prData === undefined ? makeTestPrData() : options.prData;
  useGitStore.setState({
    prDetails: details ? { [scope.cacheKey]: details } : {},
    prData: prData ? { [scope.prKey]: prData } : {},
  });
  const result = renderWithI18n(
    <PrDetailScopeProvider value={scope}>
      <PrAskChatContext.Provider value={chat}>
        <PrDetailNavProvider resetKey={scope.cacheKey}>
          <NavProbe />
          {ui}
        </PrDetailNavProvider>
      </PrAskChatContext.Provider>
    </PrDetailScopeProvider>,
  );
  return Object.assign(result, { scope, chat });
}
