import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project, Thread } from "@/shared/contracts";
import { HOME_PROJECT_ID, HOME_PROJECT_NAME } from "@/shared/homeScope";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useWorkspaceStore } from "@/renderer/state/workspaceStore";
import { SidebarFlatThreadList } from "./SidebarFlatThreadList";

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({}),
}));

vi.mock("@/renderer/dnd", () => ({
  useDragSource: () => null,
}));

vi.mock("./NewThreadButton", () => ({
  NewThreadButton: (props: { projectId: string }) => (
    <button type="button">new-thread:{props.projectId}</button>
  ),
}));

vi.mock("./SidebarThreadRow", () => ({
  SeeMoreThreadsButton: () => <button type="button">see-more</button>,
  SidebarThreadRow: (props: {
    row: { key: string };
    project: { name: string };
    projectTag?: React.ReactNode;
  }) => (
    <div data-testid="row">
      {props.row.key} in {props.project.name}
      {props.projectTag}
    </div>
  ),
}));

function makeThread(id: string, projectId: string, updatedAt: string): Thread {
  return {
    id,
    projectId,
    title: `Thread ${id}`,
    status: "inactive",
    done: false,
    starred: false,
    archived: false,
    createdAt: updatedAt,
    updatedAt,
    agentKind: "claude",
  } as unknown as Thread;
}

// The real Home row is persisted with `disabled: true` (see
// `ensureHomeProjectRow`); the flat list must not filter it out on that flag.
const homeProject: Project = {
  id: HOME_PROJECT_ID,
  name: HOME_PROJECT_NAME,
  location: { kind: "windows", path: "C:\\Users\\me" },
  createdAt: "2026-07-01T00:00:00.000Z",
  disabled: true,
} as Project;

const localProject: Project = {
  id: "local-1",
  name: "Poracode",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: "2026-07-01T00:00:00.000Z",
  workspaceId: "w1",
} as Project;

const unreachableRemoteProject: Project = {
  id: "remote-1",
  name: "Mac Poracode",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-07-01T00:00:00.000Z",
  remoteServerId: "desktop-1",
  remoteId: "rp-1",
  workspaceId: "w1",
} as Project;

describe("SidebarFlatThreadList", () => {
  beforeEach(() => {
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useSharedSettings.setState({
      homeScopeEnabled: true,
      workspaces: [{ id: "w1", name: "Side Hustle" }],
    } as never);
    useWorkspaceStore.setState({ activeWorkspaceId: "w1" });
  });

  it("shows Home threads alongside project threads with the new-thread row", () => {
    useAppStore.setState({
      projects: [homeProject, localProject],
      threads: [
        makeThread("h1", HOME_PROJECT_ID, "2026-08-02T10:00:00.000Z"),
        makeThread("p1", "local-1", "2026-08-01T10:00:00.000Z"),
      ],
    });

    render(<SidebarFlatThreadList sortMode="updated" />);

    expect(screen.getByText(`new-thread:${HOME_PROJECT_ID}`)).toBeInTheDocument();
    expect(screen.getByText(/thread:h1 in Home/)).toBeInTheDocument();
    expect(screen.getByText(/thread:p1 in Poracode/)).toBeInTheDocument();
  });

  it("keeps Home threads and the new-thread row when the only workspace project is unreachable", () => {
    useAppStore.setState({
      projects: [homeProject, unreachableRemoteProject],
      threads: [
        makeThread("h1", HOME_PROJECT_ID, "2026-08-02T10:00:00.000Z"),
        makeThread("r1", "remote-1", "2026-08-03T10:00:00.000Z"),
      ],
    });

    render(<SidebarFlatThreadList sortMode="updated" />);

    expect(screen.getByText(`new-thread:${HOME_PROJECT_ID}`)).toBeInTheDocument();
    expect(screen.getByText(/thread:h1 in Home/)).toBeInTheDocument();
    expect(screen.queryByText(/thread:r1/)).not.toBeInTheDocument();
  });

  it("hides remote threads while the server reports an error (e.g. relay answering for an off machine)", () => {
    useRemoteServersStore.setState({
      runtime: { "desktop-1": { status: "error", projects: [], threads: [] } },
    } as never);
    useAppStore.setState({
      projects: [homeProject, unreachableRemoteProject],
      threads: [makeThread("r1", "remote-1", "2026-08-03T10:00:00.000Z")],
    });

    render(<SidebarFlatThreadList sortMode="updated" />);

    expect(screen.queryByText(/thread:r1/)).not.toBeInTheDocument();
  });

  it("shows remote threads while the server is online", () => {
    useRemoteServersStore.setState({
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    } as never);
    useAppStore.setState({
      projects: [homeProject, unreachableRemoteProject],
      threads: [makeThread("r1", "remote-1", "2026-08-03T10:00:00.000Z")],
    });

    render(<SidebarFlatThreadList sortMode="updated" />);

    expect(screen.getByText(/thread:r1 in Mac Poracode/)).toBeInTheDocument();
  });

  it("hides Home threads when home scope is disabled", () => {
    useSharedSettings.setState({ homeScopeEnabled: false } as never);
    useAppStore.setState({
      projects: [homeProject, localProject],
      threads: [
        makeThread("h1", HOME_PROJECT_ID, "2026-08-02T10:00:00.000Z"),
        makeThread("p1", "local-1", "2026-08-01T10:00:00.000Z"),
      ],
    });

    render(<SidebarFlatThreadList sortMode="updated" />);

    expect(screen.queryByText(/thread:h1/)).not.toBeInTheDocument();
    expect(screen.getByText(/thread:p1 in Poracode/)).toBeInTheDocument();
    expect(screen.getByText("new-thread:local-1")).toBeInTheDocument();
  });
});
