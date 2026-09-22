import { remoteImageRefPath, type RemoteImageRefValue } from "./imageRef";

/**
 * Bounded, authenticated image-blob cache for environment records (R3).
 *
 * The environment data plane cannot be reached by a headerless `<img>` GET —
 * the parent proxy requires the parent credential header before it dials the
 * child — so the TS image surface for an environment resolves through this
 * cache instead of a ticketed child URL. Bytes are fetched with the same
 * client transport (child bearer + parent header + parent pin) and exposed as
 * `blob:` object URLs under the existing synchronous `string` resolver
 * contract: the first resolution starts the fetch and returns `""`, later
 * resolutions return the cached URL.
 *
 * React contract (`useSyncExternalStore`):
 * - `resolutionForImageKey` is a PURE snapshot read: it never starts, restarts,
 *   or reorders a fetch, and it returns an immutable object whose identity is
 *   stable until the key's state actually changes. Missing keys get a cached
 *   frozen empty snapshot, so a repeated read cannot render-loop React.
 * - Starting and retrying are explicit side effects on the request entry points
 *   (`imageRefResolution` / `localImageResolution`) — the renderer calls them
 *   from an effect, keeping `getSnapshot` pure.
 *
 * Bounds and lifecycle, all pinned by tests:
 * - Real LRU by entry count and total bytes: a read/request/subscription moves
 *   the entry to the most-recently-used position, and eviction takes the
 *   least-recently-used evictable entry.
 * - Fetch concurrency is bounded (`maxConcurrentFetches`): excess keys wait in
 *   a FIFO queue, so the transient retained model is
 *   `maxBytes` (ready object URLs) + `maxConcurrentFetches x per-fetch cap`
 *   (in-flight byte arrays) + queue metadata. A queued entry retains no bytes.
 * - An eviction or a failure latches the key for the retry window and
 *   notifies once, so a visible-but-over-budget or failing image cannot drive
 *   a blind refetch loop; the latch expiry notifies and allows exactly one
 *   retry. A single image larger than the aggregate byte budget is latched
 *   permanently ("oversized"): it can never fit, so it is never refetched.
 * - Eviction and dispose revoke every object URL and abort in-flight fetches;
 *   a late completion from a replaced/evicted generation is dropped and its
 *   object URL (if any) revoked.
 * - One notification per `(key, generation)` on the pending→ready and
 *   pending→failed transitions, plus one when a latch's retry window elapses.
 *   `subscribeImageKey` is the explicit keyed subscription consumers drive
 *   `useSyncExternalStore` with.
 * - Per-fetch streaming byte cap is enforced by the injected `fetchBytes`
 *   implementation (the client uses the host's bounded body reader).
 */

export const ENVIRONMENT_IMAGE_CACHE_MAX_ENTRIES = 64;
export const ENVIRONMENT_IMAGE_CACHE_MAX_BYTES = 64 * 1024 * 1024;
/** Failed/evicted keys latch for this long, then notify so a consumer can retry once. */
export const ENVIRONMENT_IMAGE_RETRY_WINDOW_MS = 15_000;
/** Concurrent authenticated image fetches; queued keys retain no bytes. */
export const ENVIRONMENT_IMAGE_MAX_CONCURRENT_FETCHES = 4;

/** Missing-key snapshots are cached to keep `getSnapshot` identity stable. */
const MISSING_SNAPSHOT_LIMIT = 256;

/** Keyed resolution state; `url` is empty while pending, failed, or evicted. */
export interface RemoteEnvironmentImageResolution {
  readonly key: string;
  readonly url: string;
  readonly pending: boolean;
}

