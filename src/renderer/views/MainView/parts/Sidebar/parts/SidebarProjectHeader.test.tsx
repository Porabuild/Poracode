import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { SidebarProjectHeader } from "./SidebarProjectHeader";
import { SidebarProjectSection } from "./SidebarProjectSection";

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({}),
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

function seedRemote(status: "online" | "offline") {
  useRemoteServersStore.setState({
    servers: [server],
    runtime: { [server.desktopId]: { status, projects: [], threads: [] } },
  });
}

describe("SidebarProjectHeader", () => {
  beforeEach(() => {
    seedRemote("online");
    useAppStore.setState({ projects: [project], threads: [] });
  });

  it("shows the bare server name without the Poracode brand prefix", () => {
    render(
      <SidebarProjectHeader
        project={project}
        isCollapsed
        isDragging={false}
        isUnreachable={false}
      />,
    );

    expect(screen.getByText("H1FCM6T4GX")).toBeInTheDocument();
    expect(screen.queryByText("Poracode on H1FCM6T4GX")).not.toBeInTheDocument();
  });

  it("lights the connection dot green while the remote server is online", () => {
    render(
      <SidebarProjectHeader
        project={project}
        isCollapsed
        isDragging={false}
        isUnreachable={false}
      />,
    );

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
});
