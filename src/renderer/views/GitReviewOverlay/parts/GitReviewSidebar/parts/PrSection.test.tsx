import type { ReactNode } from "react";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrData, PrDetails } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useGitStore } from "@/renderer/state/gitStore";
import { PrSection } from "./PrSection";

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
    useGitStore.setState({ prData: { [prKey]: pr }, prDetails: {} });
  });

  it("shows target branch, diff totals, and passed checks", () => {
    useGitStore.getState().setPrDetails(`${projectId}#${pr.number}`, details);
    const onRefreshPr = vi.fn<() => Promise<void>>(async () => undefined);

    render(<PrSection {...baseProps} onRefreshPr={onRefreshPr} />);

    const branch = screen.getByLabelText("Target branch: main");
    expect(branch).toHaveTextContent("main");
    expect(branch).not.toHaveTextContent("Target branch");
    expect(screen.getByText("+51")).toBeInTheDocument();
    expect(screen.getByText("−7")).toBeInTheDocument();
    expect(screen.getByText("2/3").parentElement).toHaveTextContent("Checks: 2/3");
    expect(screen.getByText("Lint").parentElement).toHaveTextContent("46s · Passed");
    expect(screen.getByText("Test").parentElement).toHaveTextContent("Running");
    expect(onRefreshPr).not.toHaveBeenCalled();
  });

  it("requests details once when the compact PR data has no details", async () => {
    const onRefreshPr = vi.fn<() => Promise<void>>(async () => undefined);
    const view = render(<PrSection {...baseProps} onRefreshPr={onRefreshPr} />);

    await waitFor(() => expect(onRefreshPr).toHaveBeenCalledOnce());
    expect(screen.queryByText("+51")).not.toBeInTheDocument();

    view.rerender(<PrSection {...baseProps} onRefreshPr={onRefreshPr} />);
    expect(onRefreshPr).toHaveBeenCalledOnce();
  });
});