export interface RemoteEnvironmentImageBytes {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export interface RemoteEnvironmentImageCacheOptions {
  /** Performs the authenticated, byte-capped fetch for one relative path. */
  readonly fetchBytes: (
    requestPath: string,
    signal: AbortSignal,
  ) => Promise<RemoteEnvironmentImageBytes>;
  readonly createObjectUrl: (blob: Blob) => string;
  readonly revokeObjectUrl: (url: string) => void;
  readonly maxEntries?: number;
  readonly maxBytes?: number;
  readonly retryWindowMs?: number;
  readonly maxConcurrentFetches?: number;
}

/** Stable key for one host-held image reference; matches the resolution cache. */
export function environmentImageRefKey(ref: RemoteImageRefValue): string {
  return `ref:${ref.threadId}/${ref.itemId}/${JSON.stringify(ref.path)}`;
}

/** Stable key for one absolute host path; matches the resolution cache. */
export function environmentLocalImageKey(absolutePath: string): string {
  return `path:${absolutePath}`;
}

type ImageEntryStatus = "queued" | "pending" | "ready" | "failed" | "oversized";

interface ImageCacheEntry {
  requestPath: string;
  status: ImageEntryStatus;
  controller: AbortController | undefined;
  objectUrl: string | undefined;
  bytes: number;
  retryAtMs: number | undefined;
  retryTimer: ReturnType<typeof setTimeout> | undefined;
  /** Immutable snapshot; replaced only on an observable state transition. */
  snapshot: RemoteEnvironmentImageResolution;
}

interface EvictionLatch {
  readonly requestPath: string;
  readonly retryAtMs: number;
  readonly retryTimer: ReturnType<typeof setTimeout>;
}

export class RemoteEnvironmentImageCache {
  private readonly fetchBytes: RemoteEnvironmentImageCacheOptions["fetchBytes"];
  private readonly createObjectUrl: RemoteEnvironmentImageCacheOptions["createObjectUrl"];
  private readonly revokeObjectUrl: RemoteEnvironmentImageCacheOptions["revokeObjectUrl"];
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly retryWindowMs: number;
  private readonly maxConcurrentFetches: number;
  /** Insertion order is LRU order: touches move the entry to the end. */
  private readonly entries = new Map<string, ImageCacheEntry>();
  private readonly latches = new Map<string, EvictionLatch>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly missingSnapshots = new Map<string, RemoteEnvironmentImageResolution>();
  private totalBytes = 0;
  private disposed = false;

  constructor(options: RemoteEnvironmentImageCacheOptions) {
    this.fetchBytes = options.fetchBytes;
    this.createObjectUrl = options.createObjectUrl;
    this.revokeObjectUrl = options.revokeObjectUrl;
    this.maxEntries = options.maxEntries ?? ENVIRONMENT_IMAGE_CACHE_MAX_ENTRIES;
    this.maxBytes = options.maxBytes ?? ENVIRONMENT_IMAGE_CACHE_MAX_BYTES;
    this.retryWindowMs = options.retryWindowMs ?? ENVIRONMENT_IMAGE_RETRY_WINDOW_MS;
    this.maxConcurrentFetches =
      options.maxConcurrentFetches ?? ENVIRONMENT_IMAGE_MAX_CONCURRENT_FETCHES;
  }

  imageRefUrl(ref: RemoteImageRefValue): string {
    return this.imageRefResolution(ref).url;
  }

  localImageUrl(absolutePath: string): string {
    return this.localImageResolution(absolutePath).url;
  }

  /**
   * Side-effecting request entry point: starts (or retries) the fetch for a
   * host-held reference and returns the current snapshot.
   */
  imageRefResolution(ref: RemoteImageRefValue): RemoteEnvironmentImageResolution {
    return this.requestResolution(environmentImageRefKey(ref), remoteImageRefPath(ref));
  }

  /** Side-effecting request entry point for an absolute host path. */
  localImageResolution(absolutePath: string): RemoteEnvironmentImageResolution {
    return this.requestResolution(
      environmentLocalImageKey(absolutePath),
      localImageRequestPath(absolutePath),
    );
  }

  /**
   * Pure snapshot read for `useSyncExternalStore`. Never starts, retries, or
   * reorders a fetch; the returned object is stable until the key transitions.
   */
  resolutionForImageKey(key: string): RemoteEnvironmentImageResolution {
    if (this.disposed) return this.missingSnapshot(key);
    const entry = this.entries.get(key);
    return entry ? entry.snapshot : this.missingSnapshot(key);
  }

