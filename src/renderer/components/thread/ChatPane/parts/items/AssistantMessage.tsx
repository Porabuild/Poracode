import { memo, useMemo } from "react";
import { Surface } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { MessageItemPayload } from "@/shared/contracts";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { useAppStore } from "@/renderer/state/appStore";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { chatMessageSurfaceClass } from "./chatMessageSurface";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { CopyTextButton } from "./CopyTextButton";
import { ImageCard } from "./ImageCard";
import { imageViewSourceFromImageBlock } from "./imageViewSource";
import { SmoothItemMarkdown } from "./ItemMarkdown";

interface AssistantMessageProps {
  threadId: string;
  item: RuntimeChatItem;
  isTurnActive: boolean;
}

export const AssistantMessage = memo(function AssistantMessage({
  threadId,
  item,
  isTurnActive,
}: AssistantMessageProps) {
  const { t } = useLingui();
  const actions = useChatPaneActions();
  // The copy action only appears under a turn's *final* answer: the message
  // must be the last top-level item of its turn — any trailing item (another
  // message, a tool call, an error from a failed turn) means the text was an
  // intermediate status note, not the answer. Every turn keeps its button, not
  // just the most recent one. Sub-agent messages (those nested under a tool
  // call) are ignored so they neither qualify nor cancel a top-level answer's
  // terminal status. A completed item at the live tail is still an
  // intermediate update until the turn itself settles, so it must not expose
  // a copy action yet.
  const finalAnswerStatus = useAppStore((state): "confirmed" | "candidate" | "none" => {
    if (item.parentItemId) return "none";
    const ids = state.runtimeItemIdsByThread[threadId];
    const byId = state.runtimeItemsByIdByThread[threadId];
    if (!ids || !byId) return "none";
    const index = ids.indexOf(item.id);
    if (index < 0) return "none";
    for (let i = index + 1; i < ids.length; i += 1) {
      const next = byId[ids[i]!];
      if (!next || next.parentItemId) continue;
      return next.type === "user_message" ? "confirmed" : "none";
    }
    return isTurnActive ? "candidate" : "confirmed";
  });
  const stream = item.streams.assistant_text ?? "";
  const payload = getRuntimeItemPayload<MessageItemPayload>(item, "assistant_message");
  const payloadTextBlocks = payload?.content?.filter((block) => block.kind === "text");
  const payloadText =
    payloadTextBlocks && payloadTextBlocks.length > 0
      ? payloadTextBlocks
          .map((block) => block.text)
          .filter(Boolean)
          .join("\n")
      : undefined;
  const isStreaming = item.state !== "completed";
  // Keep live output responsive, then use the final payload as the display
  // source of truth. An explicit empty text block intentionally hides the stream.
  const rawText = isStreaming && stream.length > 0 ? stream : (payloadText ?? stream);
  // Agents (e.g. ACP providers) can embed images directly in a message as image
  // content blocks; render them inline beneath any text.
  const imageSources = useMemo(
    () =>
      (payload?.content ?? [])
        .filter((b) => b.kind === "image")
        .map((b) => imageViewSourceFromImageBlock(b, actions?.remoteImageRefUrl))
        .filter((s): s is NonNullable<typeof s> => s !== null),
    [actions?.remoteImageRefUrl, payload?.content],
  );
  const showCopyButton = finalAnswerStatus === "confirmed" && !isStreaming && rawText.length > 0;
  // The tail answer's copy action becomes available only once its turn
  // settles. Reserve the same strip while the answer is still a candidate so
  // revealing the button cannot grow the virtual row and move the transcript
  // past the pinned bottom edge.
  const reserveCopyButtonSpace = finalAnswerStatus !== "none" && rawText.length > 0;
  return (
    <Surface variant="transparent" className={chatMessageSurfaceClass}>
      <div className="min-w-0 leading-snug">
        {rawText.length > 0 ? (
          <SmoothItemMarkdown text={rawText} isStreaming={isStreaming} />
        ) : null}
        {imageSources.length > 0 ? (
          <div className="mt-1 flex flex-col gap-2">
            {imageSources.map((source, index) => (
              <ImageCard key={`${source.src.slice(0, 64)}:${index}`} source={source} />
            ))}
          </div>
        ) : null}
        {isStreaming && rawText.length === 0 && imageSources.length === 0 ? (
          <div className="text-foreground-muted">
            <PixelLoader size="xxs" />
          </div>
        ) : null}
      </div>
      {reserveCopyButtonSpace ? (
        <div className="poracode-message-action-strip mt-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/checkpoint:opacity-100 focus-within:opacity-100">
          {showCopyButton ? (
            <CopyTextButton text={rawText} label={t`Copy message`} />
          ) : (
            <span aria-hidden="true" className="block size-5" />
          )}
        </div>
      ) : null}
    </Surface>
  );
});
