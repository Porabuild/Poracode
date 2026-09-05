import type { WebSocket } from "ws";
import type { CdpSession } from "../cdp/cdpClient";

/**
 * One connected companion extension = one live control channel to the user's
 * real Chrome/Brave/Edge. This is the "external" transport counterpart to the
 * embedded {@link import("../BrowserTab").BrowserTab}: instead of driving an
 * Electron `<webview>`, commands are relayed over a localhost WebSocket to the
 * extension's `chrome.debugger`, which speaks the same CDP protocol.
 *
 * The class owns request/response correlation, CDP event fan-out, and which of
 * the user's tabs is currently attached (the debugger banner tab).
 */

export interface ChromeTabInfo {
  tabId: number;
  url: string;
  title: string;
  active: boolean;
  windowId?: number;
}

export interface ChromeConnectionStatus {
  connected: true;
  extensionVersion: string;
  attachedTabId: number | null;
  attachedUrl?: string;
  attachedTitle?: string;
}

type CdpEventHandler = (params: unknown) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Options for {@link ExternalChromeConnection.openTab} — which thread's tab
 *  group to place the workspace tab in (named after the task). */
export interface OpenTabOptions {
  reuse?: boolean;
  groupKey?: string;
  groupTitle?: string;
  groupColor?: string;
}

