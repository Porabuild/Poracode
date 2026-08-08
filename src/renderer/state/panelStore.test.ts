import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { selectAnyObstructingOverlayOpen, usePanelStore } from "./panelStore";
import { useFileEditorStore } from "./fileEditorStore";

const initialPanelState = usePanelStore.getState();
const initialFileEditorState = useFileEditorStore.getState();

function resetPanelStore() {
  usePanelStore.setState({
    ...initialPanelState,
    gitReviewContext: null,
    gitReviewAsPanel: false,
    gitOverlayOpen: false,
    prReviewContext: null,
    githubActionsContext: null,
    filesPanelContext: null,
    subAgentPanelContext: null,
    subAgentPanelOpen: false,
    browserPanelOpen: false,
    browserOverlayOpen: false,
    settingsOpen: false,
    projectSettingsId: null,
    threadSearchOpen: false,
  });
}

function resetFileEditorStore() {
  useFileEditorStore.setState({
    ...initialFileEditorState,
    overlayMode: null,
  });
}

describe("selectAnyObstructingOverlayOpen", () => {
  beforeEach(() => {
    resetPanelStore();
    resetFileEditorStore();
  });
  afterEach(() => {
    resetPanelStore();
    resetFileEditorStore();
  });

  it("returns false when no overlays are open", () => {
    expect(selectAnyObstructingOverlayOpen()).toBe(false);
  });

  it("returns true when the settings overlay is open", () => {
    usePanelStore.setState({ settingsOpen: true });
    expect(selectAnyObstructingOverlayOpen()).toBe(true);
  });

  it("returns true when a project settings overlay is open", () => {
    usePanelStore.setState({ projectSettingsId: "proj-1" });
    expect(selectAnyObstructingOverlayOpen()).toBe(true);
  });

  it("returns true when the git review overlay is open", () => {
    usePanelStore.setState({ gitOverlayOpen: true });
    expect(selectAnyObstructingOverlayOpen()).toBe(true);
  });

  it("returns true when a PR review context is set", () => {
    usePanelStore.setState({
      prReviewContext: { projectId: "p", prNumber: 1 },
    });
    expect(selectAnyObstructingOverlayOpen()).toBe(true);
  });

  it("returns true when GitHub Actions is open", () => {
    usePanelStore.setState({ githubActionsContext: { projectId: "p" } });
    expect(selectAnyObstructingOverlayOpen()).toBe(true);
  });

  it("returns true when the thread search overlay is open", () => {
    usePanelStore.setState({ threadSearchOpen: true });
    expect(selectAnyObstructingOverlayOpen()).toBe(true);
  });

  it("returns true when the file editor overlay is fullscreen", () => {
    useFileEditorStore.setState({ overlayMode: "fullscreen" });
    expect(selectAnyObstructingOverlayOpen()).toBe(true);
  });

  it("returns true when the file editor overlay is modal", () => {
    useFileEditorStore.setState({ overlayMode: "modal" });
    expect(selectAnyObstructingOverlayOpen()).toBe(true);
  });

  it("does not treat gitReviewAsPanel as obstructing on its own", () => {
    usePanelStore.setState({ gitReviewAsPanel: true });
    expect(selectAnyObstructingOverlayOpen()).toBe(false);
  });

  it("does not treat the browser overlay itself as obstructing", () => {
    usePanelStore.setState({ browserOverlayOpen: true, browserPanelOpen: true });
    expect(selectAnyObstructingOverlayOpen()).toBe(false);
  });
});

describe("setPrReviewContext", () => {
  beforeEach(() => {
    resetPanelStore();
  });

  afterEach(() => {
    resetPanelStore();
  });

  it("updates local sync safety when reopening the same pull request", () => {
    const context = { projectId: "p", prNumber: 42, prKey: "p:42" };
    usePanelStore.getState().setPrReviewContext({ ...context, skipLocalSync: true });
    usePanelStore.getState().setPrReviewContext(context);

    expect(usePanelStore.getState().prReviewContext).toEqual(context);
  });
});

