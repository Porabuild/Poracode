import { randomUUID } from "node:crypto";
import { BrowserWindow, shell } from "electron";
import type {
  BrowserEvent,
  BrowserState,
  BrowserStartPickerResult,
  BrowserTabInfo,
} from "@/shared/ipc";
import type { UsageLoginConfirmationAction, UsageLoginDeviceCode } from "@/shared/contracts";
import type { LightcodePaths } from "@/shared/lightcodePaths";
import type { BrowserLinkOpenTarget, BrowserLinkPresentationMode } from "@/shared/settings";
import { dbGetState, dbSetState } from "../db";
import { readSharedSettingsFile } from "../sharedSettingsFile";
import { saveClipboardImageFile } from "../attachments/localFiles";
import { IPC_EVENT_CHANNELS } from "@/shared/ipc";
import { BrowserLoginCaptureCoordinator } from "./BrowserLoginCaptureCoordinator";
import { BrowserTab, resolveWebContentsById } from "./BrowserTab";
import { BrowserHistoryStore, fetchSearchSuggestions } from "./browserHistory";
import { BrowserBookmarkStore, type BrowserBookmark } from "./browserBookmarks";
import { PICKER_COMMIT_ORIGIN, onPickerCommit } from "./picker/pickerProtocol";
import { buildPickerScript } from "./picker/pickerScript";

const PERSIST_KEY = "browser-panel-tabs-v1";
const PERSIST_DEBOUNCE_MS = 750;
const ATTACH_TIMEOUT_MS = 8000;
const INTERNAL_BROWSER_PROTOCOLS = new Set(["http:", "https:"]);
const SYSTEM_BROWSER_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

interface PersistedTabsState {
  tabs: Array<{ url: string; title: string }>;
  activeIndex: number | null;
}

interface PendingPicker {
  threadId: string;
  tabId: string;
  resolve(result: BrowserStartPickerResult): void;
}

type PickerPayload =
  | { kind: "cancelled" }
  | {
      kind: "picked";
      selector: string;
      rect: { x: number; y: number; width: number; height: number };
      dpr: number;
      url: string;
      title: string;
    };

interface BrowserPanelManagerOptions {
  isExtracted?: () => boolean;
  focusExtractedWindow?: () => void;
}

export class BrowserPanelManager {
  private tabs: BrowserTab[] = [];
  private activeTabId: string | null = null;
  private hosts = new Set<BrowserWindow>();
  /** Out-of-window observers (remote access gateway) fed the same events as
   * the renderer; the renderer stays the only consumer of host-window IPC. */
  private readonly eventListeners = new Set<(event: BrowserEvent) => void>();
  private pendingPicker: PendingPicker | null = null;
  private unsubscribePicker: (() => void) | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly history = new BrowserHistoryStore();
  private readonly bookmarks = new BrowserBookmarkStore();
  private restored = false;
  private pickerKeyCleanup: (() => void) | null = null;
  private readonly loginCoordinator = new BrowserLoginCaptureCoordinator({
    createTab: (payload) => this.createTab(payload),
    closeTab: (tabId) => this.closeTab(tabId),
    findTab: (tabId) => this.findTab(tabId),
    emit: (event) => this.emit(event),
    hasHostWindow: () => this.hasHostWindow(),
  });

