// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitProjectSnapshotResult, GitStatusResult, Project } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useGitStore } from "@/renderer/state/gitStore";
import { GitView } from "./GitView";

const toastDanger = vi.hoisted(() => vi.fn<(message: string) => void>());

const bridge = vi.hoisted(() => ({
  getGitStatus: vi.fn<(payload: unknown) => Promise<GitStatusResult>>(),
  gitFetch: vi.fn<(payload: unknown) => Promise<void>>(),
  gitProjectSnapshot: vi.fn<(payload: unknown) => Promise<GitProjectSnapshotResult>>(),
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
    readonly onLaunchConflictResolverThread?: (input: unknown) => void;
  }) => (
    <>
      <button type="button" onClick={props.onRefresh}>
        Refresh changes
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

function makeSnapshot(status = makeStatus()): GitProjectSnapshotResult {
  return {
    status,
    branches: {
      current: status.branch,
      branches: [{ name: status.branch, isCurrent: true, isRemote: false }] as never,
    },
    worktrees: [],
    ghAvailable: true,
  };
}

describe("GitView", () => {
  beforeEach(() => {
    const status = makeStatus();
    toastDanger.mockClear();
    bridge.getGitStatus.mockReset();
    bridge.gitFetch.mockReset();
    bridge.gitProjectSnapshot.mockReset();
    bridge.getGitStatus.mockResolvedValue(status);
    bridge.gitFetch.mockResolvedValue(undefined);
    bridge.gitProjectSnapshot.mockResolvedValue(makeSnapshot(status));
    useGitStore.setState({
      statuses: { "project-1": status },
      worktreeStatuses: {},
      branches: {},
      worktrees: {},
    });
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
});
