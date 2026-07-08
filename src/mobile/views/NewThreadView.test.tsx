// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitProjectSnapshotResult, GitStatusResult, Project } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useGitStore } from "@/renderer/state/gitStore";
import { NewThreadView } from "./NewThreadView";

const bridge = vi.hoisted(() => ({
  getGitStatus: vi.fn<(payload: unknown) => Promise<GitStatusResult>>(),
  gitProjectSnapshot: vi.fn<(payload: unknown) => Promise<GitProjectSnapshotResult>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => true,
}));

vi.mock("@/renderer/hooks/uiSelectors", () => ({
  useProjectAgentStatuses: () => [],
}));

// The draft view pulls in the whole composer tree; stub it so these tests stay
// focused on NewThreadView's git hydration.
vi.mock("@/renderer/components/thread/ThreadDraftView", () => ({
  ThreadDraftView: () => <div data-testid="draft-view" />,
}));

function makeProject(id: string, path: string): Project {
  return {
    id,
    name: id,
    location: { kind: "posix", path },
  } as unknown as Project;
}

function makeStatus(branch: string): GitStatusResult {
  return {
    isRepo: true,
    branch,
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
}

function makeSnapshot(branch: string): GitProjectSnapshotResult {
  return {
    status: makeStatus(branch),
    branches: {
      current: branch,
      branches: [{ name: branch, isCurrent: true, isRemote: false }] as never,
    },
    worktrees: [],
    ghAvailable: true,
  };
}

describe("NewThreadView git hydration", () => {
  beforeEach(() => {
    useGitStore.setState({ statuses: {}, branches: {}, worktrees: {} });
    bridge.getGitStatus.mockReset();
    bridge.gitProjectSnapshot.mockReset();
    bridge.getGitStatus.mockResolvedValue(makeStatus("main"));
    bridge.gitProjectSnapshot.mockResolvedValue(makeSnapshot("main"));
  });

  it("hydrates useGitStore so the worktree/branch selector can render", async () => {
    const project = makeProject("proj-1", "/repo/one");
    render(<NewThreadView project={project} onStart={vi.fn<() => void>()} />);

    await waitFor(() => {
      expect(useGitStore.getState().statuses["proj-1"]?.branch).toBe("main");
    });
    // getGitStatus makes `gitBranch` truthy (row appears); gitProjectSnapshot
    // populates the branch list the dropdown reads from.
    expect(bridge.getGitStatus).toHaveBeenCalledWith({ projectLocation: project.location });
    expect(bridge.gitProjectSnapshot).toHaveBeenCalledWith({
      projectLocation: project.location,
      includeGhCheck: true,
    });
    expect(useGitStore.getState().branches["proj-1"]?.branches).toHaveLength(1);
  });

  it("re-hydrates when the active project changes in place", async () => {
    const projectA = makeProject("proj-a", "/repo/a");
    const projectB = makeProject("proj-b", "/repo/b");
    const { rerender } = render(<NewThreadView project={projectA} onStart={vi.fn<() => void>()} />);

    await waitFor(() => {
      expect(bridge.getGitStatus).toHaveBeenCalledWith({ projectLocation: projectA.location });
    });

    bridge.gitProjectSnapshot.mockResolvedValue(makeSnapshot("dev"));
    bridge.getGitStatus.mockResolvedValue(makeStatus("dev"));
    rerender(<NewThreadView project={projectB} onStart={vi.fn<() => void>()} />);

    await waitFor(() => {
      expect(bridge.getGitStatus).toHaveBeenCalledWith({ projectLocation: projectB.location });
    });
    await waitFor(() => {
      expect(useGitStore.getState().statuses["proj-b"]?.branch).toBe("dev");
    });
  });

  it("skips hydration and shows the empty state when there is no project", () => {
    render(<NewThreadView project={null} onStart={vi.fn<() => void>()} />);

    expect(screen.getByText("Add a project")).toBeTruthy();
    expect(bridge.getGitStatus).not.toHaveBeenCalled();
    expect(bridge.gitProjectSnapshot).not.toHaveBeenCalled();
  });
});
