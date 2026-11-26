import { memo, useMemo } from "react";
import { Surface } from "@heroui/react";
import type { ToolCallPayload } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { selectThreadUserAttachmentImagePaths } from "../../chatPaneSelectors";
import { chatMessageSurfaceClass } from "./chatMessageSurface";
import { ImageMosaic } from "./ImageMosaic";
import { EMPTY_USER_ATTACHMENT_PATHS, resolveImageViewSources } from "./imageViewSource";
import { ToolCall } from "./ToolCall";
import { readMcpAppResource } from "@/shared/mcpAppResources";
import { InlineVisual } from "./InlineVisual";
import { readMcpAppReference } from "@/shared/contracts/mcpApps";
import { McpAppCard } from "./McpAppCard";
import type { CallToolResult } from "@modelcontextprotocol/client";

interface ImageViewProps {
  item: RuntimeChatItem;
  threadId?: string;
}
const EMPTY_APP_ARGUMENTS: Record<string, unknown> = {};

/**
 * Renders an `image_view` tool call (e.g. Codex's `imageGeneration`) as an
 * inline picture (or mosaic when the call returns multiple images) in the chat
 * — with copy / download actions and a click-to-zoom lightbox — instead of
 * dumping the raw base64 into a tool-call accordion.
 *
 * Host-held images under an environment connection render a reserved slot while
 * the authenticated blob fetch is pending, then resolve through the keyed
 * subscription (`RemoteImageCard`) without waiting for unrelated store events.
 *
 * Falls back to the generic {@link ToolCall} row whenever the payload has no
 * renderable image (still running, errored, a user-attachment read, or a
 * non-image "image" tool), so progress and error states still surface normally.
 */
export const ImageView = memo(function ImageView({ item, threadId }: ImageViewProps) {
  const payload = item.payload as ToolCallPayload | undefined;
  const actions = useChatPaneActions();
  const attachmentThreadId = threadId ?? actions?.threadId;
  const readiness = actions?.remoteImageReadiness;
  const userAttachmentPaths = useAppStore((state) =>
    attachmentThreadId
      ? selectThreadUserAttachmentImagePaths(state, attachmentThreadId)
      : EMPTY_USER_ATTACHMENT_PATHS,
  );
  // Keep `sources` referentially stable so `RemoteImageCard` does not resubscribe
  // its host-held image readiness listener on unrelated renders.
  const refUrl = readiness?.resolveRef ?? actions?.remoteImageRefUrl;
  const pendingAsPlaceholder = readiness !== undefined;
  const sources = useMemo(
    () =>
      resolveImageViewSources(payload, refUrl, {
        pendingAsPlaceholder,
        userAttachmentPaths,
      }),
    [payload, refUrl, pendingAsPlaceholder, userAttachmentPaths],
  );

  const appResource =
    item.state === "completed" && payload?.status === "success"
      ? readMcpAppResource(payload.result)
      : undefined;
  const image =
    sources.length > 0 && payload?.status !== "error" ? (
      <Surface variant="transparent" className={chatMessageSurfaceClass}>
        <ImageMosaic sources={sources} />
      </Surface>
    ) : null;
  if (appResource) {
    const title = payload?.title ?? payload?.name;
    const app = readMcpAppReference(payload?.result);
    return (
      <>
        {app && app.resourceUri === appResource.uri && actions?.threadId && payload ? (
          <McpAppCard
            key={`${app.sessionId}:${app.toolName}`}
            app={app}
            threadId={actions.threadId}
            html={appResource.text}
            title={title ?? app.toolName}
            input={
              payload.args && typeof payload.args === "object" && !Array.isArray(payload.args)
                ? (payload.args as Record<string, unknown>)
                : EMPTY_APP_ARGUMENTS
            }
            result={payload.result as CallToolResult}
          />
        ) : (
          <InlineVisual html={appResource.text} {...(title ? { title } : {})} />
        )}
        {image}
      </>
    );
  }
  return image ?? <ToolCall item={item} />;
});
