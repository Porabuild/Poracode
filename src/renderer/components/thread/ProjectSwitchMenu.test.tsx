import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project } from "@/shared/contracts";
import { HOME_PROJECT_ID, HOME_PROJECT_NAME } from "@/shared/homeScope";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useWorkspaceStore } from "@/renderer/state/workspaceStore";
import { ProjectSwitchMenu } from "./ProjectSwitchMenu";

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({}),
  isRemoteSession: () => false,
}));

function project(id: string, name: string, workspaceId?: string): Project {
  return {
    id,
    name,
    location: { kind: "windows", path: `C:\\${id}` },
    createdAt: "2026-07-01T00:00:00.000Z",
    ...(workspaceId ? { workspaceId } : {}),
  } as Project;
}

// Mirrors production: the synthetic Home row is persisted with `disabled: true`
// and must still be offered by every workspace.
const homeProject = { ...project(HOME_PROJECT_ID, HOME_PROJECT_NAME), disabled: true } as Project;

const workProject = project("a", "Alpha", "w1");
const sideHustleProject = project("b", "Beta", "w2");
const unfiledProject = project("c", "Gamma");

async function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Switch project" }));
  return screen.findByRole("menu");
}

describe("ProjectSwitchMenu", () => {
  beforeEach(() => {
    localStorage.clear();
    useSharedSettings.setState({
      workspaces: [
        { id: "w1", name: "Work", icon: "briefcase", createdAt: "2026-07-27T00:00:00.000Z" },
        { id: "w2", name: "Side Hustle", icon: "rocket", createdAt: "2026-07-27T00:00:00.000Z" },
      ],
    });
    useWorkspaceStore.setState({ activeWorkspaceId: "w1", lastProjectIdByWorkspace: {} });
    useAppStore.setState({
      projects: [homeProject, workProject, sideHustleProject, unfiledProject],
      view: { kind: "draft", projectId: "a" },
    });
  });

  it("groups other workspaces' projects under their own heading instead of hiding them", async () => {
    render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);
    const menu = await openMenu();

    const groups = within(menu).getAllByRole("group");
    expect(groups).toHaveLength(2);
    // Active workspace first: Home and unfiled projects belong to every workspace.
    expect(
      within(groups[0]!)
        .getAllByRole("menuitemradio")
        .map((item) => item.textContent),
    ).toEqual([HOME_PROJECT_NAME, "Alpha", "Gamma"]);
    // The out-of-workspace group names the workspace the project would move to.
    const other = within(groups[1]!).getByRole("menuitemradio", { name: /Beta/ });
    expect(other).toHaveTextContent("Side Hustle");
    expect(within(menu).getByText("Other workspaces")).toBeInTheDocument();
  });

  it("keeps a flat list when every project belongs to the active workspace", async () => {
    useAppStore.setState({ projects: [homeProject, workProject, unfiledProject] });
    render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);
    const menu = await openMenu();

    expect(within(menu).queryByRole("group")).not.toBeInTheDocument();
    expect(within(menu).getAllByRole("menuitemradio")).toHaveLength(3);
  });

  it("follows an out-of-workspace pick into its workspace and remembers it there", async () => {
    render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);
    const menu = await openMenu();

    fireEvent.click(within(menu).getByRole("menuitemradio", { name: /Beta/ }));

    await waitFor(() => {
      expect(useAppStore.getState().view).toEqual({ kind: "draft", projectId: "b" });
    });
    // Otherwise the new thread would be started in a project the sidebar hides.
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("w2");
    expect(useWorkspaceStore.getState().lastProjectIdByWorkspace).toEqual({ w2: "b" });
  });

  it("stays in the active workspace when the pick is already visible there", async () => {
    render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);
    const menu = await openMenu();

    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Gamma" }));

    await waitFor(() => {
      expect(useAppStore.getState().view).toEqual({ kind: "draft", projectId: "c" });
    });
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("w1");
    expect(useWorkspaceStore.getState().lastProjectIdByWorkspace).toEqual({ w1: "c" });
  });

  it("labels the trigger with a draft that outlived a workspace switch", async () => {
    render(<ProjectSwitchMenu currentProjectId="b" variant="compact" />);

    expect(screen.getByRole("button", { name: "Switch project" })).toHaveTextContent("Beta");

    const menu = await openMenu();
    expect(within(menu).getByRole("menuitemradio", { name: /Beta/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitemradio", { name: "Alpha" })).toBeInTheDocument();
  });
});
