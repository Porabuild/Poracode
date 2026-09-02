import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { dockPanelTab, openGitReview, openUsagePanel, undockPanelTab } from "./panelActions";

function resetDockState() {
  useSharedSettings.setState({ terminalPosition: "bottom", gitReviewMode: "panel" });
  usePanelStore.setState({
    rightPanelTab: "git",
    rightPanelSplit: null,
    bottomPanelDocks: { left: null, right: null },
    usagePanelOpen: false,
    notesPanelOpen: false,
    browserPanelOpen: false,
    gitReviewContext: null,
    gitReviewAsPanel: false,
  });
  useDevTerminalStore.setState({
    isOpen: false,
    explicitlyOpened: false,
    activeProjectId: null,
    activeWorktreePath: null,
  });
}

describe("dockPanelTab", () => {
  beforeEach(resetDockState);
  afterEach(resetDockState);

  it("docks a tab into a bottom slot and opens its content", () => {
    dockPanelTab("usage", { zone: "bottom-panel", placement: "right" });

    expect(usePanelStore.getState().bottomPanelDocks).toEqual({ left: null, right: "usage" });
    expect(usePanelStore.getState().usagePanelOpen).toBe(true);
  });

  it("fills both bottom slots with different tabs", () => {
    dockPanelTab("usage", { zone: "bottom-panel", placement: "left" });
    dockPanelTab("notes", { zone: "bottom-panel", placement: "right" });

    expect(usePanelStore.getState().bottomPanelDocks).toEqual({ left: "usage", right: "notes" });
  });

  it("moves a right-panel split tab into the bottom dock", () => {
    usePanelStore.getState().setRightPanelSplit({ tab: "usage", placement: "bottom" });

    dockPanelTab("usage", { zone: "bottom-panel", placement: "left" });

    expect(usePanelStore.getState().rightPanelSplit).toBeNull();
    expect(usePanelStore.getState().bottomPanelDocks).toEqual({ left: "usage", right: null });
  });

  it("splits the right panel without switching the active tab", () => {
    dockPanelTab("usage", { zone: "right-panel", placement: "bottom" });

    expect(usePanelStore.getState().rightPanelTab).toBe("git");
    expect(usePanelStore.getState().rightPanelSplit).toEqual({
      tab: "usage",
      placement: "bottom",
    });
    expect(usePanelStore.getState().usagePanelOpen).toBe(true);
  });

  it("moves a bottom-docked tab back into the right panel as a split", () => {
    usePanelStore.getState().setBottomPanelDock("right", "usage");

    dockPanelTab("usage", { zone: "right-panel", placement: "top" });

    expect(usePanelStore.getState().bottomPanelDocks).toEqual({ left: null, right: null });
    expect(usePanelStore.getState().rightPanelSplit).toEqual({
      tab: "usage",
      placement: "top",
    });
  });

  it("does not split the active tab with itself", () => {
    usePanelStore.setState({ rightPanelTab: "usage", usagePanelOpen: true });

    dockPanelTab("usage", { zone: "right-panel", placement: "bottom" });

    expect(usePanelStore.getState().rightPanelSplit).toBeNull();
  });

  it("ignores the terminal in the bottom row — it already owns the middle", () => {
    dockPanelTab("terminal", { zone: "bottom-panel", placement: "right" });

    expect(usePanelStore.getState().bottomPanelDocks).toEqual({ left: null, right: null });
  });

  it("keeps the terminal on the free side when a panel is dropped into the left slot", () => {
    useDevTerminalStore.setState({ isOpen: true, explicitlyOpened: true });

    dockPanelTab("usage", { zone: "bottom-panel", placement: "left" });

    expect(useDevTerminalStore.getState().isOpen).toBe(true);
    expect(usePanelStore.getState().bottomPanelDocks).toEqual({ left: "usage", right: null });
  });

  it("keeps the terminal when a panel is dropped into the right slot", () => {
    useDevTerminalStore.setState({ isOpen: true, explicitlyOpened: true });

    dockPanelTab("usage", { zone: "bottom-panel", placement: "right" });

    expect(useDevTerminalStore.getState().isOpen).toBe(true);
    expect(usePanelStore.getState().bottomPanelDocks).toEqual({ left: null, right: "usage" });
  });

  it("closes the terminal when a panel is dropped into the free slot beside an existing dock", () => {
    useDevTerminalStore.setState({ isOpen: true, explicitlyOpened: true });
    usePanelStore.getState().setBottomPanelDock("right", "notes");

    dockPanelTab("usage", { zone: "bottom-panel", placement: "left" });

    expect(useDevTerminalStore.getState().isOpen).toBe(false);
    expect(usePanelStore.getState().bottomPanelDocks).toEqual({ left: "usage", right: "notes" });
  });

  it("closes the terminal when a panel fills the remaining free slot on the right", () => {
    useDevTerminalStore.setState({ isOpen: true, explicitlyOpened: true });
    usePanelStore.getState().setBottomPanelDock("left", "notes");

    dockPanelTab("usage", { zone: "bottom-panel", placement: "right" });

    expect(useDevTerminalStore.getState().isOpen).toBe(false);
    expect(usePanelStore.getState().bottomPanelDocks).toEqual({ left: "notes", right: "usage" });
  });

  it("ignores non-dockable tabs", () => {
    dockPanelTab("docks", { zone: "right-panel", placement: "bottom" });

    expect(usePanelStore.getState().rightPanelSplit).toBeNull();
  });
});

