import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserTabGroupInfo } from "@/shared/ipc";

const resolveWebContentsById = vi.hoisted(() => vi.fn<(id: number) => unknown>());

vi.mock("electron", () => ({
  BrowserWindow: class BrowserWindow {},
  shell: { openExternal: vi.fn<(url: string) => Promise<void>>() },
}));

vi.mock("../db", () => ({
  dbGetState: vi.fn<(key: string) => string | null>(),
  dbSetState: vi.fn<(key: string, value: string) => void>(),
}));

vi.mock("../sharedSettingsFile", () => ({
  readSharedSettingsFile: vi.fn<(path: string) => unknown>(),
}));

vi.mock("../attachments/localFiles", () => ({
  saveClipboardImageFile: vi.fn<() => string>(),
}));

vi.mock("@/shared/ipc", () => ({
  IPC_EVENT_CHANNELS: { browserEvent: "browser-event" },
  browserTabGroupSchema: {
    safeParse: vi.fn<(value: unknown) => { success: true; data: unknown }>((value) => ({
      success: true,
      data: value,
    })),
  },
}));

vi.mock("./picker/pickerProtocol", () => ({
  PICKER_COMMIT_ORIGIN: "poracode-picker",
  onPickerCommit: vi.fn<() => () => void>(() => vi.fn<() => void>()),
}));

vi.mock("./picker/pickerScript", () => ({
  buildPickerScript: vi.fn<() => string>(),
}));

vi.mock("./BrowserTab", () => ({
  BrowserTab: class BrowserTab {},
  resolveWebContentsById,
}));

function createManagerWithTab() {
  const tab = {
    tabId: "tab-1",
    attach: vi.fn<(webContents: unknown) => void>(),
  };
  const hostWebContents = {
    id: 42,
    on: vi.fn<() => void>(),
    send: vi.fn<() => void>(),
  };
  const host = {
    webContents: hostWebContents,
    once: vi.fn<() => void>(),
    isDestroyed: () => false,
  };
  return { tab, host, hostWebContents };
}

function createFakeTab(tabId: string) {
  return {
    tabId,
    snapshot: () => ({
      tabId,
      url: `https://${tabId}.test/`,
      title: tabId,
      loading: false,
      canGoBack: false,
      canGoForward: false,
      devToolsOpen: false,
    }),
  };
}

function seedGroupState(
  manager: unknown,
  tabs: ReturnType<typeof createFakeTab>[],
  groups: BrowserTabGroupInfo[],
  tabGroupPairs: Array<[string, string]>,
): void {
  const state = manager as {
    tabs: ReturnType<typeof createFakeTab>[];
    tabGroups: {
      restore(groups: BrowserTabGroupInfo[]): void;
      assignRestoredTab(tabId: string, groupId: string): boolean;
    };
  };
  state.tabs = tabs;
  state.tabGroups.restore(groups);
  for (const [tabId, groupId] of tabGroupPairs) {
    state.tabGroups.assignRestoredTab(tabId, groupId);
  }
}

describe("BrowserPanelManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects the host window WebContents as a browser tab target", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36",
    );
    const { tab, host } = createManagerWithTab();

    manager.bindHost(host as never);
    (manager as unknown as { tabs: (typeof tab)[] }).tabs = [tab];
    manager.attachWebContents("tab-1", 42);

    expect(resolveWebContentsById).not.toHaveBeenCalled();
    expect(tab.attach).not.toHaveBeenCalled();
  });

  it("attaches a non-host WebContents to the browser tab", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36",
    );
    const { tab, host } = createManagerWithTab();
    const guestWebContents = { id: 99 };
    resolveWebContentsById.mockReturnValue(guestWebContents);

    manager.bindHost(host as never);
    (manager as unknown as { tabs: (typeof tab)[] }).tabs = [tab];
    manager.attachWebContents("tab-1", 99);

    expect(resolveWebContentsById).toHaveBeenCalledWith(99);
    expect(tab.attach).toHaveBeenCalledWith(guestWebContents);
  });

  it("moves ungrouped tabs into the target tab's group", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36",
    );
    const group = {
      id: "group-agent",
      title: "Poracode",
      color: "purple",
      collapsed: false,
    } satisfies BrowserTabGroupInfo;

    seedGroupState(
      manager,
      [createFakeTab("tab-free"), createFakeTab("tab-a"), createFakeTab("tab-b")],
      [group],
      [
        ["tab-a", group.id],
        ["tab-b", group.id],
      ],
    );

    manager.moveTab("tab-free", "tab-a", "after");

    const state = manager.snapshot();
    expect(state.tabs.map((t) => t.tabId)).toEqual(["tab-a", "tab-free", "tab-b"]);
    expect(state.tabs.find((t) => t.tabId === "tab-free")?.groupId).toBe(group.id);
  });

  it("removes a tab from its group when moved beside an ungrouped tab", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36",
    );
    const group = {
      id: "group-agent",
      title: "Poracode",
      color: "purple",
      collapsed: false,
    } satisfies BrowserTabGroupInfo;

    seedGroupState(
      manager,
      [createFakeTab("tab-a"), createFakeTab("tab-free")],
      [group],
      [["tab-a", group.id]],
    );

    manager.moveTab("tab-a", "tab-free", "after");

    const state = manager.snapshot();
    expect(state.tabs.map((t) => t.tabId)).toEqual(["tab-free", "tab-a"]);
    expect(state.tabs.find((t) => t.tabId === "tab-a")?.groupId).toBeUndefined();
    expect(state.groups).toEqual([]);
  });
});
