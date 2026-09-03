import { useMemo } from "react";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { i18n as i18nSingleton } from "@/renderer/i18n/i18n";
import { openImageLightbox } from "@/renderer/components/composer/ImageLightbox";
import {
  buildGalleryResolversFromState,
  getCachedThreadGallery,
  selectRemoteGalleryRevision,
  type ThreadGalleryImage,
} from "./ChatPane/parts/items/threadGalleryImages";

const EMPTY_IDS: readonly string[] = [];
const EMPTY_BY_ID: Record<string, never> = {};
const EMPTY_GALLERY: readonly ThreadGalleryImage[] = [];

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

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- intentional escape hatch: the module cache below already dedupes across subscribers; this memo only re-reads the live remote clients per store update
  return useMemo(() => {
    if (!threadId) return EMPTY_GALLERY;
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
  }, [threadId, itemIds, itemsById, thread, project, structuralVersion, remoteRevision, locale]);
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
  });
}

/** Open the thread gallery in the fullscreen lightbox at `initialSrc` (or 0). */
export function openThreadGallery(
  images: readonly ThreadGalleryImage[],
  initialSrc?: string,
  initialIndex = 0,
): void {
  if (images.length === 0) return;
  const atSrc = initialSrc ? images.findIndex((img) => img.src === initialSrc) : -1;
  const index = atSrc >= 0 ? atSrc : Math.min(Math.max(0, initialIndex), images.length - 1);
  openImageLightbox(
    images.map((img) => ({ src: img.src, ...(img.alt ? { alt: img.alt } : {}) })),
    index,
  );
}
