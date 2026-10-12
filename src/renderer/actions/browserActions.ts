import { readBridge } from "@/renderer/bridge";
import type { BrowserState } from "@/shared/ipc";
import { useBrowserPanelStore, browserActionKey } from "@/renderer/state/browserPanelStore";
import { runRendererAction } from "@/renderer/state/rendererActionStore";
import {
  beginBrowserPresentation,
  projectBrowserPresentation,
  browserPresentationBase,
  type BrowserPresentationEdit,
} from "@/renderer/state/browserPresentationIntents";

let activationQueue: Promise<void> | null = null;
let activationOwnerRevision = -1;
/** Select from resident state; keep queued host activations in click order. */
export function activateBrowserTab(tabId: string): void {
  const store = useBrowserPanelStore.getState();
  if (activationOwnerRevision !== store.ownerRevision) {
    activationOwnerRevision = store.ownerRevision;
    activationQueue = null;
  }
  const token = store.beginActivation(tabId);
  const write = () => {
    if (!store.markActivationDispatched(token)) return Promise.resolve();
    return readBridge().browserActivateTab({ tabId });
  };
  const job = (activationQueue ? activationQueue.catch(() => {}).then(write) : write()).then(
    () => store.settleActivation(token, true),
    () => store.settleActivation(token, false),
  );
  activationQueue = job;
  void job.finally(() => {
    if (activationQueue === job) activationQueue = null;
  });
}

export function runBrowserNavigation(tabId: string, write: () => Promise<unknown>): void {
  const ownerRevision = useBrowserPanelStore.getState().ownerRevision;
  void runRendererAction(
    browserActionKey(`browser:navigate:${tabId}`, ownerRevision),
    () =>
      useBrowserPanelStore.getState().ownerRevision === ownerRevision ? write() : Promise.resolve(),
    { queue: true },
  ).catch(() => {});
}

export function createBrowserTab(url: string): void {
  const key = browserActionKey("browser:create", useBrowserPanelStore.getState().ownerRevision);
  void runRendererAction(key, () => readBridge().browserCreateTab({ url, activate: true })).catch(
    () => {},
  );
}

/** Paint reversible browser state before the native/remote command completes. */
export function editBrowserPresentation(
  edit: BrowserPresentationEdit,
  write: () => Promise<unknown>,
): void {
  const lease = beginBrowserPresentation(edit);
  const key = browserActionKey(lease.key, useBrowserPanelStore.getState().ownerRevision);
  const { tabs, groups, activeTabId, extracted, bookmarks, bookmarkBarVisible } =
    useBrowserPanelStore.getState();
  const resident = { tabs, groups, activeTabId, extracted, bookmarks, bookmarkBarVisible };
  paintBrowserPresentation(projectBrowserPresentation(resident));
  const paintedSelection = useBrowserPanelStore.getState().activeTabId;
  const selectionRevision = useBrowserPanelStore.getState().selectionRevision;
  void runRendererAction(key, () => (lease.dispatch() ? write() : Promise.resolve()), {
    queue: true,
  }).then(
    () => lease.settle(true),
    () => {
      if (!lease.settle(false)) return;
      const current = useBrowserPanelStore.getState();
      const restored = projectBrowserPresentation(browserPresentationBase(resident));
      const selectionUnchanged =
        current.activeTabId === paintedSelection && current.selectionRevision === selectionRevision;
      paintBrowserPresentation({
        ...restored,
        activeTabId:
          current.activationIntent &&
          restored.tabs.some((tab) => tab.tabId === current.activationIntent!.tabId)
            ? current.activationIntent.tabId
            : !selectionUnchanged && restored.tabs.some((tab) => tab.tabId === current.activeTabId)
              ? current.activeTabId
              : restored.activeTabId,
      });
    },
  );
}

function paintBrowserPresentation(state: BrowserState): void {
  useBrowserPanelStore.setState({
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    groups: state.groups ?? [],
    bookmarks: state.bookmarks ?? [],
    bookmarkBarVisible: state.bookmarkBarVisible === true,
    extracted: state.extracted === true,
  });
}
