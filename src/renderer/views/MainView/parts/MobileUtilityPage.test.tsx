import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoracodeBridge } from "@/shared/ipc";
import { installBrowserClientRuntime, resetClientRuntimeForTest } from "@/renderer/clientRuntime";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { MobileUtilityPage } from "./MobileUtilityPage";

vi.mock("@/renderer/adaptiveLayout", () => ({
  useCompactLayout: () => true,
}));

vi.mock("./RightPanel/parts/NotesPanel/NotesPanel", () => ({
  NotesPanel: ({ projectId }: { projectId: string }) => <div>Notes for {projectId}</div>,
}));

vi.mock("./RightPanel/parts/BrowserPanel/BrowserPanel", () => ({
  BrowserPanel: () => <div>Browser surface</div>,
}));

vi.mock("@/renderer/deferredFeatures", () => ({
  DeferredDevTerminalPanel: (props: { positionOverride?: string }) => (
    <div data-position={props.positionOverride}>Terminal surface</div>
  ),
}));

describe("MobileUtilityPage", () => {
  beforeEach(() => {
    usePanelStore.setState({ mobileUtilityPage: "projects" });
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
          projects: [],
          threads: [],
        },
      },
      lastKnownProjects: {},
      excludedProjectIds: {},
    });
  });

  afterEach(() => {
    document.getElementById("poracode-mobile-page-header-actions")?.remove();
    resetClientRuntimeForTest();
    Reflect.deleteProperty(window, "poracode");
  });

  it("always identifies the active remote in the Projects bottom controls", () => {
    render(<MobileUtilityPage />);

    const picker = screen.getByRole("button", { name: "Connections" });
    expect(picker).toHaveTextContent("Studio");
    expect(picker).toHaveClass("m-floating-selector");
    expect(picker.querySelector(".lucide-chevron-up")).not.toBeNull();
  });

  it("identifies the browser's active connection in the compact page header", () => {
    usePanelStore.setState({ mobileUtilityPage: "browser" });
    const headerActions = document.createElement("div");
    headerActions.id = "poracode-mobile-page-header-actions";
    document.body.append(headerActions);

    render(<MobileUtilityPage />);

    const picker = screen.getByRole("button", { name: "Connections" });
    expect(picker).toHaveTextContent("Studio");
    expect(headerActions).toContainElement(picker);
    expect(screen.getByText("Browser surface")).toBeInTheDocument();
  });

  it("renders terminals as a dedicated compact page", () => {
    usePanelStore.setState({ mobileUtilityPage: "terminal" });

    render(<MobileUtilityPage />);

    expect(screen.getByText("Terminal surface")).toHaveAttribute("data-position", "mobile");
  });

  it("mounts Notes for a paired environment while its cached runtime is offline", () => {
    const browserBridge = {} as PoracodeBridge;
    window.poracode = browserBridge;
    installBrowserClientRuntime(browserBridge);
    const projectId = "remote:desktop-1:project:project-1";
    useAppStore.setState({
      projects: [
        {
          id: projectId,
          remoteServerId: "desktop-1",
          remoteId: "project-1",
          name: "Poracode",
          location: { kind: "posix", path: "/repo", remoteServerId: "desktop-1" },
          createdAt: "2026-08-15T00:00:00.000Z",
        },
      ],
      view: { kind: "draft", projectId },
    });
    usePanelStore.setState({ mobileUtilityPage: "notes" });
    useRemoteServersStore.setState((state) => ({
      runtime: {
        ...state.runtime,
        "desktop-1": { status: "offline", projects: [], threads: [] },
      },
    }));

    render(<MobileUtilityPage />);

    expect(screen.getByText(`Notes for ${projectId}`)).toBeInTheDocument();
    expect(screen.queryByText("No remote environments connected yet.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Project" })).toHaveTextContent("Poracode");
  });

  it("switches between project-scoped Notes from the bottom selector", async () => {
    const projectOne = {
      id: "remote:desktop-1:project:project-1",
      remoteServerId: "desktop-1",
      remoteId: "project-1",
      name: "Poracode",
      location: { kind: "posix" as const, path: "/repo", remoteServerId: "desktop-1" },
      createdAt: "2026-08-15T00:00:00.000Z",
    };
    const projectTwo = {
      ...projectOne,
      id: "remote:desktop-1:project:project-2",
      remoteId: "project-2",
      name: "Website",
      location: { ...projectOne.location, path: "/website" },
    };
    useAppStore.setState({
      projects: [projectOne, projectTwo],
      view: { kind: "draft", projectId: projectOne.id },
    });
    usePanelStore.setState({ mobileUtilityPage: "notes" });

    render(<MobileUtilityPage />);

    const picker = screen.getByRole("button", { name: "Project" });
    expect(picker).toHaveClass("m-floating-selector");
    expect(picker.parentElement).toHaveClass("m-utility-floating-actions--centered");
    expect(picker).toHaveTextContent("Poracode");
    fireEvent.click(picker);

    const dialog = await screen.findByRole("dialog", { name: "Project" });
    fireEvent.click(within(dialog).getByRole("button", { name: /Website/ }));

    expect(screen.getByText(`Notes for ${projectTwo.id}`)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Project" })).toBeNull());
    expect(screen.getByRole("button", { name: "Project" })).toHaveTextContent("Website");
  });
});
