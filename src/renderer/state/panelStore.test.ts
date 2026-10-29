import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeAdaptiveLayout, resetAdaptiveLayoutForTest } from "@/renderer/adaptiveLayout";
import {
  DOCKABLE_PANEL_TABS,
  selectAnyObstructingOverlayOpen,
  selectPullRequestsOverlayVisible,
  usePanelStore,
} from "./panelStore";
import { useFileEditorStore } from "./fileEditorStore";
import { useCommandPaletteStore } from "@/renderer/commands/commandPaletteStore";
import {
  PANEL_PERSIST_KEY,
  PANEL_PERSIST_VERSION,
  resolveRightPanelFollowsThread,
  type PersistedPanelSlice,
} from "./panelPersist";

const initialPanelState = usePanelStore.getState();
const initialFileEditorState = useFileEditorStore.getState();

function resetPanelStore() {
  usePanelStore.setState({
    ...initialPanelState,
    gitReviewContext: null,
    gitReviewAsPanel: false,
    gitOverlayOpen: false,
    prReviewContext: null,
    pullRequestsOverlayOpen: false,
    githubActionsContext: null,
    filesPanelContext: null,
    subAgentPanelContext: null,
    subAgentPanelOpen: false,
    browserPanelOpen: false,
    browserOverlayOpen: false,
    settingsOpen: false,
    projectSettingsId: null,
    mobileUtilityPage: null,
  });
  useCommandPaletteStore.setState({ isOpen: false });
}

function resetFileEditorStore() {
  useFileEditorStore.setState({
    ...initialFileEditorState,
    overlayMode: null,
  });
}

it("defaults the thread list to the flat layout", () => {
  expect(initialPanelState.threadListLayout).toBe("flat");
});

it("defaults the right panel to follow the focused thread", () => {
  expect(initialPanelState.rightPanelFollowsThread).toBe(true);
});

describe("device tab session context", () => {
  beforeEach(resetPanelStore);
  afterEach(resetPanelStore);

  it("keeps a detached preview independent of panel closing and docks the same exact context", () => {
    const panel = usePanelStore.getState();
    panel.setDeviceWorkspaceThreadId("first");
    panel.setDeviceWorkspaceDetached(true);
    panel.closeAllPanels();
    expect(usePanelStore.getState()).toMatchObject({
      deviceWorkspaceThreadId: "first",
      deviceWorkspaceDetached: true,
    });
    panel.setDeviceWorkspaceDetached(false);
    expect(usePanelStore.getState()).toMatchObject({
      deviceWorkspaceThreadId: "first",
      deviceWorkspaceDetached: false,
      rightPanelTab: "devices",
    });
    panel.setDeviceWorkspaceDetached(true);
    panel.setDeviceWorkspaceThreadId("second");
    expect(usePanelStore.getState()).toMatchObject({
      deviceWorkspaceThreadId: "second",
      deviceWorkspaceDetached: false,
    });
    panel.setDeviceWorkspaceThreadId(null);
    panel.setDeviceWorkspaceDetached(true);
    expect(usePanelStore.getState().deviceWorkspaceDetached).toBe(false);
  });

  it("retains one context across tab switches and clears it when the panel closes", () => {
    usePanelStore.getState().setDeviceWorkspaceThreadId("first");
    expect(usePanelStore.getState().rightPanelTab).toBe("devices");
    const opened = usePanelStore.getState();
    opened.setDeviceWorkspaceThreadId("first");
    expect(usePanelStore.getState()).toMatchObject({
      deviceWorkspaceThreadId: "first",
      rightPanelTab: "devices",
    });
    opened.setRightPanelTab("notes");
    expect(usePanelStore.getState().deviceWorkspaceThreadId).toBe("first");
    opened.setDeviceWorkspaceThreadId("second");
    expect(usePanelStore.getState()).toMatchObject({
      deviceWorkspaceThreadId: "second",
      rightPanelTab: "devices",
    });
    expect(DOCKABLE_PANEL_TABS.has("devices")).toBe(false);
    opened.closeAllPanels();
    expect(usePanelStore.getState().deviceWorkspaceThreadId).toBeNull();
  });

  it("keeps the exact pre-upgrade v1 persisted whitelist and never writes device context or tab", () => {
    usePanelStore.getState().setThreadSortMode("created");
    usePanelStore.getState().setThreadSortMode("updated");
    const before = localStorage.getItem(PANEL_PERSIST_KEY);
    expect(before).not.toBeNull();
    const legacy = JSON.parse(before!) as PersistedPanelSlice;
    expect(Object.keys(legacy).sort()).toEqual(
      [
        "version",
        "gitReviewContext",
        "browserOverlayDrawerWidth",
        "rightPanelFollowsThread",
        "threadToolRailOffset",
        "threadSortMode",
        "threadListLayout",
      ].sort(),
    );
    expect(legacy.version).toBe(1);
    expect(PANEL_PERSIST_VERSION).toBe(1);
    usePanelStore.getState().setDeviceWorkspaceThreadId("thread-with-no-credentials");
    usePanelStore.getState().setDeviceWorkspaceDetached(true);
    usePanelStore.getState().setRightPanelTab("notes");
    usePanelStore.getState().closeAllPanels();
    expect(localStorage.getItem(PANEL_PERSIST_KEY)).toBe(before);
    expect(resolveRightPanelFollowsThread(JSON.parse(before!))).toBe(
      legacy.rightPanelFollowsThread,
    );
  });
});

