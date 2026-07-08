import { webContents as webContentsModule, type WebContents } from "electron";
import { CdpClient } from "./cdp/cdpClient";
import { DialogController } from "./cdp/dialogController";
import { NetworkCapture } from "./cdp/networkCapture";
import {
  installNavigationGuards,
  installSessionPermissions,
  isNavigationUrlAllowed,
} from "./permissions";

export interface BrowserTabSnapshot {
  tabId: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  devToolsOpen: boolean;
  faviconUrl?: string;
}

export interface BrowserTabOptions {
  tabId: string;
  initialUrl?: string;
  userAgent: string;
  onUpdate(snapshot: BrowserTabSnapshot): void;
  onAttention(tabId: string): void;
  onPopup(tabId: string, url: string): void;
}

export interface ConsoleEntry {
  ts: number;
  level: "log" | "warn" | "error" | "info" | "debug" | "exception";
  text: string;
  source?: string;
  line?: number;
}

const CONSOLE_BUFFER_SIZE = 200;

export class BrowserTab {
  readonly tabId: string;
  readonly network: NetworkCapture;
  readonly dialogs: DialogController;
  private _webContents: WebContents | null = null;
  private _cdp: CdpClient | null = null;
  private currentUrl: string;
  private currentTitle: string;
  private faviconUrl: string | undefined;
  private loading = false;
  private destroyed = false;
  private console: ConsoleEntry[] = [];
  private initScriptIds = new Set<string>();
  private lastEmittedSnapshot: BrowserTabSnapshot | null = null;
  private clearInitialHistoryOnLoad = false;
  private clearInitialHistoryTimer: ReturnType<typeof setTimeout> | null = null;
  private devToolsVisible = false;
  private wcCleanups: Array<() => void> = [];
  private attachedPromise: Promise<void>;
  private resolveAttached: (() => void) | null = null;

  constructor(private readonly opts: BrowserTabOptions) {
    this.tabId = opts.tabId;
    this.network = new NetworkCapture();
    this.dialogs = new DialogController();
    this.currentUrl = opts.initialUrl ?? "about:blank";
    this.currentTitle = "";
    if (opts.initialUrl) {
      this.clearInitialHistoryOnLoad = true;
    }
    this.attachedPromise = new Promise<void>((resolve) => {
      this.resolveAttached = resolve;
    });
  }

  get webContents(): WebContents {
    if (!this._webContents || this._webContents.isDestroyed()) {
      throw new Error(`Browser tab ${this.tabId} has no attached webContents`);
    }
    return this._webContents;
  }

  get cdp(): CdpClient {
    if (!this._cdp) {
      throw new Error(`Browser tab ${this.tabId} has no attached CDP client`);
    }
    return this._cdp;
  }

  isAttached(): boolean {
    return this._webContents !== null && !this._webContents.isDestroyed();
  }

  whenAttached(): Promise<void> {
    return this.attachedPromise;
  }

  attach(webContents: WebContents): void {
    if (this.destroyed) return;
    if (this._webContents === webContents) return;
    if (this._webContents) {
      this.teardownListeners();
    }
    this._webContents = webContents;
    webContents.setUserAgent(this.opts.userAgent);
    this._cdp = new CdpClient(webContents);
    installSessionPermissions(webContents.session);
    const removeNavGuards = installNavigationGuards(webContents, (popupUrl) => {
      this.opts.onPopup(this.tabId, popupUrl);
    });
    this.wcCleanups.push(removeNavGuards);
    this.wireEvents(webContents);
    this.currentUrl = webContents.getURL() || this.currentUrl;
    this.currentTitle = webContents.getTitle() || this.currentTitle;
    this.loading = webContents.isLoadingMainFrame();
    void this.ensureDialogController();
    this.resolveAttached?.();
    this.emit();
  }

