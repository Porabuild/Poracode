/**
 * Keeps the newest transcript images of running threads warm in their image
 * owner's cache at prefetch priority, so opening such a thread paints its
 * latest images from cache. Bounded to the newest few per thread.
 */
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import type { RemoteImageRefValue } from "@/shared/remote";
import { cardVariantForRef } from "@/shared/remote/clientEnvironmentImages";
import { isVisibleRuntimeItem } from "@/shared/runtimeItemVisibility";
import {
  imageViewSourceFromImageBlock,
  resolveImageViewSource,
} from "@/renderer/components/thread/ChatPane/parts/items/imageViewSource";
import { resolveThreadImageAuthority } from "@/renderer/components/thread/threadImageAuthority";
import { useAppStore } from "@/renderer/state/appStore";

export const RUNNING_THREAD_IMAGE_PREFETCH_LIMIT = 4;
const MAX_SCANNED_ITEMS = 200;

const IMAGE_TOOL_TYPES = new Set(["image_view", "tool_call", "mcp_tool_call", "dynamic_tool_call"]);

function payloadContent(payload: unknown): readonly unknown[] | null {
  if (!payload || typeof payload !== "object") return null;
  const content = (payload as { content?: unknown }).content;
  return Array.isArray(content) ? content : null;
}

/**
 * The newest host-held image refs in `itemIds`, newest first, at most `limit`.
 * Skips rows the transcript never paints. Mirrors what `ImageView` renders for
 * the first image candidate and what the assistant message renders for each
 * `image` content block.
 */
export function newestThreadImageRefs(
  itemIds: readonly string[],
  itemsById: Readonly<Record<string, RuntimeChatItem>>,
  resolveRef: (ref: RemoteImageRefValue) => string,
  limit = RUNNING_THREAD_IMAGE_PREFETCH_LIMIT,
): Array<{ ref: RemoteImageRefValue; rank: number }> {
  const refs: Array<{ ref: RemoteImageRefValue; rank: number }> = [];
  const start = Math.max(0, itemIds.length - MAX_SCANNED_ITEMS);
  for (let index = itemIds.length - 1; index >= start; index -= 1) {
    const item = itemsById[itemIds[index]!];
    if (!item || item.parentItemId || !isVisibleRuntimeItem(item)) continue;
    if (IMAGE_TOOL_TYPES.has(item.type)) {
      const source = resolveImageViewSource(item.payload, resolveRef, {
        pendingAsPlaceholder: true,
      });
      if (source?.remoteRef) refs.push({ ref: source.remoteRef, rank: index });
    } else if (item.type === "assistant_message") {
      const content = payloadContent(item.payload);
      if (!content) continue;
      for (let blockIndex = content.length - 1; blockIndex >= 0; blockIndex -= 1) {
        const block = content[blockIndex];
        if (!block || typeof block !== "object") continue;
        if ((block as { kind?: unknown }).kind !== "image") continue;
        const source = imageViewSourceFromImageBlock(
          block as { dataUrl?: unknown; mimeType?: unknown; name?: unknown },
          resolveRef,
          { pendingAsPlaceholder: true },
        );
        if (source?.remoteRef) refs.push({ ref: source.remoteRef, rank: index });
        if (refs.length >= limit) return refs;
      }
    }
    if (refs.length >= limit) break;
  }
  return refs.slice(0, limit);
}

/**
 * Start warming the newest images of one running thread. Scans immediately and
 * again only when that thread's item ids or structural version change. Returns
 * the store unsubscribe function.
 */
export function startThreadImagePrefetch(threadId: string): () => void {
  const scan = () => {
    const state = useAppStore.getState();
    const thread = state.threads.find((candidate) => candidate.id === threadId);
    if (!thread) return;
    const readiness = resolveThreadImageAuthority(thread).readiness;
    if (!readiness) return;
    const itemIds = state.runtimeItemIdsByThread[threadId] ?? [];
    const itemsById = state.runtimeItemsByIdByThread[threadId] ?? {};
    for (const { ref, rank } of newestThreadImageRefs(itemIds, itemsById, readiness.resolveRef)) {
      readiness.requestRef(ref, "prefetch", cardVariantForRef(ref), rank);
    }
  };

  scan();
  return useAppStore.subscribe((state, previous) => {
    if (
      state.runtimeItemIdsByThread[threadId] !== previous.runtimeItemIdsByThread[threadId] ||
      state.runtimeStructuralVersionByThread[threadId] !==
        previous.runtimeStructuralVersionByThread[threadId]
    ) {
      scan();
    }
  });
}
