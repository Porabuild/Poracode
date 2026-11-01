import { memo, useContext, useMemo } from "react";
import { Surface } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { assistantDisplayText } from "@/shared/assistantMessageText";
import { isChatVideoSource } from "@/shared/chatVideo";
import { isChatFileSource } from "@/shared/chatFile";
import { MarkdownFile } from "./MarkdownFile";
import { MarkdownVideo } from "./MarkdownVideo";
import { splitInlineVisuals } from "@/shared/inlineVisuals";
import { RUNTIME_STREAM_ELISION_NOTICE_PREFIX } from "@/shared/runtimeStreamRetentionPolicy";
import { MAX_NATIVE_VISUALS_PER_MESSAGE } from "@/shared/nativeVisuals";
import type { MessageItemPayload } from "@/shared/contracts";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { useAppStore } from "@/renderer/state/appStore";
import { formatMessageTimestamp } from "@/renderer/utils/formatTime";
import type { RuntimeStreamRetention } from "@/renderer/state/slices/runtimeStreamRetention";
import { HYDRATED_STREAM_HEAD_CHARS } from "@/renderer/state/slices/runtimeStreamRetention";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { chatMessageSurfaceClass } from "./chatMessageSurface";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { ChatReaderFollowContext } from "../../chatReaderFollow";
import { CopyTextButton } from "./CopyTextButton";
import { RemoteImageCard } from "./RemoteImageCard";
import { imageViewSourceFromImageBlock } from "./imageViewSource";
import { InlineVisual } from "./InlineVisual";
import { NativeVisual } from "./NativeVisual";
import { SmoothItemMarkdown } from "./ItemMarkdown";
import { WindowedPlainText } from "./WindowedPlainText";
import { useWindowedAssistantText } from "./useWindowedAssistantText";
import { isMessageReplyFormFallback } from "../../../messageReplyForms";
import { selectCompletedTurnsByAnchorItem } from "../../chatPaneSelectors";
import { ThreadForkTurnAction } from "../../../ThreadForkControls";

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
  const { t, i18n } = useLingui();
  const actions = useChatPaneActions();
  const completedTurnStartedAt = useAppStore((state) =>
    item.parentItemId
      ? undefined
      : selectCompletedTurnsByAnchorItem(state, threadId).get(item.id)?.startedAt,
  );
  const completedTurnEndedAt = useAppStore((state) =>
    item.parentItemId
      ? undefined
      : selectCompletedTurnsByAnchorItem(state, threadId).get(item.id)?.endedAt,
  );
  const latestCompletedAnswerId = useAppStore((state) => {
    let latestId: string | undefined;
    for (const anchorId of selectCompletedTurnsByAnchorItem(state, threadId).keys()) {
      const anchor = state.runtimeItemsByIdByThread[threadId]?.[anchorId];
      if (anchor?.type === "assistant_message" && anchor.state === "completed") latestId = anchorId;
    }
    return latestId;
  });
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
  const payload = getRuntimeItemPayload<MessageItemPayload>(item, "assistant_message");
  const isStreaming = item.state !== "completed";
  // Stream/payload arbitration lives in the shared helper so find-in-chat and
  // transcript exports always agree with what this component renders.
  const rawText = assistantDisplayText(item);
  const isStreamText = rawText === item.streams.assistant_text;
  const retention = isStreamText ? item.streamRetention?.assistant_text : undefined;
  // Agents (e.g. ACP providers) can embed images directly in a message as image
  // content blocks; render them inline beneath any text.
  const imageSources = useMemo(
    () =>
      (payload?.content ?? [])
        .filter((b) => b.kind === "image")
        .map((b) =>
          imageViewSourceFromImageBlock(
            b,
            actions?.remoteImageReadiness?.resolveRef ?? actions?.remoteImageRefUrl,
            {
              pendingAsPlaceholder: actions?.remoteImageReadiness !== undefined,
            },
          ),
        )
        .filter((s): s is NonNullable<typeof s> => s !== null),
    [actions?.remoteImageRefUrl, actions?.remoteImageReadiness, payload?.content],
  );
  const showCopyButton = finalAnswerStatus === "confirmed" && !isStreaming && rawText.length > 0;
  const keepActionsVisible = showCopyButton && item.id === latestCompletedAnswerId;
  const videos = (payload?.content ?? []).filter(
    (block) => block.kind === "file" && isChatVideoSource(block.path, block.mimeType),
  );
  // Canonical file blocks explicitly declare a file, so any safe local ref
  // (any extension) becomes a download card; unsafe refs stay inert.
  const fileCards = (payload?.content ?? []).filter(
    (block) =>
      block.kind === "file" &&
      !isChatVideoSource(block.path, block.mimeType) &&
      (isChatFileSource(block.path) || /^https?:\/\//iu.test(block.path)),
  );
  // The tail answer's copy action becomes available only once its turn
  // settles. Reserve the same strip while the answer is still a candidate so
  // revealing the button cannot grow the virtual row and move the transcript
  // past the pinned bottom edge.
  const reserveCopyButtonSpace = finalAnswerStatus !== "none" && rawText.length > 0;
  const textBody =
    rawText.length > 0 && !isMessageReplyFormFallback(item, rawText) ? (
      <AssistantTextBody
        key={isStreamText ? "stream" : "payload"}
        text={rawText}
        isStreaming={isStreaming}
        threadId={threadId}
        itemId={item.id}
        isTurnActive={isTurnActive}
        initialRevealKey={item.observedLive && isTurnActive ? `${threadId}\0${item.id}` : undefined}
        {...(retention ? { retention } : {})}
      />
    ) : null;
  return (
    <Surface variant="transparent" className={chatMessageSurfaceClass}>
      <div className="min-w-0 leading-snug">
        {textBody}
        {videos.map((block, index) =>
          block.kind === "file" ? (
            <MarkdownVideo
              key={`${block.path}:${index}`}
              src={block.path}
              {...(block.name ? { name: block.name } : {})}
              {...(block.mimeType ? { mimeType: block.mimeType } : {})}
            />
          ) : null,
        )}
        {fileCards.map((block, index) =>
          block.kind === "file" ? (
            <MarkdownFile
              key={`${block.path}:${index}`}
              src={block.path}
              {...(block.name ? { name: block.name } : {})}
              {...(block.mimeType ? { mimeType: block.mimeType } : {})}
            />
          ) : null,
        )}
        {imageSources.length > 0 ? (
          <div className="mt-1 flex flex-col gap-2">
            {imageSources.map((source, index) => (
              <RemoteImageCard
                key={`${source.remoteRef ? JSON.stringify(source.remoteRef.path) : source.src.slice(0, 64)}:${index}`}
                source={source}
              />
            ))}
          </div>
        ) : null}
        {isStreaming &&
        rawText.length === 0 &&
        imageSources.length === 0 &&
        videos.length === 0 &&
        fileCards.length === 0 ? (
          <div className="text-foreground-muted">
            <PixelLoader size="xxs" />
          </div>
        ) : null}
      </div>
      {reserveCopyButtonSpace || completedTurnStartedAt !== undefined ? (
        <div
          className={`poracode-message-action-strip mt-1 flex min-h-6 items-center gap-0.5 opacity-100 transition-opacity ${keepActionsVisible ? "" : "[@media(hover:hover)]:opacity-0"} [@media(hover:hover)]:group-hover/checkpoint:opacity-100 focus-within:opacity-100`}
        >
          {showCopyButton ? (
            <CopyTextButton text={rawText} label={t`Copy message`} />
          ) : reserveCopyButtonSpace ? (
            <span aria-hidden="true" className="block size-[var(--m-tap-min,1.5rem)]" />
          ) : null}
          {completedTurnStartedAt !== undefined ? (
            <ThreadForkTurnAction
              threadId={threadId}
              itemId={item.id}
              startedAt={completedTurnStartedAt}
              alwaysVisible={keepActionsVisible}
            />
          ) : null}
          {showCopyButton && completedTurnEndedAt !== undefined ? (
            /* A 24px line box matches the icon buttons, so the text snaps to
               pixels with them instead of drifting 1px at fractional offsets. */
            <time
              dateTime={new Date(completedTurnEndedAt).toISOString()}
              title={i18n.date(completedTurnEndedAt, { dateStyle: "full", timeStyle: "long" })}
              className="ml-1 whitespace-nowrap text-[length:var(--lc-chat-font-size-meta)] leading-6 tabular-nums text-muted"
            >
              {formatMessageTimestamp(completedTurnEndedAt, i18n.locale)}
            </time>
          ) : null}
        </div>
      ) : null}
    </Surface>
  );
});

