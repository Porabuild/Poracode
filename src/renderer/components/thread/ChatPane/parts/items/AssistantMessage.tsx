import { memo, useDeferredValue, useMemo } from "react";
import { Surface } from "@heroui/react";
import type { MessageItemPayload } from "@/shared/contracts";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { chatMessageSurfaceClass } from "./chatMessageSurface";
import { ImageCard } from "./ImageView";
import { imageViewSourceFromImageBlock } from "./imageViewSource";
import { ItemMarkdown } from "./ItemMarkdown";

interface AssistantMessageProps {
  item: RuntimeChatItem;
}

export const AssistantMessage = memo(function AssistantMessage({ item }: AssistantMessageProps) {
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
    </Surface>
  );
});
