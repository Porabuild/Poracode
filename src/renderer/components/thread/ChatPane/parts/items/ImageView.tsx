import { memo, useMemo } from "react";
import { Surface } from "@heroui/react";
import type { ToolCallPayload } from "@/shared/contracts";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { chatMessageSurfaceClass } from "./chatMessageSurface";
import { RemoteImageCard } from "./RemoteImageCard";
import { resolveImageViewSource } from "./imageViewSource";
import { ToolCall } from "./ToolCall";
import { readMcpAppResource } from "@/shared/mcpAppResources";
import { InlineVisual } from "./InlineVisual";
import { readMcpAppReference } from "@/shared/contracts/mcpApps";
import { McpAppCard } from "./McpAppCard";
import type { CallToolResult } from "@modelcontextprotocol/client";

interface ImageViewProps {
  item: RuntimeChatItem;
}
const EMPTY_APP_ARGUMENTS: Record<string, unknown> = {};

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
      resolveImageViewSource(payload, readiness?.resolveRef ?? actions?.remoteImageRefUrl, {
        pendingAsPlaceholder: readiness !== undefined,
      }),
    [actions?.remoteImageRefUrl, readiness, payload],
  );

  const appResource =
    item.state === "completed" && payload?.status === "success"
      ? readMcpAppResource(payload.result)
      : undefined;
  const image =
    source && payload?.status !== "error" ? (
      <Surface variant="transparent" className={chatMessageSurfaceClass}>
        <RemoteImageCard source={source} />
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
