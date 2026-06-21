import { useAppStore } from "@/renderer/state/appStore";
import { useChatFindStore } from "@/renderer/state/chatFindStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useFindFocusStore } from "@/renderer/state/findFocusStore";
import { useGitFindStore } from "@/renderer/state/gitFindStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useCommandPaletteStore } from "@/renderer/commands/commandPaletteStore";
import { isEditorFocusElement, isTerminalFocusElement } from "@/renderer/commands/focusedSurface";
import { openEditorFind } from "./editorFindBridge";
import { openTerminalFind } from "./terminalFindBridge";

export type FindTarget = "editor" | "terminal" | "settings" | "git" | "tree" | "chat";

/**
 * Decide which surface a Find (Ctrl+F) press should target. Focus wins first
 * (cursor inside Monaco, an xterm, or a surface tagged `data-lightcode-find-
 * scope`); otherwise the topmost open overlay is used; the active chat is the
 * fallback. Returns null when nothing is searchable (e.g. a blocking modal owns
 * its own input, or the home view).
 */
export function resolveFindTarget(): FindTarget | null {
  const element = document.activeElement instanceof Element ? document.activeElement : null;
  if (isEditorFocusElement(element)) return "editor";
  if (isTerminalFocusElement(element)) return "terminal";
  const scope = element
    ?.closest("[data-lightcode-find-scope]")
    ?.getAttribute("data-lightcode-find-scope");
  if (scope === "git" || scope === "settings" || scope === "tree" || scope === "chat") {
    return scope;
  }
  if (element?.closest("[data-lightcode-browser]")) return null;

  const panel = usePanelStore.getState();
  // Blocking modals trap their own input — leave Ctrl+F to them.
  if (
    useCommandPaletteStore.getState().isOpen ||
    panel.threadSearchOpen ||
    panel.createProjectModalOpen ||
    panel.cloneProjectModalOpen
  ) {
    return null;
  }
  if (panel.settingsOpen || panel.projectSettingsId !== null) return "settings";
  if (panel.gitOverlayOpen || panel.prReviewContext !== null) return "git";
  if (useFileEditorStore.getState().overlayMode !== null) return "tree";
  if (useAppStore.getState().view.kind === "thread") return "chat";
  return null;
}

/** Entry point for the `find.open` command: open Find on the active surface. */
export function openFindForActiveSurface(): void {
  const target = resolveFindTarget();
  if (!target) return;
  switch (target) {
    case "editor":
      openEditorFind();
      return;
    case "terminal":
      openTerminalFind();
      return;
    case "git":
      useGitFindStore.getState().open();
      return;
    case "settings":
      useFindFocusStore.getState().requestSettingsFocus();
      return;
    case "tree":
      useFindFocusStore.getState().requestTreeFocus();
      return;
    case "chat": {
      const threadId = resolveFocusedThreadId();
      if (threadId) useChatFindStore.getState().open(threadId);
      return;
    }
  }
}

function resolveFocusedThreadId(): string | null {
  const app = useAppStore.getState();
  if (app.view.kind !== "thread") return null;
  const focused =
    app.focusedPaneId && app.view.panes.includes(app.focusedPaneId)
      ? app.focusedPaneId
      : app.view.panes[0];
  return focused ?? null;
}
