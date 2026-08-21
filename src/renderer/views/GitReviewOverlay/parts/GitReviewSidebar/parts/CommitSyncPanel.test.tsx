import { screen } from "@testing-library/react";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { GitActionPhase } from "@/renderer/state/gitReviewActionStore";
import type { CommitDefaultAction } from "@/shared/contracts";
import { CommitSyncPanel } from "./CommitSyncPanel";

vi.mock("@heroui/react", () => {
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
  const ButtonGroup = (props: { children?: ReactNode }) => <div>{props.children}</div>;
  ButtonGroup.Separator = () => <span />;
  const Dropdown = (props: { children?: ReactNode }) => <div>{props.children}</div>;
  Dropdown.Popover = (props: { children?: ReactNode }) => <div>{props.children}</div>;
  Dropdown.Menu = (props: { children?: ReactNode }) => <div>{props.children}</div>;
  Dropdown.Item = (props: { children?: ReactNode }) => <div>{props.children}</div>;
  const Label = (props: { children?: ReactNode }) => <span>{props.children}</span>;
  const Tooltip = (props: { children?: ReactNode }) => <div>{props.children}</div>;
  Tooltip.Content = (props: { children?: ReactNode }) => <div>{props.children}</div>;
  return { Button, ButtonGroup, Dropdown, Label, Tooltip };
});

vi.mock("@/renderer/components/common", () => ({
  TextArea: (props: { value?: string; onChange?: (e: { target: { value: string } }) => void }) => (
    <textarea value={props.value} onChange={props.onChange} readOnly />
  ),
  PixelLoader: () => <span data-testid="pixel-loader" />,
}));

function renderPanel(overrides?: Partial<Parameters<typeof CommitSyncPanel>[0]>): void {
  const props: Parameters<typeof CommitSyncPanel>[0] = {
    hasAnyChanges: false,
    hasPendingPullStash: false,
    hasStagedChanges: false,
    hasRemote: false,
    hasTracking: false,
    needsPush: false,
    ahead: 0,
    behind: 0,
    commitMessage: "",
    setCommitMessage: vi.fn<(value: string) => void>(),
    canCommitStaged: false,
    canGenerateMessage: false,
    canCreatePr: false,
    commitDefaultAction: "commit" as CommitDefaultAction,
    setCommitDefaultAction: vi.fn<(action: CommitDefaultAction) => void>(),
    isCommitting: false,
    isGenerating: false,
    isSyncing: false,
    prLoading: false,
    actionPhase: null,
    isPullingFromSource: false,
    showPullFromSource: false,
    sourceBranch: null,
    sourceAhead: 0,
    handleCommit: vi.fn<() => Promise<boolean>>(),
    handleCommitAndCreatePr: vi.fn<() => Promise<void>>(),
    handleGenerateMessage: vi.fn<() => Promise<void>>(),
    handleSyncOrPush: vi.fn<() => Promise<void>>(),
    handleSyncAction: vi.fn<() => Promise<void>>(),
    handlePullFromSource: vi.fn<() => Promise<void>>(),
  };
  renderWithI18n(<CommitSyncPanel {...props} {...overrides} />);
}

// English catalog is active under renderWithI18n, so each phase resolves to
// its source string.
const PHASE_TEXT: Record<GitActionPhase, string> = {
  "generating-message": "Generating commit message…",
  committing: "Committing…",
  pushing: "Pushing…",
  pulling: "Pulling…",
  syncing: "Syncing…",
  "generating-pr-summary": "Generating PR summary…",
  "creating-pr": "Creating PR…",
};

describe("CommitSyncPanel pipeline status row", () => {
  it("shows no status line when no tracked step is running", () => {
    renderPanel();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  // Each pipeline step renders its own live label so a multi-step flow like
  // "Commit & Create PR" shows which backend operation is running.
  it.each(Object.entries(PHASE_TEXT) as [GitActionPhase, string][])(
    "renders the %s status line",
    (phase, expected) => {
      renderPanel({ actionPhase: phase });
      expect(screen.getByRole("status")).toHaveTextContent(expected);
      expect(screen.getByTestId("pixel-loader")).toBeInTheDocument();
    },
  );

  it("keeps the status line visible while the commit button is pending", () => {
    renderPanel({
      hasAnyChanges: true,
      hasRemote: true,
      isCommitting: true,
      actionPhase: "pushing",
    });
    expect(screen.getByRole("status")).toHaveTextContent(PHASE_TEXT.pushing);
  });

  it("disables conflicting commit controls while another phase is active", () => {
    renderPanel({
      hasAnyChanges: true,
      canCommitStaged: true,
      actionPhase: "creating-pr",
    });

    expect(screen.getByRole("button", { name: "Commit" })).toBeDisabled();
  });
});
