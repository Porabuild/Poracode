import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserDownloadInfo, BrowserImportResult, BrowserTabGroupInfo } from "@/shared/ipc";
import type { BrowserCredentialStore } from "./BrowserCredentialStore";
import type { BrowserDownloadManager, BrowserDownloadManagerEvent } from "./BrowserDownloadManager";
import type { WindowsChromiumImportService } from "./WindowsChromiumImportService";

const resolveWebContentsById = vi.hoisted(() => vi.fn<(id: number) => unknown>());
const browserTabHarness = vi.hoisted(() => ({
  attach: vi.fn<(webContents: unknown) => void>(),
  whenAttached: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}));

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
  BrowserTab: class BrowserTab {
    readonly tabId: string;
    private url: string;
    private title = "";

    constructor(
      private readonly options: {
        tabId: string;
        initialUrl?: string;
        onUpdate(snapshot: {
          tabId: string;
          url: string;
          title: string;
          loading: boolean;
          canGoBack: boolean;
          canGoForward: boolean;
          devToolsOpen: boolean;
          zoomFactor: number;
        }): void;
      },
    ) {
      this.tabId = options.tabId;
      this.url = options.initialUrl ?? "about:blank";
    }

    snapshot() {
      return {
        tabId: this.tabId,
        url: this.url,
        title: this.title,
        loading: false,
        canGoBack: false,
        canGoForward: false,
        devToolsOpen: false,
        zoomFactor: 1,
      };
    }

    isAttached() {
      return false;
    }

    attach = browserTabHarness.attach;

    whenAttached = browserTabHarness.whenAttached;

    async loadURL(url: string) {
      this.url = url;
      this.options.onUpdate(this.snapshot());
    }

    async destroy() {}
  },
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

function createBrowserSession() {
  return {
    on: vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(),
    removeListener: vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(),
    clearStorageData: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    clearCache: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  };
}

function browserDataServices(manager: unknown): {
  credentials: BrowserCredentialStore;
  downloads: BrowserDownloadManager | null;
  importer: WindowsChromiumImportService | null;
} {
  return manager as {
    credentials: BrowserCredentialStore;
    downloads: BrowserDownloadManager | null;
    importer: WindowsChromiumImportService | null;
  };
}

function emptyImportResult(): BrowserImportResult {
  return {
    passwordsImported: 0,
    cookiesImported: 0,
    passwordsSkipped: 0,
    cookiesSkipped: 0,
    protectedItemsSkipped: 0,
    errors: [],
  };
}

