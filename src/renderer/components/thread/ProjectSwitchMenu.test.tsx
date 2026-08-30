import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project } from "@/shared/contracts";
import { HOME_PROJECT_ID, HOME_PROJECT_NAME } from "@/shared/homeScope";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
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
    useRemoteServersStore.setState({ servers: [], runtime: {} });
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

  it("offers only the active workspace's projects, like the sidebar", async () => {
    render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);
    const menu = await openMenu();

    // Home and unfiled projects belong to every workspace; Beta is filed in
    // Side Hustle and stays out of the list entirely.
    expect(within(menu).queryByRole("group")).not.toBeInTheDocument();
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((item) => item.textContent),
    ).toEqual([HOME_PROJECT_NAME, "Alpha", "Gamma"]);
    expect(within(menu).queryByText("Other workspaces")).not.toBeInTheDocument();
  });

  it("keeps a flat list when every project belongs to the active workspace", async () => {
    useAppStore.setState({ projects: [homeProject, workProject, unfiledProject] });
    render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);
    const menu = await openMenu();

    expect(within(menu).queryByRole("group")).not.toBeInTheDocument();
    expect(within(menu).getAllByRole("menuitemradio")).toHaveLength(3);
  });

  it("does not offer projects filed in another workspace", async () => {
    render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);
    const menu = await openMenu();

    expect(within(menu).queryByRole("menuitemradio", { name: /Beta/ })).not.toBeInTheDocument();
  });

  it("remembers an in-workspace pick for the active workspace", async () => {
    render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);
    const menu = await openMenu();

    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Gamma" }));

    await waitFor(() => {
      expect(useAppStore.getState().view).toEqual({ kind: "draft", projectId: "c" });
    });
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("w1");
    expect(useWorkspaceStore.getState().lastProjectIdByWorkspace).toEqual({ w1: "c" });
  });

  it("names the hosting machine on a mirrored project, in the trigger and the menu", async () => {
    const mirrored = {
      ...project("r", "Alpha", "w1"),
      remoteServerId: "desktop-1",
      remoteId: "rp-1",
    } as Project;
    useRemoteServersStore.setState({
      servers: [{ desktopId: "desktop-1", label: "Poracode on MacBook 16" }],
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    } as never);
    useAppStore.setState({ projects: [workProject, mirrored] });

    render(<ProjectSwitchMenu currentProjectId="r" variant="compact" />);

    // Two projects share the name "Alpha"; only the mirrored one is machine-tagged.
    expect(screen.getByRole("button", { name: "Switch project" })).toHaveTextContent("MacBook 16");
    const menu = await openMenu();
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual(["Alpha", "AlphaMacBook 16"]);
  });

  it("pins Home first, then local projects, then remote mirrors regardless of store order", async () => {
    const remoteAlpha = {
      ...project("r1", "RemoteAlpha"),
      remoteServerId: "desktop-1",
      remoteId: "rp-1",
    } as Project;
    const remoteGamma = {
      ...project("r2", "RemoteGamma"),
      remoteServerId: "desktop-1",
      remoteId: "rp-2",
    } as Project;
    useRemoteServersStore.setState({
      servers: [{ desktopId: "desktop-1", label: "Poracode on MacBook 16" }],
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    } as never);
    // Store order interleaves remote mirrors among local projects — the
    // selector must ignore it and bucket Home, local, then remote.
    useAppStore.setState({
      projects: [
        remoteAlpha,
        homeProject,
        project("l1", "LocalBeta"),
        remoteGamma,
        project("l2", "LocalDelta"),
      ],
    });

    render(<ProjectSwitchMenu currentProjectId="l1" variant="compact" />);
    const menu = await openMenu();
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual([
      HOME_PROJECT_NAME,
      "LocalBeta",
      "LocalDelta",
      "RemoteAlphaMacBook 16",
      "RemoteGammaMacBook 16",
    ]);
  });

  it("omits Home from the selector when the Home scope setting is off", async () => {
    useSharedSettings.setState({ homeScopeEnabled: false });
    render(<ProjectSwitchMenu currentProjectId="a" variant="compact" />);
    const menu = await openMenu();

    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((item) => item.textContent),
    ).toEqual(["Alpha", "Gamma"]);
  });

  it("labels the trigger with a draft that outlived a workspace switch", async () => {
    render(<ProjectSwitchMenu currentProjectId="b" variant="compact" />);

    expect(screen.getByRole("button", { name: "Switch project" })).toHaveTextContent("Beta");

    // Beta is filed in Side Hustle, so the Work-scoped menu offers the active
    // workspace's projects instead.
    const menu = await openMenu();
    expect(within(menu).queryByRole("menuitemradio", { name: /Beta/ })).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitemradio", { name: "Alpha" })).toBeInTheDocument();
  });

  it("keeps a hidden current project switchable when one active target remains", async () => {
    useSharedSettings.setState({ homeScopeEnabled: false });
    useAppStore.setState({ projects: [workProject, sideHustleProject] });
    render(<ProjectSwitchMenu currentProjectId="b" variant="compact" />);

    expect(screen.getByRole("button", { name: "Switch project" })).not.toBeDisabled();
    const menu = await openMenu();
    expect(within(menu).getByRole("menuitemradio", { name: "Alpha" })).toBeInTheDocument();
  });
});
