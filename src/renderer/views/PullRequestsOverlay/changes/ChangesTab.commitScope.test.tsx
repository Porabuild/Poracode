// @vitest-environment jsdom
import { useState, type ReactNode } from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ForgePrCommitDiffResult } from "@/shared/contracts";
import { PrDetailScopeProvider, usePrDetailScope } from "../detail/prDetailScope";
import {
  makeTestDetails,
  makeTestScopedSource,
  renderInPrDetail,
} from "../testing/prDetailTestScope";
import { ChangesTab } from "./ChangesTab";
import {
  bridge,
  navHandle,
  NavCapture,
  clearReview,
  COMMIT_DIFF,
  COMMITS,
  resetBridge,
  seedReview,
} from "./changesFixtures";

vi.mock("@/renderer/bridge", async () => {
  const { bridge: fake } = await import("./changesFixtures");
  return { readBridge: () => fake, isRemoteSession: () => false, isMac: () => false };
});
vi.mock("@git-diff-view/react", async (importOriginal) => {
  const { FakeDiffView } = await import("./changesFixtures");
  return {
    ...(await importOriginal<typeof import("@git-diff-view/react")>()),
    DiffView: FakeDiffView,
  };
});
vi.mock("../../GitReviewOverlay/parts/diffBuildClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../GitReviewOverlay/parts/diffBuildClient")>()),
  useDiffTheme: () => "light" as const,
}));

const [FIRST, SECOND] = COMMITS.map((commit) => commit.oid) as [string, string];
/** Lets a test move the review's head, as a push does. */
function HeadSwitch(props: { children: ReactNode }) {
  const base = usePrDetailScope();
  const [headSha, setHeadSha] = useState(base.headSha);
  return (
    <PrDetailScopeProvider value={{ ...base, headSha }}>
      <button type="button" onClick={() => setHeadSha("fedcba9876543")}>
        push
      </button>
      {props.children}
    </PrDetailScopeProvider>
  );
}

function renderTab(capabilities: Parameters<typeof makeTestScopedSource>[0] = {}) {
  const scoped = makeTestScopedSource(capabilities);
  return renderInPrDetail(
    <>
      <NavCapture />
      <HeadSwitch>
        <ChangesTab />
      </HeadSwitch>
    </>,
    { scoped, source: scoped },
    { details: makeTestDetails({ commits: COMMITS, source: scoped }) },
  );
}

function deferred() {
  return Promise.withResolvers<ForgePrCommitDiffResult>();
}

function commitCalls() {
  return bridge.forgeGetPrCommitDiff.mock.calls.map(([input]) => input);
}