// The toggle entry points close the right panel when their tab is already
// active. A bottom-docked tab is not what the right panel is showing, so that
// close is invisible — the toggle has to pull the panel back instead.
describe("toggling a bottom-docked tab", () => {
  beforeEach(resetDockState);
  afterEach(resetDockState);

  it("brings a docked Usage back into the right panel", () => {
    usePanelStore.getState().setUsagePanelOpen(true);
    usePanelStore.getState().setBottomPanelDock("right", "usage");
    usePanelStore.setState({ rightPanelTab: "usage" });

    openUsagePanel();

    expect(usePanelStore.getState().bottomPanelDocks).toEqual({ left: null, right: null });
    expect(usePanelStore.getState().usagePanelOpen).toBe(true);
    expect(usePanelStore.getState().rightPanelTab).toBe("usage");
  });

  it("brings a docked Git back into the right panel", () => {
    usePanelStore.getState().setGitReviewContext({ projectId: "p1" });
    usePanelStore.getState().setGitReviewAsPanel(true);
    usePanelStore.getState().setBottomPanelDock("left", "git");
    usePanelStore.setState({ rightPanelTab: "git" });

    openGitReview("p1");

    expect(usePanelStore.getState().bottomPanelDocks).toEqual({ left: null, right: null });
    expect(usePanelStore.getState().gitReviewContext).not.toBeNull();
    expect(usePanelStore.getState().rightPanelTab).toBe("git");
  });

  it("still closes the panel when the tab is not docked", () => {
    usePanelStore.getState().setUsagePanelOpen(true);
    usePanelStore.setState({ rightPanelTab: "usage" });

    openUsagePanel();

    expect(usePanelStore.getState().usagePanelOpen).toBe(false);
  });
});

describe("undockPanelTab", () => {
  beforeEach(resetDockState);
  afterEach(resetDockState);

  it("pulls a tab out of the split half and the bottom row", () => {
    usePanelStore.getState().setRightPanelSplit({ tab: "notes", placement: "top" });
    usePanelStore.getState().setBottomPanelDock("left", "usage");

    undockPanelTab("notes");
    undockPanelTab("usage");

    expect(usePanelStore.getState().rightPanelSplit).toBeNull();
    expect(usePanelStore.getState().bottomPanelDocks).toEqual({ left: null, right: null });
  });

  it("leaves other placements untouched", () => {
    usePanelStore.getState().setBottomPanelDock("left", "usage");

    undockPanelTab("notes");

    expect(usePanelStore.getState().bottomPanelDocks).toEqual({ left: "usage", right: null });
  });
});
