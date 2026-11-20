import { memo, useMemo } from "react";
import { Surface } from "@heroui/react";
import { useShallow } from "zustand/react/shallow";
import type { ToolCallPayload } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { selectThreadUserAttachmentImagePaths } from "../../chatPaneSelectors";
import { chatMessageSurfaceClass } from "./chatMessageSurface";
import { ImageMosaic } from "./ImageMosaic";
import { ImageView } from "./ImageView";
import { resolveImageViewSources, type ImageViewSource } from "./imageViewSource";
import { useRememberToolCallItems } from "./toolCallEntrance";

interface ImageGroupProps {
  readonly threadId: string;
  readonly itemIds: readonly string[];
}

/**
 * Renders 2+ consecutive standalone image tool calls as one compact mosaic
 * row instead of stacking full-height image cards vertically.
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

  // Keep `sources` referentially stable so `RemoteImageCard` does not resubscribe
  // its host-held image readiness listener on unrelated renders.
  const { sources, fallbackItems } = useMemo(() => {
    const nextSources: ImageViewSource[] = [];
    const nextFallbacks: RuntimeChatItem[] = [];
    for (const item of items) {
      if (!item) continue;
      const payload = item.payload as ToolCallPayload | undefined;
      if (payload?.status === "error") {
        nextFallbacks.push(item);
        continue;
      }
      const itemSources = resolveImageViewSources(payload, refUrl, {
        pendingAsPlaceholder,
        userAttachmentPaths,
      });
      if (itemSources.length > 0) {
        nextSources.push(...itemSources);
      } else {
        nextFallbacks.push(item);
      }
    }
    return { sources: nextSources, fallbackItems: nextFallbacks };
  }, [items, pendingAsPlaceholder, refUrl, userAttachmentPaths]);

  if (sources.length === 0) {
    return (
      <>
        {fallbackItems.map((item) => (
          <ImageView key={item.id} item={item} />
        ))}
      </>
    );
  }

  return (
    <>
      <Surface variant="transparent" className={chatMessageSurfaceClass}>
        <ImageMosaic sources={sources} />
      </Surface>
      {fallbackItems.map((item) => (
        <ImageView key={item.id} item={item} />
      ))}
    </>
  );
});