function AssistantTextBody({
  text,
  isStreaming,
  retention,
  threadId,
  itemId,
  isTurnActive,
  initialRevealKey,
}: {
  text: string;
  isStreaming: boolean;
  retention?: RuntimeStreamRetention;
  threadId: string;
  itemId: string;
  isTurnActive: boolean;
  initialRevealKey: string | undefined;
}) {
  // Retained head/tail text cannot prove a fenced source block is intact.
  // Hydrated history has no local offsets, so also recognize its prefix notice.
  const elided =
    (retention?.elidedChars ?? 0) > 0 ||
    text.slice(0, HYDRATED_STREAM_HEAD_CHARS).includes(RUNTIME_STREAM_ELISION_NOTICE_PREFIX);
  const parts =
    !elided && (text.includes("poracode-html-v") || text.includes("poracode-visual-v"))
      ? splitInlineVisuals(text)
      : undefined;
  let nativeCount = 0;
  if (parts?.some((part) => part.kind !== "markdown")) {
    return parts.map((part, index) =>
      part.kind === "visual" ? (
        <InlineVisual
          key={index}
          html={part.html}
          title={part.title}
          complete={part.complete}
          isStreaming={isStreaming}
        />
      ) : part.kind === "native" ? (
        <NativeVisual
          key={index}
          source={part.source}
          title={part.title}
          version={part.version}
          complete={part.complete && !isStreaming}
          isStreaming={isStreaming && isTurnActive}
          threadId={threadId}
          itemId={itemId}
          ordinal={nativeCount}
          limited={nativeCount++ >= MAX_NATIVE_VISUALS_PER_MESSAGE}
        />
      ) : (
        <AssistantProseTextBody
          key={index}
          text={part.text}
          isStreaming={isStreaming}
          initialRevealKey={initialRevealKey}
        />
      ),
    );
  }
  return (
    <AssistantProseTextBody
      text={text}
      isStreaming={isStreaming}
      initialRevealKey={initialRevealKey}
      {...(retention ? { retention } : {})}
    />
  );
}

function AssistantProseTextBody({
  text,
  isStreaming,
  retention,
  initialRevealKey,
}: {
  text: string;
  isStreaming: boolean;
  retention?: RuntimeStreamRetention;
  initialRevealKey: string | undefined;
}) {
  const readerFollow = useContext(ChatReaderFollowContext);
  const body = useWindowedAssistantText(text, isStreaming, retention, readerFollow);
  return body.window ? (
    <WindowedPlainText
      text={body.window.text}
      hasEarlier={body.window.start > 0}
      isBrowsingEarlier={body.isBrowsingEarlier}
      onEarlier={body.showEarlier}
      onLatest={body.showLatest}
    />
  ) : (
    <SmoothItemMarkdown
      text={text}
      isStreaming={isStreaming}
      {...(initialRevealKey ? { initialRevealKey } : {})}
    />
  );
}
