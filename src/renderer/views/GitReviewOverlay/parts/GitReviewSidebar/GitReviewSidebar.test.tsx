import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult, Project } from "@/shared/contracts";

const bridgeMock = vi.hoisted(() => ({
  gitStage: vi.fn<() => Promise<void>>(),
  gitUnstage: vi.fn<() => Promise<void>>(),
  gitRevert: vi.fn<() => Promise<void>>(),
  gitStageAll: vi.fn<() => Promise<void>>(),
  gitUnstageAll: vi.fn<() => Promise<void>>(),
  gitRevertAll: vi.fn<() => Promise<void>>(),
  gitCommit: vi.fn<() => Promise<void>>(),
  gitFetch: vi.fn<() => Promise<void>>(),
  gitGetWorktreeSourceBranch:
    vi.fn<
      () => Promise<{ sourceBranch: string | null; commitsAhead: number; sourceAhead: number }>
    >(),
  generateCommitMessage: vi.fn<() => Promise<{ message: string }>>(),
}));

vi.mock("@heroui/react", () => {
  function Button(props: {
    children?: ReactNode | ((state: { isPending: boolean }) => ReactNode);
    className?: string;
    isDisabled?: boolean;
    isPending?: boolean;
    onPress?: () => void;
    variant?: string;
  }) {
    return (
      <button
        className={props.className}
        data-variant={props.variant}
        disabled={props.isDisabled}
        type="button"
        onClick={props.onPress}
      >
        {typeof props.children === "function"
          ? props.children({ isPending: props.isPending ?? false })
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

  const Modal = {
    Backdrop: Wrapper,
    Container: Wrapper,
    Dialog: Wrapper,
    Header: Wrapper,
    Body: Wrapper,
    Footer: Wrapper,
    Icon: () => <span />,
    Heading: (props: { children: ReactNode }) => <div>{props.children}</div>,
    CloseTrigger: () => <span />,
  };

  const AlertDialog = {
    Backdrop: Wrapper,
    Container: Wrapper,
    Dialog: Wrapper,
    Header: Wrapper,
    Body: Wrapper,
    Footer: Wrapper,
    Icon: () => <span />,
    Heading: (props: { children: ReactNode }) => <div>{props.children}</div>,
    CloseTrigger: () => <span />,
  };

  const Select = (props: { children: ReactNode }) => <div>{props.children}</div>;
  Select.Trigger = (props: { children: ReactNode }) => <div>{props.children}</div>;
  Select.Value = () => <span />;
  Select.Indicator = () => <span />;
  Select.Popover = (props: { children: ReactNode }) => <div>{props.children}</div>;

  const ListBox = (props: { children: ReactNode }) => <div>{props.children}</div>;
  ListBox.Item = (props: { children: ReactNode }) => <div>{props.children}</div>;
  ListBox.ItemIndicator = () => <span />;

  return {
    AlertDialog,
    Modal,
    Button,
    ButtonGroup,
    Dropdown,
    Label: (props: { children: ReactNode }) => <span>{props.children}</span>,
    ListBox,
    Select,
    Separator: () => <span />,

    Surface: Wrapper,
    Tooltip,
    toast: { danger: vi.fn<() => void>() },
  };
});

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridgeMock,
  isWindows: () => false,
}));

vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: (
    selector: (state: { agentStatuses: never[]; wslAgentStatuses: never[] }) => unknown,
  ) => selector({ agentStatuses: [], wslAgentStatuses: [] }),
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (
    selector: (state: {
      commitGenProvider: string;
      commitGenModel: string;
      commitGenEffort: string;
      wslCommitGenProvider: string;
      wslCommitGenModel: string;
      wslCommitGenEffort: string;
      conflictResolverProvider: string;
      conflictResolverModel: string;
      conflictResolverEffort: string;
      conflictResolverPresentationMode: "terminal" | "gui";
      wslConflictResolverProvider: string;
      wslConflictResolverModel: string;
      wslConflictResolverEffort: string;
      wslConflictResolverPresentationMode: "terminal" | "gui";
    }) => unknown,
  ) =>
    selector({
      commitGenProvider: "codex",
      commitGenModel: "gpt-5.4",
      commitGenEffort: "medium",
      wslCommitGenProvider: "auto",
      wslCommitGenModel: "",
      wslCommitGenEffort: "",
      conflictResolverProvider: "auto",
      conflictResolverModel: "",
      conflictResolverEffort: "",
      conflictResolverPresentationMode: "gui",
      wslConflictResolverProvider: "auto",
      wslConflictResolverModel: "",
      wslConflictResolverEffort: "",
      wslConflictResolverPresentationMode: "gui",
    }),
}));

