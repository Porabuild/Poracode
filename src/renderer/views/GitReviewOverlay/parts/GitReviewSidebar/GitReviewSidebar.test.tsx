import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitBranchListResult, GitStatusResult, PrData, Project } from "@/shared/contracts";

const bridgeMock = vi.hoisted(() => ({
  gitStage: vi.fn<() => Promise<void>>(),
  gitUnstage: vi.fn<() => Promise<void>>(),
  gitRevert: vi.fn<() => Promise<void>>(),
  gitStageAll: vi.fn<() => Promise<void>>(),
  gitUnstageAll: vi.fn<() => Promise<void>>(),
  gitRevertAll: vi.fn<() => Promise<void>>(),
  gitCommit: vi.fn<() => Promise<void>>(),
  gitFetch: vi.fn<() => Promise<void>>(),
  gitListBranches: vi.fn<() => Promise<GitBranchListResult>>(),
  gitGetWorktreeSourceBranch:
    vi.fn<
      () => Promise<{ sourceBranch: string | null; commitsAhead: number; sourceAhead: number }>
    >(),
  ghGetPrForBranch: vi.fn<() => Promise<PrData | null>>(),
  ghCreatePr: vi.fn<() => Promise<PrData>>(),
  ghGetPrDetails: vi.fn<() => Promise<undefined>>(),
  generateCommitMessage: vi.fn<() => Promise<{ message: string }>>(),
  generatePrSummary: vi.fn<() => Promise<{ title: string; description: string }>>(),
}));

const toastDanger = vi.hoisted(() =>
  vi.fn<
    (
      message: string,
      options?: { actionProps?: { children?: string; onPress?: () => void } },
    ) => void
  >(),
);
const getCommitGenCandidatesMock = vi.hoisted(() => vi.fn<() => Array<{ kind: string }>>());
const dropdownMenuHandlers = vi.hoisted(() => ({
  targetBranch: null as ((keys: Set<string>) => void) | null,
}));