describe("ChangesTab commit scope", () => {
  beforeEach(() => {
    resetBridge();
    Element.prototype.scrollIntoView = vi.fn<() => void>();
    navHandle.current = undefined;
    clearReview();
    seedReview();
  });

  it("offers a commit select with each commit's short sha and headline", async () => {
    renderTab();
    const select = screen.getByRole("button", { name: /Commit scope/ });
    fireEvent.click(select);
    const menu = await screen.findByRole("menu", { name: "Commit scope" });
    expect(within(menu).getByText("All changes")).toBeInTheDocument();
    expect(within(menu).getByText("1111111")).toBeInTheDocument();
    expect(within(menu).getByText("First commit")).toBeInTheDocument();
    expect(within(menu).getByText("2222222")).toBeInTheDocument();
    expect(within(menu).getByText("Second commit")).toBeInTheDocument();
  });

  it("hides the select and never requests a commit diff without the capability", () => {
    renderTab({ commitDiffs: undefined });
    expect(screen.queryByRole("button", { name: /Commit scope/ })).not.toBeInTheDocument();
    act(() => navHandle.current?.setCommitScope(FIRST));
    expect(bridge.forgeGetPrCommitDiff).not.toHaveBeenCalled();
    // The whole-review diff stays on screen.
    expect(document.querySelector('section[data-diff-path="src/a.ts"]')).not.toBeNull();
  });

  it("loads the chosen commit, lists its files from the diff, and hides viewed and comment UI", async () => {
    bridge.forgeGetPrCommitDiff.mockResolvedValue({ diff: COMMIT_DIFF });
    renderTab();
    act(() => navHandle.current?.setCommitScope(FIRST));
    await waitFor(() =>
      expect(
        document.querySelector('section[data-diff-path="src/only-in-commit.ts"]'),
      ).not.toBeNull(),
    );
    expect(bridge.forgeGetPrCommitDiff).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        commit: FIRST,
        prNumber: 42,
        forgeRepository: "owner/repo",
        forgeAccount: expect.objectContaining({ login: "viewer" }),
      }),
    );
    expect(document.querySelector('section[data-diff-path="src/a.ts"]')).toBeNull();
    const tree = screen.getByRole("navigation", { name: "Changed files" });
    expect(within(tree).getByText("only-in-commit.ts")).toBeInTheDocument();
    expect(within(tree).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(tree).queryByText(/viewed/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /only available on the whole review/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Comment on/ })).not.toBeInTheDocument();
  });

  it("shows a loading state, then an error with a working retry", async () => {
    const first = deferred();
    bridge.forgeGetPrCommitDiff.mockReturnValueOnce(first.promise);
    renderTab();
    act(() => navHandle.current?.setCommitScope(FIRST));
    expect(document.querySelector("section[data-diff-path]")).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await act(async () => {
      first.reject(new Error("host exploded"));
      await first.promise.catch(() => undefined);
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("host exploded");
    bridge.forgeGetPrCommitDiff.mockResolvedValueOnce({ diff: COMMIT_DIFF });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        document.querySelector('section[data-diff-path="src/only-in-commit.ts"]'),
      ).not.toBeNull(),
    );
    expect(bridge.forgeGetPrCommitDiff).toHaveBeenCalledTimes(2);
  });

  it("ignores a response for a commit that is no longer selected", async () => {
    const slow = deferred();
    const fast = deferred();
    bridge.forgeGetPrCommitDiff.mockImplementation((input) =>
      (input as { commit: string }).commit === FIRST ? slow.promise : fast.promise,
    );
    renderTab();
    act(() => navHandle.current?.setCommitScope(FIRST));
    act(() => navHandle.current?.setCommitScope(SECOND));
    await act(async () => {
      fast.resolve({ diff: COMMIT_DIFF.replaceAll("only-in-commit", "second-only") });
      await fast.promise;
    });
    await waitFor(() =>
      expect(document.querySelector('section[data-diff-path="src/second-only.ts"]')).not.toBeNull(),
    );
    await act(async () => {
      slow.resolve({ diff: COMMIT_DIFF });
      await slow.promise;
    });
    expect(document.querySelector('section[data-diff-path="src/only-in-commit.ts"]')).toBeNull();
    expect(document.querySelector('section[data-diff-path="src/second-only.ts"]')).not.toBeNull();
  });

  it("reuses a loaded commit, and asks again after the head moves", async () => {
    bridge.forgeGetPrCommitDiff.mockResolvedValue({ diff: COMMIT_DIFF });
    renderTab();
    act(() => navHandle.current?.setCommitScope(FIRST));
    await waitFor(() => expect(commitCalls()).toHaveLength(1));
    await waitFor(() =>
      expect(
        document.querySelector('section[data-diff-path="src/only-in-commit.ts"]'),
      ).not.toBeNull(),
    );
    act(() => navHandle.current?.setCommitScope(null));
    expect(document.querySelector('section[data-diff-path="src/a.ts"]')).not.toBeNull();
    act(() => navHandle.current?.setCommitScope(FIRST));
    expect(
      document.querySelector('section[data-diff-path="src/only-in-commit.ts"]'),
    ).not.toBeNull();
    expect(commitCalls()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "push" }));
    await waitFor(() => expect(commitCalls()).toHaveLength(2));
  });

  it("returns to the whole review from the select", async () => {
    bridge.forgeGetPrCommitDiff.mockResolvedValue({ diff: COMMIT_DIFF });
    renderTab();
    act(() => navHandle.current?.setCommitScope(SECOND));
    await waitFor(() =>
      expect(
        document.querySelector('section[data-diff-path="src/only-in-commit.ts"]'),
      ).not.toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Commit scope/ }));
    fireEvent.click(
      within(await screen.findByRole("menu", { name: "Commit scope" })).getByText("All changes"),
    );
    await waitFor(() =>
      expect(document.querySelector('section[data-diff-path="src/a.ts"]')).not.toBeNull(),
    );
    expect(screen.getByTestId("pr-nav")).toHaveAttribute("data-commit", "");
  });
});
