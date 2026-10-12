import { beforeEach, expect, it, vi } from "vitest";
import type { BrowserTabInfo } from "@/shared/ipc";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import {
  activateBrowserTab,
  editBrowserPresentation,
  runBrowserNavigation,
} from "./browserActions";

const { activate } = vi.hoisted(() => ({
  activate: vi.fn<(input: { tabId: string }) => Promise<void>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({ browserActivateTab: activate }) }));
const tabs = ["a", "b", "c"].map((tabId): BrowserTabInfo => ({
  tabId,
  url: "about:blank",
  title: tabId,
  loading: false,
  canGoBack: false,
  canGoForward: false,
  devToolsOpen: false,
}));
beforeEach(() => {
  activate.mockReset().mockResolvedValue();
  useBrowserPanelStore.getState().resetOwner();
  useBrowserPanelStore.setState({
    activationIntent: null,
    hostActiveTabId: null,
    initialized: false,
  });
  useBrowserPanelStore.getState().setState({ tabs, activeTabId: "a" });
});

it("switches resident tabs immediately and keeps the latest selection across stale events and acknowledgments", async () => {
  let accept!: () => void;
  activate.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        accept = resolve;
      }),
  );
  activateBrowserTab("b");
  activateBrowserTab("c");
  expect(useBrowserPanelStore.getState().activeTabId).toBe("c");
  expect(activate).toHaveBeenCalledTimes(1);
  // This target is still queued: a matching event cannot release its intent.
  useBrowserPanelStore.getState().setState({ tabs, activeTabId: "c" });
  useBrowserPanelStore.getState().setState({ tabs, activeTabId: "b" });
  expect(useBrowserPanelStore.getState().activeTabId).toBe("c");
  accept();
  await vi.waitFor(() => expect(activate).toHaveBeenCalledTimes(2));
  useBrowserPanelStore.getState().setState({ tabs, activeTabId: "c" });
  await vi.waitFor(() => expect(useBrowserPanelStore.getState().activationIntent).toBeNull());
});

it("keeps pending-close tabs resident through updates and retires their native custody on absence", async () => {
  let accept!: () => void;
  editBrowserPresentation(
    { kind: "close", tabId: "b" },
    () =>
      new Promise<void>((resolve) => {
        accept = resolve;
      }),
  );
  useBrowserPanelStore
    .getState()
    .upsertTab({ ...tabs[1]!, title: "Still resident", loading: true });
  expect(useBrowserPanelStore.getState().tabs.map((tab) => tab.tabId)).toEqual(["a", "c"]);
  expect(useBrowserPanelStore.getState().residentTabs[1]?.title).toBe("Still resident");
  useBrowserPanelStore.getState().setState({ tabs: [tabs[0]!, tabs[2]!], activeTabId: "a" });
  expect(useBrowserPanelStore.getState().residentTabs.map((tab) => tab.tabId)).toEqual(["a", "c"]);
  accept();
  await Promise.resolve();
});

it("composes activation refusal with a pending close and confirms only raw host selection", async () => {
  let acceptClose!: () => void;
  let refuseActivation!: (error: Error) => void;
  useBrowserPanelStore.getState().setState({ tabs, activeTabId: "b" });
  editBrowserPresentation(
    { kind: "close", tabId: "b" },
    () =>
      new Promise<void>((resolve) => {
        acceptClose = resolve;
      }),
  );
  activate.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        refuseActivation = reject;
      }),
  );
  activateBrowserTab("c");
  useBrowserPanelStore.getState().setState({ tabs, activeTabId: "b" });
  expect(useBrowserPanelStore.getState().activationIntent?.tabId).toBe("c");
  refuseActivation(new Error("refused"));
  await vi.waitFor(() => expect(useBrowserPanelStore.getState().activationIntent).toBeNull());
  expect(useBrowserPanelStore.getState().activeTabId).toBe("c");
  acceptClose();
  useBrowserPanelStore.getState().setState({ tabs: [tabs[0]!, tabs[2]!], activeTabId: "c" });
});

it("restores host selection after a refused close even when an earlier activation has retired", async () => {
  let acceptActivation!: () => void;
  let refuseClose!: (error: Error) => void;
  activate.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        acceptActivation = resolve;
      }),
  );
  activateBrowserTab("b");
  editBrowserPresentation(
    { kind: "close", tabId: "b" },
    () =>
      new Promise<void>((_resolve, reject) => {
        refuseClose = reject;
      }),
  );
  useBrowserPanelStore.getState().setState({ tabs, activeTabId: "b" });
  acceptActivation();
  refuseClose(new Error("refused"));
  await vi.waitFor(() => expect(useBrowserPanelStore.getState().tabs).toHaveLength(3));
  expect(useBrowserPanelStore.getState().activeTabId).toBe("b");
});

it("retires old owner edits and queued activations before a replacement owner's snapshot", async () => {
  let refuseEdit!: (error: Error) => void;
  let acceptActivation!: () => void;
  editBrowserPresentation(
    { kind: "bookmark-bar", visible: true },
    () =>
      new Promise<void>((_resolve, reject) => {
        refuseEdit = reject;
      }),
  );
  activate.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        acceptActivation = resolve;
      }),
  );
  activateBrowserTab("b");
  activateBrowserTab("c");
  useBrowserPanelStore.getState().resetOwner();
  useBrowserPanelStore
    .getState()
    .setState({ tabs: [tabs[0]!], activeTabId: "a", bookmarkBarVisible: false });
  refuseEdit(new Error("old owner"));
  acceptActivation();
  await vi.waitFor(() => expect(useBrowserPanelStore.getState().activationIntent).toBeNull());
  expect(useBrowserPanelStore.getState().bookmarkBarVisible).toBe(false);
  expect(useBrowserPanelStore.getState().tabs).toHaveLength(1);
  expect(activate).toHaveBeenCalledTimes(1);
});