it("hides a side chat when it is the only open right panel and reopens its tab", () => {
  resetPanelStore();
  usePanelStore.setState({ sideChatPanelOpen: true, rightPanelTab: "sideChat" });
  usePanelStore.getState().closeAllPanels();
  expect(usePanelStore.getState().sideChatPanelOpen).toBe(false);
  usePanelStore.getState().setRightPanelTab("sideChat");
  expect(usePanelStore.getState().sideChatPanelOpen).toBe(true);
  resetPanelStore();
});

function stubMatchMedia(matches: (query: string) => boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      media: query,
      matches: matches(query),
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    })),
  );
}

describe("compact project settings navigation", () => {
  beforeEach(() => {
    resetPanelStore();
    resetAdaptiveLayoutForTest();
    Reflect.deleteProperty(window, "poracodeHost");
    stubMatchMedia((query) => query === "(max-width: 767px)");
    initializeAdaptiveLayout();
  });

  afterEach(() => {
    resetPanelStore();
    resetAdaptiveLayoutForTest();
    vi.unstubAllGlobals();
  });

  it("opens project settings as a top-level mobile page", () => {
    usePanelStore.getState().openProjectSettings("proj-1");

    expect(usePanelStore.getState()).toMatchObject({
      mobileUtilityPage: "projectSettings",
      projectSettingsId: "proj-1",
    });
  });

  it("clears both the page and project identity when navigating back", () => {
    usePanelStore.getState().openProjectSettings("proj-1");
    usePanelStore.getState().closeProjectSettings();

    expect(usePanelStore.getState()).toMatchObject({
      mobileUtilityPage: null,
      projectSettingsId: null,
    });
  });

  it("keeps the desktop project settings overlay route unchanged", () => {
    resetAdaptiveLayoutForTest();
    stubMatchMedia(() => false);
    initializeAdaptiveLayout();

    usePanelStore.getState().openProjectSettings("proj-1");

    expect(usePanelStore.getState()).toMatchObject({
      mobileUtilityPage: null,
      projectSettingsId: "proj-1",
    });
  });
});

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

  it("returns true when the search palette is open", () => {
    useCommandPaletteStore.getState().open();
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

describe("pull-request overlay", () => {
  beforeEach(() => {
    resetPanelStore();
  });

  afterEach(() => {
    resetPanelStore();
  });

  it("is visible for the list alone, a selected review alone, or both", () => {
    expect(selectPullRequestsOverlayVisible(usePanelStore.getState())).toBe(false);

    usePanelStore.getState().openPullRequestsOverlay();
    expect(selectPullRequestsOverlayVisible(usePanelStore.getState())).toBe(true);
    expect(selectAnyObstructingOverlayOpen()).toBe(true);

    usePanelStore.getState().closePullRequestsOverlay();
    usePanelStore.getState().setPrReviewContext({ projectId: "p", prNumber: 7 });
    expect(selectPullRequestsOverlayVisible(usePanelStore.getState())).toBe(true);
  });

  it("closing clears the list and the selected review together", () => {
    usePanelStore.getState().openPullRequestsOverlay();
    usePanelStore.getState().setPrReviewContext({ projectId: "p", prNumber: 7 });

    usePanelStore.getState().closePullRequestsOverlay();

    expect(usePanelStore.getState().pullRequestsOverlayOpen).toBe(false);
    expect(usePanelStore.getState().prReviewContext).toBeNull();
    expect(selectAnyObstructingOverlayOpen()).toBe(false);
  });

  it("selecting a review keeps the list open", () => {
    usePanelStore.getState().openPullRequestsOverlay();
    usePanelStore.getState().openPullRequestsOverlay();

    usePanelStore.getState().setPrReviewContext({ projectId: "p", prNumber: 7 });
    expect(usePanelStore.getState().pullRequestsOverlayOpen).toBe(true);
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
