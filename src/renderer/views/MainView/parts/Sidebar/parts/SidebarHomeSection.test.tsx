import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project } from "@/shared/contracts";
import { HOME_PROJECT_ID, HOME_PROJECT_NAME } from "@/shared/homeScope";
import { useAppStore } from "@/renderer/state/appStore";
import { projectRemoteProject } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { SidebarHomeSection } from "./SidebarHomeSection";

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({}),
  isRemoteSession: () => false,
}));

vi.mock("@dnd-kit/react", () => ({
  useDraggable: () => undefined,
}));

vi.mock("@heroui/react", () => {
  const Tooltip = Object.assign((props: { children: ReactNode }) => <>{props.children}</>, {
    Trigger: (props: { children: ReactNode }) => <>{props.children}</>,
    Content: (props: { children: ReactNode }) => <div>{props.children}</div>,
  });
  return { Tooltip };
});

const server: RemoteServerRecord = {
  desktopId: "desktop-1",
  label: "Poracode on Studio PC",
  endpoint: "http://192.168.1.10:49152/",
  accessToken: "token",
  scopes: ["projects:manage"],
};

const home: Project = projectRemoteProject(server.desktopId, {
  id: HOME_PROJECT_ID,
  name: HOME_PROJECT_NAME,
  location: { kind: "posix", path: "/home/me" },
  createdAt: "2026-07-01T00:00:00.000Z",
  disabled: true,
});

function seedRemote(status: "online" | "offline") {
  useRemoteServersStore.setState({
    servers: [server],
    runtime: { [server.desktopId]: { status, projects: [], threads: [] } },
  });
}

describe("SidebarHomeSection", () => {
  beforeEach(() => {
    useAppStore.setState({ projects: [home], threads: [] });
  });

  it("names the machine and lists Home while it is online", () => {
    seedRemote("online");

    render(<SidebarHomeSection project={home} sortMode="updated" />);

    expect(screen.getByText("Studio PC")).toBeInTheDocument();
    expect(screen.getByText("New thread")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Terminal for ${home.name}` })).toBeInTheDocument();
  });

  it("greys out an offline machine's Home like its projects", () => {
    seedRemote("offline");

    const { container } = render(<SidebarHomeSection project={home} sortMode="updated" />);

    expect(container.querySelector(".poracode-sidebar-project-nudge")).toHaveClass("opacity-50");
    expect(screen.queryByText("New thread")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: `Terminal for ${home.name}` }),
    ).not.toBeInTheDocument();
  });
});
