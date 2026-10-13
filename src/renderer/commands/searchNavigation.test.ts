import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { useFileEditorStore, type FileEditorBuffer } from "@/renderer/state/fileEditorStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { revealSearchDestination } from "./searchNavigation";
const initialEditor = useFileEditorStore.getState();
const initialPanels = usePanelStore.getState();
afterEach(() => {
  useFileEditorStore.setState(initialEditor);
  usePanelStore.setState(initialPanels);
});

describe("search destination navigation", () => {
  it("reveals a thread over Settings/editor while retaining unsaved buffers and docked panels", () => {
    const buffer: FileEditorBuffer = {
      path: "file.ts",
      status: "ready",
      modifiedAtMs: 1,
      content: "unsaved",
      savedContent: "saved",
      lineEnding: "lf",
      hasBom: false,
      isDirty: true,
      isLoading: false,
    };
    useFileEditorStore.setState({ overlayMode: "fullscreen", buffers: { "file.ts": buffer } });
    usePanelStore.setState({
      settingsOpen: true,
      mobileUtilityPage: "settings",
      gitOverlayOpen: true,
      browserPanelOpen: true,
      browserOverlayOpen: true,
    });
    revealSearchDestination("thread");
    expect(usePanelStore.getState().settingsOpen).toBe(false);
    expect(usePanelStore.getState().mobileUtilityPage).toBeNull();
    expect(usePanelStore.getState().gitOverlayOpen).toBe(false);
    expect(usePanelStore.getState().browserPanelOpen).toBe(true);
    expect(usePanelStore.getState().browserOverlayOpen).toBe(false);
    expect(useFileEditorStore.getState().overlayMode).toBeNull();
    expect(useFileEditorStore.getState().buffers["file.ts"]).toBe(buffer);
  });
  it("dismisses Settings for a file destination without hiding the file editor", () => {
    usePanelStore.setState({ settingsOpen: true, projectSettingsId: "p" });
    useFileEditorStore.setState({ overlayMode: "modal" });
    revealSearchDestination("file");
    expect(usePanelStore.getState().settingsOpen).toBe(false);
    expect(usePanelStore.getState().projectSettingsId).toBeNull();
    expect(useFileEditorStore.getState().overlayMode).toBe("modal");
  });
  it("reveals a setting over the editor and maximized browser without closing docked panels", () => {
    usePanelStore.setState({ browserPanelOpen: true, browserOverlayOpen: true });
    useFileEditorStore.setState({ overlayMode: "modal" });
    revealSearchDestination("setting");
    usePanelStore.getState().openSettingsSection("appearance", "appearance.mode");
    expect(usePanelStore.getState().settingsOpen).toBe(true);
    expect(usePanelStore.getState().settingsSection).toBe("appearance");
    expect(usePanelStore.getState().settingsAnchor).toBe("appearance.mode");
    expect(usePanelStore.getState().browserPanelOpen).toBe(true);
    expect(usePanelStore.getState().browserOverlayOpen).toBe(false);
    expect(useFileEditorStore.getState().overlayMode).toBeNull();
  });
});
