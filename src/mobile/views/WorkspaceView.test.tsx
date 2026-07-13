// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitProjectSnapshotResult, GitStatusResult, Project } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useGitStore } from "@/renderer/state/gitStore";
import { WorkspaceView } from "./WorkspaceView";

const bridge = vi.hoisted(() => ({
  gitSwitchBranch: vi.fn<(payload: unknown) => Promise<unknown>>(),
  getGitStatus: vi.fn<(payload: unknown) => Promise<GitStatusResult>>(),
  gitProjectSnapshot: vi.fn<(payload: unknown) => Promise<GitProjectSnapshotResult>>(),
}));

const gitStatusRef = vi.hoisted(() => ({
  current: undefined as GitStatusResult | undefined,
}));

const branchSelectorRender = vi.hoisted(() => vi.fn<(props: unknown) => void>());
const navigateMock = vi.hoisted(() => vi.fn<(input: unknown) => void>());

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => true,
  readBridge: () => bridge,
}));

vi.mock("@/renderer/components/common", () => ({
  BranchSelector: (props: {
    value: string;
    onSelect?: (selection: {
      branch: string;
      baseBranch?: string;
      isWorktree: boolean;
      worktreePath?: string;
    }) => void;
    onSwitchBranch?: (branch: string, createNew: boolean) => void;
    onOpenPrReview?: (args: { branch: string; prNumber: number; worktreePath?: string }) => void;
  }) => {
    branchSelectorRender(props);
    return (
      <>
        <button
          type="button"
          aria-label="Switch branch"
          onClick={() => props.onSwitchBranch?.("feature/mobile", true)}
        >
          {props.value}
        </button>
        <button
          type="button"
          aria-label="Open branch PR"
          onClick={() => props.onOpenPrReview?.({ branch: "feature/mobile", prNumber: 42 })}
        >
          PR
        </button>
        <button
          type="button"
          aria-label="Open worktree branch"
          onClick={() =>
            props.onSelect?.({
              branch: "feature/worktree",
              baseBranch: "feature/worktree",
              isWorktree: true,
              worktreePath: "/repo/.poracode/worktrees/feature",
            })
          }
        >
          Worktree
        </button>
      </>
    );
  },
}));

vi.mock("./GitView", () => ({
  GitView: (props: {
    onOpenFile?: (path: string) => void;
    onLaunchConflictResolverThread?: (input: unknown) => void;
  }) => (
    <>
      <button type="button" data-testid="git-view" onClick={() => props.onOpenFile?.("src/app.ts")}>
        Open changed file
      </button>
      <button
        type="button"
        data-testid="resolve-conflicts"
        onClick={() =>
          props.onLaunchConflictResolverThread?.({
            agentKind: "codex",
            config: { model: "gpt-5.4" },
            prompt: "Resolve conflicts",
            presentationMode: "gui",
            existingWorktreePath: "/repo/wt",
            worktreeBranch: "feature/x",
          })
        }
      >
        Resolve conflicts
      </button>
    </>
  ),
  useGitTargetStatus: () => gitStatusRef.current,
}));

vi.mock("./FilesView", () => ({
  FilesView: (props: { initialFilePath?: string; initialOpenKey?: string }) => (
    <div data-testid="files-view" data-open-key={props.initialOpenKey ?? ""}>
      {props.initialFilePath ?? ""}
    </div>
  ),
}));

function makeProject(): Project {
  return {
    id: "project-1",
    name: "Repo",
    location: { kind: "posix", path: "/repo" },
  } as Project;
}

function makeStatus(branch: string): GitStatusResult {
  return {
    isRepo: true,
    branch,
    tracking: branch === "main" ? "origin/main" : `origin/${branch}`,
    hasRemote: true,
    remoteInfo: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    totalInsertions: 0,
    totalDeletions: 0,
  };
}

function makeSnapshot(branch: string): GitProjectSnapshotResult {
  return {
    status: makeStatus(branch),
    branches: {
      current: branch,
      branches: [
        { name: "main", isCurrent: branch === "main", isRemote: false },
        { name: "feature/mobile", isCurrent: branch === "feature/mobile", isRemote: false },
      ] as never,
    },
    worktrees: [],
    ghAvailable: true,
  };
}