it("dispatches replacement owner commands while the old owner's jobs are still held", async () => {
  let acceptOldActivation!: () => void;
  let acceptOldEdit!: () => void;
  let acceptOldNavigation!: () => void;
  activate.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        acceptOldActivation = resolve;
      }),
  );
  activateBrowserTab("b");
  editBrowserPresentation(
    { kind: "bookmark-bar", visible: true },
    () =>
      new Promise<void>((resolve) => {
        acceptOldEdit = resolve;
      }),
  );
  runBrowserNavigation(
    "a",
    () =>
      new Promise<void>((resolve) => {
        acceptOldNavigation = resolve;
      }),
  );
  useBrowserPanelStore.getState().resetOwner();
  useBrowserPanelStore.getState().setState({ tabs, activeTabId: "a" });
  activateBrowserTab("c");
  const edit = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const navigate = vi.fn<() => Promise<void>>(() => Promise.resolve());
  editBrowserPresentation({ kind: "bookmark-bar", visible: true }, edit);
  runBrowserNavigation("a", navigate);
  expect(activate).toHaveBeenCalledTimes(2);
  expect(edit).toHaveBeenCalledOnce();
  expect(navigate).toHaveBeenCalledOnce();
  acceptOldActivation();
  acceptOldEdit();
  acceptOldNavigation();
  useBrowserPanelStore.getState().setState({ tabs, activeTabId: "c", bookmarkBarVisible: true });
  await Promise.resolve();
});

it("restores a surviving pending activation after its tab's close is refused", async () => {
  let accept!: () => void;
  let reject!: (error: Error) => void;
  activate.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        accept = resolve;
      }),
  );
  activateBrowserTab("b");
  editBrowserPresentation(
    { kind: "close", tabId: "b" },
    () =>
      new Promise<void>((_resolve, refuse) => {
        reject = refuse;
      }),
  );
  reject(new Error("refused"));
  await vi.waitFor(() => expect(useBrowserPanelStore.getState().tabs).toHaveLength(3));
  expect(useBrowserPanelStore.getState().activeTabId).toBe("b");
  expect(useBrowserPanelStore.getState().activationIntent?.tabId).toBe("b");
  accept();
  useBrowserPanelStore.getState().setState({ tabs, activeTabId: "b" });
});

it("keeps newer host navigation after its target event precedes the command acknowledgment", async () => {
  let accept!: () => void;
  activate.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        accept = resolve;
      }),
  );
  activateBrowserTab("b");
  useBrowserPanelStore.getState().setState({ tabs, activeTabId: "b" });
  useBrowserPanelStore.getState().setState({ tabs, activeTabId: "a" });
  accept();
  await vi.waitFor(() => expect(useBrowserPanelStore.getState().activationIntent).toBeNull());
  expect(useBrowserPanelStore.getState().activeTabId).toBe("a");
});

it("restores the host selection on rejection", async () => {
  activate.mockRejectedValueOnce(new Error("closed"));
  activateBrowserTab("b");
  expect(useBrowserPanelStore.getState().activeTabId).toBe("b");
  await vi.waitFor(() => expect(useBrowserPanelStore.getState().activeTabId).toBe("a"));
});

it("closes a tab immediately, rejects stale snapshots, and restores the latest host row on refusal", async () => {
  let reject!: (error: Error) => void;
  useBrowserPanelStore.getState().setState({ tabs, activeTabId: "b" });
  editBrowserPresentation(
    { kind: "close", tabId: "b" },
    () =>
      new Promise<void>((_accept, refuse) => {
        reject = refuse;
      }),
  );
  expect(useBrowserPanelStore.getState().tabs.map((tab) => tab.tabId)).toEqual(["a", "c"]);
  const freshTabs = tabs.map((tab) =>
    tab.tabId === "b" ? { ...tab, title: "Fresh host title" } : tab,
  );
  useBrowserPanelStore.getState().setState({ tabs: freshTabs, activeTabId: "b" });
  expect(useBrowserPanelStore.getState().tabs).toHaveLength(2);
  reject(new Error("refused"));
  await vi.waitFor(() => expect(useBrowserPanelStore.getState().tabs).toHaveLength(3));
  expect(useBrowserPanelStore.getState().activeTabId).toBe("b");
  expect(useBrowserPanelStore.getState().tabs[1]?.title).toBe("Fresh host title");
});

it("optimistically toggles bookmarks while preserving unrelated host additions", async () => {
  let accept!: () => void;
  const bookmark = { url: "https://example.test", title: "Example", createdAt: 1 };
  editBrowserPresentation(
    { kind: "bookmark", url: bookmark.url, bookmark },
    () =>
      new Promise<void>((resolve) => {
        accept = resolve;
      }),
  );
  expect(useBrowserPanelStore.getState().bookmarks).toEqual([bookmark]);
  const other = { url: "https://other.test", title: "Other", createdAt: 2 };
  useBrowserPanelStore.getState().setState({ tabs, activeTabId: "a", bookmarks: [other] });
  expect(useBrowserPanelStore.getState().bookmarks).toEqual([other, bookmark]);
  accept();
  await Promise.resolve();
  useBrowserPanelStore
    .getState()
    .setState({ tabs, activeTabId: "a", bookmarks: [other, bookmark] });
  useBrowserPanelStore.getState().setState({ tabs, activeTabId: "a", bookmarks: [other] });
  expect(useBrowserPanelStore.getState().bookmarks).toEqual([other]);
});