/** Outbound (Poracode -> extension) request payloads, minus the correlation id. */
type RequestPayload =
  | { type: "listTabs" }
  | { type: "attach"; tabId?: number }
  | {
      type: "openTab";
      url?: string;
      reuse?: boolean;
      groupKey?: string;
      groupTitle?: string;
      groupColor?: string;
    }
  | { type: "detach"; tabId: number }
  | { type: "cdp"; tabId: number; method: string; params?: Record<string, unknown> };

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class ExternalChromeConnection {
  readonly extensionVersion: string;
  private attachedTabId: number | null = null;
  private attachedUrl: string | undefined;
  private attachedTitle: string | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly listeners = new Map<string, Set<CdpEventHandler>>();
  private closed = false;

  constructor(
    private readonly ws: WebSocket,
    hello: { extensionVersion?: string },
    private readonly onClosed: () => void,
  ) {
    this.extensionVersion = hello.extensionVersion ?? "unknown";
    this.ws.on("message", (data: unknown) => this.handleMessage(data));
    this.ws.on("close", () => this.dispose());
    this.ws.on("error", () => this.dispose());
  }

  status(): ChromeConnectionStatus {
    return {
      connected: true,
      extensionVersion: this.extensionVersion,
      attachedTabId: this.attachedTabId,
      ...(this.attachedUrl ? { attachedUrl: this.attachedUrl } : {}),
      ...(this.attachedTitle ? { attachedTitle: this.attachedTitle } : {}),
    };
  }

  isAttached(): boolean {
    return this.attachedTabId !== null;
  }

  async listTabs(): Promise<ChromeTabInfo[]> {
    const res = (await this.request({ type: "listTabs" })) as { tabs?: ChromeTabInfo[] };
    return res.tabs ?? [];
  }

  /** Attach the debugger to `tabId` (or the active tab when omitted). */
  async attach(tabId?: number): Promise<ChromeTabInfo> {
    const res = (await this.request({
      type: "attach",
      ...(typeof tabId === "number" ? { tabId } : {}),
    })) as { tab?: ChromeTabInfo };
    if (!res.tab) throw new Error("Extension did not return an attached tab");
    this.attachedTabId = res.tab.tabId;
    this.attachedUrl = res.tab.url;
    this.attachedTitle = res.tab.title;
    return res.tab;
  }

  /**
   * Open (or reuse) a **background** tab inside the "Poracode" tab group (no
   * focus steal) and make it the attached workspace. Runs in the user's real
   * profile, so logins/cookies carry over — it just doesn't hijack their
   * foreground tab. Reuses the existing workspace tab by default (never closes
   * tabs); pass `{ reuse: false }` to force an additional tab.
   */
  async openTab(url?: string, opts?: OpenTabOptions): Promise<ChromeTabInfo> {
    const reuse = opts?.reuse !== false;
    const res = (await this.request({
      type: "openTab",
      ...(url ? { url } : {}),
      ...(reuse ? {} : { reuse: false }),
      ...(opts?.groupKey ? { groupKey: opts.groupKey } : {}),
      ...(opts?.groupTitle ? { groupTitle: opts.groupTitle } : {}),
      ...(opts?.groupColor ? { groupColor: opts.groupColor } : {}),
    })) as { tab?: ChromeTabInfo };
    if (!res.tab) throw new Error("Extension did not return an opened tab");
    this.attachedTabId = res.tab.tabId;
    this.attachedUrl = res.tab.url;
    this.attachedTitle = res.tab.title;
    return res.tab;
  }

  /**
   * Ensure a workspace tab is attached. Defaults to a background Poracode-group
   * tab so the agent never steals the user's foreground; `attach(tabId)` opts
   * into driving one of the user's own tabs instead.
   */
  async ensureWorkspace(): Promise<number> {
    if (this.attachedTabId !== null) return this.attachedTabId;
    const tab = await this.openTab();
    return tab.tabId;
  }

  async detach(): Promise<void> {
    if (this.attachedTabId === null) return;
    const tabId = this.attachedTabId;
    await this.request({ type: "detach", tabId });
    if (this.attachedTabId !== tabId) return;
    this.attachedTabId = null;
    this.attachedUrl = undefined;
    this.attachedTitle = undefined;
  }

  /** Run a CDP command against the attached tab. Opens a workspace on first use. */
  async sendCdp<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    expectedTabId?: number,
  ): Promise<T> {
    const tabId = expectedTabId ?? (await this.ensureWorkspace());
    // A pinned batch must not reopen a detached tab or follow another caller's attachment.
    if (expectedTabId !== undefined && this.attachedTabId !== expectedTabId) {
      throw new Error("Chrome attachment changed during the batch; remaining actions were stopped");
    }
    const res = (await this.request({
      type: "cdp",
      tabId,
      method,
      ...(params ? { params } : {}),
    })) as { result?: unknown };
    return res.result as T;
  }

  onCdpEvent(method: string, handler: CdpEventHandler): () => void {
    let set = this.listeners.get(method);
    if (!set) {
      set = new Set();
      this.listeners.set(method, set);
    }
    set.add(handler);
    return () => {
      const s = this.listeners.get(method);
      if (!s) return;
      s.delete(handler);
      if (s.size === 0) this.listeners.delete(method);
    };
  }

  /** A {@link CdpSession} view of this connection, usable with `../cdp/tools`. */
  cdpSession(expectedTabId?: number): CdpSession {
    return new ExternalCdpClient(this, expectedTabId);
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Chrome connection closed"));
    }
    this.pending.clear();
    this.listeners.clear();
    try {
      this.ws.close();
    } catch {}
    this.onClosed();
  }

  private request(
    payload: RequestPayload,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("Chrome connection closed"));
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome request timed out: ${payload.type}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify({ id, ...payload }));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err as Error);
      }
    });
  }

  private handleMessage(data: unknown): void {
    let msg: Record<string, unknown>;
    try {
      const text =
        typeof data === "string"
          ? data
          : Buffer.isBuffer(data)
            ? data.toString("utf8")
            : String(data);
      msg = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = msg.type;
    if (type === "result" && typeof msg.id === "number") {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(msg.id);
      if (msg.ok === false) {
        pending.reject(new Error(typeof msg.error === "string" ? msg.error : "Chrome error"));
      } else {
        pending.resolve(msg);
      }
      return;
    }
    if (type === "cdpEvent" && typeof msg.method === "string") {
      if (typeof msg.tabId === "number" && msg.tabId !== this.attachedTabId) return;
      const set = this.listeners.get(msg.method);
      if (!set) return;
      for (const handler of set) {
        try {
          handler(msg.params);
        } catch {}
      }
      return;
    }
    if (type === "detached") {
      if (msg.tabId !== this.attachedTabId) return;
      // The user closed the tab or dismissed the "Poracode is debugging"
      // banner. Drop the attachment so the next command re-attaches.
      this.attachedTabId = null;
      this.attachedUrl = undefined;
      this.attachedTitle = undefined;
    }
  }
}

/**
 * {@link CdpSession} implementation backed by the extension. Structurally
 * identical to the embedded `CdpClient` so every function in `../cdp/tools.ts`
 * runs against the user's real browser without modification.
 */
class ExternalCdpClient implements CdpSession {
  constructor(
    private readonly conn: ExternalChromeConnection,
    private readonly expectedTabId?: number,
  ) {}

  async attach(): Promise<void> {
    if (this.expectedTabId !== undefined) {
      if (!this.isAttached()) throw new Error("Chrome attachment changed during the batch");
      return;
    }
    await this.conn.ensureWorkspace();
  }

  isAttached(): boolean {
    return this.expectedTabId === undefined
      ? this.conn.isAttached()
      : this.conn.status().attachedTabId === this.expectedTabId;
  }

  send<TResult = unknown>(method: string, params?: Record<string, unknown>): Promise<TResult> {
    return this.conn.sendCdp<TResult>(method, params, this.expectedTabId);
  }

  on(method: string, handler: (params: unknown) => void): () => void {
    return this.conn.onCdpEvent(method, handler);
  }
}