describe("subagent panel lifecycle", () => {
  beforeEach(() => {
    resetPanelStore();
  });

  afterEach(() => {
    resetPanelStore();
  });

  it("hides the temporary target without forgetting it, then closes it explicitly", () => {
    const panel = usePanelStore.getState();
    panel.setSubAgentPanelContext({
      threadId: "thread-1",
      parentItemId: "parent-1",
      projectLocation: { kind: "posix", path: "/repo" },
    });
    panel.setRightPanelTab("subagent");

    expect(usePanelStore.getState()).toMatchObject({
      rightPanelTab: "subagent",
      subAgentPanelContext: {
        threadId: "thread-1",
        parentItemId: "parent-1",
      },
      subAgentPanelOpen: true,
    });

    usePanelStore.getState().closeAllPanels();
    expect(usePanelStore.getState()).toMatchObject({
      subAgentPanelOpen: false,
      subAgentPanelContext: {
        threadId: "thread-1",
        parentItemId: "parent-1",
      },
    });

    usePanelStore.getState().setRightPanelTab("subagent");
    expect(usePanelStore.getState().subAgentPanelOpen).toBe(true);

    usePanelStore.getState().setSubAgentPanelContext(null);
    expect(usePanelStore.getState()).toMatchObject({
      subAgentPanelOpen: false,
      subAgentPanelContext: null,
    });
  });
});

describe("panel dock state", () => {
  beforeEach(() => {
    resetPanelStore();
    usePanelStore.setState({
      rightPanelSplit: null,
      bottomPanelDocks: { left: null, right: null },
    });
  });
  afterEach(() => {
    resetPanelStore();
    usePanelStore.setState({
      rightPanelSplit: null,
      bottomPanelDocks: { left: null, right: null },
    });
  });

  it("stores and clears the right-panel split", () => {
    usePanelStore.getState().setRightPanelSplit({ tab: "usage", placement: "bottom" });
    expect(usePanelStore.getState().rightPanelSplit).toEqual({
      tab: "usage",
      placement: "bottom",
    });

    usePanelStore.getState().setRightPanelSplit(null);
    expect(usePanelStore.getState().rightPanelSplit).toBeNull();
  });

  it("bails out when setting an identical split", () => {
    usePanelStore.getState().setRightPanelSplit({ tab: "usage", placement: "top" });
    const before = usePanelStore.getState().rightPanelSplit;
    usePanelStore.getState().setRightPanelSplit({ tab: "usage", placement: "top" });
    expect(usePanelStore.getState().rightPanelSplit).toBe(before);
  });

  it("fills and clears the two bottom slots independently", () => {
    usePanelStore.getState().setBottomPanelDock("left", "usage");
    usePanelStore.getState().setBottomPanelDock("right", "git");
    expect(usePanelStore.getState().bottomPanelDocks).toEqual({ left: "usage", right: "git" });

    usePanelStore.getState().setBottomPanelDock("left", null);
    expect(usePanelStore.getState().bottomPanelDocks).toEqual({ left: null, right: "git" });
  });

  it("moves a tab rather than rendering it in both slots", () => {
    usePanelStore.getState().setBottomPanelDock("left", "usage");
    usePanelStore.getState().setBottomPanelDock("right", "usage");

    expect(usePanelStore.getState().bottomPanelDocks).toEqual({ left: null, right: "usage" });
  });

  it("clears a docked tab from whichever slot holds it", () => {
    usePanelStore.getState().setBottomPanelDock("right", "notes");
    usePanelStore.getState().clearBottomPanelDockTab("notes");

    expect(usePanelStore.getState().bottomPanelDocks).toEqual({ left: null, right: null });
  });

  it("releases a dock slot when the docked panel closes its own content", () => {
    usePanelStore.getState().setUsagePanelOpen(true);
    usePanelStore.getState().setBottomPanelDock("right", "usage");

    usePanelStore.getState().setUsagePanelOpen(false);

    // Otherwise an empty "Usage" section keeps the bottom row on screen.
    expect(usePanelStore.getState().bottomPanelDocks).toEqual({ left: null, right: null });
  });

  it("releases the right-panel split when its content closes", () => {
    usePanelStore.getState().setGitReviewContext({ projectId: "p1" });
    usePanelStore.getState().setRightPanelSplit({ tab: "git", placement: "bottom" });

    usePanelStore.getState().setGitReviewContext(null);

    expect(usePanelStore.getState().rightPanelSplit).toBeNull();
  });

  it("keeps a docked tab's content open when the right panel is hidden", () => {
    usePanelStore.getState().setUsagePanelOpen(true);
    usePanelStore.getState().setNotesPanelOpen(true);
    usePanelStore.getState().setBottomPanelDock("right", "usage");
    usePanelStore.getState().setRightPanelSplit({ tab: "notes", placement: "bottom" });

    usePanelStore.getState().closeAllPanels();

    // The bottom row is a separate surface, so its panel stays alive; the
    // right panel's own split does not.
    expect(usePanelStore.getState().usagePanelOpen).toBe(true);
    expect(usePanelStore.getState().notesPanelOpen).toBe(false);
    expect(usePanelStore.getState().rightPanelSplit).toBeNull();
  });
});

