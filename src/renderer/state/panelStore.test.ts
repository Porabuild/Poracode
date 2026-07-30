import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { selectAnyObstructingOverlayOpen, usePanelStore } from "./panelStore";
import { useFileEditorStore } from "./fileEditorStore";
import { useCommandPaletteStore } from "@/renderer/commands/commandPaletteStore";

const initialPanelState = usePanelStore.getState();
const initialFileEditorState = useFileEditorStore.getState();

function resetPanelStore() {
  usePanelStore.setState({
    ...initialPanelState,
    gitReviewContext: null,
    gitReviewAsPanel: false,
    gitOverlayOpen: false,
    prReviewContext: null,
    filesPanelContext: null,
    browserPanelOpen: false,
    browserOverlayOpen: false,
    settingsOpen: false,
    projectSettingsId: null,
  });
  useCommandPaletteStore.setState({ isOpen: false });
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

  it("returns true when everything search is open", () => {
    useCommandPaletteStore.setState({ isOpen: true });
    expect(selectAnyObstructingOverlayOpen()).toBe(true);
  });

  it("returns true when the file editor overlay is fullscreen", () => {
    useFileEditorStore.setState({ overlayMode: "fullscreen" });
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
