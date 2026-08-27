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
    handlePushAndCreatePr: vi.fn<() => Promise<void>>(),
    handlePullFromSource: vi.fn<() => Promise<void>>(),
  };
  renderWithI18n(<CommitSyncPanel {...props} {...overrides} />);
}

// English catalog is active under renderWithI18n, so each phase resolves to
// its source string.
const PHASE_TEXT: Record<GitActionPhase, string> = {
  "generating-message": "Generating…",
  committing: "Committing…",
  pushing: "Pushing…",
  pulling: "Pulling…",
  syncing: "Syncing…",
  "generating-pr-summary": "Summarizing…",
  "creating-pr": "Creating PR…",
};

describe("CommitSyncPanel in-button step status", () => {
  it("keeps the idle caption when no tracked step is running", () => {
    renderPanel({ hasAnyChanges: true, canCommitStaged: true });
    expect(screen.getByRole("button", { name: "Commit" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  // Each pipeline step replaces the caption of the button that started it, so a
  // multi-step flow like "Commit & Create PR" names the backend operation in
  // flight without adding a row that reflows the panel.
  it.each(["generating-message", "committing", "pushing", "creating-pr"] as GitActionPhase[])(
    "labels the commit button with the %s step",
    (phase) => {
      renderPanel({
        hasAnyChanges: true,
        canCommitStaged: true,
        isCommitting: true,
        actionPhase: phase,
      });
      expect(screen.getByRole("status")).toHaveTextContent(PHASE_TEXT[phase]);
      expect(screen.getByTestId("pixel-loader")).toBeInTheDocument();
    },
  );

  it("labels the sync button with its own step", () => {
    renderPanel({
      hasRemote: true,
      hasTracking: true,
      behind: 1,
      isSyncing: true,
      actionPhase: "pulling",
    });
    expect(screen.getByRole("status")).toHaveTextContent(PHASE_TEXT.pulling);
  });

  it("labels the sync button while pulling from the source branch", () => {
    renderPanel({
      hasRemote: true,
      hasTracking: true,
      showPullFromSource: true,
      sourceBranch: "main",
      sourceAhead: 2,
      isPullingFromSource: true,
      actionPhase: "pulling",
    });
    expect(screen.getByRole("status")).toHaveTextContent(PHASE_TEXT.pulling);
  });

  // The AI generate button owns the phase slot on its own; the commit button
  // must not claim a step it did not start.
  it("leaves the commit button captioned while only the generate button runs", () => {
    renderPanel({
      hasAnyChanges: true,
      canCommitStaged: true,
      canGenerateMessage: true,
      isGenerating: true,
      actionPhase: "generating-message",
    });
    expect(screen.getByRole("button", { name: "Commit" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
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

// Committed-but-not-pushed is the gap between the commit split-button (which
// offers "Commit & Create PR") and the PR section (which offers "Create PR"
// once pushed): the push row has to carry the chained action there.
describe("CommitSyncPanel push options", () => {
  const pushedAhead = {
    hasRemote: true,
    hasTracking: true,
    needsPush: true,
    ahead: 2,
  } as const;

  it("offers Push & Create PR while a pushable branch can still open a PR", () => {
    renderPanel({ ...pushedAhead, canCreatePr: true });
    expect(screen.getByText("Push & Create PR")).toBeInTheDocument();
  });

  it("omits Push & Create PR when no PR can be opened", () => {
    renderPanel({ ...pushedAhead, canCreatePr: false });
    expect(screen.queryByText("Push & Create PR")).not.toBeInTheDocument();
    expect(screen.getAllByText("Push (2)").length).toBeGreaterThan(0);
  });
});