  private wireEvents(wc: WebContents): void {
    const onTitleUpdated = (_e: unknown, title: string) => {
      this.currentTitle = title;
      this.emit();
    };
    wc.on("page-title-updated", onTitleUpdated);
    this.wcCleanups.push(() => wc.removeListener("page-title-updated", onTitleUpdated));

    const onDidStartLoading = () => {
      this.loading = true;
      this.emit();
    };
    wc.on("did-start-loading", onDidStartLoading);
    this.wcCleanups.push(() => wc.removeListener("did-start-loading", onDidStartLoading));

    const onDidStopLoading = () => {
      this.loading = false;
      this.currentUrl = wc.getURL();
      this.currentTitle = wc.getTitle();
      if (this.clearInitialHistoryOnLoad) {
        this.clearInitialHistoryOnLoad = false;
        this.clearNavigationHistory();
        if (this.clearInitialHistoryTimer) {
          clearTimeout(this.clearInitialHistoryTimer);
        }
        this.clearInitialHistoryTimer = setTimeout(() => {
          this.clearInitialHistoryTimer = null;
          this.clearNavigationHistory();
        }, 500);
      }
      this.emit();
    };
    wc.on("did-stop-loading", onDidStopLoading);
    this.wcCleanups.push(() => wc.removeListener("did-stop-loading", onDidStopLoading));

    const onDidNavigate = (_e: unknown, url: string) => {
      this.currentUrl = url;
      this.faviconUrl = undefined;
      this.emit();
    };
    wc.on("did-navigate", onDidNavigate);
    this.wcCleanups.push(() => wc.removeListener("did-navigate", onDidNavigate));

    const onDidNavigateInPage = (_e: unknown, url: string) => {
      this.currentUrl = url;
      this.emit();
    };
    wc.on("did-navigate-in-page", onDidNavigateInPage);
    this.wcCleanups.push(() => wc.removeListener("did-navigate-in-page", onDidNavigateInPage));

    const onFaviconUpdated = (_e: unknown, favicons: string[]) => {
      const first = favicons.find((f) => typeof f === "string" && f.length > 0);
      if (first && first !== this.faviconUrl) {
        this.faviconUrl = first;
        this.emit();
      }
    };
    wc.on("page-favicon-updated", onFaviconUpdated);
    this.wcCleanups.push(() => wc.removeListener("page-favicon-updated", onFaviconUpdated));

    const onWillPreventUnload = (event: Electron.Event) => {
      event.preventDefault();
    };
    wc.on("will-prevent-unload", onWillPreventUnload);
    this.wcCleanups.push(() => wc.removeListener("will-prevent-unload", onWillPreventUnload));

    const onBeforeInputEvent = (event: Electron.Event, input: Electron.Input) => {
      if (isBrowserReloadKeyDown(input)) {
        event.preventDefault();
        if (isBrowserHardReloadKeyDown(input)) {
          this.hardReload();
          return;
        }
        wc.reload();
        return;
      }
      if (isBrowserBackKeyDown(input)) {
        event.preventDefault();
        this.goBack();
        return;
      }
      if (isBrowserForwardKeyDown(input)) {
        event.preventDefault();
        this.goForward();
        return;
      }
    };
    wc.on("before-input-event", onBeforeInputEvent);
    this.wcCleanups.push(() => wc.removeListener("before-input-event", onBeforeInputEvent));

    const onConsoleMessage = (
      event: Electron.Event<Electron.WebContentsConsoleMessageEventParams>,
    ) => {
      const level: ConsoleEntry["level"] =
        event.level === "error"
          ? "error"
          : event.level === "warning"
            ? "warn"
            : event.level === "info"
              ? "info"
              : event.level === "debug"
                ? "debug"
                : "log";
      this.pushConsole({
        ts: Date.now(),
        level,
        text: event.message,
        source: event.sourceId,
        line: event.lineNumber,
      });
    };
    wc.on("console-message", onConsoleMessage);
    this.wcCleanups.push(() => wc.removeListener("console-message", onConsoleMessage));

    const onRenderProcessGone = (_e: unknown, details: Electron.RenderProcessGoneDetails) => {
      this.pushConsole({
        ts: Date.now(),
        level: "exception",
        text: `render-process-gone: ${details.reason}`,
      });
    };
    wc.on("render-process-gone", onRenderProcessGone);
    this.wcCleanups.push(() => wc.removeListener("render-process-gone", onRenderProcessGone));

    const onDevToolsOpened = () => {
      this.devToolsVisible = true;
      this.emit();
    };
    wc.on("devtools-opened", onDevToolsOpened);
    this.wcCleanups.push(() => wc.removeListener("devtools-opened", onDevToolsOpened));

    const onDevToolsClosed = () => {
      this.devToolsVisible = false;
      this.emit();
    };
    wc.on("devtools-closed", onDevToolsClosed);
    this.wcCleanups.push(() => wc.removeListener("devtools-closed", onDevToolsClosed));

    const onDestroyed = () => {
      this.teardownListeners();
      this._webContents = null;
      this._cdp = null;
      // The tab can be unmounted when the headless browser goes idle, then
      // remounted on the next automation. Re-arm the attach promise so a later
      // whenAttached() waits for that fresh attach instead of resolving stale.
      if (!this.destroyed) {
        this.attachedPromise = new Promise<void>((resolve) => {
          this.resolveAttached = resolve;
        });
      }
    };
    wc.on("destroyed", onDestroyed);
    this.wcCleanups.push(() => wc.removeListener("destroyed", onDestroyed));
  }

