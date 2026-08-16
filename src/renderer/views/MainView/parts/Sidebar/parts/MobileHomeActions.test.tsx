import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PoracodeBridge } from "@/shared/ipc";
import { installBrowserClientRuntime, resetClientRuntimeForTest } from "@/renderer/clientRuntime";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useSidebarOverlayStore } from "@/renderer/state/sidebarOverlayStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { MobileHomeActions } from "./MobileHomeActions";

describe("MobileHomeActions", () => {
  beforeEach(() => {
    localStorage.clear();
    usePanelStore.setState({
      settingsOpen: false,
      settingsSection: "general",
      notesPanelOpen: false,
      portsPanelOpen: false,
    });
    useSharedSettings.setState({ sidebarHiddenShortcuts: ["githubActions"] });
    useSidebarOverlayStore.setState({ isCollapsed: false, isNarrow: false });
    useRemoteServersStore.setState({
      servers: [],
      runtime: {},
      lastKnownProjects: {},
      excludedProjectIds: {},
    });
  });

  afterEach(() => resetClientRuntimeForTest());

  it("opens the mobile More surface as a bottom sheet", async () => {
    render(<MobileHomeActions />);

    fireEvent.click(screen.getByRole("button", { name: "More" }));

    const dialog = await screen.findByRole("dialog", { name: "More" });
    expect(dialog.querySelector(".m-sheet")).not.toBeNull();
    expect(dialog.querySelector(".m-sheet-scroll > .m-sheet-head")).not.toBeNull();
    expect(dialog.querySelector(".m-sheet-scroll > .m-sheet-list")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });

  it("opens the mobile Settings list without changing the desktop sidebar preference", async () => {
    useSidebarOverlayStore.setState({ isCollapsed: true });
    render(<MobileHomeActions />);

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "More" })).toBeNull());
    expect(usePanelStore.getState()).toMatchObject({
      settingsOpen: true,
      settingsSection: null,
    });
    expect(useSidebarOverlayStore.getState().isCollapsed).toBe(true);
  });

  it("opens restored PWA tools from the mobile More sheet", async () => {
    installBrowserClientRuntime({} as PoracodeBridge);
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Studio",
          endpoint: "https://desktop.example.test",
          accessToken: "token",
          scopes: [],
        },
      ],
      runtime: {
        "desktop-1": {
          status: "online",
          projects: [],
          threads: [],
        },
      },
    });
    render(<MobileHomeActions />);

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ports" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "More" })).toBeNull());
    expect(usePanelStore.getState()).toMatchObject({
      portsPanelOpen: true,
      rightPanelTab: "ports",
    });
  });

  it("disables desktop-backed More actions while the remote desktop is offline", async () => {
    installBrowserClientRuntime({} as PoracodeBridge);
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Studio",
          endpoint: "https://desktop.example.test",
          accessToken: "token",
          scopes: ["projects:manage"],
        },
      ],
      runtime: {
        "desktop-1": {
          status: "offline",
          projects: [],
          threads: [],
        },
      },
    });
    render(<MobileHomeActions />);

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const more = await screen.findByRole("dialog", { name: "More" });

    for (const label of ["Usage", "Ports", "Notes", "Pull requests", "Schedules"]) {
      expect(within(more).getByRole("button", { name: label })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
    for (const label of ["Connections", "Projects", "Settings"]) {
      expect(within(more).getByRole("button", { name: label })).not.toHaveAttribute(
        "aria-disabled",
      );
    }

    fireEvent.click(within(more).getByRole("button", { name: "Notes" }));
    expect(usePanelStore.getState().notesPanelOpen).toBe(false);
    expect(screen.getByRole("dialog", { name: "More" })).toBeInTheDocument();
  });

  it("uses the nightly More order and opens Projects as a full-screen drawer", async () => {
    installBrowserClientRuntime({} as PoracodeBridge);
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Studio",
          endpoint: "https://desktop.example.test",
          accessToken: "token",
          scopes: ["projects:manage"],
        },
      ],
      runtime: {
        "desktop-1": {
          status: "online",
          message: "",
          projects: [
            {
              id: "project-1",
              name: "Poracode",
              disabled: false,
              createdAt: new Date(0).toISOString(),
              location: { kind: "windows", path: "C:\\repo" },
            },
          ],
          threads: [],
        },
      },
    });
    render(<MobileHomeActions />);

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const more = await screen.findByRole("dialog", { name: "More" });
    const labels = within(more)
      .getAllByRole("button")
      .map((button) => button.textContent?.trim())
      .filter(Boolean);
    expect(labels.slice(0, 5)).toEqual(["Usage", "Connections", "Projects", "Browser", "Ports"]);

    fireEvent.click(within(more).getByRole("button", { name: "Projects" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "More" })).toBeNull());
    const projects = await screen.findByRole("dialog", { name: "Projects" });
    expect(projects.querySelector(".m-sheet")).toHaveAttribute("data-full-screen", "true");
    expect(within(projects).getByRole("button", { name: "Poracode" })).toBeInTheDocument();
  });
});
