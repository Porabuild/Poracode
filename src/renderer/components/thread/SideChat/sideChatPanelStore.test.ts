import { afterEach, expect, it } from "vitest";
import type { SideChatBootstrap } from "@/shared/ipc/sideChat";
import { usePanelStore } from "@/renderer/state/panelStore";
import { auxiliaryThreadIds } from "@/renderer/state/auxiliaryThreadWindows";
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
  usePanelStore.getState().closeAllPanels();
});
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
