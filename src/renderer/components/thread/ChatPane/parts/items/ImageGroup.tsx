import { memo, useMemo } from "react";
import { Surface } from "@heroui/react";
import { useShallow } from "zustand/react/shallow";
import type { ToolCallPayload } from "@/shared/contracts";
import type { RemoteImageRefValue } from "@/shared/remote";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { selectThreadUserAttachmentImagePaths } from "../../chatPaneSelectors";
import { isPendingImageGroupFollower } from "../../chatToolGroupItem";
import { chatMessageSurfaceClass } from "./chatMessageSurface";
import { ImageMosaic } from "./ImageMosaic";
import { ImageView } from "./ImageView";
import { resolveImageViewSources, type ImageViewSource } from "./imageViewSource";
import { useRememberToolCallItems } from "./toolCallEntrance";

interface ImageGroupProps {
  readonly threadId: string;
  readonly itemIds: readonly string[];
}

interface CachedResolvedSources {
  readonly refUrl: ((ref: RemoteImageRefValue) => string) | undefined;
  readonly pendingAsPlaceholder: boolean;
  readonly userAttachmentPaths: ReadonlySet<string>;
  readonly sources: readonly ImageViewSource[];
}

const EMPTY_SOURCES: readonly ImageViewSource[] = [];
const resolvedItemSourcesCache = new WeakMap<object, CachedResolvedSources>();

function resolveCachedItemSources(
  payload: ToolCallPayload | undefined,
  refUrl: ((ref: RemoteImageRefValue) => string) | undefined,
  pendingAsPlaceholder: boolean,
  userAttachmentPaths: ReadonlySet<string>,
): readonly ImageViewSource[] {
  if (!payload || typeof payload !== "object") return EMPTY_SOURCES;
  const cached = resolvedItemSourcesCache.get(payload);
  if (
    cached &&
    cached.refUrl === refUrl &&
    cached.pendingAsPlaceholder === pendingAsPlaceholder &&
    cached.userAttachmentPaths === userAttachmentPaths
  ) {
    return cached.sources;
  }
  const sources = resolveImageViewSources(payload, refUrl, {
    pendingAsPlaceholder,
    userAttachmentPaths,
  });
  resolvedItemSourcesCache.set(payload, {
    refUrl,
    pendingAsPlaceholder,
    userAttachmentPaths,
    sources,
  });
  return sources;
}

/**
 * Renders 1+ consecutive standalone image tool calls in one stable row: a
 * single image renders as the standard inline card, and 2+ images render as a
 * uniform monotonic mosaic without unmounting tile 0 on the `1 -> 2` transition.
 */
export const ImageGroup = memo(function ImageGroup({ threadId, itemIds }: ImageGroupProps) {
  useRememberToolCallItems(itemIds);
  const actions = useChatPaneActions();
  const readiness = actions?.remoteImageReadiness;
  const items = useAppStore(
    useShallow((state) => {
      const byId = state.runtimeItemsByIdByThread[threadId];
      return itemIds.map((id) => byId?.[id]);
    }),
  );
  const userAttachmentPaths = useAppStore((state) =>
    selectThreadUserAttachmentImagePaths(state, threadId),
  );
  const refUrl = readiness?.resolveRef ?? actions?.remoteImageRefUrl;
  const pendingAsPlaceholder = readiness !== undefined;

  // Cache resolved sources per item payload so appending new images keeps
  // earlier `ImageViewSource` references stable (avoiding `RemoteImageCard` /
  // `ImageCard` re-renders and host-held image listener resubscriptions).
  const { sources, pendingTileCount, fallbackItems } = useMemo(() => {
    const nextSources: ImageViewSource[] = [];
    const nextFallbacks: RuntimeChatItem[] = [];
    const pendingItems: RuntimeChatItem[] = [];
    for (const item of items) {
      if (!item) continue;
      const payload = item.payload as ToolCallPayload | undefined;
      if (payload?.status === "error") {
        nextFallbacks.push(item);
        continue;
      }
      const itemSources = resolveCachedItemSources(
        payload,
        refUrl,
        pendingAsPlaceholder,
        userAttachmentPaths,
      );
      if (itemSources.length > 0) {
        nextSources.push(...itemSources);
      } else if (isPendingImageGroupFollower(item, userAttachmentPaths)) {
        pendingItems.push(item);
      } else {
        nextFallbacks.push(item);
      }
    }
    if (nextSources.length === 0 && pendingItems.length > 0) {
      nextFallbacks.push(...pendingItems);
      return { sources: nextSources, pendingTileCount: 0, fallbackItems: nextFallbacks };
    }
    return {
      sources: nextSources,
      pendingTileCount: pendingItems.length,
      fallbackItems: nextFallbacks,
    };
  }, [items, pendingAsPlaceholder, refUrl, userAttachmentPaths]);

  if (sources.length === 0) {
    return (
      <>
        {fallbackItems.map((item) => (
          <ImageView key={item.id} item={item} threadId={threadId} />
        ))}
      </>
    );
  }

  return (
    <>
      <Surface variant="transparent" className={chatMessageSurfaceClass}>
        <ImageMosaic sources={sources} pendingTileCount={pendingTileCount} />
      </Surface>
      {fallbackItems.map((item) => (
        <ImageView key={item.id} item={item} threadId={threadId} />
      ))}
    </>
  );
});
