import { memo, useDeferredValue, useMemo } from "react";
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
import { CopyTextButton } from "./CopyTextButton";
import { ImageCard } from "./ImageView";
import { imageViewSourceFromImageBlock } from "./imageViewSource";
import { ItemMarkdown } from "./ItemMarkdown";

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
  // Matching Codex: the copy action only appears under a turn's *final* answer,
  // i.e. the last assistant message before the next user message (or the end of
  // the thread). Every turn keeps its button, not just the most recent one.
  // Sub-agent messages (those nested under a tool call) are ignored so they
  // neither qualify nor cancel a top-level answer's terminal status. A
  // completed item at the live tail is still an intermediate update until the
  // turn itself settles, so it must not expose a copy action yet.
  const isFinalAnswer = useAppStore((state) => {
    if (item.parentItemId) return false;
    const ids = state.runtimeItemIdsByThread[threadId];
    const byId = state.runtimeItemsByIdByThread[threadId];
    if (!ids || !byId) return false;
    const index = ids.indexOf(item.id);
    if (index < 0) return false;
    for (let i = index + 1; i < ids.length; i += 1) {
      const next = byId[ids[i]!];
      if (!next || next.parentItemId) continue;
      if (next.type === "user_message") return true;
      if (next.type === "assistant_message") return false;
    }
    return !isTurnActive;
  });
  const stream = item.streams.assistant_text ?? "";
  const payload = getRuntimeItemPayload<MessageItemPayload>(item, "assistant_message");
  const rawText =
    stream.length > 0
      ? stream
      : (payload?.content
          ?.map((b) => (b.kind === "text" ? b.text : ""))
          .filter(Boolean)
          .join("\n") ?? "");
  const deferredText = useDeferredValue(rawText);
  const text = item.state === "completed" ? rawText : deferredText;
  const isStreaming = item.state !== "completed";
  // Agents (e.g. ACP providers) can embed images directly in a message as image
  // content blocks; render them inline beneath any text.
  const imageSources = useMemo(
    () =>
      (payload?.content ?? [])
        .filter((b) => b.kind === "image")
        .map((b) => imageViewSourceFromImageBlock(b))
        .filter((s): s is NonNullable<typeof s> => s !== null),
    [payload?.content],
  );
  const showCopyButton = isFinalAnswer && !isStreaming && rawText.length > 0;
  return (
    <Surface variant="transparent" className={chatMessageSurfaceClass}>
      <div className="min-w-0 leading-snug">
        {rawText.length > 0 ? <ItemMarkdown text={text} /> : null}
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
      {showCopyButton ? (
        <div className="poracode-message-action-strip mt-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/checkpoint:opacity-100 focus-within:opacity-100">
          <CopyTextButton text={rawText} label={t`Copy message`} />
        </div>
      ) : null}
    </Surface>
  );
});