vi.mock("@heroui/react", () => {
  function Button(props: {
    children?: ReactNode | ((state: { isPending: boolean }) => ReactNode);
    className?: string;
    "aria-label"?: string;
    isDisabled?: boolean;
    isPending?: boolean;
    onPress?: () => void;
    variant?: string;
  }) {
    return (
      <button
        className={props.className}
        aria-label={props["aria-label"]}
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
  Tooltip.Trigger = Wrapper;
  Tooltip.Content = (props: { children: ReactNode }) => <div>{props.children}</div>;

  const Dropdown = (props: { children: ReactNode }) => <div>{props.children}</div>;
  Dropdown.Popover = (props: { children: ReactNode }) => <div>{props.children}</div>;
  Dropdown.Menu = (props: {
    children: ReactNode;
    "aria-label"?: string;
    onSelectionChange?: (keys: Set<string>) => void;
  }) => {
    if (props["aria-label"] === "Target branch") {
      dropdownMenuHandlers.targetBranch = props.onSelectionChange ?? null;
    }
    return <div>{props.children}</div>;
  };
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
    Link: Button,
    ListBox,
    Select,
    Separator: () => <span />,

    Surface: Wrapper,
    ToggleButton: Button,
    Tooltip,
    toast: { danger: toastDanger },
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

vi.mock("@/renderer/state/sharedSettingsStore", () => {
  const sharedSettings = {
    commitGenProvider: "codex",
    commitGenModel: "gpt-5.4",
    commitGenEffort: "medium",
    wslCommitGenProvider: "auto",
    wslCommitGenModel: "",
    wslCommitGenEffort: "",
    conflictResolverProvider: "auto",
    conflictResolverModel: "",
    conflictResolverEffort: "",
    conflictResolverFast: false,
    conflictResolverPresentationMode: "gui" as const,
    prAutomationDefault: "off" as const,
    prCreateMode: "dialog" as const,
    setPrCreateMode: vi.fn<(mode: "dialog" | "auto") => void>(),
    wslConflictResolverProvider: "auto",
    wslConflictResolverModel: "",
    wslConflictResolverEffort: "",
    wslConflictResolverFast: false,
    wslConflictResolverPresentationMode: "gui" as const,
  };
  const useSharedSettings = (selector: (state: typeof sharedSettings) => unknown) =>
    selector(sharedSettings);
  useSharedSettings.getState = () => sharedSettings;
  return { useSharedSettings };
});

vi.mock("@/renderer/components/providers/conflictResolver", () => ({
  getConflictResolverCandidates: () => [
    {
      kind: "codex",
      capabilities: {
        presentationMode: "gui",
        presentationModes: ["gui"],
        bypassPermissions: { approvalPolicy: "bypassPermissions" },
      },
    },
  ],
  readConflictResolverSettingsForProject: () => ({
    provider: "codex",
    model: "gpt-5.4",
    effort: "medium",
    fast: false,
    presentationMode: "gui",
  }),
  resolveConflictResolverLaunchConfig: () => ({ model: "gpt-5.4", effort: "medium" }),
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

vi.mock("@/renderer/components/providers/commitGen", () => ({
  generateCommitMessageWithFallback: vi.fn<() => Promise<string>>(),
  getCommitGenCandidates: getCommitGenCandidatesMock,
  resolveCommitGenConfig: vi
    .fn<() => { model: string; effort: string; availableEfforts: string[] }>()
    .mockReturnValue({ model: "", effort: "", availableEfforts: [] }),
}));

import { useGitStore } from "@/renderer/state/gitStore";
import { useGitReviewActionStore } from "@/renderer/state/gitReviewActionStore";
import { GitReviewSidebar } from "./GitReviewSidebar";
import { GitTouchProvider, type GitTouchFileTarget } from "./gitTouchContext";
import type { ConflictResolverLaunchInput } from "./parts/useConflictResolver";

describe("GitReviewSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toastDanger.mockClear();
    bridgeMock.gitStage.mockResolvedValue(undefined);
    bridgeMock.gitUnstage.mockResolvedValue(undefined);
    bridgeMock.gitRevert.mockResolvedValue(undefined);
    bridgeMock.gitStageAll.mockResolvedValue(undefined);
    bridgeMock.gitUnstageAll.mockResolvedValue(undefined);
    bridgeMock.gitRevertAll.mockResolvedValue(undefined);
    bridgeMock.gitCommit.mockResolvedValue(undefined);
    bridgeMock.gitFetch.mockResolvedValue(undefined);
    bridgeMock.gitListBranches.mockResolvedValue({ current: "", branches: [] });
    bridgeMock.gitGetWorktreeSourceBranch.mockImplementation(() => new Promise(() => {}));
    bridgeMock.ghGetPrForBranch.mockResolvedValue(null);
    bridgeMock.ghGetPrDetails.mockResolvedValue(undefined);
    bridgeMock.ghCreatePr.mockResolvedValue({
      number: 581,
      state: "open",
      title: "feature/worktree",
      url: "https://github.com/example/poracode/pull/581",
      baseBranch: "master",
      isDraft: false,
      updatedAt: "2026-08-18T00:00:00.000Z",
    });
    bridgeMock.generateCommitMessage.mockResolvedValue({ message: "generated" });
    bridgeMock.generatePrSummary.mockResolvedValue({
      title: "Generated worktree PR",
      description: "Generated description",
    });
    getCommitGenCandidatesMock.mockReturnValue([]);
    dropdownMenuHandlers.targetBranch = null;
    useGitStore.setState({
      branches: {},
      ghAvailable: {},
      prData: {},
      worktreeSourceInfo: {},
      statuses: {},
      worktreeStatuses: {},
    });
    useGitReviewActionStore.setState({ panels: {} });
  });

  it("renders worktree changes from the provided git status", () => {
    const project: Project = {
      id: "project-1",
      name: "Poracode",
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

  it("keeps remote routing when resolving the PR target branch", async () => {
    const project: Project = {
      id: "remote:desktop-1:project:project-1",
      remoteServerId: "desktop-1",
      remoteId: "project-1",
      name: "Remote Poracode",
      createdAt: new Date().toISOString(),
      location: {
        kind: "windows",
        path: "C:\\repo-worktree",
        remoteServerId: "desktop-1",
      },
    };
    const gitStatus: GitStatusResult = {
      isRepo: true,
      branch: "feature/remote",
      tracking: "",
      hasRemote: true,
      remoteInfo: {
        url: "https://github.com/example/poracode.git",
        platform: "github",
        owner: "example",
        repo: "poracode",
      },
      ahead: 0,
      behind: 0,
      staged: [
        {
          path: "src/remote-change.ts",
          status: "M",
          staged: true,
          insertions: 1,
          deletions: 0,
        },
      ],
      unstaged: [],
      totalInsertions: 1,
      totalDeletions: 0,
    };

    bridgeMock.gitGetWorktreeSourceBranch.mockResolvedValue({
      sourceBranch: "main",
      commitsAhead: 1,
      sourceAhead: 0,
    });
    useGitStore.setState({ ghAvailable: { [project.id]: true } });

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

    await waitFor(() =>
      expect(bridgeMock.gitGetWorktreeSourceBranch).toHaveBeenCalledWith({
        projectLocation: {
          kind: "windows",
          path: "C:\\repo-worktree",
          remoteServerId: "desktop-1",
        },
        branch: "feature/remote",
      }),
    );
    expect(await screen.findByText("Commit & Create PR")).toBeInTheDocument();
  });

  it("virtualizes long staged and unstaged file lists independently", async () => {
    const clientHeightSpy = vi
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(240);
    const offsetHeightSpy = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains("overflow-y-auto") ? 240 : 24;
      });
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const height = this.classList.contains("overflow-y-auto") ? 240 : 24;
        return {
          x: 0,
          y: 0,
          top: 0,
          right: 320,
          bottom: height,
          left: 0,
          width: 320,
          height,
          toJSON: () => ({}),
        };
      });

    try {
      const project: Project = {
        id: "project-1",
        name: "Poracode",
        createdAt: new Date().toISOString(),
        location: { kind: "windows", path: "C:\\repo" },
      };
      const gitStatus: GitStatusResult = {
        isRepo: true,
        branch: "feature",
        tracking: "",
        hasRemote: false,
        remoteInfo: null,
        ahead: 0,
        behind: 0,
        staged: Array.from({ length: 100 }, (_, index) => ({
          path: `src/staged-${index.toString().padStart(3, "0")}.ts`,
          status: "M",
          staged: true,
          insertions: 1,
          deletions: 0,
        })),
        unstaged: Array.from({ length: 100 }, (_, index) => ({
          path: `src/unstaged-${index.toString().padStart(3, "0")}.ts`,
          status: "M",
          staged: false,
          insertions: 1,
          deletions: 0,
        })),
        totalInsertions: 200,
        totalDeletions: 0,
      };

      const { container } = render(
        <GitReviewSidebar
          project={project}
          gitStatus={gitStatus}
          selectedFile={null}
          selectedStaged={false}
          refreshKey={0}
          onSelectFile={() => undefined}
          onClose={() => undefined}
          onRefresh={() => undefined}
          mode="panel"
        />,
      );

      await waitFor(() => {
        const sizers = [...container.querySelectorAll<HTMLElement>("div.relative.min-w-0")].filter(
          (element) => Number.parseInt(element.style.height, 10) > 2000,
        );
        expect(sizers).toHaveLength(2);
      });
      expect(screen.queryByText("src/staged-099.ts")).not.toBeInTheDocument();
      expect(screen.queryByText("src/unstaged-099.ts")).not.toBeInTheDocument();

      // Rows must be offset with `top`; a transform would shift the sticky
      // header of an expanded row away from the scroll container's top edge.
      const rows = [...container.querySelectorAll<HTMLElement>("[data-index]")];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.style.transform === "")).toBe(true);
      expect(rows.some((row) => row.style.top !== "" && row.style.top !== "0px")).toBe(true);
    } finally {
      clientHeightSpy.mockRestore();
      offsetHeightSpy.mockRestore();
      rectSpy.mockRestore();
    }
  });

  it("mounts panel row actions only while the row is hovered or focused", () => {
    const project: Project = {
      id: "project-1",
      name: "Poracode",
      createdAt: new Date().toISOString(),
      location: { kind: "windows", path: "C:\\repo" },
    };
    const gitStatus: GitStatusResult = {
      isRepo: true,
      branch: "feature",
      tracking: "",
      hasRemote: false,
      remoteInfo: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [
        {
          path: "src/actions.ts",
          status: "M",
          staged: false,
          insertions: 1,
          deletions: 0,
        },
      ],
      totalInsertions: 1,
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
        mode="panel"
      />,
    );

    const row = screen.getByText("actions.ts").closest('[role="button"]');
    expect(row).not.toBeNull();
    expect(screen.queryByTitle("Open in editor")).not.toBeInTheDocument();
    fireEvent.pointerMove(row!);
    expect(screen.getByTitle("Open in editor")).toBeInTheDocument();
    fireEvent.pointerLeave(row!);
    expect(screen.queryByTitle("Open in editor")).not.toBeInTheDocument();
    fireEvent.focus(row!);
    expect(screen.getByTitle("Open in editor")).toBeInTheDocument();
  });

  it("uses Git's merge message as an editable commit template", async () => {
    const project: Project = {
      id: "merge-project",
      name: "Poracode",
      createdAt: new Date().toISOString(),
      location: { kind: "windows", path: "C:\\repo-worktree" },
    };
    const status = (mergeMessage: string): GitStatusResult => ({
      isRepo: true,
      branch: "feature",
      tracking: "origin/feature",
      hasRemote: true,
      remoteInfo: null,
      ahead: 0,
      behind: 1,
      staged: [
        {
          path: "src/merged.ts",
          status: "M",
          staged: true,
          insertions: 1,
          deletions: 0,
        },
      ],
      unstaged: [],
      totalInsertions: 1,
      totalDeletions: 0,
      mergeInProgress: true,
      mergeMessage,
      conflictFiles: [
        {
          path: "src/conflict.ts",
          status: "U",
          staged: false,
          insertions: 1,
          deletions: 1,
        },
      ],
    });
    const firstStatus = status("Merge branch 'main' into feature");
    const view = render(
      <GitReviewSidebar
        project={project}
        gitStatus={firstStatus}
        selectedFile={null}
        selectedStaged={false}
        refreshKey={0}
        onSelectFile={() => undefined}
        onClose={() => undefined}
        onRefresh={() => undefined}
      />,
    );

    const input = screen.getByLabelText("Commit message");
    await waitFor(() => expect(input).toHaveValue("Merge branch 'main' into feature"));

    view.rerender(
      <GitReviewSidebar
        project={project}
        gitStatus={status("Merge branch 'develop' into feature")}
        selectedFile={null}
        selectedStaged={false}
        refreshKey={1}
        onSelectFile={() => undefined}
        onClose={() => undefined}
        onRefresh={() => undefined}
      />,
    );
    await waitFor(() => expect(input).toHaveValue("Merge branch 'develop' into feature"));

    fireEvent.change(input, { target: { value: "Custom merge message" } });
    view.rerender(
      <GitReviewSidebar
        project={project}
        gitStatus={status("Merge branch 'release' into feature")}
        selectedFile={null}
        selectedStaged={false}
        refreshKey={2}
        onSelectFile={() => undefined}
        onClose={() => undefined}
        onRefresh={() => undefined}
      />,
    );
    await waitFor(() => expect(input).toHaveValue("Custom merge message"));

    fireEvent.change(input, { target: { value: "" } });
    view.rerender(
      <GitReviewSidebar
        project={project}
        gitStatus={status("Merge branch 'release' into feature")}
        selectedFile={null}
        selectedStaged={false}
        refreshKey={3}
        onSelectFile={() => undefined}
        onClose={() => undefined}
        onRefresh={() => undefined}
      />,
    );
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("does not replace a commit message typed before the conflict", async () => {
    useGitReviewActionStore.getState().patch("typed-project", {
      commitMessage: "Keep my message",
    });
    const project: Project = {
      id: "typed-project",
      name: "Poracode",
      createdAt: new Date().toISOString(),
      location: { kind: "windows", path: "C:\\repo" },
    };
    const gitStatus: GitStatusResult = {
      isRepo: true,
      branch: "feature",
      tracking: "",
      hasRemote: false,
      remoteInfo: null,
      ahead: 0,
      behind: 0,
      staged: [
        {
          path: "src/merged.ts",
          status: "M",
          staged: true,
          insertions: 1,
          deletions: 0,
        },
      ],
      unstaged: [],
      totalInsertions: 1,
      totalDeletions: 0,
      mergeInProgress: true,
      mergeMessage: "Merge branch 'main' into feature",
      conflictFiles: [],
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

    await waitFor(() =>
      expect(screen.getByLabelText("Commit message")).toHaveValue("Keep my message"),
    );
  });

  it("reports failed file staging before refreshing the git state", async () => {
    const project: Project = {
      id: "project-1",
      name: "Poracode",
      createdAt: new Date().toISOString(),
      location: { kind: "windows", path: "C:\\repo" },
    };
    const gitStatus: GitStatusResult = {
      isRepo: true,
      branch: "feature",
      tracking: "",
      hasRemote: false,
      remoteInfo: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [
        {
          path: "src/app.ts",
          status: "M",
          staged: false,
          insertions: 4,
          deletions: 1,
        },
      ],
      totalInsertions: 4,
      totalDeletions: 1,
    };
    const onRefresh = vi.fn<() => void>();
    bridgeMock.gitStage.mockRejectedValueOnce(new Error("stage failed"));
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
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByTitle("Stage"));

    await waitFor(() => {
      expect(toastDanger).toHaveBeenCalledWith("stage failed");
    });
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("shows an init action when the location is not a git repository", async () => {
    const project: Project = {
      id: "project-1",
      name: "Poracode",
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

    await act(async () => {
      fireEvent.click(initButton);
    });

    expect(onInitRepository).toHaveBeenCalledOnce();
  });

  it("shows the pixel loader while init is pending", async () => {
    const project: Project = {
      id: "project-1",
      name: "Poracode",
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
      name: "Poracode",
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

  it("routes conflict file actions through the touch menu when provided", () => {
    const project: Project = {
      id: "project-1",
      name: "Poracode",
      createdAt: new Date().toISOString(),
      location: { kind: "windows", path: "C:\\repo" },
    };
    const gitStatus: GitStatusResult = {
      isRepo: true,
      branch: "feature",
      tracking: "",
      hasRemote: false,
      remoteInfo: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      totalInsertions: 4,
      totalDeletions: 2,
      mergeInProgress: true,
      conflictFiles: [
        {
          path: "src/conflict.ts",
          status: "UU",
          staged: false,
          insertions: 4,
          deletions: 2,
        },
      ],
    };
    const openFileMenu = vi.fn<(target: GitTouchFileTarget) => void>();
    const openGroupMenu = vi.fn<() => void>();

    render(
      <GitTouchProvider value={{ openFileMenu, openGroupMenu }}>
        <GitReviewSidebar
          project={project}
          gitStatus={gitStatus}
          selectedFile={null}
          selectedStaged={false}
          refreshKey={0}
          onSelectFile={() => undefined}
          onClose={() => undefined}
          onRefresh={() => undefined}
          mode="overlay"
        />
      </GitTouchProvider>,
    );

    expect(screen.queryByTitle("Open in editor")).not.toBeInTheDocument();

    // No kebab on touch: press-and-hold (contextmenu) the row opens the sheet.
    fireEvent.contextMenu(screen.getByRole("button", { name: /conflict\.ts/i }));

    expect(openFileMenu).toHaveBeenCalledWith({
      path: "src/conflict.ts",
      staged: false,
      status: "UU",
      insertions: 4,
      deletions: 2,
    });
  });

  it("uses the conflict resolver launch override when provided", () => {
    const project: Project = {
      id: "project-1",
      name: "Poracode",
      createdAt: new Date().toISOString(),
      location: { kind: "windows", path: "C:\\repo" },
    };
    const gitStatus: GitStatusResult = {
      isRepo: true,
      branch: "feature",
      tracking: "",
      hasRemote: false,
      remoteInfo: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      totalInsertions: 4,
      totalDeletions: 2,
      mergeInProgress: true,
      conflictFiles: [
        {
          path: "src/conflict.ts",
          status: "UU",
          staged: false,
          insertions: 4,
          deletions: 2,
        },
      ],
    };
    const onLaunchConflictResolverThread = vi.fn<(input: ConflictResolverLaunchInput) => void>();

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
        worktreePath={"C:\\repo-worktree"}
        worktreeBranch="feature"
        onLaunchConflictResolverThread={onLaunchConflictResolverThread}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fix in Agent" }));

    expect(onLaunchConflictResolverThread).toHaveBeenCalledWith({
      agentKind: "codex",
      config: {
        model: "gpt-5.4",
        effort: "medium",
        approvalPolicy: "bypassPermissions",
      },
      prompt: expect.stringContaining("src/conflict.ts"),
      presentationMode: "gui",
      existingWorktreePath: "C:\\repo-worktree",
      worktreeBranch: "feature",
    });
  });

  it("adds a remote from the clean working tree state", async () => {
    const project: Project = {
      id: "project-1",
      name: "Poracode",
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
      target: { value: " git@github.com:example/poracode.git " },
    });
    const addButtons = screen.getAllByRole("button", { name: "Add Remote" });
    fireEvent.click(addButtons[addButtons.length - 1]!);

    await waitFor(() =>
      expect(onAddRemote).toHaveBeenCalledWith("upstream", "git@github.com:example/poracode.git"),
    );
    await waitFor(() => expect(screen.queryByLabelText("Remote URL")).not.toBeInTheDocument());
  });

  it("moves worktree merge actions into the create PR dropdown", async () => {
    const project: Project = {
      id: "project-1",
      name: "Poracode",
      createdAt: new Date().toISOString(),
      location: { kind: "windows", path: "C:\\repo-worktree" },
    };

    const gitStatus: GitStatusResult = {
      isRepo: true,
      branch: "feature/worktree",
      tracking: "origin/feature/worktree",
      hasRemote: true,
      remoteInfo: {
        url: "https://github.com/example/poracode.git",
        platform: "github",
        owner: "example",
        repo: "poracode",
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

  it("uses the branch name instead of the remote ref as the PR base", async () => {
    const project: Project = {
      id: "project-1",
      name: "Poracode",
      createdAt: new Date().toISOString(),
      location: { kind: "windows", path: "C:\\repo-worktree" },
    };
    const gitStatus: GitStatusResult = {
      isRepo: true,
      branch: "feature/worktree",
      tracking: "origin/feature/worktree",
      hasRemote: true,
      remoteInfo: {
        url: "https://github.com/example/poracode.git",
        platform: "github",
        owner: "example",
        repo: "poracode",
      },
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      totalInsertions: 0,
      totalDeletions: 0,
    };

    bridgeMock.gitGetWorktreeSourceBranch.mockResolvedValue({
      sourceBranch: "origin/master",
      commitsAhead: 2,
      sourceAhead: 0,
    });
    const branches: GitBranchListResult = {
      current: "feature/worktree",
      branches: [
        {
          name: "develop",
          current: false,
          commit: "alternate",
          isRemote: false,
        },
        {
          name: "master",
          current: false,
          commit: "base",
          isRemote: true,
          remote: "origin",
        },
      ],
    };
    bridgeMock.gitListBranches
      .mockRejectedValueOnce(new Error("branch discovery failed"))
      .mockResolvedValue(branches);
    getCommitGenCandidatesMock.mockReturnValue([{ kind: "codex" }]);
    let resolveSummary!: (value: { title: string; description: string }) => void;
    bridgeMock.generatePrSummary.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSummary = resolve;
        }),
    );
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

    await waitFor(() => expect(toastDanger).toHaveBeenCalled());
    const retryAction = toastDanger.mock.calls.at(-1)?.[1]?.actionProps;
    expect(retryAction?.children).toBe("Retry");
    act(() => retryAction?.onPress?.());

    expect(await screen.findByRole("button", { name: "master" })).toBeInTheDocument();
    expect(screen.getAllByText("master")).toHaveLength(2);
    act(() => dropdownMenuHandlers.targetBranch?.(new Set(["develop"])));
    expect(screen.getByRole("button", { name: "develop" })).toBeInTheDocument();
    act(() => dropdownMenuHandlers.targetBranch?.(new Set(["master"])));
    expect(screen.getByRole("button", { name: "master" })).toBeInTheDocument();
    const createButtons = screen.getAllByRole("button", { name: "Create PR" });
    fireEvent.click(createButtons[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Generate PR summary" }));

    await waitFor(() =>
      expect(bridgeMock.generatePrSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: "feature/worktree",
          baseBranch: "origin/master",
        }),
      ),
    );
    expect(
      screen
        .getAllByRole("status")
        .every((status) => status.textContent?.includes("Generating PR summary…")),
    ).toBe(true);
    await act(async () => {
      resolveSummary({
        title: "Generated worktree PR",
        description: "Generated description",
      });
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Create PR" }).at(-1)!);
    await waitFor(() =>
      expect(bridgeMock.ghCreatePr).toHaveBeenCalledWith({
        projectLocation: project.location,
        branch: "feature/worktree",
        baseBranch: "master",
        title: "Generated worktree PR",
        body: "Generated description",
        isDraft: false,
      }),
    );
    expect(bridgeMock.gitListBranches).toHaveBeenCalledWith({
      projectLocation: project.location,
      includeRemote: true,
    });
  });

  it("hides Create PR when the branch still points at the latest merged PR commit", async () => {
    const project: Project = {
      id: "project-1",
      name: "Poracode",
      createdAt: new Date().toISOString(),
      location: { kind: "windows", path: "C:\\repo-worktree" },
    };
    const gitStatus: GitStatusResult = {
      isRepo: true,
      branch: "feature/worktree",
      headSha: "merged-head",
      tracking: "origin/feature/worktree",
      hasRemote: true,
      remoteInfo: {
        url: "https://github.com/example/poracode.git",
        platform: "github",
        owner: "example",
        repo: "poracode",
      },
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      totalInsertions: 0,
      totalDeletions: 0,
    };
    const mergedPr: PrData = {
      number: 429,
      state: "merged",
      headSha: "merged-head",
      title: "Add GitHub Actions workflow management view",
      url: "https://github.com/example/poracode/pull/429",
      baseBranch: "master",
      isDraft: false,
      updatedAt: "2026-07-30T00:00:00.000Z",
    };

    bridgeMock.gitGetWorktreeSourceBranch.mockResolvedValue({
      sourceBranch: "master",
      commitsAhead: 1,
      sourceAhead: 0,
    });
    bridgeMock.ghGetPrForBranch.mockResolvedValue(mergedPr);
    useGitStore.setState({ ghAvailable: { [project.id]: true } });

    const { rerender } = render(
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

    expect(
      await screen.findByText("#429 - Add GitHub Actions workflow management view"),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("button", { name: "Create PR" })
        .some((button) => button.classList.contains("flex-1")),
    ).toBe(false);

    rerender(
      <GitReviewSidebar
        project={project}
        gitStatus={{ ...gitStatus, headSha: "new-pushed-head" }}
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

    expect(
      screen
        .getAllByRole("button", { name: "Create PR" })
        .some((button) => button.classList.contains("flex-1")),
    ).toBe(true);
  });

  it("does not show the removed merge section while worktree source info is still loading", () => {
    const project: Project = {
      id: "project-1",
      name: "Poracode",
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
      name: "Poracode",
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
      name: "Poracode",
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
