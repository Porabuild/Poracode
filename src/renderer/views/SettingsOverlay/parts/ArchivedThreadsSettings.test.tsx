// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

const actions = vi.hoisted(() => ({
  deleteThreadsAndOwnedWorktrees: vi.fn<(threads: readonly Thread[]) => void>(),
  unarchiveThread: vi.fn<(threadId: string) => void>(),
}));

vi.mock("@/renderer/actions/threadActions", () => actions);
vi.mock("@/renderer/components/providers/ThreadProviderIcon", () => ({
  ThreadProviderIcon: () => <span data-testid="provider-icon" />,
}));

import { ArchivedThreadsSettings } from "./ArchivedThreadsSettings";

const project: Project = {
  id: "local-project",
  name: "Local project",
  location: { kind: "windows", path: "C:\\work\\local" },
  createdAt: "2026-08-01T00:00:00.000Z",
};

function thread(
  id: string,
  title: string,
  updatedAt: string,
  remote?: { desktopId: string; projectId: string },
): Thread {
  return {
    id,
    projectId: remote?.projectId ?? project.id,
    title,
    agentKind: "claude",
    config: { model: "default" },
    status: "inactive",
    attention: "none",
    canResumeWithConfig: false,
    archived: true,
    archivedAt: updatedAt,
    done: false,
    starred: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt,
    ...(remote ? { remoteServerId: remote.desktopId, remoteId: `remote-${id}` } : {}),
  };
}

describe("ArchivedThreadsSettings", () => {
  beforeEach(() => {
    actions.deleteThreadsAndOwnedWorktrees.mockReset();
    actions.unarchiveThread.mockReset();
    useAppStore.setState({
      projects: [
        project,
        {
          ...project,
          id: "remote:d1:project:remote-project",
          name: "Remote project",
          remoteServerId: "d1",
          remoteId: "remote-project",
          location: { kind: "posix", path: "/work/remote", remoteServerId: "d1" },
        },
      ],
      threads: [
        {
          ...thread("local-new", "Local newer", "2026-08-22T18:30:00.000Z"),
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          ...thread("local-old", "Local older", "2026-08-21T12:00:00.000Z"),
          worktreePath: "C:\\worktrees\\feature-archive",
          worktreeBranch: "feature/archive",
        },
        thread("remote-row", "Remote archive", "2026-08-22T19:00:00.000Z", {
          desktopId: "d1",
          projectId: "remote:d1:project:remote-project",
        }),
      ],
    });
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Studio Mac",
          endpoint: "https://remote.test",
          accessToken: "test-token",
          scopes: [],
        },
      ],
      runtime: {
        d1: { status: "online", projects: [], threads: [] },
      },
    });
  });

  it("separates local and remote archives by machine", async () => {
    render(<ArchivedThreadsSettings />);

    expect(screen.getByText("Local newer")).toBeInTheDocument();
    expect(screen.queryByText("Remote archive")).not.toBeInTheDocument();

    const machineTrigger = screen.getByRole("button", { name: "Machine: This machine" });
    expect(machineTrigger).toHaveClass("rounded-3xl", "justify-start");
    expect(machineTrigger.querySelector(".lucide-monitor")).not.toBeNull();
    fireEvent.click(machineTrigger);
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Studio Mac" }));

    expect(screen.getByText("Remote archive")).toBeInTheDocument();
    expect(screen.queryByText("Local newer")).not.toBeInTheDocument();
    expect(machineTrigger.querySelector(".lucide-server")).not.toBeNull();
    expect(machineTrigger).toHaveAccessibleName("Machine: Studio Mac");
  });

  it("groups archives by day and clears only the selected day", () => {
    render(<ArchivedThreadsSettings />);

    const clearDayButtons = screen.getAllByRole("button", { name: /Clear archived threads from/ });
    expect(clearDayButtons).toHaveLength(2);
    fireEvent.click(clearDayButtons[0]!);

    expect(actions.deleteThreadsAndOwnedWorktrees).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(actions.deleteThreadsAndOwnedWorktrees).toHaveBeenCalledTimes(1);
    expect(
      actions.deleteThreadsAndOwnedWorktrees.mock.calls[0]?.[0].map((candidate) => candidate.id),
    ).toEqual(["local-new"]);
  });

  it("shows the archive time and clears every archive on the selected machine", () => {
    render(<ArchivedThreadsSettings />);

    expect(screen.getAllByText(/Archived at/)).toHaveLength(2);
    expect(screen.getByText("Worktree: feature/archive")).toBeInTheDocument();
    const clearAll = screen.getByRole("button", { name: "Clear all" });
    fireEvent.click(clearAll);

    expect(screen.getByText(/Associated worktrees with no remaining threads/i)).toBeInTheDocument();
    expect(actions.deleteThreadsAndOwnedWorktrees).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(actions.deleteThreadsAndOwnedWorktrees).toHaveBeenCalledTimes(1);
    expect(
      actions.deleteThreadsAndOwnedWorktrees.mock.calls[0]?.[0].map((candidate) => candidate.id),
    ).toEqual(["local-new", "local-old"]);
  });

  it("confirms a single archived thread and discloses worktree removal", () => {
    render(<ArchivedThreadsSettings />);

    fireEvent.click(screen.getAllByRole("button", { name: "Delete thread" })[1]!);

    expect(actions.deleteThreadsAndOwnedWorktrees).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Permanently delete the selected archive entries/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Associated worktrees with no remaining threads/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(actions.deleteThreadsAndOwnedWorktrees).toHaveBeenCalledWith([
      expect.objectContaining({ id: "local-old" }),
    ]);
  });

  it("disables archive mutations for an unavailable remote machine", async () => {
    useRemoteServersStore.setState((state) => ({
      runtime: {
        ...state.runtime,
        d1: { status: "offline", projects: [], threads: [] },
      },
    }));
    render(<ArchivedThreadsSettings />);

    fireEvent.click(screen.getByRole("button", { name: /Machine:/ }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Studio Mac" }));

    expect(screen.getByText(/selected machine is unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restore thread" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete thread" })).toBeDisabled();
  });

  it("keeps archive mutations available after a reachable remote error", async () => {
    useRemoteServersStore.setState((state) => ({
      runtime: {
        ...state.runtime,
        d1: { status: "error", message: "Previous request failed", projects: [], threads: [] },
      },
    }));
    render(<ArchivedThreadsSettings />);

    fireEvent.click(screen.getByRole("button", { name: /Machine:/ }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Studio Mac" }));

    expect(screen.queryByText(/selected machine is unavailable/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Restore thread" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete thread" })).toBeEnabled();
  });
});