describe("create project modal", () => {
  beforeEach(() => {
    resetPanelStore();
  });
  afterEach(() => {
    resetPanelStore();
  });

  it("is closed by default", () => {
    expect(usePanelStore.getState().createProjectModalOpen).toBe(false);
  });

  it("opens and closes the scratch modal", () => {
    usePanelStore.getState().openCreateProjectModal();
    expect(usePanelStore.getState().createProjectModalOpen).toBe(true);

    usePanelStore.getState().closeCreateProjectModal();
    expect(usePanelStore.getState().createProjectModalOpen).toBe(false);
  });
});

describe("browserOverlayMaximized lifecycle", () => {
  beforeEach(() => {
    resetPanelStore();
  });
  afterEach(() => {
    resetPanelStore();
  });

  it("defaults to false so the overlay opens in drawer mode", () => {
    expect(usePanelStore.getState().browserOverlayMaximized).toBe(false);
  });

  it("is reset to false when the overlay is closed", () => {
    const { setBrowserOverlayOpen, setBrowserOverlayMaximized } = usePanelStore.getState();
    setBrowserOverlayOpen(true);
    setBrowserOverlayMaximized(true);
    expect(usePanelStore.getState().browserOverlayMaximized).toBe(true);

    setBrowserOverlayOpen(false);
    expect(usePanelStore.getState().browserOverlayMaximized).toBe(false);
  });

  it("survives hiding the right-panel browser (overlay is independent)", () => {
    const { setBrowserOverlayOpen, setBrowserOverlayMaximized, setBrowserPanelOpen } =
      usePanelStore.getState();
    setBrowserPanelOpen(true);
    setBrowserOverlayOpen(true);
    setBrowserOverlayMaximized(true);

    // Hiding the docked panel must not tear down a maximized overlay, otherwise
    // the fullscreen page would vanish when the right panel is hidden.
    setBrowserPanelOpen(false);
    expect(usePanelStore.getState().browserPanelOpen).toBe(false);
    expect(usePanelStore.getState().browserOverlayMaximized).toBe(true);
    expect(usePanelStore.getState().browserOverlayOpen).toBe(true);
  });

  it("survives closeAllPanels (e.g. the narrow-viewport right-panel auto-hide)", () => {
    const {
      setBrowserPanelOpen,
      setBrowserOverlayOpen,
      setBrowserOverlayMaximized,
      closeAllPanels,
    } = usePanelStore.getState();
    setBrowserPanelOpen(true);
    setBrowserOverlayOpen(true);
    setBrowserOverlayMaximized(true);

    // closeAllPanels backs the right-panel auto-hide on resize; it must close
    // the docked panel but leave the standalone browser overlay intact.
    closeAllPanels();
    expect(usePanelStore.getState().browserPanelOpen).toBe(false);
    expect(usePanelStore.getState().browserOverlayOpen).toBe(true);
    expect(usePanelStore.getState().browserOverlayMaximized).toBe(true);
  });
});