function renderWorkspace(
  project = makeProject(),
  statusKey?: string,
  extraProps?: Partial<Parameters<typeof WorkspaceView>[0]>,
) {
  return render(
    <WorkspaceView
      gitTarget={{
        project,
        ...(statusKey ? { statusKey } : {}),
      }}
      filesTarget={{
        project,
        projectLocation: project.location,
        rootLabel: project.name,
      }}
      initialTab="changes"
      onClose={vi.fn<() => void>()}
      {...extraProps}
    />,
  );
}

describe("mobile WorkspaceView branch selector", () => {
  beforeEach(() => {
    const status = makeStatus("main");
    gitStatusRef.current = status;
    branchSelectorRender.mockClear();
    bridge.gitSwitchBranch.mockReset();
    bridge.getGitStatus.mockReset();
    bridge.gitProjectSnapshot.mockReset();
    navigateMock.mockClear();
    bridge.gitSwitchBranch.mockResolvedValue({
      branch: "feature/mobile",
      created: true,
      tracking: "origin/feature/mobile",
      ahead: 0,
      behind: 0,
    });
    bridge.getGitStatus.mockResolvedValue(makeStatus("feature/mobile"));
    bridge.gitProjectSnapshot.mockResolvedValue(makeSnapshot("feature/mobile"));
    useGitStore.setState({
      statuses: { "project-1": status },
      worktreeStatuses: {},
      branches: {},
      worktrees: {},
    });
  });

  it("switches or creates the main repo branch through the remote bridge", async () => {
    const project = makeProject();
    renderWorkspace(project);

    fireEvent.click(screen.getByRole("button", { name: "Switch branch" }));

    await waitFor(() => {
      expect(bridge.gitSwitchBranch).toHaveBeenCalledWith({
        projectLocation: project.location,
        branch: "feature/mobile",
        createNew: true,
      });
    });
    expect(bridge.getGitStatus).toHaveBeenCalledWith({ projectLocation: project.location });
    expect(bridge.gitProjectSnapshot).toHaveBeenCalledWith({
      projectLocation: project.location,
      includeGhCheck: true,
    });
    await waitFor(() => {
      expect(useGitStore.getState().statuses["project-1"]?.branch).toBe("feature/mobile");
    });
    expect(useGitStore.getState().branches["project-1"]?.current).toBe("feature/mobile");
  });

  it("keeps worktree branch labels read-only like desktop", () => {
    renderWorkspace(makeProject(), "/repo/.poracode/worktrees/feature");

    expect(branchSelectorRender).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Switch branch" })).not.toBeInTheDocument();
  });

  it("opens a changed git file in the mounted Files editor", () => {
    renderWorkspace();

    fireEvent.click(screen.getByTestId("git-view"));

    expect(screen.getByRole("tab", { name: "Files" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("files-view")).toHaveTextContent("src/app.ts");
    expect(screen.getByTestId("files-view")).toHaveAttribute("data-open-key", "git:1");
  });

  it("routes branch PR badges into the mobile PR review screen", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Open branch PR" }));

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/pr/$prNumber",
      params: { prNumber: "42" },
      search: {
        project: "project-1",
        prKey: "__branchname:project-1:feature/mobile",
      },
    });
  });

  it("hands existing worktree branch selections to the mobile route layer", () => {
    const onOpenWorktreeBranch =
      vi.fn<(input: { worktreePath: string; worktreeBranch: string }) => void>();
    renderWorkspace(makeProject(), undefined, { onOpenWorktreeBranch });

    fireEvent.click(screen.getByRole("button", { name: "Open worktree branch" }));

    expect(onOpenWorktreeBranch).toHaveBeenCalledWith({
      worktreePath: "/repo/.poracode/worktrees/feature",
      worktreeBranch: "feature/worktree",
    });
  });

  it("passes conflict resolver launches to the mobile route layer", () => {
    const onLaunchConflictResolverThread = vi.fn<(input: unknown) => void>();
    renderWorkspace(makeProject(), undefined, { onLaunchConflictResolverThread });

    fireEvent.click(screen.getByTestId("resolve-conflicts"));

    expect(onLaunchConflictResolverThread).toHaveBeenCalledWith({
      agentKind: "codex",
      config: { model: "gpt-5.4" },
      prompt: "Resolve conflicts",
      presentationMode: "gui",
      existingWorktreePath: "/repo/wt",
      worktreeBranch: "feature/x",
    });
  });
});