function isCredentialsUpdatedEvent(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "credentials-updated"
  );
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

  it("opens app-owned download history once and reuses the existing tab", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36",
    );
    const first = await manager.openInternalPage("downloads");
    const second = await manager.openInternalPage("downloads");

    expect(first).toMatchObject({
      url: "chrome://downloads/",
      title: "Download history",
      internalPage: "downloads",
    });
    expect(second.tabId).toBe(first.tabId);
    expect(manager.snapshot().tabs).toHaveLength(1);
    expect(manager.getTab(first.tabId)).toBeNull();
    expect(manager.getActiveTab()).toBeNull();

    manager.attachWebContents(first.tabId, 99);
    expect(resolveWebContentsById).not.toHaveBeenCalled();
    expect(browserTabHarness.attach).not.toHaveBeenCalled();
  });

  it("replaces an internal page when the tab navigates to the web", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36",
    );
    const internal = await manager.openInternalPage("passwords");

    await manager.navigate(internal.tabId, "https://example.com/");

    expect(manager.snapshot().tabs[0]?.url).toBe("https://example.com/");
    expect(manager.snapshot().tabs[0]?.internalPage).toBeUndefined();

    const guestWebContents = { id: 99 };
    resolveWebContentsById.mockReturnValue(guestWebContents);
    manager.attachWebContents(internal.tabId, 99);
    expect(resolveWebContentsById).toHaveBeenCalledWith(99);
    expect(browserTabHarness.attach).toHaveBeenCalledWith(guestWebContents);
  });

  it("wires the shared browser session into browser data services", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const session = createBrowserSession();
    const manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36",
      { browserSession: session as never },
    );
    const services = browserDataServices(manager);
    const downloadWiring = services.downloads as unknown as { session: unknown };
    const importWiring = services.importer as unknown as {
      session: unknown;
      credentialStore: unknown;
    };

    expect(downloadWiring.session).toBe(session);
    expect(importWiring.session).toBe(session);
    expect(importWiring.credentialStore).toBe(services.credentials);
    expect(session.on).toHaveBeenCalledWith("will-download", expect.any(Function));

    const internal = await manager.openInternalPage("downloads");
    await manager.clearCookies(internal.tabId);
    await manager.clearCache(internal.tabId);

    expect(session.clearStorageData).toHaveBeenCalledWith({ storages: ["cookies"] });
    expect(session.clearCache).toHaveBeenCalledOnce();

    manager.dispose();
    expect(session.removeListener).toHaveBeenCalledWith("will-download", expect.any(Function));
  });

  it("forwards download updates and opaque-id actions through the download manager", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36",
      { browserSession: createBrowserSession() as never },
    );
    const downloads = browserDataServices(manager).downloads;
    if (!downloads) throw new Error("Expected the download manager");
    const download = {
      id: "download-1",
      filename: "report.pdf",
      url: "https://example.test/report.pdf",
      mimeType: "application/pdf",
      state: "progressing",
      receivedBytes: 10,
      totalBytes: 100,
      startTime: 1,
      canResume: true,
    } satisfies BrowserDownloadInfo;
    const list = vi.spyOn(downloads, "list").mockReturnValue([download]);
    const pause = vi.spyOn(downloads, "pause");
    const resume = vi.spyOn(downloads, "resume");
    const cancel = vi.spyOn(downloads, "cancel");
    const remove = vi.spyOn(downloads, "remove");
    const open = vi.spyOn(downloads, "open").mockResolvedValue(true);
    const reveal = vi.spyOn(downloads, "reveal").mockReturnValue(true);
    const events: unknown[] = [];
    manager.addEventListener((event) => events.push(event));
    const { onEvent } = (
      downloads as unknown as {
        options: { onEvent?(event: BrowserDownloadManagerEvent): void };
      }
    ).options;

    onEvent?.({ type: "updated", download });
    onEvent?.({ type: "removed", downloadId: download.id });

    expect(events).toContainEqual({ type: "download-updated", download });
    expect(events).toContainEqual({ type: "download-removed", downloadId: download.id });
    expect(list).not.toHaveBeenCalled();
    expect(manager.getDownloads()).toEqual([download]);

    await manager.downloadAction(download.id, "pause");
    await manager.downloadAction(download.id, "resume");
    await manager.downloadAction(download.id, "cancel");
    await manager.downloadAction(download.id, "remove");
    await manager.downloadAction(download.id, "open");
    await manager.downloadAction(download.id, "show-in-folder");

    expect(pause).toHaveBeenCalledWith(download.id);
    expect(resume).toHaveBeenCalledWith(download.id);
    expect(cancel).toHaveBeenCalledWith(download.id);
    expect(remove).toHaveBeenCalledWith(download.id);
    expect(open).toHaveBeenCalledWith(download.id);
    expect(reveal).toHaveBeenCalledWith(download.id);

    open.mockResolvedValueOnce(false);
    await expect(manager.downloadAction(download.id, "open")).rejects.toThrow(
      "Unable to open download",
    );
    reveal.mockReturnValueOnce(false);
    await expect(manager.downloadAction(download.id, "show-in-folder")).rejects.toThrow(
      "Unable to show download in folder",
    );
  });

  it("notifies credential consumers only after credential data changes", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36",
      { browserSession: createBrowserSession() as never },
    );
    const importer = browserDataServices(manager).importer;
    if (!importer) throw new Error("Expected the browser importer");
    const events: unknown[] = [];
    manager.addEventListener((event) => events.push(event));

    const credential = manager.upsertCredential({
      origin: "https://example.test",
      username: "alice",
      password: "secret",
    });
    manager.deleteCredential("missing");
    manager.deleteCredential(credential.id);
    const importData = vi
      .spyOn(importer, "importData")
      .mockResolvedValueOnce(emptyImportResult())
      .mockResolvedValueOnce({ ...emptyImportResult(), passwordsImported: 1 });
    await manager.importBrowserData({
      sourceId: "source-1",
      passwords: true,
      cookies: false,
      acknowledgeProtectedData: true,
    });
    await manager.importBrowserData({
      sourceId: "source-1",
      passwords: true,
      cookies: false,
      acknowledgeProtectedData: true,
    });

    expect(events.filter((event) => isCredentialsUpdatedEvent(event))).toHaveLength(3);
    expect(importData).toHaveBeenCalledTimes(2);
  });

  it("keeps automation active until every explicit session ends", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36",
    );
    const activity: boolean[] = [];
    manager.addEventListener((event) => {
      if (event.type === "automation-active") activity.push(event.active);
    });

    expect(manager.setAutomationSession("thread-1", true)).toBe(false);
    expect(manager.setAutomationSession("thread-2", true)).toBe(false);
    expect(manager.setAutomationSession("thread-1", false)).toBe(false);
    expect(activity).toEqual([true]);

    expect(manager.setAutomationSession("thread-2", false)).toBe(true);
    expect(activity).toEqual([true, false]);
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