  constructor(
    private readonly paths: LightcodePaths,
    private readonly browserUserAgent: string,
    private readonly options: BrowserPanelManagerOptions = {},
  ) {
    this.unsubscribePicker = onPickerCommit((commit) => this.onPickerCommit(commit));
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      try {
        const state: PersistedTabsState = {
          tabs: this.tabs.map((t) => {
            const s = t.snapshot();
            return { url: s.url, title: s.title };
          }),
          activeIndex: this.activeTabId
            ? this.tabs.findIndex((t) => t.tabId === this.activeTabId)
            : null,
        };
        dbSetState(PERSIST_KEY, JSON.stringify(state));
      } catch {}
    }, PERSIST_DEBOUNCE_MS);
  }

  private async restoreFromDisk(): Promise<void> {
    if (this.restored) return;
    this.restored = true;
    let parsed: PersistedTabsState | null = null;
    try {
      const raw = dbGetState(PERSIST_KEY);
      if (!raw) return;
      const candidate = JSON.parse(raw) as PersistedTabsState;
      if (!candidate || !Array.isArray(candidate.tabs)) return;
      parsed = candidate;
    } catch {
      return;
    }
    if (!parsed || parsed.tabs.length === 0) return;
    for (let i = 0; i < parsed.tabs.length; i++) {
      const entry = parsed.tabs[i];
      if (!entry || typeof entry.url !== "string" || entry.url.length === 0) continue;
      const isActive = parsed.activeIndex === i;
      await this.createTab({ url: entry.url, activate: isActive }).catch(() => {});
    }
  }

  bindHost(window: BrowserWindow): void {
    this.hosts.add(window);
    const onBeforeInputEvent = (event: Electron.Event, input: Electron.Input) => {
      if (!this.pendingPicker || !isEscapeKeyDown(input)) return;
      event.preventDefault();
      this.cancelPicker();
    };
    window.webContents.on("before-input-event", onBeforeInputEvent);
    window.once("closed", () => {
      this.hosts.delete(window);
      try {
        window.webContents.removeListener("before-input-event", onBeforeInputEvent);
      } catch {}
    });
    void this.restoreFromDisk();
    this.emitState();
  }

  dispose(): void {
    this.unsubscribePicker?.();
    this.unsubscribePicker = null;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.clearPickerShortcut();
    this.loginCoordinator.cancelLoginConfirmations();
    for (const t of this.tabs) {
      void t.destroy();
    }
    this.tabs = [];
    this.activeTabId = null;
    this.hosts.clear();
  }

  private clearPickerShortcut(): void {
    this.pickerKeyCleanup?.();
    this.pickerKeyCleanup = null;
  }

  private bindPickerShortcut(tab: BrowserTab): void {
    this.clearPickerShortcut();
    if (!tab.isAttached()) return;
    const wc = tab.webContents;
    const onBeforeInputEvent = (event: Electron.Event, input: Electron.Input) => {
      if (this.pendingPicker?.tabId !== tab.tabId || !isEscapeKeyDown(input)) return;
      event.preventDefault();
      this.cancelPicker();
    };
    wc.on("before-input-event", onBeforeInputEvent);
    this.pickerKeyCleanup = () => {
      if (tab.isDestroyed() || !tab.isAttached()) return;
      try {
        wc.removeListener("before-input-event", onBeforeInputEvent);
      } catch {}
    };
  }

  private emit(event: BrowserEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {}
    }
    for (const host of this.hosts) {
      if (host.isDestroyed()) {
        this.hosts.delete(host);
        continue;
      }
      try {
        host.webContents.send(IPC_EVENT_CHANNELS.browserEvent, event);
      } catch {}
    }
  }

  addEventListener(listener: (event: BrowserEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  private emitState(): void {
    this.emit({ type: "state", state: this.snapshot() });
  }

  notifyState(): void {
    this.emitState();
  }

  revealPanel(): void {
    if (this.options.isExtracted?.()) {
      this.options.focusExtractedWindow?.();
      return;
    }
    this.emit({ type: "open-panel" });
  }

  private hasHostWindow(): boolean {
    for (const host of this.hosts) {
      if (!host.isDestroyed()) return true;
    }
    return false;
  }

  private readLinkSettings(): {
    linkOpenTarget: BrowserLinkOpenTarget;
    linkPresentationMode: BrowserLinkPresentationMode;
  } {
    try {
      const browser = readSharedSettingsFile(this.paths.settingsPath).browser;
      return {
        linkOpenTarget: browser.linkOpenTarget,
        linkPresentationMode: browser.linkPresentationMode,
      };
    } catch {
      return { linkOpenTarget: "internal", linkPresentationMode: "panel" };
    }
  }

  private async openSystemBrowser(rawUrl: string): Promise<boolean> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return false;
    }
    if (!SYSTEM_BROWSER_PROTOCOLS.has(url.protocol)) return false;
    await shell.openExternal(url.toString());
    return true;
  }

  async openLink(rawUrl: string): Promise<boolean> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return false;
    }

    const settings = this.readLinkSettings();
    if (settings.linkOpenTarget === "system" || !INTERNAL_BROWSER_PROTOCOLS.has(url.protocol)) {
      return this.openSystemBrowser(url.toString());
    }

    if (this.options.isExtracted?.()) {
      this.options.focusExtractedWindow?.();
    } else {
      this.emit({ type: "open-panel", mode: settings.linkPresentationMode });
    }
    void this.createTab({ url: url.toString(), activate: true }).catch(() => {});
    return true;
  }

  private toInfo(t: BrowserTab): BrowserTabInfo {
    const s = t.snapshot();
    return {
      tabId: s.tabId,
      url: s.url,
      title: s.title,
      loading: s.loading,
      canGoBack: s.canGoBack,
      canGoForward: s.canGoForward,
      devToolsOpen: s.devToolsOpen,
      ...(s.faviconUrl ? { faviconUrl: s.faviconUrl } : {}),
    };
  }

  snapshot(): BrowserState {
    return {
      tabs: this.tabs.map((t) => this.toInfo(t)),
      activeTabId: this.activeTabId,
      extracted: this.options.isExtracted?.() === true,
      bookmarks: this.bookmarks.list(),
      bookmarkBarVisible: this.bookmarks.isBarVisible(),
    };
  }

  addBookmark(bookmark: BrowserBookmark): void {
    this.bookmarks.add(bookmark);
    this.emitState();
  }

  removeBookmark(url: string): void {
    this.bookmarks.remove(url);
    this.emitState();
  }

  setBookmarkBarVisible(visible: boolean): void {
    this.bookmarks.setBarVisible(visible);
    this.emitState();
  }

  private findTab(tabId: string): BrowserTab | undefined {
    return this.tabs.find((t) => t.tabId === tabId);
  }

  attachWebContents(tabId: string, webContentsId: number): void {
    const tab = this.findTab(tabId);
    if (!tab) return;
    // Reject a host window's own WebContents by id first, before resolving it.
    for (const host of this.hosts) {
      if (host.webContents.id === webContentsId) return;
    }
    const wc = resolveWebContentsById(webContentsId);
    if (!wc) return;
    for (const host of this.hosts) {
      if (host.webContents === wc) return;
    }
    tab.attach(wc);
  }

  async createTab(payload: { url?: string; activate?: boolean }): Promise<BrowserTabInfo> {
    const tabId = `tab-${randomUUID()}`;
    const tab = new BrowserTab({
      tabId,
      ...(payload.url ? { initialUrl: payload.url } : {}),
      userAgent: this.browserUserAgent,
      onUpdate: (snap) => {
        this.emit({ type: "tab-updated", tab: { ...snap } });
        if (!snap.loading) this.history.record(snap.url, snap.title, Date.now());
        this.schedulePersist();
      },
      onAttention: (id) => {
        this.emit({ type: "tab-attention", tabId: id });
      },
      onPopup: (_sourceTabId, popupUrl) => {
        void this.openLink(popupUrl).catch(() => {});
      },
    });
    this.tabs.push(tab);
    const shouldActivate = payload.activate !== false;
    if (shouldActivate || this.activeTabId === null) {
      this.activeTabId = tabId;
    }
    this.emitState();
    this.schedulePersist();
    // Wait for the renderer to mount the <webview> and attach its webContents
    // so callers (e.g. MCP) can immediately use cdp / dialogs / network.
    await Promise.race([
      tab.whenAttached(),
      new Promise<void>((resolve) => setTimeout(resolve, ATTACH_TIMEOUT_MS)),
    ]);
    return this.toInfo(tab);
  }

  setActiveTab(tabId: string): void {
    if (!this.findTab(tabId)) return;
    if (this.activeTabId === tabId) return;
    this.activeTabId = tabId;
    this.emitState();
    this.schedulePersist();
  }

  moveTab(tabId: string, targetTabId: string, position: "before" | "after"): void {
    if (tabId === targetTabId) return;
    const from = this.tabs.findIndex((t) => t.tabId === tabId);
    const target = this.tabs.findIndex((t) => t.tabId === targetTabId);
    if (from < 0 || target < 0) return;
    const [tab] = this.tabs.splice(from, 1);
    if (!tab) return;
    let to = this.tabs.findIndex((t) => t.tabId === targetTabId);
    if (to < 0) {
      this.tabs.splice(from, 0, tab);
      return;
    }
    if (position === "after") to += 1;
    this.tabs.splice(to, 0, tab);
    this.emitState();
    this.schedulePersist();
  }

  async closeTab(tabId: string): Promise<void> {
    const idx = this.tabs.findIndex((t) => t.tabId === tabId);
    if (idx < 0) return;
    const [tab] = this.tabs.splice(idx, 1);
    if (!tab) return;
    await tab.destroy();
    if (this.activeTabId === tabId) {
      const next = this.tabs[idx] ?? this.tabs[idx - 1] ?? this.tabs[0];
      this.activeTabId = next?.tabId ?? null;
    }
    this.emitState();
    this.schedulePersist();
  }

  async navigate(tabId: string, url: string): Promise<void> {
    const t = this.findTab(tabId);
    if (!t) throw new Error(`No browser tab: ${tabId}`);
    await t.loadURL(url);
  }

  async back(tabId: string): Promise<void> {
    const t = this.findTab(tabId);
    if (!t || !t.isAttached()) return;
    const wc = t.webContents;
    if (wc.navigationHistory.canGoBack()) {
      wc.navigationHistory.goBack();
    }
  }

  async forward(tabId: string): Promise<void> {
    const t = this.findTab(tabId);
    if (!t || !t.isAttached()) return;
    const wc = t.webContents;
    if (wc.navigationHistory.canGoForward()) {
      wc.navigationHistory.goForward();
    }
  }

  async reload(tabId: string): Promise<void> {
    const t = this.findTab(tabId);
    if (!t || !t.isAttached()) return;
    t.webContents.reload();
  }

  async hardReload(tabId: string): Promise<void> {
    const t = this.findTab(tabId);
    if (!t) return;
    t.hardReload();
  }

  async toggleDevTools(tabId: string): Promise<void> {
    const t = this.findTab(tabId);
    if (!t) return;
    t.toggleDevTools();
  }

  async clearHistory(tabId: string): Promise<void> {
    this.history.clear();
    const t = this.findTab(tabId);
    if (!t) return;
    t.clearHistory();
  }

  async suggest(query: string): Promise<{
    history: Array<{ url: string; title: string }>;
    suggestions: string[];
  }> {
    const history = this.history.query(query, 6).map((e) => ({ url: e.url, title: e.title }));
    const suggestions = await fetchSearchSuggestions(query, this.browserUserAgent);
    return { history, suggestions };
  }

  recentHistory(limit: number): Array<{ url: string; title: string }> {
    return this.history.recent(limit).map((e) => ({ url: e.url, title: e.title }));
  }

  async clearCookies(tabId: string): Promise<void> {
    const t = this.findTab(tabId);
    if (!t) return;
    await t.clearCookies();
  }

  async clearCache(tabId: string): Promise<void> {
    const t = this.findTab(tabId);
    if (!t) return;
    await t.clearCache();
  }

  async capturePng(tabId: string): Promise<Buffer | null> {
    const t = this.findTab(tabId);
    if (!t || !t.isAttached()) return null;
    return await t.capturePng();
  }

  /**
   * Browser-login capture (cookie/device-code flows) lives in
   * {@link BrowserLoginCaptureCoordinator}; these thin delegates keep the public
   * API stable for `UsageLoginManager` and the IPC layer.
   */
  captureLoginCookies(opts: {
    loginUrl: string;
    cookieUrl: string;
    authCookiePattern: RegExp;
    timeoutMs: number;
    providerLabel?: string;
    validateSession?: (cookieHeader: string) => Promise<boolean>;
  }): Promise<{ ok: boolean; cookie?: string; cancelled?: boolean; error?: string }> {
    return this.loginCoordinator.captureLoginCookies(opts);
  }

  captureLoginLocalStorage(opts: {
    loginUrl: string;
    keys: string[];
    requiredKey: string;
    timeoutMs: number;
    providerLabel?: string;
  }): Promise<{
    ok: boolean;
    values?: Record<string, string>;
    cancelled?: boolean;
    error?: string;
  }> {
    return this.loginCoordinator.captureLoginLocalStorage(opts);
  }

  resolveUsageLoginConfirmation(payload: {
    requestId: string;
    action: UsageLoginConfirmationAction;
  }): void {
    this.loginCoordinator.resolveUsageLoginConfirmation(payload);
  }

  showUsageLoginDeviceCode(deviceCode: UsageLoginDeviceCode): void {
    this.loginCoordinator.showUsageLoginDeviceCode(deviceCode);
  }

  clearUsageLoginDeviceCode(providerId: string): void {
    this.loginCoordinator.clearUsageLoginDeviceCode(providerId);
  }

  clearLoginCookies(opts: { cookieUrl: string; authCookiePattern: RegExp }): Promise<void> {
    return this.loginCoordinator.clearLoginCookies(opts);
  }

  /** Cancel an in-flight `captureLoginCookies` (e.g. user closed the overlay). */
  cancelLoginCapture(): void {
    this.loginCoordinator.cancelLoginCapture();
  }

  getActiveTab(): BrowserTab | null {
    return this.activeTabId ? (this.findTab(this.activeTabId) ?? null) : null;
  }

  getTab(tabId: string): BrowserTab | null {
    return this.findTab(tabId) ?? null;
  }

  async startPicker(payload: {
    threadId: string;
    tabId: string;
  }): Promise<BrowserStartPickerResult> {
    const tab = this.findTab(payload.tabId);
    if (!tab) {
      return { ok: false, error: `No browser tab: ${payload.tabId}` };
    }
    if (!tab.isAttached()) {
      return { ok: false, error: `Browser tab ${payload.tabId} is not ready` };
    }
    if (this.pendingPicker) {
      return { ok: false, error: "Picker already active" };
    }
    return await new Promise<BrowserStartPickerResult>((resolve) => {
      this.pendingPicker = { threadId: payload.threadId, tabId: payload.tabId, resolve };
      this.bindPickerShortcut(tab);
      const wc = tab.webContents;
      // Only focus if not already focused — `webContents.focus()` can shift
      // focus onto the currently-focused element of the page, which Chromium
      // may scroll into view, producing a visible page jump the moment the
      // picker starts.
      if (!wc.isFocused()) wc.focus();
      const script = buildPickerScript(payload.tabId, PICKER_COMMIT_ORIGIN);
      wc.executeJavaScript(script, false)
        .then((pickerPayload: unknown) => {
          if (!isPickerPayload(pickerPayload)) return;
          void this.onPickerCommit({ tabId: payload.tabId, payload: pickerPayload });
        })
        .catch((err) => {
          if (this.pendingPicker && this.pendingPicker.tabId === payload.tabId) {
            this.clearPickerShortcut();
            this.pendingPicker = null;
            resolve({ ok: false, error: (err as Error).message ?? "Picker injection failed" });
          }
        });
    });
  }

  cancelPicker(): void {
    if (!this.pendingPicker) return;
    const active = this.findTab(this.pendingPicker.tabId);
    if (active && active.isAttached()) {
      active.webContents
        .executeJavaScript(
          `(() => { window.dispatchEvent(new CustomEvent("__lightcode_picker_cancel")); })()`,
          false,
        )
        .catch(() => {});
    }
    this.clearPickerShortcut();
    this.pendingPicker.resolve({ ok: true, cancelled: true });
    this.pendingPicker = null;
    this.emit({ type: "picker-cancelled" });
  }

  private async onPickerCommit(commit: { tabId: string; payload: PickerPayload }): Promise<void> {
    const pending = this.pendingPicker;
    if (!pending || pending.tabId !== commit.tabId) return;
    this.clearPickerShortcut();
    this.pendingPicker = null;

    if (commit.payload.kind === "cancelled") {
      pending.resolve({ ok: true, cancelled: true });
      this.emit({ type: "picker-cancelled" });
      return;
    }

    try {
      const result = await this.captureElement(pending.threadId, commit.tabId, {
        selector: commit.payload.selector,
        rect: commit.payload.rect,
        url: commit.payload.url,
        title: commit.payload.title,
      });
      pending.resolve(result);
    } catch (err) {
      pending.resolve({ ok: false, error: (err as Error).message ?? "Capture failed" });
    }
  }

  private async captureElement(
    threadId: string,
    tabId: string,
    pick: {
      selector: string;
      rect: { x: number; y: number; width: number; height: number };
      url: string;
      title: string;
    },
  ): Promise<BrowserStartPickerResult> {
    const tab = this.findTab(tabId);
    if (!tab || !tab.isAttached()) return { ok: false, error: `No browser tab: ${tabId}` };
    const wc = tab.webContents;

    // The user clicked the element in the picker, so it's already inside the
    // viewport. Capture from the renderer's painted bitmap via
    // `webContents.capturePage` — no scrolling, no CDP off-surface path, and
    // no visible flicker. `pick.rect` is viewport-relative as captured by the
    // picker script.
    const rect = pick.rect;
    const clip = {
      x: Math.max(0, Math.floor(rect.x)),
      y: Math.max(0, Math.floor(rect.y)),
      width: Math.max(1, Math.ceil(rect.width)),
      height: Math.max(1, Math.ceil(rect.height)),
    };
    const img = await wc.capturePage(clip);
    const bytes = img.toPNG();

    const path = saveClipboardImageFile(this.paths, {
      threadId,
      data: new Uint8Array(bytes),
      extension: "png",
    });
    const baseName = path.split(/[\\/]/).pop() ?? "Selection.png";
    return {
      ok: true,
      attachmentPath: path,
      attachmentName: baseName,
      mimeType: "image/png",
      selector: pick.selector,
      sourceUrl: pick.url,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  }
}

function isEscapeKeyDown(input: Electron.Input): boolean {
  if (input.type !== "keyDown") return false;
  return input.key === "Escape" || input.key === "Esc" || input.code === "Escape";
}

function isPickerPayload(value: unknown): value is PickerPayload {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: unknown }).kind;
  if (kind === "cancelled") return true;
  if (kind !== "picked") return false;
  const payload = value as { selector?: unknown; rect?: unknown; url?: unknown; title?: unknown };
  return (
    typeof payload.selector === "string" &&
    typeof payload.url === "string" &&
    typeof payload.title === "string" &&
    typeof payload.rect === "object" &&
    payload.rect !== null
  );
}
