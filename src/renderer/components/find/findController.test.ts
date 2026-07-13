import { afterEach, describe, expect, it } from "vitest";
import { useCommandPaletteStore } from "@/renderer/commands/commandPaletteStore";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { resolveFindTarget } from "./findController";

function resetFindRoutingState(): void {
  document.body.innerHTML = "";
  useCommandPaletteStore.setState({ isOpen: false });
  usePanelStore.setState({
    settingsOpen: false,
    projectSettingsId: null,
    gitOverlayOpen: false,
    prReviewContext: null,
    threadSearchOpen: false,
    createProjectModalOpen: false,
    cloneProjectModalOpen: false,
  });
  useAppStore.setState({ view: { kind: "home" } });
}

describe("resolveFindTarget", () => {
  afterEach(() => {
    resetFindRoutingState();
  });

  it("falls back to chat in a thread view", () => {
    useAppStore.setState({ view: { kind: "thread", panes: ["thread-1"] } });

    expect(resolveFindTarget()).toBe("chat");
  });

  it("does not route browser chrome focus to chat find", () => {
    useAppStore.setState({ view: { kind: "thread", panes: ["thread-1"] } });
    document.body.innerHTML = `<div data-poracode-browser=""><input id="address" /></div>`;
    document.getElementById("address")?.focus();

    expect(resolveFindTarget()).toBeNull();
  });

  it("lets the command palette keep Ctrl+F", () => {
    useAppStore.setState({ view: { kind: "thread", panes: ["thread-1"] } });
    useCommandPaletteStore.setState({ isOpen: true });

    expect(resolveFindTarget()).toBeNull();
  });
});
