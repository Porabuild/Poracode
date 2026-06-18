import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore, type DevTerminalTab } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { DevTerminalPanel } from "./DevTerminalPanel";

const { bridge } = vi.hoisted(() => ({
  bridge: {
    closeThread: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    startShell: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("./parts/RightTerminalLayout", () => ({
  RightTerminalLayout: (props: {
    projectTabs: DevTerminalTab[];
    handleCloseTab: (tab: DevTerminalTab) => void;
  }) => (
    <button type="button" onClick={() => props.handleCloseTab(props.projectTabs[0]!)}>
      close right tab
    </button>
  ),
}));

vi.mock("./parts/BottomTerminalLayout", () => ({
  BottomTerminalLayout: (props: {
    projectTabs: DevTerminalTab[];
    handleCloseTab: (tab: DevTerminalTab) => void;
  }) => (
    <button type="button" onClick={() => props.handleCloseTab(props.projectTabs[0]!)}>
      close bottom tab
    </button>
  ),
}));

const project: Project = {
  id: "project-1",
  name: "Lightcode",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-05-12T00:00:00.000Z",
};

const tab: DevTerminalTab = {
  id: "shell:one",
  projectId: project.id,
  title: project.name,
  createdAt: "2026-05-12T00:00:00.000Z",
};

function resetStores() {
  useAppStore.setState({ projects: [project] });
  useSharedSettings.setState({ terminalPosition: "right" });
  useDevTerminalStore.setState({
    isOpen: true,
    activeProjectId: project.id,
    activeWorktreePath: null,
    tabs: [tab],
    activeTabId: tab.id,
    focusRequestId: 0,
    tabActivity: {},
  });
  usePanelStore.setState({
    gitReviewContext: { projectId: project.id },
    gitReviewAsPanel: true,
    gitOverlayOpen: false,
    filesPanelContext: {
      projectId: project.id,
      projectName: project.name,
      rootLabel: project.name,
    },
    rightPanelTab: "terminal",
  });
}

describe("DevTerminalPanel", () => {
  beforeEach(() => {
    bridge.closeThread.mockClear();
    bridge.startShell.mockClear();
    resetStores();
  });

  it("closes the unified right panel when the last right-panel terminal tab is removed", () => {
    render(<DevTerminalPanel hideHeader />);

    fireEvent.click(screen.getByRole("button", { name: "close right tab" }));

    expect(useDevTerminalStore.getState().isOpen).toBe(false);
    expect(usePanelStore.getState().gitReviewContext).toBeNull();
    expect(usePanelStore.getState().filesPanelContext).toBeNull();
    expect(bridge.closeThread).toHaveBeenCalledWith({ threadId: tab.id });
  });

  it("keeps git and files panel contexts when the bottom terminal closes its last tab", () => {
    useSharedSettings.setState({ terminalPosition: "bottom" });
    render(<DevTerminalPanel hideHeader />);

    fireEvent.click(screen.getByRole("button", { name: "close bottom tab" }));

    expect(useDevTerminalStore.getState().isOpen).toBe(false);
    expect(usePanelStore.getState().gitReviewContext).toEqual({ projectId: project.id });
    expect(usePanelStore.getState().filesPanelContext?.projectId).toBe(project.id);
  });
});
