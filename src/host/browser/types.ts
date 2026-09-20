import type { BrowserEvent, BrowserState, BrowserTabInfo } from "@/shared/ipc";

/**
 * Electron-free browser surfaces consumed by the host HTTP/data plane.
 * The desktop `BrowserPanelManager` / `BrowserTab` / `BrowserMcpIngress`
 * classes structurally satisfy these types; headless compositions never
 * construct the Electron implementations.
 */

export interface HostBrowserCdp {
  attach(): Promise<void>;
  detach(): void;
  isAttached(): boolean;
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on(method: string, handler: (params: unknown) => void): () => void;
}

export interface HostBrowserWebContents {
  once(event: "destroyed", listener: () => void): void;
  removeListener(event: "destroyed", listener: () => void): void;
}

export interface BrowserTab {
  readonly tabId: string;
  readonly cdp: HostBrowserCdp;
  readonly webContents: HostBrowserWebContents;
  isAttached(): boolean;
  isDestroyed(): boolean;
}

export interface BrowserPanelManager {
  snapshot(): BrowserState;
  createTab(payload: { url?: string; activate?: boolean }): Promise<BrowserTabInfo>;
  closeTab(tabId: string): Promise<void>;
  setActiveTab(tabId: string): void;
  moveTab(tabId: string, targetTabId: string, position: "before" | "after"): void;
  navigate(tabId: string, url: string): Promise<void>;
  back(tabId: string): Promise<void>;
  forward(tabId: string): Promise<void>;
  reload(tabId: string): Promise<void>;
  addEventListener(listener: (event: BrowserEvent) => void): () => void;
  setAutomationSession(sessionId: string, active: boolean): boolean;
  getActiveTab(): BrowserTab | null;
}

export interface BrowserMcpIngressInfo {
  url: string;
  token: string;
  port: number;
}

export interface BrowserMcpIngress {
  setManagerAccessor(getter: () => BrowserPanelManager | null): void;
  setAllowEval(allow: boolean): void;
  setAllowDataAccess(allow: boolean): void;
  start(): Promise<BrowserMcpIngressInfo>;
  getInfo(): BrowserMcpIngressInfo | null;
  dispose(): Promise<void>;
}
