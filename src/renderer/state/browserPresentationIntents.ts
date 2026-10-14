import type { BrowserBookmarkInfo, BrowserState } from "@/shared/ipc";

export type BrowserPresentationEdit =
  | { kind: "close"; tabId: string }
  | { kind: "bookmark"; url: string; bookmark: BrowserBookmarkInfo | null }
  | { kind: "bookmark-bar"; visible: boolean };
interface Intent {
  edit: BrowserPresentationEdit;
  dispatched: boolean;
}
const intents = new Map<string, Intent>();
let hostState: BrowserState | undefined;

function keyFor(edit: BrowserPresentationEdit): string {
  return edit.kind === "close"
    ? `browser:close:${edit.tabId}`
    : edit.kind === "bookmark"
      ? `browser:bookmark:${edit.url}`
      : "browser:bookmark-bar";
}

export function beginBrowserPresentation(edit: BrowserPresentationEdit) {
  const key = keyFor(edit);
  const intent: Intent = { edit, dispatched: false };
  intents.set(key, intent);
  return {
    key,
    dispatch: () => {
      if (intents.get(key) !== intent) return false;
      intent.dispatched = true;
      return true;
    },
    settle: (accepted: boolean) => {
      if (intents.get(key) !== intent) return false;
      if (!accepted) intents.delete(key);
      return true;
    },
  };
}

function matches(state: BrowserState, edit: BrowserPresentationEdit): boolean {
  if (edit.kind === "close") return !state.tabs.some((tab) => tab.tabId === edit.tabId);
  if (edit.kind === "bookmark-bar") return (state.bookmarkBarVisible === true) === edit.visible;
  const bookmark = state.bookmarks?.find((entry) => entry.url === edit.url);
  return edit.bookmark ? bookmark !== undefined : bookmark === undefined;
}

/** Merge by tab/URL, so unrelated authoritative browser changes remain live. */
export function projectBrowserPresentation(state: BrowserState, observe = false): BrowserState {
  if (observe) hostState = state;
  let projected = state;
  for (const [key, intent] of intents) {
    if (observe && intent.dispatched && matches(state, intent.edit)) {
      // Once the host has published the intended result, later host changes win.
      intents.delete(key);
      continue;
    }
    const edit = intent.edit;
    if (edit.kind === "close") {
      const index = projected.tabs.findIndex((tab) => tab.tabId === edit.tabId);
      const tabs = projected.tabs.filter((tab) => tab.tabId !== edit.tabId);
      projected = {
        ...projected,
        tabs,
        activeTabId:
          projected.activeTabId === edit.tabId
            ? (tabs[Math.min(Math.max(index, 0), tabs.length - 1)]?.tabId ?? null)
            : projected.activeTabId,
      };
    } else if (edit.kind === "bookmark-bar")
      projected = { ...projected, bookmarkBarVisible: edit.visible };
    else {
      const bookmarks = projected.bookmarks ?? [];
      const index = bookmarks.findIndex((entry) => entry.url === edit.url);
      const next = bookmarks.filter((entry) => entry.url !== edit.url);
      if (edit.bookmark) next.splice(index < 0 ? next.length : index, 0, edit.bookmark);
      projected = { ...projected, bookmarks: next };
    }
  }
  return projected;
}

export function browserPresentationBase(fallback: BrowserState): BrowserState {
  return hostState ?? fallback;
}

export function resetBrowserPresentationIntents(): void {
  intents.clear();
  hostState = undefined;
}
