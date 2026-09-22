import { memo, useMemo } from "react";
import { Surface } from "@heroui/react";
import type { ToolCallPayload } from "@/shared/contracts";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { chatMessageSurfaceClass } from "./chatMessageSurface";
import { RemoteImageCard } from "./RemoteImageCard";
import { resolveImageViewSource } from "./imageViewSource";
import { ToolCall } from "./ToolCall";

interface ImageViewProps {
  item: RuntimeChatItem;
}

/**
 * Renders an `image_view` tool call (e.g. Codex's `imageGeneration`) as an
 * inline picture in the chat — with copy / download actions and a click-to-zoom
 * lightbox — instead of dumping the raw base64 into a tool-call accordion.
 *
 * Host-held images under an environment connection render a reserved slot while
 * the authenticated blob fetch is pending, then resolve through the keyed
 * subscription (`RemoteImageCard`) without waiting for unrelated store events.
 *
 * Falls back to the generic {@link ToolCall} row whenever the payload has no
 * renderable image (still running, errored, or a non-image "image" tool), so
 * progress and error states still surface normally.
 */
export const ImageView = memo(function ImageView({ item }: ImageViewProps) {
  const payload = item.payload as ToolCallPayload | undefined;
  const actions = useChatPaneActions();
  const readiness = actions?.remoteImageReadiness;
  const source = useMemo(
    () =>
      resolveImageViewSource(payload, actions?.remoteImageRefUrl, {
        pendingAsPlaceholder: readiness !== undefined,
      }),
    [actions?.remoteImageRefUrl, readiness, payload],
  );

  if (!source || payload?.status === "error") {
    return <ToolCall item={item} />;
  }
  return (
    <Surface variant="transparent" className={chatMessageSurfaceClass}>
      <RemoteImageCard source={source} />
    </Surface>
  );
});
