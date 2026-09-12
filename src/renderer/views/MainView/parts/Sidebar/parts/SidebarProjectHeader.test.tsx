import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { SidebarProjectHeader } from "./SidebarProjectHeader";
import { SidebarProjectSection } from "./SidebarProjectSection";

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({}),
  isRemoteSession: () => false,
}));

vi.mock("@dnd-kit/react", () => ({
  useDraggable: () => undefined,
}));

vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: () => ({ ref: () => {} }),
}));

vi.mock("./GitBadge", () => ({
  GitBadge: () => <span>git-status</span>,
}));

vi.mock("./SyncBadge", () => ({
  SyncBadge: () => <span>sync-status</span>,
}));

vi.mock("@heroui/react", () => {
  const Tooltip = Object.assign((props: { children: ReactNode }) => <>{props.children}</>, {
    Trigger: (props: { children: ReactNode }) => <>{props.children}</>,
    Content: (props: { children: ReactNode }) => <div>{props.children}</div>,
  });
  return { Tooltip };
});

const project: Project = {
  id: "project-1",
  name: "Mac Poracode",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-07-01T00:00:00.000Z",
  remoteServerId: "desktop-1",
  remoteId: "remote-project-1",
};

const server: RemoteServerRecord = {
  desktopId: "desktop-1",
  label: "Poracode on H1FCM6T4GX",
  endpoint: "http://192.168.1.10:49152/",
  accessToken: "token",
  scopes: ["projects:manage"],
};

/** Thread-row collapse footprint — project icons must share this when idle. */
const COLLAPSED_PANEL_CLASSES = [
  "w-0",
  "overflow-hidden",
  "opacity-0",
  "pointer-events-none",
  "group-hover:w-[18px]",
  "group-hover:opacity-100",
] as const;

function seedRemote(status: "online" | "offline") {
  useRemoteServersStore.setState({
    servers: [server],
    runtime: { [server.desktopId]: { status, projects: [], threads: [] } },
  });
}

function resetPanelAndTerminalState() {
  usePanelStore.setState({
    rightPanelTab: "git",
    filesPanelContext: null,
  });
  useDevTerminalStore.setState({
    isOpen: false,
    explicitlyOpened: false,
    activeProjectId: null,
    activeWorktreePath: null,
    tabs: [],
    activeTabId: null,
    focusRequestId: 0,
    tabActivity: {},
    streamingTabs: {},
  });
}

function renderHeader() {
  return render(
    <SidebarProjectHeader project={project} isCollapsed isDragging={false} isUnreachable={false} />,
  );
}

describe("SidebarProjectHeader", () => {
  beforeEach(() => {
    seedRemote("online");
    useAppStore.setState({ projects: [project], threads: [] });
    resetPanelAndTerminalState();
  });

  it("shows the bare server name without the Poracode brand prefix", () => {
    renderHeader();

    expect(screen.getByText("H1FCM6T4GX")).toBeInTheDocument();
    expect(screen.queryByText("Poracode on H1FCM6T4GX")).not.toBeInTheDocument();
  });

  it("lights the connection dot green while the remote server is online", () => {
    renderHeader();

    expect(screen.getByTitle("Online")).toHaveClass("bg-success");
  });

  it("dims the connection dot when the remote server is offline", () => {
    seedRemote("offline");

    const { container } = render(
      <SidebarProjectHeader project={project} isCollapsed isDragging={false} isUnreachable />,
    );

    expect(screen.getByTitle("Offline")).toHaveClass("bg-default-400");
    expect(container.querySelector(".poracode-sidebar-project-nudge")).toHaveClass("opacity-50");
    expect(screen.queryByText("git-status")).not.toBeInTheDocument();
    expect(screen.queryByText("sync-status")).not.toBeInTheDocument();
  });

  it("hides the project body while the remote server is offline", () => {
    seedRemote("offline");

    render(<SidebarProjectSection projectId={project.id} projectIndex={0} sortMode="updated" />);

    expect(screen.queryByText("New thread")).not.toBeInTheDocument();
  });

  it("shows the project body while the remote server is online", () => {
    render(<SidebarProjectSection projectId={project.id} projectIndex={0} sortMode="updated" />);

    expect(screen.getByText("New thread")).toBeInTheDocument();
  });

  it("collapses idle files and terminal icons so they reserve no row width", () => {
    renderHeader();

    const files = screen.getByRole("button", { name: `Files for ${project.name}` });
    const terminal = screen.getByRole("button", { name: `Terminal for ${project.name}` });

    for (const className of COLLAPSED_PANEL_CLASSES) {
      expect(files).toHaveClass(className);
      expect(terminal).toHaveClass(className);
    }
    // Opacity-only hide would keep p-0.5 + fixed width; collapse must not.
    expect(files.className).not.toMatch(/(?:^|\s)p-0\.5(?:\s|$)/);
    expect(terminal.className).not.toMatch(/(?:^|\s)p-0\.5(?:\s|$)/);
    expect(files).not.toHaveClass("w-[18px]");
    expect(terminal).not.toHaveClass("w-[18px]");
  });

  it("keeps the files icon sized and accented while the files panel is active", () => {
    usePanelStore.setState({
      rightPanelTab: "files",
      filesPanelContext: {
        projectId: project.id,
        projectName: project.name,
        rootLabel: project.name,
      },
    });

    renderHeader();

    const files = screen.getByRole("button", { name: `Files for ${project.name}` });
    expect(files).toHaveClass("w-[18px]", "p-0.5", "text-accent");
    expect(files).not.toHaveClass("w-0");
  });

  it("keeps the terminal icon sized while a project terminal tab is open", () => {
    useDevTerminalStore.setState({
      isOpen: true,
      activeProjectId: project.id,
      activeWorktreePath: null,
      tabs: [
        {
          id: "term-1",
          projectId: project.id,
          title: "shell",
          createdAt: "2026-07-01T00:00:00.000Z",
        },
      ],
      activeTabId: "term-1",
    });

    renderHeader();

    const terminal = screen.getByRole("button", { name: `Terminal for ${project.name}` });
    expect(terminal).toHaveClass("w-[18px]", "p-0.5");
    expect(terminal).not.toHaveClass("w-0");
  });
});
