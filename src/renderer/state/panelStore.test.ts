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
    filesPanelContext: null,
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

  it("returns true when the thread search overlay is open", () => {
    usePanelStore.setState({ threadSearchOpen: true });
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

  it("is reset when the browser panel is closed entirely", () => {
    const { setBrowserOverlayOpen, setBrowserOverlayMaximized, setBrowserPanelOpen } =
      usePanelStore.getState();
    setBrowserOverlayOpen(true);
    setBrowserOverlayMaximized(true);

    setBrowserPanelOpen(false);
    expect(usePanelStore.getState().browserOverlayMaximized).toBe(false);
    expect(usePanelStore.getState().browserOverlayOpen).toBe(false);
  });

  it("is reset by closeAllPanels", () => {
    const { setBrowserOverlayOpen, setBrowserOverlayMaximized, closeAllPanels } =
      usePanelStore.getState();
    setBrowserOverlayOpen(true);
    setBrowserOverlayMaximized(true);

    closeAllPanels();
    expect(usePanelStore.getState().browserOverlayMaximized).toBe(false);
  });
});
