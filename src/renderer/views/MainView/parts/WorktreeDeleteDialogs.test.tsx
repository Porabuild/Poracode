import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useWorktreeDeleteStore } from "@/renderer/state/worktreeDeleteStore";
import { WorktreeDeleteDialogs } from "./WorktreeDeleteDialogs";

const { bridge, toast } = vi.hoisted(() => ({
  bridge: {
    gitDeleteBranch: vi.fn<() => Promise<void>>(),
    gitListBranches: vi.fn<() => Promise<never[]>>(),
  },
  toast: {
    danger: vi.fn<(message: string) => void>(),
  },
}));

vi.mock("@heroui/react", () => ({ toast }));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("@/renderer/views/MainView/parts/Sidebar/parts/DeleteWorktreeDialog", () => ({
  DeleteWorktreeDialog: () => null,
}));

vi.mock("@/renderer/views/MainView/parts/Sidebar/parts/ForceDeleteBranchDialog", () => ({
  ForceDeleteBranchDialog: (props: { onForceDelete: () => void }) => (
    <button type="button" onClick={props.onForceDelete}>
      force delete
    </button>
  ),
}));

const project: Project = {
  id: "project-1",
  name: "Remote project",
  location: {
    kind: "posix",
    path: "/repo",
    remoteServerId: "desktop-1",
  },
  remoteServerId: "desktop-1",
  remoteId: "remote-project",
  createdAt: "2026-08-02T00:00:00.000Z",
};

describe("WorktreeDeleteDialogs", () => {
  beforeEach(() => {
    bridge.gitDeleteBranch.mockReset().mockResolvedValue(undefined);
    bridge.gitListBranches.mockReset().mockResolvedValue([]);
    toast.danger.mockReset();
    useAppStore.setState({ projects: [project] });
    useWorktreeDeleteStore.getState().setDialog({
      kind: "branch-unmerged",
      projectId: project.id,
      worktreeBranch: "feature/remote",
      error: "not fully merged",
    });
  });

  it("keeps the force-delete dialog open when the remote command fails", async () => {
    bridge.gitDeleteBranch.mockRejectedValueOnce(new Error("remote server offline"));
    render(<WorktreeDeleteDialogs />);

    fireEvent.click(screen.getByRole("button", { name: "force delete" }));

    await vi.waitFor(() => expect(toast.danger).toHaveBeenCalledWith("remote server offline"));
    expect(useWorktreeDeleteStore.getState().dialog).not.toBeNull();
    expect(bridge.gitListBranches).not.toHaveBeenCalled();
  });

  it("closes the force-delete dialog after the remote command succeeds", async () => {
    render(<WorktreeDeleteDialogs />);

    fireEvent.click(screen.getByRole("button", { name: "force delete" }));

    await vi.waitFor(() => expect(useWorktreeDeleteStore.getState().dialog).toBeNull());
    expect(bridge.gitDeleteBranch).toHaveBeenCalledWith({
      projectLocation: project.location,
      branch: "feature/remote",
      force: true,
    });
  });
});
