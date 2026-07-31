import type { ReactNode } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrData, PrDetails, PrWatch } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useGitStore } from "@/renderer/state/gitStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { PrSection } from "./PrSection";

const prWatchControls = vi.hoisted(() => vi.fn<(props: unknown) => void>());

vi.mock("./PrWatchControls", () => ({
  PrWatchControls: (props: unknown) => {
    prWatchControls(props);
    return <div data-testid="pr-watch-controls" />;
  },
}));

vi.mock("@heroui/react", () => {
  function Wrapper(props: { children?: ReactNode }) {
    return <>{props.children}</>;
  }

  function Button(props: {
    children?: ReactNode | ((state: { isPending: boolean }) => ReactNode);
    isDisabled?: boolean;
    isPending?: boolean;
    onPress?: () => void;
  }) {
    return (
      <button type="button" disabled={props.isDisabled} onClick={props.onPress}>
        {typeof props.children === "function"
          ? props.children({ isPending: props.isPending ?? false })
          : props.children}
      </button>
    );
  }

  const ButtonGroup = Object.assign(Wrapper, { Separator: () => null });
  const Dropdown = Object.assign(Wrapper, {
    Popover: Wrapper,
    Menu: Wrapper,
    Item: Wrapper,
  });
  const Tooltip = Object.assign(Wrapper, {
    Trigger: Wrapper,
    Content: Wrapper,
  });

  return {
    Button,
    ButtonGroup,
    Dropdown,
    Label: Wrapper,
    Link: Wrapper,
    Separator: () => null,
    ToggleButton: Button,
    Tooltip,
  };
});

const prKey = "C:\\repo-worktree";
const projectId = "project-1";
const pr: PrData = {
  number: 42,
  state: "open",
  title: "Improve PR summary",
  url: "https://github.com/example/poracode/pull/42",
  baseBranch: "main",
  isDraft: false,
  checksStatus: "PENDING",
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  updatedAt: "2026-07-13T12:00:00Z",
};

const details: PrDetails = {
  number: 42,
  title: pr.title,
  body: "",
  baseBranch: "main",
  headBranch: "feature/pr-summary",
  additions: 51,
  deletions: 7,
  changedFiles: 4,
  mergedAt: null,
  mergedBy: null,
  closedAt: null,
  commits: [],
  comments: [],
  reviews: [],
  checks: [
    {
      name: "Lint",
      state: "COMPLETED",
      conclusion: "SUCCESS",
      startedAt: "2026-07-13T12:00:00Z",
      completedAt: "2026-07-13T12:00:46Z",
    },
    { name: "Typecheck", state: "SUCCESS", conclusion: "" },
    { name: "Test", state: "IN_PROGRESS", conclusion: "" },
  ],
};

const baseProps = {
  prKey,
  projectId,
  prLoading: false,
  handleMergePr: vi.fn<(method: "merge" | "squash" | "rebase", admin?: boolean) => Promise<void>>(
    async () => undefined,
  ),
  handleClosePr: vi.fn<() => Promise<void>>(async () => undefined),
  handleMarkPrReady: vi.fn<() => Promise<void>>(async () => undefined),
};

describe("PrSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prWatchControls.mockClear();
    useGitStore.setState({ prData: { [prKey]: pr }, prDetails: {} });
    useSharedSettings.setState({ prMergeMethod: "squash" });
  });

  it("shows target branch, diff totals, and passed checks", () => {
    useGitStore.getState().setPrDetails(`${projectId}#${pr.number}`, details);
    const onRefreshPr = vi.fn<() => Promise<void>>(async () => undefined);
    const onInitialWatchUsed = vi.fn<() => void>();
    const initialWatch = {
      projectId,
      prNumber: pr.number,
      headBranch: details.headBranch,
      watchEnabled: true,
      autoMerge: true,
      agentKind: "codex",
      config: { model: "gpt-5.7" },
      lastCommentCursor: null,
      lastReviewCommentCursor: null,
      lastReviewCursor: null,
      lastCheckKey: null,
      activeThreadId: null,
      lastError: null,
    } satisfies PrWatch;

    render(
      <PrSection
        {...baseProps}
        onRefreshPr={onRefreshPr}
        initialWatch={initialWatch}
        onInitialWatchUsed={onInitialWatchUsed}
      />,
    );

    const branch = screen.getByLabelText("Target branch: main");
    expect(branch).toHaveTextContent("main");
    expect(branch).not.toHaveTextContent("Target branch");
    expect(screen.getByText("+51")).toBeInTheDocument();
    expect(screen.getByText("−7")).toBeInTheDocument();
    expect(screen.getByText("2/3").parentElement).toHaveTextContent("Checks: 2/3");
    expect(screen.getByText("Lint").parentElement).toHaveTextContent("46s · Passed");
    expect(screen.getByText("Test").parentElement).toHaveTextContent("Running");
    expect(onRefreshPr).not.toHaveBeenCalled();
    expect(screen.getByTestId("pr-watch-controls")).toBeInTheDocument();
    expect(prWatchControls).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        prNumber: 42,
        headBranch: "feature/pr-summary",
        initialWatch,
        onInitialWatchUsed,
      }),
    );
  });

  it("requests details once when the compact PR data has no details", async () => {
    const onRefreshPr = vi.fn<() => Promise<void>>(async () => undefined);
    const view = render(<PrSection {...baseProps} onRefreshPr={onRefreshPr} />);

    await waitFor(() => expect(onRefreshPr).toHaveBeenCalledOnce());
    expect(screen.queryByText("+51")).not.toBeInTheDocument();

    view.rerender(<PrSection {...baseProps} onRefreshPr={onRefreshPr} />);
    expect(onRefreshPr).toHaveBeenCalledOnce();
  });

  it("shows a danger status when merge conflicts must be resolved", () => {
    useGitStore.setState({
      prData: {
        [prKey]: {
          ...pr,
          checksStatus: "SUCCESS",
          mergeable: "CONFLICTING",
          mergeStateStatus: "DIRTY",
        },
      },
    });

    render(<PrSection {...baseProps} />);

    const indicator = screen
      .getByText("#42 - Improve PR summary")
      .parentElement?.querySelector(".rounded-full");
    expect(indicator).toHaveClass("bg-danger");
    expect(indicator).not.toHaveClass("bg-success");
  });

  it.each(["CHANGES_REQUESTED", "REVIEW_REQUIRED"])(
    "shows a danger status for %s when merge-state data is missing",
    (reviewDecision) => {
      useGitStore.setState({
        prData: {
          [prKey]: {
            number: pr.number,
            state: pr.state,
            title: pr.title,
            url: pr.url,
            baseBranch: pr.baseBranch,
            isDraft: pr.isDraft,
            checksStatus: "SUCCESS",
            reviewDecision,
            updatedAt: pr.updatedAt,
          },
        },
      });

      render(<PrSection {...baseProps} />);

      const indicator = screen
        .getByText("#42 - Improve PR summary")
        .parentElement?.querySelector(".rounded-full");
      expect(indicator).toHaveClass("bg-danger");
      expect(indicator).not.toHaveClass("bg-success");
    },
  );

  it("uses the selected merge method for the primary merge action", () => {
    useSharedSettings.setState({ prMergeMethod: "merge" });
    render(<PrSection {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Merge PR: Commit" }));

    expect(baseProps.handleMergePr).toHaveBeenCalledWith("merge", false);
  });
});
