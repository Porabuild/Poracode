import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult, Project } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { SyncBadge } from "./SyncBadge";

const bridgeMock = vi.hoisted(() => ({
  gitPull: vi.fn<() => Promise<void>>(),
  gitPush: vi.fn<() => Promise<void>>(),
  gitSync: vi.fn<() => Promise<void>>(),
  getGitStatus: vi.fn<() => Promise<GitStatusResult>>(),
}));

const toastMock = vi.hoisted(() => ({
  danger: vi.fn<(message: string) => void>(),
}));

vi.mock("@heroui/react", () => {
  const Tooltip = Object.assign((props: { children: ReactNode }) => <div>{props.children}</div>, {
    Trigger: (props: { children: ReactNode }) => <>{props.children}</>,
    Content: (props: { children: ReactNode }) => <div>{props.children}</div>,
  });

  return {
    Tooltip,
    toast: toastMock,
  };
});

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridgeMock,
}));

const project: Project = {
  id: "project-1",
  name: "Project",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-05-23T00:00:00.000Z",
};

function makeStatus(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return {
    isRepo: true,
    branch: "main",
    tracking: "origin/main",
    hasRemote: true,
    remoteInfo: null,
    ahead: 0,
    behind: 1,
    staged: [],
    unstaged: [],
    totalInsertions: 0,
    totalDeletions: 0,
    ...overrides,
  };
}

describe("SyncBadge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    useAppStore.setState({ projects: [project] });
    useGitStore.setState({
      statuses: { [project.id]: makeStatus() },
      worktreeStatuses: {},
      worktrees: {},
      branches: {},
      ghAvailable: {},
      prData: {},
      worktreeSourceInfo: {},
      prFiles: {},
      prDiffs: {},
      prDetails: {},
    });
  });

  it("shows a toast when pulling from the sidebar badge fails", async () => {
    bridgeMock.gitPull.mockRejectedValueOnce(new Error("remote rejected"));

    render(<SyncBadge projectId={project.id} />);

    fireEvent.click(screen.getByRole("button", { name: "Pull ↓1" }));

    await waitFor(() => {
      expect(toastMock.danger).toHaveBeenCalledWith("remote rejected");
    });
  });
});
