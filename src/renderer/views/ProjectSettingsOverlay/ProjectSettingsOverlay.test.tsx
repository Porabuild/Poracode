// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useProjectGroupStore } from "@/renderer/state/projectGroups/projectGroupStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

const layout = vi.hoisted(() => ({ compact: false }));

vi.mock("@/renderer/adaptiveLayout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/adaptiveLayout")>()),
  useCompactLayout: () => layout.compact,
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({}),
  isRemoteSession: () => false,
  isMac: () => false,
  isWindows: () => false,
}));

import { ProjectSettingsOverlay } from "./ProjectSettingsOverlay";

const project: Project = {
  id: "project-1",
  name: "Poracode",
  location: { kind: "windows", path: "E:\\work\\poracode" },
  createdAt: "2026-07-25T10:00:00.000Z",
};

describe("ProjectSettingsOverlay", () => {
  beforeEach(() => {
    layout.compact = false;
    useAppStore.setState({ projects: [project] });
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useProjectGroupStore.setState({ manualGroups: {}, lastUsedAt: {} });
  });

  it("navigates project settings sections as compact pages", () => {
    layout.compact = true;
    const onClose = vi.fn<() => void>();

    render(<ProjectSettingsOverlay projectId={project.id} onClose={onClose} />);

    const main = screen.getByRole("main");
    expect(within(main).getByRole("button", { name: "General" })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "Worktrees" })).toBeInTheDocument();
    expect(within(main).queryByText("Display name in the sidebar.")).not.toBeInTheDocument();

    fireEvent.click(within(main).getByRole("button", { name: "General" }));
    expect(within(main).getByText("Display name in the sidebar.")).toBeInTheDocument();
    expect(within(main).queryByRole("button", { name: "Worktrees" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(within(main).getByRole("button", { name: "Worktrees" })).toBeInTheDocument();
    expect(within(main).queryByText("Display name in the sidebar.")).not.toBeInTheDocument();

    fireEvent.click(document.querySelector(".m-back")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("opens on a deep-linked section, then navigates back to the section index", () => {
    layout.compact = true;

    render(
      <ProjectSettingsOverlay projectId={project.id} initialSection="search" onClose={() => {}} />,
    );

    const main = screen.getByRole("main");
    expect(
      within(main).getByText("Project-specific overrides on top of the global search settings."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(within(main).getByRole("button", { name: "Plugins" })).toBeInTheDocument();
  });

  it("uses the compact header and an icon-only bottom add action", () => {
    layout.compact = true;

    render(<ProjectSettingsOverlay projectId={project.id} onClose={() => {}} />);

    const main = screen.getByRole("main");
    fireEvent.click(within(main).getByRole("button", { name: "Actions" }));

    expect(within(main).queryByRole("heading", { name: "Actions" })).not.toBeInTheDocument();
    expect(within(main).getByText(/Custom commands available/)).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "Add action" })).toHaveClass(
      "m-home-compose-action",
    );
    expect(within(main).queryByText("Add action")).not.toBeInTheDocument();
  });
  describe("on several machines", () => {
    const onMac: Project = {
      ...project,
      id: "remote:mac:project:p",
      remoteServerId: "mac",
      remoteId: "p",
      location: { kind: "posix", path: "/Users/me/poracode", remoteServerId: "mac" },
    };

    beforeEach(() => {
      useAppStore.setState({ projects: [project, onMac] });
      useRemoteServersStore.setState({
        servers: [{ desktopId: "mac", label: "Poracode on MacBook" }],
        runtime: { mac: { status: "online", projects: [], threads: [] } },
      } as never);
    });

    it("floats the machine picker on desktop and reserves room below each section", () => {
      render(
        <ProjectSettingsOverlay
          projectId={project.id}
          initialSection="general"
          onClose={vi.fn<() => void>()}
        />,
      );
      const picker = screen.getByRole("button", { name: /Select machine/ });
      expect(picker).toHaveTextContent("Local");
      const wrapper = picker.closest<HTMLElement>("[style]");
      expect(wrapper?.style.getPropertyValue("--project-settings-bottom-space")).toBe("5rem");
      expect(screen.getByText("All machines")).toBeInTheDocument();
      expect(screen.getByText("On Local")).toBeInTheDocument();
    });

    it("keeps the machine picker in the page flow on compact layouts", () => {
      layout.compact = true;
      render(
        <ProjectSettingsOverlay
          projectId={project.id}
          initialSection="general"
          onClose={vi.fn<() => void>()}
        />,
      );
      expect(screen.getByRole("button", { name: /Select machine/ })).toBeInTheDocument();
      expect(document.querySelector('[style*="--project-settings-bottom-space"]')).toBeNull();
    });

    it("shows no machine scope for a project on one machine", () => {
      useAppStore.setState({ projects: [project] });
      render(
        <ProjectSettingsOverlay
          projectId={project.id}
          initialSection="general"
          onClose={vi.fn<() => void>()}
        />,
      );
      expect(screen.queryByRole("button", { name: /Select machine/ })).not.toBeInTheDocument();
      expect(screen.queryByText("All machines")).not.toBeInTheDocument();
    });
  });
});
