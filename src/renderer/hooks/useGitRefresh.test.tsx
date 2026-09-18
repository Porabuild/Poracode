import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useGitRefresh } from "./useGitRefresh";

const { bridgeMock, gitRefreshMocks } = vi.hoisted(() => ({
  bridgeMock: {
    gitWatchProject: vi.fn<() => Promise<void>>(),
    gitUnwatchProject: vi.fn<() => Promise<void>>(),
    gitFetch: vi.fn<() => Promise<void>>(),
    onSupervisorEvent: vi.fn<() => () => void>(),
  },
  gitRefreshMocks: {
    cleanupGitRefreshProjects: vi.fn<(activeProjectIds: ReadonlySet<string>) => void>(),
    getWatcherRefreshMode: vi.fn<(projectId: string) => "status" | "full">(() => "full"),
    prefetchBranchPrData: vi.fn<(project: Pick<Project, "id" | "location">) => Promise<void>>(),
    refreshGitProject:
      vi.fn<
        (
          project: Pick<Project, "id" | "location">,
          reason: "initial" | "watcher" | "fetch" | "manual" | "poll",
          mode?: "status" | "full",
          options?: { isActive?: () => boolean; fetchRemote?: boolean },
        ) => Promise<void>
      >(),
    stopPendingPrRefresh: vi.fn<() => void>(),
    syncPendingPrRefreshProjects:
      vi.fn<(activeProjects: readonly Pick<Project, "id" | "location">[]) => void>(),
    syncWatchedWorktreeProjects:
      vi.fn<(activeProjects: readonly Pick<Project, "id" | "location">[]) => void>(),
  },
}));

vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridgeMock }));
vi.mock("@/renderer/state/gitRefresh", () => gitRefreshMocks);

const remoteProject: Project = {
  id: "remote-project",
  remoteServerId: "desktop-1",
  remoteId: "host-project",
  name: "Remote project",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-08-10T00:00:00.000Z",
};

describe("useGitRefresh remote reachability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMock.gitWatchProject.mockResolvedValue(undefined);
    bridgeMock.gitUnwatchProject.mockResolvedValue(undefined);
    bridgeMock.gitFetch.mockResolvedValue(undefined);
    bridgeMock.onSupervisorEvent.mockReturnValue(vi.fn());
    useAppStore.setState({ projects: [remoteProject] });
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Remote",
          endpoint: "http://127.0.0.1:61234",
          accessToken: "token",
          scopes: [],
        },
      ],
      runtime: {},
    });
  });

  it("skips Git work while the remote transport is connecting", () => {
    useRemoteServersStore.setState({
      runtime: {
        "desktop-1": { status: "connecting", projects: [], threads: [] },
      },
    });

    const { unmount } = renderHook(() => useGitRefresh(true));

    expect(gitRefreshMocks.prefetchBranchPrData).not.toHaveBeenCalled();
    expect(gitRefreshMocks.refreshGitProject).not.toHaveBeenCalled();
    expect(bridgeMock.gitWatchProject).not.toHaveBeenCalled();
    unmount();
  });

  it("keeps Git prefetch and recovery active for a reachable server error", () => {
    useRemoteServersStore.setState({
      runtime: {
        "desktop-1": { status: "error", projects: [], threads: [] },
      },
    });

    const { unmount } = renderHook(() => useGitRefresh(true));

    expect(gitRefreshMocks.prefetchBranchPrData).toHaveBeenCalledWith(remoteProject);
    expect(gitRefreshMocks.refreshGitProject).toHaveBeenCalledWith(
      remoteProject,
      "initial",
      "full",
      expect.any(Object),
    );
    expect(bridgeMock.gitWatchProject).toHaveBeenCalledWith({
      projectId: remoteProject.id,
      projectLocation: remoteProject.location,
    });
    unmount();
  });
});
