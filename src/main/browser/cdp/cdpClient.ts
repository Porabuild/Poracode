import type { WebContents } from "electron";
import type { CdpEventHandler, CdpSession } from "@/host/browser/cdp/session";

/**
 * Native Electron adapter for the host-owned {@link CdpSession} contract: the
 * browser tool library and every CDP helper are written against that interface
 * and never reach for a concrete `WebContents`. `ExternalCdpClient` (see
 * `@/host/browser/external/ExternalChromeConnection.ts`) implements the same
 * surface over the companion extension's `chrome.debugger`, so every CDP-based
 * tool works unchanged against the user's real Chrome.
 */
export class CdpClient implements CdpSession {
  private attached = false;
  private listeners = new Map<string, Set<CdpEventHandler>>();
  private rawListener: ((event: Electron.Event, method: string, params: unknown) => void) | null =
    null;
  private detachListener: (() => void) | null = null;

  constructor(private readonly wc: WebContents) {}

  async attach(): Promise<void> {
    if (this.attached || this.wc.isDestroyed()) return;
    try {
      this.wc.debugger.attach("1.3");
      this.attached = true;
      this.installDetachListener();
      this.installRawListener();
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      if (!/already attached/i.test(msg)) {
        throw err;
      }
      this.attached = true;
      this.installDetachListener();
      this.installRawListener();
    }
  }

  private installDetachListener(): void {
    if (this.detachListener || this.wc.isDestroyed()) return;
    const handler = () => {
      this.attached = false;
      this.removeDebuggerListeners();
    };
    this.detachListener = handler;
    try {
      this.wc.debugger.on("detach", handler);
    } catch {}
  }

  private installRawListener(): void {
    if (this.rawListener || this.wc.isDestroyed()) return;
    const handler = (_event: Electron.Event, method: string, params: unknown) => {
      const set = this.listeners.get(method);
      if (!set) return;
      for (const h of set) {
        try {
          h(params);
        } catch {}
      }
    };
    this.rawListener = handler;
    try {
      this.wc.debugger.on("message", handler);
    } catch {}
  }

  private removeDebuggerListeners(): void {
    if (this.rawListener) {
      try {
        this.wc.debugger.removeListener("message", this.rawListener);
      } catch {}
      this.rawListener = null;
    }
    if (this.detachListener) {
      try {
        this.wc.debugger.removeListener("detach", this.detachListener);
      } catch {}
      this.detachListener = null;
    }
  }

  detach(): void {
    if (!this.wc.isDestroyed() && this.attached) {
      try {
        this.wc.debugger.detach();
      } catch {}
    }
    this.attached = false;
    this.removeDebuggerListeners();
    this.listeners.clear();
  }

  isAttached(): boolean {
    return this.attached && !this.wc.isDestroyed();
  }

  async send<TResult = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<TResult> {
    if (!this.attached) {
      await this.attach();
    }
    return (await this.wc.debugger.sendCommand(method, params ?? {})) as TResult;
  }

  on(method: string, handler: CdpEventHandler): () => void {
    let set = this.listeners.get(method);
    if (!set) {
      set = new Set();
      this.listeners.set(method, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
      if (set!.size === 0) {
        this.listeners.delete(method);
      }
    };
  }
}
