import type { RuntimeChatItem } from "./slices/runtimeEventSlice";
import type { ThreadGalleryCollection } from "@/renderer/components/thread/ChatPane/parts/items/threadGalleryImages";
import {
  admitGalleryCacheSnapshot,
  readGalleryCacheRevision,
  type GalleryCacheAdmission,
} from "./galleryCacheAdmission";

export interface GalleryCacheRevision {
  structuralVersion: number;
  remoteRevision: string;
  locale: string;
  imageAuthority: object | null | undefined;
}

type GalleryCacheEntry = GalleryCacheAdmission & {
  itemIds: WeakRef<readonly string[]>;
  itemsById: WeakRef<Record<string, RuntimeChatItem>>;
  resolverKey: string;
};

// Volatile within one renderer document; no persisted or independently deployed
// cache format. Owned snapshots and borrowed-result metadata share logical
// budgets; an oversized validated result is held only weakly, not charged as
// owned data. These estimates do not bound heap allocation.
const MAX_THREAD_GALLERY_CACHE_ENTRIES = 200;
const MAX_THREAD_GALLERY_CACHE_BYTES = 32 * 1024 * 1024;
const galleryCache = new Map<string, GalleryCacheEntry>();
let cachedEstimatedBytes = 0;

/** Retire one definite owner/history without retaining a removed-ID ledger. */
export function forgetThreadGalleryCache(threadId: string): void {
  const cached = galleryCache.get(threadId);
  if (!cached) return;
  cachedEstimatedBytes -= cached.estimatedBytes;
  galleryCache.delete(threadId);
}

function authorityMatches(
  reference: GalleryCacheEntry["imageAuthority"],
  authority: object | null | undefined,
): boolean {
  if (reference === null || reference === undefined) return reference === authority;
  const current = reference.deref();
  return current !== undefined && current === authority;
}

export function readThreadGalleryCache(
  threadId: string,
  itemIds: readonly string[],
  itemsById: Record<string, RuntimeChatItem>,
  resolverKey: string,
  revision: GalleryCacheRevision,
): ThreadGalleryCollection | null {
  const cached = galleryCache.get(threadId);
  if (!cached) return null;
  const cachedIds = cached.itemIds.deref();
  const cachedItems = cached.itemsById.deref();
  if (cachedIds === undefined || cachedItems === undefined) return null;
  const metadata = readGalleryCacheRevision(revision);
  if (
    metadata &&
    cachedIds === itemIds &&
    cachedItems === itemsById &&
    cached.resolverKey === resolverKey &&
    cached.structuralVersion === metadata.structuralVersion &&
    cached.remoteRevision === metadata.remoteRevision &&
    authorityMatches(cached.imageAuthority, metadata.imageAuthority) &&
    cached.locale === metadata.locale
  ) {
    const result = cached.kind === "owned" ? cached.result : cached.result.deref();
    if (result === undefined) return null;
    galleryCache.delete(threadId);
    galleryCache.set(threadId, cached);
    return result;
  }
  return null;
}

export function writeThreadGalleryCache(
  threadId: string,
  itemIds: readonly string[],
  itemsById: Record<string, RuntimeChatItem>,
  resolverKey: string,
  revision: GalleryCacheRevision,
  result: ThreadGalleryCollection,
): ThreadGalleryCollection {
  forgetThreadGalleryCache(threadId);
  if (typeof WeakRef !== "function") return result;
  const admission = admitGalleryCacheSnapshot(threadId, resolverKey, revision, result);
  if (!admission) return result;
  let itemIdsReference: WeakRef<readonly string[]>;
  let itemsReference: WeakRef<Record<string, RuntimeChatItem>>;
  try {
    itemIdsReference = new WeakRef(itemIds);
    itemsReference = new WeakRef(itemsById);
  } catch {
    return result;
  }
  galleryCache.set(threadId, {
    ...admission,
    itemIds: itemIdsReference,
    itemsById: itemsReference,
    resolverKey,
  });
  cachedEstimatedBytes += admission.estimatedBytes;
  while (
    galleryCache.size > MAX_THREAD_GALLERY_CACHE_ENTRIES ||
    cachedEstimatedBytes > MAX_THREAD_GALLERY_CACHE_BYTES
  ) {
    const oldestThreadId = galleryCache.keys().next().value;
    if (oldestThreadId === undefined) break;
    forgetThreadGalleryCache(oldestThreadId);
  }
  return admission.kind === "owned" ? admission.result : result;
}

/** Document teardown and isolated cache tests; ordinary pane close keeps owners warm. */
export function clearThreadGalleryCache(): void {
  galleryCache.clear();
  cachedEstimatedBytes = 0;
}