  private teardownListeners(): void {
    for (const c of this.wcCleanups) {
      try {
        c();
      } catch {}
    }
    this.wcCleanups = [];
    try {
      this._cdp?.detach();
    } catch {}
  }

  private async ensureDialogController(): Promise<void> {
    try {
      await this.cdp.attach();
      await this.dialogs.enable(this.cdp);
    } catch {}
  }

  private pushConsole(entry: ConsoleEntry): void {
    this.console.push(entry);
    if (this.console.length > CONSOLE_BUFFER_SIZE) {
      this.console.splice(0, this.console.length - CONSOLE_BUFFER_SIZE);
    }
  }

  getConsoleEntries(limit?: number): ConsoleEntry[] {
    if (!limit || limit >= this.console.length) return this.console.slice();
    return this.console.slice(this.console.length - limit);
  }

  clearConsole(): void {
    this.console = [];
  }

  private clearNavigationHistory(): void {
    if (this.destroyed || !this.isAttached()) return;
    this.webContents.navigationHistory.clear();
    this.emit();
  }

  rememberInitScript(id: string): void {
    this.initScriptIds.add(id);
  }

  forgetInitScript(id: string): void {
    this.initScriptIds.delete(id);
  }

  listInitScripts(): string[] {
    return Array.from(this.initScriptIds);
  }

  private emit(): void {
    if (this.destroyed) return;
    const snap = this.snapshot();
    if (this.lastEmittedSnapshot && snapshotsEqual(this.lastEmittedSnapshot, snap)) return;
    this.lastEmittedSnapshot = snap;
    this.opts.onUpdate(snap);
  }

  snapshot(): BrowserTabSnapshot {
    const wc = this._webContents && !this._webContents.isDestroyed() ? this._webContents : null;
    return {
      tabId: this.tabId,
      url: this.currentUrl || wc?.getURL() || "",
      title: this.currentTitle || wc?.getTitle() || "",
      loading: this.loading,
      canGoBack: wc?.navigationHistory.canGoBack() ?? false,
      canGoForward: wc?.navigationHistory.canGoForward() ?? false,
      devToolsOpen: this.devToolsVisible,
      ...(this.faviconUrl ? { faviconUrl: this.faviconUrl } : {}),
    };
  }