  /**
   * Keyed subscription for one resolution key. Listeners fire on the state
   * transitions above and never on a repeat resolution of unchanged state.
   */
  subscribeImageKey(key: string, listener: () => void): () => void {
    this.touch(key);
    let listeners = this.listeners.get(key);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(key, listeners);
    }
    listeners.add(listener);
    return () => {
      const current = this.listeners.get(key);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) this.listeners.delete(key);
    };
  }

  /** Revokes every object URL, aborts every in-flight fetch, clears timers. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries.values()) this.release(entry);
    this.entries.clear();
    for (const latch of this.latches.values()) clearTimeout(latch.retryTimer);
    this.latches.clear();
    this.listeners.clear();
    this.missingSnapshots.clear();
    this.totalBytes = 0;
  }

  private requestResolution(key: string, requestPath: string): RemoteEnvironmentImageResolution {
    if (this.disposed) return this.missingSnapshot(key);
    this.touch(key);
    const latch = this.latches.get(key);
    if (latch) {
      if (Date.now() < latch.retryAtMs) return this.missingSnapshot(key);
      this.clearLatch(key);
    }
    const entry = this.entries.get(key);
    if (entry) return this.requestEntry(key, entry);
    return this.startOrQueue(key, requestPath).snapshot;
  }

  /** Retry policy for an existing entry: only a lapsed failure is restarted. */
  private requestEntry(key: string, entry: ImageCacheEntry): RemoteEnvironmentImageResolution {
    if (entry.status === "failed") {
      if (entry.retryAtMs !== undefined && Date.now() < entry.retryAtMs) return entry.snapshot;
      this.startFetch(key, entry, entry.requestPath);
    }
    return entry.snapshot;
  }

  private startOrQueue(key: string, requestPath: string): ImageCacheEntry {
    const entry: ImageCacheEntry = {
      requestPath,
      status: "queued",
      controller: undefined,
      objectUrl: undefined,
      bytes: 0,
      retryAtMs: undefined,
      retryTimer: undefined,
      snapshot: snapshotFor(key, "", true),
    };
    this.entries.set(key, entry);
    this.trim();
    this.pump();
    this.trim();
    return entry;
  }

  /** Starts queued work while a fetch slot is free, oldest queue entry first. */
  private pump(): void {
    if (this.disposed) return;
    while (this.activeFetchCount() < this.maxConcurrentFetches) {
      let started = false;
      for (const [key, entry] of this.entries) {
        if (entry.status !== "queued") continue;
        this.startFetch(key, entry, entry.requestPath);
        started = true;
        break;
      }
      if (!started) return;
    }
  }

  private activeFetchCount(): number {
    let active = 0;
    for (const entry of this.entries.values()) {
      if (entry.status === "pending") active += 1;
    }
    return active;
  }

  /** Promotes one entry to an in-flight fetch; the entry is already in the map. */
  private startFetch(key: string, entry: ImageCacheEntry, requestPath: string): void {
    if (this.disposed) return;
    entry.requestPath = requestPath;
    entry.status = "pending";
    entry.controller = new AbortController();
    entry.retryAtMs = undefined;
    if (entry.retryTimer !== undefined) {
      clearTimeout(entry.retryTimer);
      entry.retryTimer = undefined;
    }
    entry.snapshot = snapshotFor(key, "", true);
    void this.load(key, entry, entry.controller);
  }

  private async load(
    key: string,
    entry: ImageCacheEntry,
    controller: AbortController,
  ): Promise<void> {
    try {
      const { bytes, contentType } = await this.fetchBytes(entry.requestPath, controller.signal);
      // Generation guard: a replaced, evicted, or disposed entry owns identity,
      // so only the exact object still in the map may publish a result.
      if (!this.isCurrent(key, entry)) return;
      const blob = new Blob([bytes.slice().buffer], { type: contentType });
      if (blob.size > this.maxBytes) {
        // A single image can never fit the aggregate budget: latch it
        // permanently instead of evicting and refetching it forever. No object
        // URL is created (there is nothing to revoke).
        entry.status = "oversized";
        entry.controller = undefined;
        entry.snapshot = snapshotFor(key, "", false);
        this.notify(key);
        return;
      }
      const objectUrl = this.createObjectUrl(blob);
      if (!this.isCurrent(key, entry)) {
        this.revokeObjectUrl(objectUrl);
        return;
      }
      entry.status = "ready";
      entry.objectUrl = objectUrl;
      entry.bytes = blob.size;
      entry.controller = undefined;
      this.totalBytes += blob.size;
      entry.snapshot = snapshotFor(key, objectUrl, false);
      this.touch(key);
      this.trim();
      if (this.isCurrent(key, entry)) this.notify(key);
    } catch {
      this.latchFailure(key, entry, controller);
    } finally {
      this.pump();
    }
  }

  private latchFailure(key: string, entry: ImageCacheEntry, controller: AbortController): void {
    // An abort is owner-initiated (dispose, eviction, replacement): the entry is
    // already gone or intentionally superseded, so no failure is latched.
    if (this.disposed || controller.signal.aborted || !this.isCurrent(key, entry)) return;
    entry.status = "failed";
    entry.controller = undefined;
    entry.retryAtMs = Date.now() + this.retryWindowMs;
    entry.snapshot = snapshotFor(key, "", false);
    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = undefined;
      if (this.disposed || !this.isCurrent(key, entry)) return;
      this.entries.delete(key);
      this.notify(key);
    }, this.retryWindowMs);
    this.notify(key);
  }

  private isCurrent(key: string, entry: ImageCacheEntry): boolean {
    return !this.disposed && this.entries.get(key) === entry;
  }

  /** Moves an entry to the most-recently-used position (real LRU). */
  private touch(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.entries.set(key, entry);
  }

  private release(entry: ImageCacheEntry): void {
    entry.controller?.abort();
    entry.controller = undefined;
    if (entry.retryTimer !== undefined) {
      clearTimeout(entry.retryTimer);
      entry.retryTimer = undefined;
    }
    if (entry.objectUrl !== undefined) {
      this.revokeObjectUrl(entry.objectUrl);
      this.totalBytes -= entry.bytes;
      entry.objectUrl = undefined;
      entry.bytes = 0;
    }
  }

  private trim(): void {
    while (this.entries.size > this.maxEntries || this.totalBytes > this.maxBytes) {
      const candidate = this.evictionCandidate();
      if (!candidate) return;
      const [key, entry] = candidate;
      const latched = entry.status === "ready" || entry.status === "failed";
      this.entries.delete(key);
      this.release(entry);
      if (latched) this.setLatch(key, entry.requestPath);
      this.notify(key);
    }
  }

  /**
   * Least-recently-used eviction candidate. Permanently-latched oversized
   * entries are never evicted (they hold no bytes and can never refetch);
   * every other entry, including an in-flight one, is fair game in LRU order.
   */
  private evictionCandidate(): [string, ImageCacheEntry] | undefined {
    for (const [key, entry] of this.entries) {
      if (entry.status !== "oversized") return [key, entry];
    }
    return undefined;
  }

  private setLatch(key: string, requestPath: string): void {
    this.clearLatch(key);
    const latch: EvictionLatch = {
      requestPath,
      retryAtMs: Date.now() + this.retryWindowMs,
      retryTimer: setTimeout(() => {
        this.latches.delete(key);
        this.notify(key);
      }, this.retryWindowMs),
    };
    this.latches.set(key, latch);
    const cap = Math.max(this.maxEntries, 8);
    while (this.latches.size > cap) {
      const oldest = this.latches.keys().next().value;
      if (oldest === undefined) break;
      this.clearLatch(oldest);
    }
  }

  private clearLatch(key: string): void {
    const latch = this.latches.get(key);
    if (!latch) return;
    clearTimeout(latch.retryTimer);
    this.latches.delete(key);
  }

  /** Frozen empty snapshots keyed by request, identity-stable for React. */
  private missingSnapshot(key: string): RemoteEnvironmentImageResolution {
    const cached = this.missingSnapshots.get(key);
    if (cached) return cached;
    const snapshot = snapshotFor(key, "", false);
    this.missingSnapshots.set(key, snapshot);
    while (this.missingSnapshots.size > MISSING_SNAPSHOT_LIMIT) {
      const oldest = this.missingSnapshots.keys().next().value;
      if (oldest === undefined) break;
      this.missingSnapshots.delete(oldest);
    }
    return snapshot;
  }

  private notify(key: string): void {
    const listeners = this.listeners.get(key);
    if (!listeners || listeners.size === 0) return;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // A consumer's render callback must never break cache bookkeeping.
      }
    }
  }
}

function snapshotFor(key: string, url: string, pending: boolean): RemoteEnvironmentImageResolution {
  return Object.freeze({ key, url, pending });
}

function localImageRequestPath(absolutePath: string): string {
  const search = new URLSearchParams({ path: absolutePath });
  return `/api/files/image?${search.toString()}`;
}
