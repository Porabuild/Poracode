import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult, Project } from "../../../shared/contracts";

vi.mock("@heroui/react", () => {
  function Button(props: {
    children?: ReactNode | ((state: { isPending: boolean }) => ReactNode);
    isDisabled?: boolean;
  }) {
    return (
      <button disabled={props.isDisabled} type="button">
        {typeof props.children === "function"
          ? props.children({ isPending: false })
          : props.children}
      </button>
    );
  }

  function Wrapper(props: { children: ReactNode }) {
    return <div>{props.children}</div>;
  }

  const Tooltip = (props: { children: ReactNode }) => <div>{props.children}</div>;
  Tooltip.Content = (props: { children: ReactNode }) => <div>{props.children}</div>;

  const Dropdown = (props: { children: ReactNode }) => <div>{props.children}</div>;
  Dropdown.Popover = (props: { children: ReactNode }) => <div>{props.children}</div>;
  Dropdown.Menu = (props: { children: ReactNode }) => <div>{props.children}</div>;
  Dropdown.Item = (props: { children: ReactNode }) => <div>{props.children}</div>;
  Dropdown.ItemIndicator = () => <span />;

  const ButtonGroup = (props: { children: ReactNode }) => <div>{props.children}</div>;
  ButtonGroup.Separator = () => <span />;

  const AlertDialog = {
    Backdrop: Wrapper,
    Container: Wrapper,
    Dialog: Wrapper,
    Header: Wrapper,
    Body: Wrapper,
    Footer: Wrapper,
    Icon: () => <span />,
    Heading: (props: { children: ReactNode }) => <div>{props.children}</div>,
  };

  return {
    AlertDialog,
    Button,
    ButtonGroup,
    Dropdown,
    Label: (props: { children: ReactNode }) => <span>{props.children}</span>,
    Spinner: () => <span>spinner</span>,
    Tooltip,
  };
});

vi.mock("../../bridge", () => ({
  readBridge: () => ({
    gitStage: vi.fn().mockResolvedValue(undefined),
    gitUnstage: vi.fn().mockResolvedValue(undefined),
    gitRevert: vi.fn().mockResolvedValue(undefined),
    gitStageAll: vi.fn().mockResolvedValue(undefined),
    gitUnstageAll: vi.fn().mockResolvedValue(undefined),
    gitRevertAll: vi.fn().mockResolvedValue(undefined),
    gitCommit: vi.fn().mockResolvedValue(undefined),
    generateCommitMessage: vi.fn().mockResolvedValue({ message: "generated" }),
  }),
}));

vi.mock("../../state/appStore", () => ({
  useAppStore: (
    selector: (state: {
      agentStatuses: never[];
      wslAgentStatuses: Record<string, never[]>;
    }) => unknown,
  ) => selector({ agentStatuses: [], wslAgentStatuses: {} }),
}));

vi.mock("../../state/sharedSettingsStore", () => ({
  useSharedSettings: (
    selector: (state: {
      commitGenProvider: string;
      commitGenModel: string;
      commitGenEffort: string;
      wslCommitGenProvider: string;
      wslCommitGenModel: string;
      wslCommitGenEffort: string;
    }) => unknown,
  ) =>
    selector({
      commitGenProvider: "codex",
      commitGenModel: "gpt-5.4",
      commitGenEffort: "medium",
      wslCommitGenProvider: "auto",
      wslCommitGenModel: "",
      wslCommitGenEffort: "",
    }),
}));

vi.mock("../common", () => ({
  SidebarButton: (props: { label: string; onPress?: () => void }) => (
    <button onClick={props.onPress} type="button">
      {props.label}
    </button>
  ),
  TextArea: (props: {
    "aria-label"?: string;
    placeholder?: string;
    value?: string;
    disabled?: boolean;
    onChange?: (event: { target: { value: string } }) => void;
  }) => (
    <textarea
      aria-label={props["aria-label"]}
      disabled={props.disabled}
      placeholder={props.placeholder}
      value={props.value}
      onChange={(event) => props.onChange?.({ target: { value: event.target.value } })}
    />
  ),
}));

vi.mock("../layout/AppShell", () => ({
  useSidebar: () => ({
    isCollapsed: false,
    collapse: () => undefined,
    expand: () => undefined,
  }),
}));

vi.mock("../providers", () => ({
  generateCommitMessageWithFallback: vi.fn(),
  getCommitGenCandidates: vi.fn().mockReturnValue([]),
}));

import { GitReviewSidebar } from "./GitReviewSidebar";

describe("GitReviewSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders worktree changes from the provided git status", () => {
    const project: Project = {
      id: "project-1",
      name: "Lightcode",
      createdAt: new Date().toISOString(),
      location: { kind: "windows", path: "C:\\repo-worktree" },
    };

    const gitStatus: GitStatusResult = {
      isRepo: true,
      branch: "feature/worktree",
      tracking: "",
      hasRemote: false,
      remoteInfo: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [
        {
          path: "src/worktree-only.ts",
          status: "M",
          staged: false,
          insertions: 8,
          deletions: 3,
        },
      ],
      totalInsertions: 8,
      totalDeletions: 3,
    };

    render(
      <GitReviewSidebar
        project={project}
        gitStatus={gitStatus}
        selectedFile={null}
        selectedStaged={false}
        refreshKey={0}
        onSelectFile={() => undefined}
        onClose={() => undefined}
        onRefresh={() => undefined}
      />,
    );

    expect(screen.getByText("worktree-only.ts")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Commit message (Ctrl+Enter)")).toBeInTheDocument();
    expect(screen.queryByText("main-only.ts")).not.toBeInTheDocument();
  });
});