vi.mock("@/renderer/components/common", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/renderer/components/common")>();
  return {
    ...actual,
    SidebarButton: (props: { label: string; onPress?: () => void }) => (
      <button onClick={props.onPress} type="button">
        {props.label}
      </button>
    ),
    FileIcon: (props: { path: string }) => <span>{props.path}</span>,
    FileStatusBadge: (props: { status: string }) => <span>{props.status}</span>,
    ConfirmDialog: (props: { isOpen?: boolean; children?: ReactNode }) =>
      props.isOpen ? <div>{props.children}</div> : null,
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
    PixelLoader: () => <span>spinner</span>,
  };
});

vi.mock("@/renderer/views/MainView/parts/AppShell/AppShell", () => ({
  useSidebar: () => ({
    isCollapsed: false,
    closingOverlay: false,
    isOverlay: false,
    collapse: () => undefined,
    expand: () => undefined,
  }),
}));

vi.mock("@/renderer/components/providers", () => ({
  generateCommitMessageWithFallback: vi.fn<() => Promise<string>>(),
  getCommitGenCandidates: vi.fn<() => unknown[]>().mockReturnValue([]),
  resolveCommitGenConfig: vi
    .fn<() => { model: string; effort: string; availableEfforts: string[] }>()
    .mockReturnValue({ model: "", effort: "", availableEfforts: [] }),
}));

import { useGitStore } from "@/renderer/state/gitStore";
import { GitReviewSidebar } from "./GitReviewSidebar";

