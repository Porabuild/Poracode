// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GitProjectSnapshotResult,
  GitStatusResult,
  PrData,
  PrDetails,
  Project,
} from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useGitStore } from "@/renderer/state/gitStore";
import { GitView } from "./GitView";

const toastDanger = vi.hoisted(() => vi.fn<(message: string) => void>());

const bridge = vi.hoisted(() => ({
  getGitStatus: vi.fn<(payload: unknown) => Promise<GitStatusResult>>(),
  gitFetch: vi.fn<(payload: unknown) => Promise<void>>(),
  gitProjectSnapshot: vi.fn<(payload: unknown) => Promise<GitProjectSnapshotResult>>(),
  ghGetPrForBranch: vi.fn<(payload: unknown) => Promise<PrData | null>>(),
  ghGetPrDetails: vi.fn<(payload: unknown) => Promise<{ details: PrDetails }>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("@heroui/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@heroui/react")>();
  return {
    ...actual,
    toast: {
      ...actual.toast,
      danger: toastDanger,
    },
  };
});

vi.mock("@/renderer/views/GitReviewOverlay/parts/GitReviewSidebar/GitReviewSidebar", () => ({
  GitReviewSidebar: (props: {
    readonly onRefresh: () => void;
    readonly onSelectFile: (path: string, staged: boolean) => void;
    readonly onLaunchConflictResolverThread?: (input: unknown) => void;
  }) => (
    <>
      <button type="button" onClick={props.onRefresh}>
        Refresh changes
      </button>
      <button type="button" onClick={() => props.onSelectFile("src/App.tsx", false)}>
        Open src/App.tsx diff
      </button>
      <button
        type="button"
        onClick={() =>
          props.onLaunchConflictResolverThread?.({
            agentKind: "codex",
            config: { model: "gpt-5.4" },
            prompt: "Resolve conflicts",
            presentationMode: "gui",
          })
        }
      >
        Fix in Agent
      </button>
    </>
  ),
}));

vi.mock("@/renderer/views/GitReviewOverlay/parts/GitDiffContent/parts/SingleFileDiff", () => ({
  SingleFileDiff: () => <div />,
}));

function makeProject(): Project {
  return {
    id: "project-1",
    name: "Repo",
    location: { kind: "posix", path: "/repo" },
  } as Project;
}

function makeStatus(): GitStatusResult {
  return {
    isRepo: true,
    branch: "main",
    tracking: "origin/main",
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

function makePr(): PrData {
  return {
    number: 42,
    state: "open",
    title: "Fix mobile PR status",
    url: "https://github.test/repo/pull/42",
    baseBranch: "main",
    isDraft: false,
    checksStatus: "SUCCESS",
    updatedAt: "2026-07-23T12:00:00.000Z",
  };
}

describe("GitView", () => {
  beforeEach(() => {
    const status = makeStatus();
    toastDanger.mockClear();
    bridge.getGitStatus.mockReset();
    bridge.gitFetch.mockReset();
    bridge.gitProjectSnapshot.mockReset();
    bridge.ghGetPrForBranch.mockReset();
    bridge.ghGetPrDetails.mockReset();
    bridge.ghGetPrDetails.mockRejectedValue(new Error("details unavailable"));
    bridge.getGitStatus.mockResolvedValue(status);
    bridge.gitFetch.mockResolvedValue(undefined);
    bridge.ghGetPrForBranch.mockResolvedValue(null);
    bridge.gitProjectSnapshot.mockImplementation(() => new Promise(() => {}));
    useGitStore.setState({
      statuses: { "project-1": status },
      worktreeStatuses: {},
      branches: {},
      worktrees: {},
      ghAvailable: {},
      prData: {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports failed refresh fetches instead of silently doing nothing", async () => {
    const project = makeProject();
    bridge.gitFetch.mockRejectedValueOnce(new Error("fetch failed"));

    render(
      <GitView
        target={{ project }}
        refreshSignal={0}
        onClose={() => undefined}
        onRefreshingChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh changes" }));

    await waitFor(() => {
      expect(toastDanger).toHaveBeenCalledWith("fetch failed");
    });
  });

  it("forwards conflict resolver launches out of the reused sidebar", () => {
    const project = makeProject();
    const onLaunchConflictResolverThread = vi.fn<(input: unknown) => void>();

    render(
      <GitView
        target={{ project }}
        refreshSignal={0}
        onClose={() => undefined}
        onLaunchConflictResolverThread={onLaunchConflictResolverThread}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fix in Agent" }));

    expect(onLaunchConflictResolverThread).toHaveBeenCalledWith({
      agentKind: "codex",
      config: { model: "gpt-5.4" },
      prompt: "Resolve conflicts",
      presentationMode: "gui",
    });
  });

  it("loads the current worktree PR on open and on manual refresh", async () => {
    const project = makeProject();
    const worktreePath = "/repo/.poracode/worktrees/mobile";
    const status = { ...makeStatus(), branch: "feature/mobile" };
    const latestPr = makePr();
    bridge.getGitStatus.mockResolvedValue(status);
    bridge.gitProjectSnapshot.mockResolvedValue({
      status: makeStatus(),
      branches: { current: "main", branches: [] },
      worktrees: [],
      ghAvailable: true,
    });
    bridge.ghGetPrForBranch.mockResolvedValue(latestPr);
    useGitStore.setState({
      worktreeStatuses: { [worktreePath]: status },
    });

    render(
      <GitView
        target={{
          project,
          threadId: "thread-1",
          statusKey: worktreePath,
          worktreePath,
          worktreeBranch: "feature/mobile",
          locationOverride: { kind: "posix", path: worktreePath },
        }}
        refreshSignal={0}
        onClose={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(useGitStore.getState().prData[worktreePath]).toEqual(latestPr);
    });
    expect(bridge.ghGetPrForBranch).toHaveBeenCalledWith({
      projectLocation: project.location,
      branch: "feature/mobile",
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh changes" }));

    await waitFor(() => {
      expect(bridge.ghGetPrForBranch).toHaveBeenCalledTimes(2);
    });
  });

  it("holds the workspace chrome until a diff covers it and restores it before closing", () => {
    vi.useFakeTimers();
    const project = makeProject();
    const onImmersiveChange = vi.fn<(immersive: boolean) => void>();

    render(
      <GitView
        target={{ project }}
        refreshSignal={0}
        onClose={() => undefined}
        onImmersiveChange={onImmersiveChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open src/App.tsx diff" }));

    expect(document.querySelector(".m-git-diff")).toHaveAttribute("data-state", "entering");
    expect(onImmersiveChange).toHaveBeenLastCalledWith(false);
    expect(onImmersiveChange).not.toHaveBeenCalledWith(true);

    act(() => {
      vi.advanceTimersByTime(260);
    });

    expect(document.querySelector(".m-git-diff")).toHaveAttribute("data-state", "open");
    expect(onImmersiveChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Back to changes" }));

    expect(document.querySelector(".m-git-diff")).toHaveAttribute("data-state", "closing");
    expect(onImmersiveChange).toHaveBeenLastCalledWith(false);

    act(() => {
      vi.advanceTimersByTime(259);
    });
    expect(document.querySelector(".m-git-diff")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(document.querySelector(".m-git-diff")).toBeNull();
  });
});