  async loadURL(url: string): Promise<void> {
    if (!isNavigationUrlAllowed(url)) {
      throw new Error(`Navigation blocked: ${url}`);
    }
    if (!this.isAttached()) {
      // Tab not yet mounted in the renderer; just update the desired URL so the
      // initial `<webview src>` (or a later attach) reflects the request.
      this.currentUrl = url;
      this.clearInitialHistoryOnLoad = true;
      this.emit();
      return;
    }
    const wc = this.webContents;
    if (this.currentUrl === "about:blank" && !wc.navigationHistory.canGoBack()) {
      this.clearInitialHistoryOnLoad = true;
    }
    await wc.loadURL(url);
  }

  hardReload(): void {
    if (this.destroyed || !this.isAttached()) return;
    this.webContents.reloadIgnoringCache();
  }

  goBack(): void {
    if (this.destroyed || !this.isAttached()) return;
    const wc = this.webContents;
    if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }

  goForward(): void {
    if (this.destroyed || !this.isAttached()) return;
    const wc = this.webContents;
    if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }

  toggleDevTools(): void {
    if (this.destroyed || !this.isAttached()) return;
    const wc = this.webContents;
    if (this.devToolsVisible || wc.isDevToolsOpened()) {
      wc.closeDevTools();
      return;
    }
    try {
      wc.openDevTools({ mode: "detach", activate: true });
    } catch {}
  }

  clearHistory(): void {
    if (this.destroyed) return;
    this.clearNavigationHistory();
  }

  async clearCookies(): Promise<void> {
    if (this.destroyed || !this.isAttached()) return;
    await this.webContents.session.clearStorageData({ storages: ["cookies"] });
  }

  async clearCache(): Promise<void> {
    if (this.destroyed || !this.isAttached()) return;
    await this.webContents.session.clearCache();
  }

  async capturePng(): Promise<Buffer> {
    const image = await this.webContents.capturePage();
    return image.toPNG();
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      this.network.dispose();
    } catch {}
    try {
      this.dialogs.dispose();
    } catch {}
    this.teardownListeners();
    if (this.clearInitialHistoryTimer) {
      clearTimeout(this.clearInitialHistoryTimer);
      this.clearInitialHistoryTimer = null;
    }
    // The webContents lifetime is owned by the renderer's <webview> element;
    // we don't close it here. Removing the element from the DOM destroys it.
    this._webContents = null;
    this._cdp = null;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }
}

export function resolveWebContentsById(webContentsId: number): WebContents | null {
  return webContentsModule.fromId(webContentsId) ?? null;
}

function snapshotsEqual(a: BrowserTabSnapshot, b: BrowserTabSnapshot): boolean {
  return (
    a.tabId === b.tabId &&
    a.url === b.url &&
    a.title === b.title &&
    a.loading === b.loading &&
    a.canGoBack === b.canGoBack &&
    a.canGoForward === b.canGoForward &&
    a.devToolsOpen === b.devToolsOpen &&
    a.faviconUrl === b.faviconUrl
  );
}

function isBrowserReloadKeyDown(input: Electron.Input): boolean {
  if (input.type !== "keyDown") return false;
  if (input.key === "F5" || input.code === "F5") return true;
  return (input.control || input.meta) && input.key.toLowerCase() === "r";
}

function isBrowserHardReloadKeyDown(input: Electron.Input): boolean {
  return isBrowserReloadKeyDown(input) && input.shift === true;
}

// Ctrl+[ / ⌘[ goes back, Ctrl+] / ⌘] goes forward. Electron has no built-in
// browser chrome, so these navigation chords don't fire unless handled here.
function isBrowserBackKeyDown(input: Electron.Input): boolean {
  if (input.type !== "keyDown") return false;
  return (input.control || input.meta) && !input.shift && !input.alt && input.key === "[";
}

function isBrowserForwardKeyDown(input: Electron.Input): boolean {
  if (input.type !== "keyDown") return false;
  return (input.control || input.meta) && !input.shift && !input.alt && input.key === "]";
}
