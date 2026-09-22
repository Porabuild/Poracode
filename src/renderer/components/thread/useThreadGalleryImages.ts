import { useEffect, useMemo, useRef, useState } from "react";
import { environmentImageRefKey } from "@/shared/remote/clientEnvironmentImages";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { environmentImageReadinessFor } from "@/renderer/state/remoteServers/environmentSessions";
import { i18n as i18nSingleton } from "@/renderer/i18n/i18n";
import {
  openImageLightbox,
  updateImageLightboxFromThread,
} from "@/renderer/components/composer/ImageLightbox";
import {
  buildGalleryResolversFromState,
  getCachedThreadGallery,
  invalidateCachedThreadGallery,
  selectRemoteGalleryRevision,
  type ThreadGalleryCollection,
  type ThreadGalleryImage,
} from "./ChatPane/parts/items/threadGalleryImages";

const EMPTY_IDS: readonly string[] = [];
const EMPTY_BY_ID: Record<string, never> = {};
const EMPTY_GALLERY: readonly ThreadGalleryImage[] = [];
const EMPTY_COLLECTION: ThreadGalleryCollection = { images: EMPTY_GALLERY, pendingRemoteRefs: [] };

/**
 * Ordered gallery of every renderable image in a thread's loaded history:
 * user attachments, assistant markdown images + image blocks, and generated
 * `image_view` / tool-call images. Resolvers mirror `ChatPane` so remote
 * sessions (paired-desktop image endpoints, host-held refs) and local
 * project-relative markdown targets resolve exactly like the transcript.
 *
 * Collection is shared through a module cache keyed on the store slices, so
 * the bubble, the mosaic, and click-time lookups reuse one computation per
 * store update instead of rebuilding display URLs per subscriber.
 *
 * Host-held environment images that are still pending are NOT part of the
 * collection yet; the hook subscribes to their existing bounded keyed
 * readiness surface and invalidates the cache on transition, so an open
 * gallery — and a lightbox opened from this thread's gallery — picks the image
 * up when its authenticated blob lands.
 */
export function useThreadGalleryImages(
  threadId: string | undefined,
): readonly ThreadGalleryImage[] {
  const locale = i18nSingleton.locale;
  const itemIds = useAppStore((s) =>
    threadId ? (s.runtimeItemIdsByThread[threadId] ?? EMPTY_IDS) : EMPTY_IDS,
  );
  const itemsById = useAppStore((s) =>
    threadId ? (s.runtimeItemsByIdByThread[threadId] ?? EMPTY_BY_ID) : EMPTY_BY_ID,
  );
  const thread = useAppStore((s) =>
    threadId ? s.threads.find((t) => t.id === threadId) : undefined,
  );
  const project = useAppStore((s) =>
    thread ? s.projects.find((candidate) => candidate.id === thread.projectId) : undefined,
  );
  const structuralVersion = useAppStore((s) =>
    threadId ? (s.runtimeStructuralVersionByThread[threadId] ?? 0) : 0,
  );
  const remoteServerId = thread?.remoteServerId;
  const remoteRevision = useRemoteServersStore((s) =>
    selectRemoteGalleryRevision(s, remoteServerId),
  );
  // Bumped when a pending host-held image resolves: the memo re-runs and the
  // invalidated cache recomputes with the now-ready URL.
  const [readinessRevision, setReadinessRevision] = useState(0);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- intentional escape hatch: the module cache below already dedupes across subscribers; this memo only re-reads the live remote clients per store update
  const collection = useMemo(() => {
    if (!threadId) return EMPTY_COLLECTION;
    const resolvers = buildGalleryResolversFromState(useAppStore.getState(), threadId);
    return getCachedThreadGallery(
      threadId,
      itemIds,
      itemsById as Record<
        string,
        import("@/renderer/state/slices/runtimeEventSlice").RuntimeChatItem
      >,
      resolvers,
      { structuralVersion, remoteRevision, locale },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: resolvers derive from live store state per update
  }, [
    threadId,
    itemIds,
    itemsById,
    thread,
    project,
    structuralVersion,
    remoteRevision,
    locale,
    readinessRevision,
  ]);
  const images = collection.images;
  const pendingRefs = collection.pendingRemoteRefs;
  const pendingKey = pendingRefs.map(environmentImageRefKey).join("\n");
  const pendingRefsRef = useRef(pendingRefs);
  useEffect(() => {
    pendingRefsRef.current = pendingRefs;
  });

  useEffect(() => {
    if (!threadId || remoteServerId === undefined || pendingKey.length === 0) return;
    // Re-resolve the readiness surface at effect time: it is bound to the live
    // session, and a real environment-client rebuild is picked up by the
    // subscription itself (which rebinds mounted listeners).
    const readiness = environmentImageReadinessFor(remoteServerId);
    if (!readiness) return;
    const refs = pendingRefsRef.current;
    const onTransition = () => {
      invalidateCachedThreadGallery(threadId);
      setReadinessRevision((revision) => revision + 1);
    };
    const unsubscribes = refs.map((ref) => readiness.subscribeRef(ref, onTransition));
    for (const ref of refs) readiness.requestRef(ref);
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [threadId, remoteServerId, pendingKey]);

  const previousImagesRef = useRef<readonly ThreadGalleryImage[] | undefined>(undefined);
  useEffect(() => {
    const previous = previousImagesRef.current;
    previousImagesRef.current = images;
    if (previous && previous !== images) updateImageLightboxFromThread(threadId, images);
  }, [threadId, images]);

  return images;
}

/**
 * Click-time gallery lookup without subscribing the caller to the runtime
 * stores. Transcript rows (which previously never re-rendered on unrelated
 * ticks) use this inside their preview handlers so opening the gallery costs
 * one cache hit instead of a permanent subscription.
 */
export function getThreadGalleryImages(threadId: string): readonly ThreadGalleryImage[] {
  const state = useAppStore.getState();
  const itemIds = state.runtimeItemIdsByThread[threadId] ?? EMPTY_IDS;
  const itemsById = state.runtimeItemsByIdByThread[threadId] ?? EMPTY_BY_ID;
  const thread = state.threads.find((t) => t.id === threadId);
  const resolvers = buildGalleryResolversFromState(state, threadId);
  return getCachedThreadGallery(threadId, itemIds, itemsById, resolvers, {
    structuralVersion: state.runtimeStructuralVersionByThread[threadId] ?? 0,
    remoteRevision: selectRemoteGalleryRevision(
      useRemoteServersStore.getState(),
      thread?.remoteServerId,
    ),
    locale: i18nSingleton.locale,
  }).images;
}

/**
 * Open the thread gallery in the fullscreen lightbox at `initialSrc` (or 0).
 * `threadId` marks the lightbox live: while it is open, the thread's gallery
 * hook keeps its image set in sync as pending host-held blobs resolve.
 */
export function openThreadGallery(
  images: readonly ThreadGalleryImage[],
  initialSrc?: string,
  initialIndex = 0,
  threadId?: string,
): void {
  if (images.length === 0) return;
  const atSrc = initialSrc ? images.findIndex((img) => img.src === initialSrc) : -1;
  const index = atSrc >= 0 ? atSrc : Math.min(Math.max(0, initialIndex), images.length - 1);
  openImageLightbox(images, index, threadId ? { liveThreadId: threadId } : undefined);
}
