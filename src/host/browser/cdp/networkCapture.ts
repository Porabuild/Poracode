import type { CdpSession } from "./session";

const NETWORK_BUFFER_SIZE = 500;

export interface NetworkRequestEntry {
  requestId: string;
  ts: number;
  method: string;
  url: string;
  resourceType?: string;
  fromCache?: boolean;
  status?: number;
  statusText?: string;
  mimeType?: string;
  durationMs?: number;
  responseSize?: number;
  error?: string;
  ended: boolean;
}

interface RequestWillBeSent {
  requestId: string;
  request: { url: string; method: string; headers?: Record<string, string> };
  type?: string;
  timestamp: number;
  wallTime?: number;
}

interface ResponseReceived {
  requestId: string;
  response: {
    status: number;
    statusText: string;
    mimeType: string;
    fromDiskCache?: boolean;
    fromServiceWorker?: boolean;
    encodedDataLength?: number;
  };
  timestamp: number;
  type?: string;
}

interface LoadingFinished {
  requestId: string;
  timestamp: number;
  encodedDataLength?: number;
}

interface LoadingFailed {
  requestId: string;
  timestamp: number;
  errorText?: string;
  canceled?: boolean;
}

/**
 * Captures CDP Network events into a per-tab ring buffer. Lazily enabled
 * the first time the agent asks for network data, so non-MCP browsing has
 * zero overhead.
 */
export class NetworkCapture {
  private entries: NetworkRequestEntry[] = [];
  private byId = new Map<string, NetworkRequestEntry>();
  private unsubs: Array<() => void> = [];
  private enabled = false;
  private startWallSeconds = 0;

  async enable(cdp: CdpSession): Promise<void> {
    if (this.enabled) return;
    this.enabled = true;
    await cdp.send("Network.enable");
    this.unsubs.push(
      cdp.on("Network.requestWillBeSent", (params) => {
        const p = params as RequestWillBeSent;
        if (this.startWallSeconds === 0 && typeof p.wallTime === "number") {
          this.startWallSeconds = p.wallTime - p.timestamp;
        }
        const entry: NetworkRequestEntry = {
          requestId: p.requestId,
          ts: this.tsMs(p.timestamp, p.wallTime),
          method: p.request.method,
          url: p.request.url,
          ended: false,
          ...(p.type ? { resourceType: p.type } : {}),
        };
        this.push(entry);
      }),
    );
    this.unsubs.push(
      cdp.on("Network.responseReceived", (params) => {
        const p = params as ResponseReceived;
        const e = this.byId.get(p.requestId);
        if (!e) return;
        e.status = p.response.status;
        e.statusText = p.response.statusText;
        e.mimeType = p.response.mimeType;
        e.fromCache = Boolean(p.response.fromDiskCache || p.response.fromServiceWorker);
        if (typeof p.response.encodedDataLength === "number") {
          e.responseSize = p.response.encodedDataLength;
        }
      }),
    );
    this.unsubs.push(
      cdp.on("Network.loadingFinished", (params) => {
        const p = params as LoadingFinished;
        const e = this.byId.get(p.requestId);
        if (!e) return;
        e.ended = true;
        e.durationMs = this.tsMs(p.timestamp, undefined) - e.ts;
        if (typeof p.encodedDataLength === "number") {
          e.responseSize = p.encodedDataLength;
        }
      }),
    );
    this.unsubs.push(
      cdp.on("Network.loadingFailed", (params) => {
        const p = params as LoadingFailed;
        const e = this.byId.get(p.requestId);
        if (!e) return;
        e.ended = true;
        e.error = p.canceled ? "canceled" : (p.errorText ?? "failed");
        e.durationMs = this.tsMs(p.timestamp, undefined) - e.ts;
      }),
    );
  }

  private tsMs(monotonicSec: number, wallSec?: number): number {
    if (typeof wallSec === "number" && wallSec > 0) return Math.round(wallSec * 1000);
    if (this.startWallSeconds > 0) {
      return Math.round((monotonicSec + this.startWallSeconds) * 1000);
    }
    return Math.round(monotonicSec * 1000);
  }

  private push(entry: NetworkRequestEntry): void {
    this.entries.push(entry);
    this.byId.set(entry.requestId, entry);
    if (this.entries.length > NETWORK_BUFFER_SIZE) {
      const evicted = this.entries.splice(0, this.entries.length - NETWORK_BUFFER_SIZE);
      for (const e of evicted) this.byId.delete(e.requestId);
    }
  }

  list(options: { filter?: string; limit?: number } = {}): NetworkRequestEntry[] {
    const limit = Math.max(1, Math.min(NETWORK_BUFFER_SIZE, options.limit ?? 100));
    const filter = options.filter;
    let arr = this.entries;
    if (filter) {
      const lower = filter.toLowerCase();
      const asRegex = filter.startsWith("/") && filter.lastIndexOf("/") > 0;
      let re: RegExp | null = null;
      if (asRegex) {
        const last = filter.lastIndexOf("/");
        try {
          re = new RegExp(filter.slice(1, last), filter.slice(last + 1));
        } catch {
          re = null;
        }
      }
      arr = arr.filter((e) => (re ? re.test(e.url) : e.url.toLowerCase().includes(lower)));
    }
    return arr.slice(Math.max(0, arr.length - limit));
  }

  clear(): void {
    this.entries = [];
    this.byId.clear();
  }

  dispose(): void {
    for (const u of this.unsubs) {
      try {
        u();
      } catch {}
    }
    this.unsubs = [];
    this.entries = [];
    this.byId.clear();
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
