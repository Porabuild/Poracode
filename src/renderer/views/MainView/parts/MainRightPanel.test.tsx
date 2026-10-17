import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useAppStore } from "@/renderer/state/appStore";
import { resetDevTerminalStore, useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { MainRightPanel } from "./MainRightPanel";

vi.mock("@/renderer/deferredFeatures", () => ({
  DeferredDevTerminalPanel: () => <div data-testid="project-terminal" />,
  DeferredGlobalTerminalPanel: (props: { visible?: boolean }) => (
    <div data-testid="global-terminal" data-visible={props.visible} />
  ),
  DeferredProjectAuxiliaryPanel: () => <div data-testid="normal-right-panel" />,
}));

vi.mock("./RightPanel/parts/PanelDock/BottomPanelDockContainer", () => ({
  BottomPanelDockContainer: (props: { terminalVisible: boolean; children: ReactNode }) => (
    <div data-testid="normal-bottom-panel" data-visible={props.terminalVisible}>
      {props.children}
    </div>
  ),
}));

beforeEach(() => {
  resetDevTerminalStore();
  useAppStore.setState({
    projects: [],
    threads: [],
    view: { kind: "home" },
    focusedPaneId: null,
  });
  useSharedSettings.setState({ terminalPosition: "bottom" });
  usePanelStore.setState({
    gitReviewContext: null,
    filesPanelContext: null,
    subAgentPanelContext: null,
    subAgentPanelOpen: false,
    browserPanelOpen: false,
    usagePanelOpen: false,
    notesPanelOpen: false,
    portsPanelOpen: false,
    sideChatPanelOpen: false,
    threadDocksPanelOpen: false,
    bottomPanelDocks: { left: null, right: null },
  });
});

it("renders the global terminal in the normal bottom panel without a project", () => {
  useDevTerminalStore.getState().openGlobalPanel();
  render(<MainRightPanel />);
  expect(screen.getByTestId("normal-bottom-panel")).toContainElement(
    screen.getByTestId("global-terminal"),
  );
  expect(screen.getByTestId("global-terminal")).toHaveAttribute("data-visible", "true");
  expect(screen.queryByTestId("project-terminal")).toBeNull();
  expect(useAppStore.getState().projects).toEqual([]);
  expect(useDevTerminalStore.getState().tabs).toEqual([]);

  act(() => useDevTerminalStore.getState().closePanel());
  expect(screen.getByTestId("normal-bottom-panel")).toHaveAttribute("data-visible", "false");
  act(() => useDevTerminalStore.getState().openGlobalPanel());
  expect(screen.getByTestId("global-terminal")).toHaveAttribute("data-visible", "true");
});

it("switches the same bottom slot to an explicitly opened project terminal", () => {
  useDevTerminalStore.getState().openGlobalPanel();
  render(<MainRightPanel />);
  act(() => useDevTerminalStore.getState().openPanel("project-a"));
  expect(screen.getByTestId("normal-bottom-panel")).toContainElement(
    screen.getByTestId("project-terminal"),
  );
  expect(screen.queryByTestId("global-terminal")).toBeNull();
});