describe("GitReviewSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMock.gitStage.mockResolvedValue(undefined);
    bridgeMock.gitUnstage.mockResolvedValue(undefined);
    bridgeMock.gitRevert.mockResolvedValue(undefined);
    bridgeMock.gitStageAll.mockResolvedValue(undefined);
    bridgeMock.gitUnstageAll.mockResolvedValue(undefined);
    bridgeMock.gitRevertAll.mockResolvedValue(undefined);
    bridgeMock.gitCommit.mockResolvedValue(undefined);
    bridgeMock.gitFetch.mockResolvedValue(undefined);
    bridgeMock.gitGetWorktreeSourceBranch.mockResolvedValue({
      sourceBranch: null,
      commitsAhead: 0,
      sourceAhead: 0,
    });
    bridgeMock.generateCommitMessage.mockResolvedValue({ message: "generated" });
    useGitStore.setState({
      ghAvailable: {},
      prData: {},
      worktreeSourceInfo: {},
      statuses: {},
      worktreeStatuses: {},
    });
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

    useGitStore.getState().setStatus(project.id, gitStatus);

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

  it("shows an init action when the location is not a git repository", () => {
    const project: Project = {
      id: "project-1",
      name: "Lightcode",
      createdAt: new Date().toISOString(),
      location: { kind: "windows", path: "C:\\repo" },
    };
    const gitStatus: GitStatusResult = {
      isRepo: false,
      branch: "",
      tracking: "",
      hasRemote: false,
      remoteInfo: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      totalInsertions: 0,
      totalDeletions: 0,
    };
    const onInitRepository = vi.fn<() => void>();

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
        onInitRepository={onInitRepository}
      />,
    );

    expect(screen.getByText("Not a git repository")).toBeInTheDocument();
    expect(screen.queryByText("No changes")).not.toBeInTheDocument();

    const initButton = screen.getByRole("button", { name: "Initialize Repository" });

    expect(initButton).toHaveAttribute("data-variant", "tertiary");
    expect(initButton).toHaveClass("text-white");

    fireEvent.click(initButton);

    expect(onInitRepository).toHaveBeenCalledOnce();
  });

  it("shows the pixel loader while init is pending", async () => {
    const project: Project = {
      id: "project-1",
      name: "Lightcode",
      createdAt: new Date().toISOString(),
      location: { kind: "windows", path: "C:\\repo" },
    };
    const gitStatus: GitStatusResult = {
      isRepo: false,
      branch: "",
      tracking: "",
      hasRemote: false,
      remoteInfo: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      totalInsertions: 0,
      totalDeletions: 0,
    };
    const onInitRepository = vi.fn<() => Promise<void>>(() => new Promise(() => {}));

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
        onInitRepository={onInitRepository}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Initialize Repository" }));

    await waitFor(() => expect(screen.getByText("spinner")).toBeInTheDocument());
  });

  it("shows a clean working tree state after the repo has no changes", () => {
    const project: Project = {
      id: "project-1",
      name: "Lightcode",
      createdAt: new Date().toISOString(),
      location: { kind: "windows", path: "C:\\repo" },
    };
    const gitStatus: GitStatusResult = {
      isRepo: true,
      branch: "master",
      tracking: "",
      hasRemote: false,
      remoteInfo: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      totalInsertions: 0,
      totalDeletions: 0,
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

    expect(screen.getByText("Working tree clean")).toBeInTheDocument();
    expect(
      screen.getByText("No remote configured. Add a remote to enable push and pull."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No changes")).not.toBeInTheDocument();
  });

  it("adds a remote from the clean working tree state", async () => {
    const project: Project = {
      id: "project-1",
      name: "Lightcode",
      createdAt: new Date().toISOString(),
      location: { kind: "windows", path: "C:\\repo" },
    };
    const gitStatus: GitStatusResult = {
      isRepo: true,
      branch: "master",
      tracking: "",
      hasRemote: false,
      remoteInfo: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      totalInsertions: 0,
      totalDeletions: 0,
    };
    const onAddRemote = vi
      .fn<(remote: string, url: string) => Promise<boolean>>()
      .mockResolvedValue(true);

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
        onAddRemote={onAddRemote}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Remote" }));
    fireEvent.change(screen.getByLabelText("Remote name"), { target: { value: " upstream " } });
    fireEvent.change(screen.getByLabelText("Remote URL"), {
      target: { value: " git@github.com:example/lightcode.git " },
    });
    const addButtons = screen.getAllByRole("button", { name: "Add Remote" });
    fireEvent.click(addButtons[addButtons.length - 1]!);

    await waitFor(() =>
      expect(onAddRemote).toHaveBeenCalledWith("upstream", "git@github.com:example/lightcode.git"),
    );
    await waitFor(() => expect(screen.queryByLabelText("Remote URL")).not.toBeInTheDocument());
  });

  it("moves worktree merge actions into the create PR dropdown", async () => {
    const project: Project = {
      id: "project-1",
      name: "Lightcode",
      createdAt: new Date().toISOString(),
      location: { kind: "windows", path: "C:\\repo-worktree" },
    };

    const gitStatus: GitStatusResult = {
      isRepo: true,
      branch: "feature/worktree",
      tracking: "origin/feature/worktree",
      hasRemote: true,
      remoteInfo: {
        url: "https://github.com/example/lightcode.git",
        platform: "github",
        owner: "example",
        repo: "lightcode",
      },
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      totalInsertions: 0,
      totalDeletions: 0,
    };

    bridgeMock.gitGetWorktreeSourceBranch.mockResolvedValue({
      sourceBranch: "main",
      commitsAhead: 1,
      sourceAhead: 0,
    });
    const setWorktreeSourceInfo = vi.spyOn(useGitStore.getState(), "setWorktreeSourceInfo");
    useGitStore.setState({ ghAvailable: { [project.id]: true } });

    render(
      <GitReviewSidebar
        project={project}
        gitStatus={gitStatus}
        selectedFile={null}
        selectedStaged={false}
        worktreeBranch="feature/worktree"
        worktreePath="C:\\repo-worktree"
        refreshKey={1}
        onSelectFile={() => undefined}
        onClose={() => undefined}
        onRefresh={() => undefined}
      />,
    );

    await waitFor(() =>
      expect(setWorktreeSourceInfo).toHaveBeenCalledWith(expect.stringContaining("repo-worktree"), {
        sourceBranch: "main",
        commitsAhead: 1,
        sourceAhead: 0,
      }),
    );
    expect(screen.getByText("Merge Worktree")).toBeInTheDocument();
    expect(screen.getByText("Merge Locally & Remove Worktree")).toBeInTheDocument();
    expect(screen.queryByText("Merge & Remove Worktree")).not.toBeInTheDocument();
  });

  it("does not show the removed merge section while worktree source info is still loading", () => {
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
      unstaged: [],
      totalInsertions: 0,
      totalDeletions: 0,
    };

    bridgeMock.gitGetWorktreeSourceBranch.mockImplementation(() => new Promise(() => {}));

    render(
      <GitReviewSidebar
        project={project}
        gitStatus={gitStatus}
        selectedFile={null}
        selectedStaged={false}
        worktreeBranch="feature/worktree"
        worktreePath="C:\\repo-worktree"
        refreshKey={1}
        onSelectFile={() => undefined}
        onClose={() => undefined}
        onRefresh={() => undefined}
      />,
    );

    expect(screen.queryByText("spinner")).not.toBeInTheDocument();
    expect(screen.queryByText("Merge & Remove Worktree")).not.toBeInTheDocument();
  });

  it("hides pull from source when the worktree is already up to date with its source branch", async () => {
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
          insertions: 1,
          deletions: 0,
        },
      ],
      totalInsertions: 1,
      totalDeletions: 0,
    };

    bridgeMock.gitGetWorktreeSourceBranch.mockResolvedValue({
      sourceBranch: "main",
      commitsAhead: 0,
      sourceAhead: 0,
    });
    const setWorktreeSourceInfo = vi.spyOn(useGitStore.getState(), "setWorktreeSourceInfo");

    render(
      <GitReviewSidebar
        project={project}
        gitStatus={gitStatus}
        selectedFile={null}
        selectedStaged={false}
        worktreeBranch="feature/worktree"
        worktreePath="C:\\repo-worktree"
        refreshKey={1}
        onSelectFile={() => undefined}
        onClose={() => undefined}
        onRefresh={() => undefined}
      />,
    );

    await waitFor(() =>
      expect(setWorktreeSourceInfo).toHaveBeenCalledWith(expect.stringContaining("repo-worktree"), {
        sourceBranch: "main",
        commitsAhead: 0,
        sourceAhead: 0,
      }),
    );
    expect(screen.queryByText("Pull from main (0)")).not.toBeInTheDocument();
  });

  it("shows pull from source when the source branch is ahead", async () => {
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
          insertions: 1,
          deletions: 0,
        },
      ],
      totalInsertions: 1,
      totalDeletions: 0,
    };

    bridgeMock.gitGetWorktreeSourceBranch.mockResolvedValue({
      sourceBranch: "main",
      commitsAhead: 0,
      sourceAhead: 2,
    });
    const setWorktreeSourceInfo = vi.spyOn(useGitStore.getState(), "setWorktreeSourceInfo");

    render(
      <GitReviewSidebar
        project={project}
        gitStatus={gitStatus}
        selectedFile={null}
        selectedStaged={false}
        worktreeBranch="feature/worktree"
        worktreePath="C:\\repo-worktree"
        refreshKey={1}
        onSelectFile={() => undefined}
        onClose={() => undefined}
        onRefresh={() => undefined}
      />,
    );

    await waitFor(() =>
      expect(setWorktreeSourceInfo).toHaveBeenCalledWith(expect.stringContaining("repo-worktree"), {
        sourceBranch: "main",
        commitsAhead: 0,
        sourceAhead: 2,
      }),
    );
    expect(screen.getByText("Pull from main (2)")).toBeInTheDocument();
  });
});
