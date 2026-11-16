import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useProjectGroupStore } from "@/renderer/state/projectGroups/projectGroupStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useWorkspaceStore } from "@/renderer/state/workspaceStore";
import { ProjectEnvironmentMenu } from "./ProjectEnvironmentMenu";

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({}),
  isRemoteSession: () => false,
}));

const switchDraftProject = vi.hoisted(() => vi.fn<(a: string, b: string, c?: unknown) => void>());
vi.mock("./switchDraftProject", async (original) => ({
  ...(await original<typeof import("./switchDraftProject")>()),
  switchDraftProject,
}));

const stamp = "2026-11-01T10:00:00.000Z";

function projectRow(id: string, name: string, remoteServerId?: string): Project {
  return {
    id,
    name,
    ...(remoteServerId ? { remoteServerId, remoteId: "app" } : {}),
    location: {
      kind: "posix",
      path: `/${id}`,
      ...(remoteServerId ? { remoteServerId } : {}),
    },
    createdAt: stamp,
  } as Project;
}

// One logical project "App" on three machines: this computer plus two paired
// hosts, grouped by name like the real fixture.
const LOCAL = projectRow("project-1", "App");
const MAC = projectRow("remote:mac:project:app", "App", "mac");
const MINI = projectRow("remote:mini:project:app", "App", "mini");
const STUDIO = projectRow("remote:studio:project:app", "App", "studio");

async function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: /^Machine: / }));
  return screen.findByRole("menu");
}

describe("ProjectEnvironmentMenu selection", () => {
  beforeEach(() => {
    switchDraftProject.mockClear();
    useAppStore.setState({
      projects: [LOCAL, MAC, MINI, STUDIO],
      view: { kind: "draft", projectId: "project-1" },
    });
    useRemoteServersStore.setState({
      servers: [
        { desktopId: "mac", label: "MacBook" },
        { desktopId: "mini", label: "Mac mini" },
        { desktopId: "studio", label: "Studio" },
      ],
      runtime: {
        mac: { status: "online", projects: [], threads: [] },
        mini: { status: "online", projects: [], threads: [] },
        studio: { status: "online", projects: [], threads: [] },
      },
    } as never);
    useGitStore.setState({ statuses: {} });
    useProjectGroupStore.setState({ manualGroups: {}, lastUsedAt: {} });
    useSharedSettings.setState({ workspaces: [], homeScopeEnabled: false });
    useWorkspaceStore.setState({ activeWorkspaceId: null, lastProjectIdByWorkspace: {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls onSelect instead of switching the draft project", async () => {
    const onSelect = vi.fn<(projectId: string) => void>();
    render(<ProjectEnvironmentMenu currentProjectId={MAC.id} onSelect={onSelect} />);

    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: /Mac mini/ }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(MINI.id));
    expect(switchDraftProject).not.toHaveBeenCalled();
    expect(useAppStore.getState().view).toEqual({ kind: "draft", projectId: "project-1" });
  });

  it("keeps switching the draft project when onSelect is not provided", async () => {
    render(<ProjectEnvironmentMenu currentProjectId={MAC.id} />);

    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: /Mac mini/ }));

    await waitFor(() =>
      expect(switchDraftProject).toHaveBeenCalledWith(MAC.id, MINI.id, expect.anything()),
    );
  });

  it("leaves filterProject-rejected rows out of the menu entirely", async () => {
    const onSelect = vi.fn<(projectId: string) => void>();
    render(
      <ProjectEnvironmentMenu
        currentProjectId={MAC.id}
        onSelect={onSelect}
        filterProject={(id) => id !== MINI.id}
      />,
    );

    const menu = await openMenu();
    expect(within(menu).queryByRole("menuitemradio", { name: /Mac mini/ })).toBeNull();
    // The current row and every accepted row stay listed.
    expect(within(menu).getByRole("menuitemradio", { name: /Local/ })).toBeTruthy();
    expect(within(menu).getByRole("menuitemradio", { name: /MacBook/ })).toBeTruthy();
    expect(within(menu).getByRole("menuitemradio", { name: /Studio/ })).toBeTruthy();
  });

  it("keeps the current row even when filterProject rejects everything", () => {
    const { container } = render(
      <ProjectEnvironmentMenu currentProjectId={MAC.id} filterProject={() => false} />,
    );
    // One surviving environment falls back to the plain machine label.
    const label = container.querySelector("[data-project-environment]");
    expect(label?.textContent).toContain("MacBook");
    expect(screen.queryByRole("button", { name: /^Machine: / })).toBeNull();
  });
});
