import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Workspace, WorkspaceIconId } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useWorkspaceStore } from "@/renderer/state/workspaceStore";
import { SidebarWorkspaceSwitcher } from "./SidebarWorkspaceSwitcher";

function workspace(id: string, name: string, icon: WorkspaceIconId): Workspace {
  return {
    id,
    name,
    icon,
    createdAt: "2026-07-27T00:00:00.000Z",
  };
}

describe("SidebarWorkspaceSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
    useSharedSettings.setState({
      workspaces: [
        workspace("work", "Work", "briefcase"),
        workspace("side", "Side Hustle", "rocket"),
      ],
    });
    useWorkspaceStore.setState({ activeWorkspaceId: "work" });
  });

  it("stays hidden when there is only one workspace", () => {
    useSharedSettings.setState((state) => ({ workspaces: [state.workspaces[0]!] }));

    render(<SidebarWorkspaceSwitcher />);

    expect(screen.queryByRole("button", { name: "Switch workspace" })).not.toBeInTheDocument();
    expect(screen.queryByText("Work")).not.toBeInTheDocument();
  });

  it("switches directly to the other workspace when there are exactly two", () => {
    render(<SidebarWorkspaceSwitcher />);

    fireEvent.click(screen.getByRole("button", { name: "Switch workspace" }));

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("side");
    expect(screen.getByText("Side Hustle")).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Switch workspace" }));
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("work");
    expect(screen.getByText("Work")).toBeInTheDocument();
  });

  it("opens a workspace-only picker when there are more than two", async () => {
    useSharedSettings.setState((state) => ({
      workspaces: [...state.workspaces, workspace("client", "Client", "palette")],
    }));

    render(<SidebarWorkspaceSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "Switch workspace" }));

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    const client = screen.getByRole("menuitemradio", { name: "Client" });
    expect(screen.queryByText("Add workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("Manage workspaces")).not.toBeInTheDocument();

    fireEvent.click(client);
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("client");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
