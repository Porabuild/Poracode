import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project } from "@/shared/contracts";
import type { TerminalFeedListener } from "@/shared/remote/terminalFeed";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore, type DevTerminalTab } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { DevTerminalPanel } from "./DevTerminalPanel";

const { bridge, remote, layouts } = vi.hoisted(() => ({
  bridge: {
    closeThread: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    startShell: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  },
  remote: {
    watchTerminal:
      vi.fn<
        (desktopId: string, terminalId: string, listener: TerminalFeedListener) => () => void
      >(),
  },
  layouts: {
    bottomWatchTerminal: undefined as
      | ((terminalId: string, listener: TerminalFeedListener) => () => void)
      | undefined,
  },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("@/renderer/state/remoteTerminalFeed", () => ({
  watchRemoteTerminal: remote.watchTerminal,
}));

vi.mock("./parts/RightTerminalLayout", () => ({
  RightTerminalLayout: (props: {
    projectTabs: DevTerminalTab[];
    activeScopeLabel: string | undefined;
    handleCloseTab: (tab: DevTerminalTab) => void;
  }) => (
    <>
      <span>{props.activeScopeLabel}</span>
      <button type="button" onClick={() => props.handleCloseTab(props.projectTabs[0]!)}>
        close right tab
      </button>
    </>
  ),
}));

vi.mock("./parts/BottomTerminalLayout", () => ({
  BottomTerminalLayout: (props: {
    projectTabs: DevTerminalTab[];
    activeScopeLabel: string | undefined;
    handleCloseTab: (tab: DevTerminalTab) => void;
    watchTerminal?: (terminalId: string, listener: TerminalFeedListener) => () => void;
  }) => {
    layouts.bottomWatchTerminal = props.watchTerminal;
    return (
      <>
        <span>{props.activeScopeLabel}</span>
        <button type="button" onClick={() => props.handleCloseTab(props.projectTabs[0]!)}>
          close bottom tab
        </button>
      </>
    );
  },
}));

const project: Project = {
  id: "project-1",
  name: "Poracode",
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
    remote.watchTerminal.mockReset();
    layouts.bottomWatchTerminal = undefined;
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

  it("connects a remote bottom terminal to its project's server feed", () => {
    const unsubscribe = vi.fn<() => void>();
    remote.watchTerminal.mockReturnValue(unsubscribe);
    useAppStore.setState({
      projects: [{ ...project, remoteServerId: "desktop-1", remoteId: "remote-project" }],
    });
    useSharedSettings.setState({ terminalPosition: "bottom" });
    render(<DevTerminalPanel hideHeader />);

    const listener: TerminalFeedListener = {
      onOutput: vi.fn<(data: string) => void>(),
      onReset: vi.fn<() => void>(),
      onExited: vi.fn<(exitCode: number | null) => void>(),
    };
    expect(layouts.bottomWatchTerminal?.(tab.id, listener)).toBe(unsubscribe);
    expect(remote.watchTerminal).toHaveBeenCalledWith("desktop-1", tab.id, listener);
  });

  it("shows the project and worktree in the terminal scope label", () => {
    const worktreePath = "/repo/.poracode/worktrees/feature";
    useSharedSettings.setState({ terminalPosition: "bottom" });
    useDevTerminalStore.setState({
      activeWorktreePath: worktreePath,
      tabs: [{ ...tab, worktreePath }],
    });

    render(<DevTerminalPanel hideHeader />);

    expect(screen.getByText("Poracode / feature")).toBeInTheDocument();
  });

  it("can force the right layout for an embedded host without changing saved settings", () => {
    useSharedSettings.setState({ terminalPosition: "bottom" });
    const onEmpty = vi.fn<() => void>();
    render(<DevTerminalPanel hideHeader positionOverride="right" onEmpty={onEmpty} />);

    fireEvent.click(screen.getByRole("button", { name: "close right tab" }));

    expect(onEmpty).toHaveBeenCalledOnce();
    expect(useSharedSettings.getState().terminalPosition).toBe("bottom");
  });
});
