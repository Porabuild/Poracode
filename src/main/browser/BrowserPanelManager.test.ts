import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_EVENT_CHANNELS } from "@/shared/ipc";
import type {
  BrowserDownloadInfo,
  BrowserImportResult,
  BrowserStartPickerResult,
  BrowserTabGroupInfo,
} from "@/shared/ipc";
import type { BrowserCredentialStore } from "./BrowserCredentialStore";
import type { BrowserDownloadManager, BrowserDownloadManagerEvent } from "./BrowserDownloadManager";
import type { ChromiumImportService } from "./ChromiumImportService";

const resolveWebContentsById = vi.hoisted(() => vi.fn<(id: number) => unknown>());
const stateStore = { get: () => null, set: () => {} };
const browserTabHarness = vi.hoisted(() => ({
  attach: vi.fn<(webContents: unknown) => void>(),
  whenAttached: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  loadURL: vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock("electron", () => ({
  BrowserWindow: class BrowserWindow {},
  shell: { openExternal: vi.fn<(url: string) => Promise<void>>() },
}));

vi.mock("@/host/db", () => ({
  dbGetState: vi.fn<(key: string) => string | null>(),
  dbSetState: vi.fn<(key: string, value: string) => void>(),
}));

vi.mock("@/host/sharedSettingsFile", () => ({
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
      await browserTabHarness.loadURL(url);
      if (url.startsWith("javascript:")) throw new Error("Navigation blocked");
      if (this.url === url) return;
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
  importer: ChromiumImportService | null;
} {
  return manager as {
    credentials: BrowserCredentialStore;
    downloads: BrowserDownloadManager | null;
    importer: ChromiumImportService | null;
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

  it.each(["picked", "rejected"] as const)(
    "ignores an old %s reply after a replacement picker starts on the same tab",
    async (reply) => {
      const { BrowserPanelManager } = await import("./BrowserPanelManager");
      const manager = new BrowserPanelManager(
        { settingsPath: "settings.json" } as never,
        "Mozilla/5.0",
        stateStore,
      );
      const originalInjection = Promise.withResolvers<unknown>();
      const replacementInjection = Promise.withResolvers<unknown>();
      const contents = {
        on: vi.fn<() => void>(),
        removeListener: vi.fn<() => void>(),
        isDestroyed: () => false,
        isFocused: () => true,
        executeJavaScript: vi
          .fn<() => Promise<unknown>>()
          .mockResolvedValue(undefined)
          .mockReturnValueOnce(originalInjection.promise)
          .mockResolvedValueOnce(undefined)
          .mockReturnValueOnce(replacementInjection.promise),
      };
      const tab = {
        ...createFakeTab("tab-1"),
        webContents: contents,
        isAttached: () => true,
        isDestroyed: () => false,
        captureElementPng: vi.fn<() => Promise<Buffer>>(),
        destroy: async () => {},
      };
      (manager as unknown as { tabs: (typeof tab)[] }).tabs = [tab];
      try {
        const original = manager.startPicker({ threadId: "original-thread", tabId: "tab-1" });
        manager.cancelPicker();
        await expect(original).resolves.toEqual({ ok: true, cancelled: true });
        const replacement = manager.startPicker({ threadId: "replacement-thread", tabId: "tab-1" });
        const settled = vi.fn<(result: BrowserStartPickerResult) => void>();
        void replacement.then(settled);

        if (reply === "picked") {
          originalInjection.resolve({
            kind: "picked",
            selector: "#old-target",
            rect: { x: 100, y: 200, width: 80, height: 40 },
            dpr: 1,
            url: "https://old.test/",
            title: "Old selection",
          });
        } else {
          originalInjection.reject(new Error("Old injection failed"));
        }
        await originalInjection.promise.catch(() => {});
        await Promise.resolve();
        await Promise.resolve();
        expect(settled).not.toHaveBeenCalled();
        expect(tab.captureElementPng).not.toHaveBeenCalled();

        replacementInjection.resolve({ kind: "cancelled" });
        await expect(replacement).resolves.toEqual({ ok: true, cancelled: true });
      } finally {
        manager.dispose();
      }
    },
  );

  it("rejects the host window WebContents as a browser tab target", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36",
      stateStore,
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
      stateStore,
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

  it.each([false, true])(
    "publishes and selects a linked tab before revealing the browser (restored: %s)",
    async (restored) => {
      const { BrowserPanelManager } = await import("./BrowserPanelManager");
      const saved = {
        tabs: [{ url: "https://duckduckgo.com/", title: "DuckDuckGo" }],
        activeIndex: 0,
      };
      const manager = new BrowserPanelManager(
        { settingsPath: "settings.json" } as never,
        "Mozilla/5.0",
        {
          get: (key: string) =>
            restored && key === "browser-panel-tabs-v1" ? JSON.stringify(saved) : null,
          set: () => {},
        },
      );
      try {
        const { host } = createManagerWithTab();
        manager.bindHost(host as never);
        await vi.waitFor(() => expect(manager.snapshot().tabs).toHaveLength(restored ? 1 : 0));
        let latestState = manager.snapshot();
        const revealedStates: (typeof latestState)[] = [];
        manager.addEventListener((event) => {
          if (event.type === "state") latestState = event.state;
          if (event.type === "open-panel") revealedStates.push(latestState);
        });

        await expect(manager.openLink("https://example.com/linked-page")).resolves.toBe(true);

        expect(revealedStates).toHaveLength(1);
        const revealed = revealedStates[0]!;
        expect(revealed.tabs).toHaveLength(restored ? 2 : 1);
        expect(revealed.tabs.find((tab) => tab.tabId === revealed.activeTabId)?.url).toBe(
          "https://example.com/linked-page",
        );
      } finally {
        manager.dispose();
      }
    },
  );

  it("opens app-owned download history once and reuses the existing tab", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36",
      stateStore,
    );
    const first = await manager.openInternalPage("downloads");
    const second = await manager.openInternalPage("downloads");

    expect(first).toMatchObject({
      url: "poracode://downloads",
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
      stateStore,
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

  it("publishes a same-URL return from an internal page after a blocked attempt", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0",
      stateStore,
    );
    const tab = await manager.createTab({ url: "https://example.com/" }, { awaitAttach: false });
    const states: ReturnType<typeof manager.snapshot>[] = [];
    manager.addEventListener((event) => {
      if (event.type === "state") states.push(event.state);
    });
    await manager.navigate(tab.tabId, "poracode://passwords");
    await expect(manager.navigate(tab.tabId, "javascript:alert(1)")).rejects.toThrow(
      "Navigation blocked",
    );
    expect(manager.snapshot().tabs[0]?.internalPage).toBe("passwords");
    await manager.navigate(tab.tabId, "https://example.com/");
    expect(states.at(-1)?.tabs[0]?.internalPage).toBeUndefined();
    expect(states.at(-1)?.tabs[0]?.url).toBe("https://example.com/");
    expect(states).toHaveLength(3);
  });

  it.each([false, true])(
    "does not restore an older page after navigation or close: %s",
    async (close) => {
      const { BrowserPanelManager } = await import("./BrowserPanelManager");
      const manager = new BrowserPanelManager(
        { settingsPath: "settings.json" } as never,
        "Mozilla/5.0",
        stateStore,
      );
      const tab = await manager.createTab({ url: "https://example.com/" }, { awaitAttach: false });
      await manager.navigate(tab.tabId, "poracode://passwords");
      const navigation = Promise.withResolvers<void>();
      browserTabHarness.loadURL.mockReturnValueOnce(navigation.promise);
      const older = manager.navigate(tab.tabId, "https://other.test/");
      if (close) await manager.closeTab(tab.tabId);
      else await manager.navigate(tab.tabId, "poracode://downloads");
      navigation.reject(new Error("ERR_ABORTED"));
      await expect(older).rejects.toThrow("ERR_ABORTED");
      expect(manager.snapshot().tabs.map((entry) => entry.internalPage)).toEqual(
        close ? [] : ["downloads"],
      );
      expect(
        (manager as unknown as { internalPages: Map<string, unknown> }).internalPages.get(
          tab.tabId,
        ),
      ).toBe(close ? undefined : "downloads");
    },
  );

  it.each([
    ["poracode://downloads", "downloads"],
    ["poracode://downloads/", "downloads"],
    ["poracode://passwords", "passwords"],
    ["poracode://passwords/", "passwords"],
  ] as const)("opens %s without a native webview", async (url, page) => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0",
      stateStore,
    );
    const tab = await manager.createTab({ url, activate: true });

    expect(tab).toMatchObject({ url: `poracode://${page}`, internalPage: page });
    expect(browserTabHarness.whenAttached).not.toHaveBeenCalled();
    expect(manager.getTab(tab.tabId)).toBeNull();
    manager.dispose();
  });

  it("restores legacy Chrome internal addresses and persists canonical Poracode addresses", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const saved = {
      tabs: [
        { url: "chrome://downloads/", title: "Download history" },
        { url: "chrome://password-manager/passwords", title: "Password Manager" },
      ],
      activeIndex: 1,
    };
    const store = {
      get: (key: string) => (key === "browser-panel-tabs-v1" ? JSON.stringify(saved) : null),
      set: vi.fn<(key: string, value: string) => void>(),
    };
    const manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0",
      store,
    );
    const { host } = createManagerWithTab();
    vi.useFakeTimers();
    try {
      manager.bindHost(host as never);
      await vi.waitFor(() => expect(manager.snapshot().tabs).toHaveLength(2));
      const state = manager.snapshot();
      expect(state.tabs.map((tab) => [tab.url, tab.internalPage])).toEqual([
        ["poracode://downloads", "downloads"],
        ["poracode://passwords", "passwords"],
      ]);
      expect(state.activeTabId).toBe(state.tabs[1]?.tabId);
      expect(browserTabHarness.whenAttached).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(750);
      const persisted = JSON.parse(store.set.mock.calls.at(-1)![1]) as typeof saved;
      expect(persisted.tabs.map((tab) => tab.url)).toEqual([
        "poracode://downloads",
        "poracode://passwords",
      ]);
    } finally {
      manager.dispose();
      vi.useRealTimers();
    }
  });

  it("wires the shared browser session into browser data services", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const session = createBrowserSession();
    const manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36",
      stateStore,
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
      stateStore,
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
      stateStore,
      { browserSession: createBrowserSession() as never },
    );
    const importer = browserDataServices(manager).importer;
    if (!importer) throw new Error("Expected the browser importer");
    const events: unknown[] = [];
    manager.addEventListener((event) => events.push(event));

    const credential = await manager.upsertCredential({
      origin: "https://example.test",
      username: "alice",
      password: "secret",
    });
    await manager.deleteCredential("missing");
    await manager.deleteCredential(credential.id);
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
      stateStore,
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

  it("creates a host window when automation starts without one", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const ensureHostWindow = vi.fn<() => void>();
    const manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36",
      stateStore,
      { ensureHostWindow },
    );
    try {
      manager.setAutomationSession("thread-1", true);
      expect(ensureHostWindow).toHaveBeenCalledTimes(1);

      const { host } = createManagerWithTab();
      manager.bindHost(host as never);
      manager.markAutomationActivity();
      expect(ensureHostWindow).toHaveBeenCalledTimes(1);
    } finally {
      manager.dispose();
    }
  });

  it("replays live automation to a host renderer's initial sync", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36",
      stateStore,
    );
    try {
      const { host, hostWebContents } = createManagerWithTab();
      manager.bindHost(host as never);
      const activity: boolean[] = [];
      manager.addEventListener((event) => {
        if (event.type === "automation-active") activity.push(event.active);
      });

      expect(manager.snapshotForHost()).toEqual(manager.snapshot());
      expect(activity).toEqual([]);
      expect(hostWebContents.send).not.toHaveBeenCalledWith(IPC_EVENT_CHANNELS.browserEvent, {
        type: "automation-active",
        active: true,
      });

      manager.setAutomationSession("thread-1", true);
      expect(activity).toEqual([true]);
      hostWebContents.send.mockClear();

      manager.snapshotForHost();
      expect(activity).toEqual([true, true]);
      expect(hostWebContents.send).toHaveBeenCalledWith(IPC_EVENT_CHANNELS.browserEvent, {
        type: "automation-active",
        active: true,
      });
    } finally {
      manager.dispose();
    }
  });

  it("keeps the automation tab active when its host window's first bind restores tabs", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const saved = {
      tabs: [
        { url: "https://a.test/", title: "A" },
        { url: "https://b.test/", title: "B" },
      ],
      activeIndex: 1,
    };
    const store = {
      get: (key: string) => (key === "browser-panel-tabs-v1" ? JSON.stringify(saved) : null),
      set: vi.fn<(key: string, value: string) => void>(),
    };
    const { host } = createManagerWithTab();
    let manager: InstanceType<typeof BrowserPanelManager>;
    manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0",
      store,
      { ensureHostWindow: () => manager.bindHost(host as never) },
    );
    try {
      const info = await manager.createTab({ activate: true }, { agent: true, awaitAttach: false });
      await vi.waitFor(() => expect(manager.snapshot().tabs).toHaveLength(3));
      const state = manager.snapshot();
      expect(state.activeTabId).toBe(info.tabId);
      expect(state.tabs.map((tab) => tab.url)).toEqual(
        expect.arrayContaining(["https://a.test/", "https://b.test/"]),
      );
    } finally {
      manager.dispose();
    }
  });

  it("moves ungrouped tabs into the target tab's group", async () => {
    const { BrowserPanelManager } = await import("./BrowserPanelManager");
    const manager = new BrowserPanelManager(
      { settingsPath: "settings.json" } as never,
      "Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36",
      stateStore,
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
      stateStore,
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
