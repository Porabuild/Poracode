import { afterEach, expect, it } from "vitest";
import type { SideChatBootstrap } from "@/shared/ipc/sideChat";
import { usePanelStore } from "@/renderer/state/panelStore";
import { auxiliaryThreadIds } from "@/renderer/state/auxiliaryThreadWindows";
import { useComposerInputInbox } from "@/renderer/state/composerInputInbox";
import { applyNativeSideChatOwnership } from "./sideChatOwnershipActions";
import {
  applySideChatPanel,
  updateSideChatPanelDraft,
  useSideChatPanelStore,
} from "./sideChatPanelStore";
const entry = {
  id: "entry",
  prompt: "",
  title: "Side chat",
  context: null,
  source: { id: "parent" },
} as SideChatBootstrap;
afterEach(() => {
  applySideChatPanel(null);
  useComposerInputInbox.setState({ itemsByComposer: {} });
  usePanelStore.getState().closeAllPanels();
});
it.each([true, false])(
  "delivers selected text in main/auxiliary renderer (%s) and accepts old ownership events",
  (mainWindow) => {
    applyNativeSideChatOwnership({ threadIds: [] }, mainWindow);
    expect(useComposerInputInbox.getState().itemsByComposer).toEqual({});
    applyNativeSideChatOwnership(
      { threadIds: [], composerInput: { composerId: "side-chat:entry", text: "quote" } },
      mainWindow,
    );
    expect(useComposerInputInbox.getState().itemsByComposer["side-chat:entry"]).toEqual([
      [{ kind: "text", content: "quote" }],
    ]);
  },
);
it("preserves an initial draft through hide/show and ignores edits from replaced panels", () => {
  applySideChatPanel(entry);
  updateSideChatPanelDraft("entry", "Unsent question");
  usePanelStore.getState().closeAllPanels();
  expect(usePanelStore.getState().sideChatPanelOpen).toBe(false);
  usePanelStore.getState().setRightPanelTab("sideChat");
  expect(useSideChatPanelStore.getState().entry?.prompt).toBe("Unsent question");
  applySideChatPanel({ ...entry, id: "new", prompt: "new draft" });
  updateSideChatPanelDraft("entry", "stale draft");
  expect(useSideChatPanelStore.getState().entry?.prompt).toBe("new draft");
});
it("retains native bound ownership when hidden without a bind update reopening the panel", () => {
  applySideChatPanel({ ...entry, existingThreadId: "child" });
  usePanelStore.getState().closeAllPanels();
  applySideChatPanel({ ...entry, existingThreadId: "child", prompt: "question" });
  expect(auxiliaryThreadIds().has("child")).toBe(true);
  expect(usePanelStore.getState().sideChatPanelOpen).toBe(false);
  applySideChatPanel(null);
  expect(auxiliaryThreadIds().has("child")).toBe(false);
});
