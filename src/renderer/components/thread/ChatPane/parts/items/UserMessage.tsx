import {
  memo,
  type MouseEvent,
  type ReactNode,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Link, Surface, toast, Tooltip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { CanonicalContentBlock, MessageItemPayload } from "@/shared/contracts";
import { AttachmentBar } from "@/renderer/components/composer/AttachmentBar";
import { openAttachmentLightbox } from "@/renderer/components/composer/ImageLightbox";
import { attachmentImageUrl } from "@/renderer/components/composer/useAttachments";
import { openPdfPreview } from "@/renderer/components/pdf/openPdfPreview";
import {
  getThreadGalleryImages,
  openThreadGallery,
} from "@/renderer/components/thread/useThreadGalleryImages";
import type { Attachment } from "@/renderer/components/composer/useAttachments";
import { fileNameFromPath, isImagePath } from "@/shared/promptContent";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import { formatMessageTimestamp } from "@/renderer/utils/formatTime";
import { useLongPress } from "@/renderer/hooks/useLongPress";
import { openThread } from "@/renderer/actions/threadActions";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { remoteBridgeLocalImageUrl } from "@/renderer/browser/remoteBridge";
import { usesBridgeThreadImages } from "@/renderer/components/thread/threadImageReadiness";
import { isRemoteSession } from "@/renderer/bridge";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { normalizeChatProjectPath } from "../../chatPathUtils";
import { selectUserMessageSentAt } from "../../chatPaneSelectors";
import { openUserMessageActions } from "../../userMessageActions";
import { CheckpointRevertButton, type CheckpointRevertRequest } from "../CheckpointRevertControls";
import { chatPromptSurfaceClass } from "./chatMessageSurface";
import { CopyTextButton } from "./CopyTextButton";
import { InlineFilePathChip } from "./InlineFilePathChip";
import {
  extractLeadingSlashCommand,
  hasChipPiece,
  inlinePiecesFromContent,
  type PromptInlinePiece,
} from "@/renderer/components/promptChips/promptInlinePieces";
import { promptChipVisual, PromptSlashChip } from "@/renderer/components/promptChips/PromptChips";
import { ItemMarkdown } from "./ItemMarkdown";
import { extractSelectorPayloads } from "./SelectorBadge";
import { buildUserPromptText } from "./userPromptText";
import {
  hasUserMessageVisualOverflow,
  shouldNotifyUserMessageHeightChange,
  userMessageCollapsedHeightCache,
} from "./userMessageOverflow";

interface UserMessageProps {
  threadId: string;
  item: RuntimeChatItem;
  checkpointRevert: CheckpointRevertRequest | null;
}

// The height clamp and the fade mask are deliberately separate. The clamp is
// applied on the very first render — before overflow is measured — so the
// virtualizer measures the 4-line collapsed height rather than the message's
// full un-clamped height. A long paste rendered full-height on (re)mount would
// otherwise be cached at that height for one commit, then shrink to 4 lines the
// next, feeding a large size delta into the chat scroll-compensation /
// stick-to-bottom path and snapping the view to the bottom (so the user can no
// longer scroll up past the message). The fade mask is held back until overflow
// is confirmed so a short, non-overflowing message never flashes a gradient.
const lineClampClass =
  "overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4]";
const collapsedFadeClass =
  "[mask-image:linear-gradient(to_bottom,black_65%,transparent)] [-webkit-mask-image:linear-gradient(to_bottom,black_65%,transparent)]";

export const UserMessage = memo(function UserMessage({
  threadId,
  item,
  checkpointRevert,
}: UserMessageProps) {
  const { t, i18n } = useLingui();
  const actions = useChatPaneActions();
  const sentAt = useAppStore((state) => selectUserMessageSentAt(state, threadId, item.id));
  const remoteServerId = useAppStore(
    (state) => state.threads.find((thread) => thread.id === threadId)?.remoteServerId,
  );
  const imageUrlForPath = remoteServerId
    ? (path: string) =>
        usesBridgeThreadImages(remoteServerId)
          ? remoteBridgeLocalImageUrl(path)
          : useRemoteServersStore.getState().localImageUrl(remoteServerId, path)
    : undefined;
  // Own-host files already have a native `poracode-local://` URL. Routing them
  // through the managed image cache paints an empty slot, then swaps in a blob
  // URL once the fetch lands — the thumb flickers when a new thread's first
  // message appears. Host-held paths (another machine, or this browser) still
  // need that cache; the local protocol cannot load them.
  const hostHeldAttachmentImages = imageUrlForPath !== undefined || isRemoteSession();
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasVisualOverflow, setHasVisualOverflow] = useState(false);
  // Starts false so the body renders clamped on first paint; flipped true after
  // the first measurement, which is the only thing that lifts the default clamp
  // off a non-overflowing message.
  const [hasMeasured, setHasMeasured] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const hasVisualOverflowRef = useRef(false);
  const hasMeasuredRef = useRef(false);
  const payload = getRuntimeItemPayload<MessageItemPayload>(item, "user_message");
  const content = payload?.content ?? [];
  const rawText = buildUserPromptText(content);
  const { slashCommand, body } = extractLeadingSlashCommand(rawText);
  const text = body;
  const inlinePieces = inlinePiecesFromContent(content);
  const hasInlineContent = hasChipPiece(inlinePieces);
  const attachments = enrichWithSelectorPayloads(
    buildUserPromptAttachments(content),
    extractSelectorPayloads(rawText),
  );

  const syncVisualOverflow = useEffectEvent(() => {
    const element = bodyRef.current;
    if (!element) return;
    const nextHasVisualOverflow = measureUserMessageOverflow(element);
    // Run the body on the first measurement even when the overflow value is
    // unchanged from its initial `false`: a non-overflowing message renders
    // clamped-by-default, and this pass is what lifts that clamp. Relying on the
    // ref-equality short-circuit alone would leave a short message clamped
    // forever (its overflow value never differs from the initial state).
    const wasFirstMeasure = !hasMeasuredRef.current;
    const overflowChanged = hasVisualOverflowRef.current !== nextHasVisualOverflow;
    if (overflowChanged || wasFirstMeasure) {
      hasVisualOverflowRef.current = nextHasVisualOverflow;
      setHasVisualOverflow(nextHasVisualOverflow);
      // Notify scroll controls only when row height can change: overflow flips,
      // or the first measure lifts the provisional 4-line clamp on a short
      // message. First-measure + still-overflowing keeps the same clamp height
      // (fade only), so skip the stick-to-bottom cascade on thread switch.
      if (
        shouldNotifyUserMessageHeightChange({
          wasFirstMeasure,
          overflowChanged,
          nextHasVisualOverflow,
        })
      ) {
        actions?.onContentHeightChange?.();
      }
    }
    if (!hasMeasuredRef.current) {
      hasMeasuredRef.current = true;
      setHasMeasured(true);
    }
    if (!nextHasVisualOverflow) setIsExpanded(false);
  });

  useLayoutEffect(() => {
    // With no text and no attachments the component renders null (see the
    // guard below), so no post-paint overflow can exist — skip scheduling the
    // two frames. A slash-command chip or inline block with empty body text
    // still renders a measurable row (bodyRef set), so only the truly empty
    // case bails, keyed on the same values that re-arm the measurement.
    if (text.length === 0 && attachments.length === 0 && bodyRef.current === null) return;
    // Defer the forced layout read until after first paint. Thread switches
    // mount many user rows; measuring in useLayoutEffect blocked first paint
    // (~100ms in CDP). Double-rAF lands after the browser has painted the
    // provisional clamp. Long pastes stay clamped so the virtualizer estimate
    // does not inflate before this runs.
    let cancelled = false;
    let innerFrame: number | null = null;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        if (!cancelled) syncVisualOverflow();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outerFrame);
      if (innerFrame !== null) cancelAnimationFrame(innerFrame);
    };
  }, [text, attachments.length]);

  const isThreadOpenSettling = useEffectEvent(() => actions?.isThreadOpenSettling?.() === true);

  useLayoutEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    let frame: number | null = null;
    // ResizeObserver always delivers an initial callback on observe(); the
    // text/attachments effect above already scheduled syncVisualOverflow for
    // that same layout, so skip it — on every mount, including virtualizer
    // remounts mid-thread.
    let sawInitialObservation = false;
    const observer = new ResizeObserver(() => {
      if (!sawInitialObservation) {
        sawInitialObservation = true;
        return;
      }
      // Skip RO-driven remeasures during the thread-open virtualizer storm.
      // Read the shared epoch from scroll controls — rows remount constantly
      // while scrolling, so a per-mount clock here would suppress genuine
      // resizes on freshly remounted rows mid-thread.
      if (isThreadOpenSettling()) return;
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        syncVisualOverflow();
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  // In compact layout there is no reliable hover to reveal the copy/revert strip, and
  // permanently visible icons crowd a one-line bubble — so the strip is
  // dropped there and a long-press opens the shared action sheet instead.
  const compact = useCompactLayout();
  const longPressHandlers = useLongPress(
    compact
      ? () =>
          openUserMessageActions({
            text: rawText,
            requestRevert: checkpointRevert
              ? () => checkpointRevert.onRequestRevert(checkpointRevert.itemId)
              : null,
          })
      : null,
  );

  if (content.length === 0 || (text.length === 0 && attachments.length === 0 && !slashCommand))
    return null;
  const isCollapsible = hasVisualOverflow;
  const isCollapsed = isCollapsible && !isExpanded;
  const tooltipLabel = isExpanded ? t`Show less` : t`Show more`;
  const Icon = isExpanded ? ChevronUp : ChevronDown;
  // Before the first measurement, clamp height only (no fade) so the virtualizer
  // never measures the full un-clamped height on (re)mount. Once measured, fall
  // back to the real collapsed / expanded / no-overflow states.
  const collapseClass = !hasMeasured
    ? lineClampClass
    : isCollapsed
      ? `${lineClampClass} ${collapsedFadeClass}`
      : isCollapsible
        ? "max-h-[50vh] overflow-y-auto"
        : "";
  const baseBodyClass = `min-w-0 leading-snug ${!compact && checkpointRevert ? "pr-12" : "pr-7"} ${collapseClass}`;
  const inlineBodyClass = `${baseBodyClass} poracode-user-message-inline-content whitespace-pre-wrap break-words text-[length:var(--lc-chat-font-size)] text-foreground`;

  let bodyContent: ReactNode = null;
  let bodyClass = baseBodyClass;
  if (hasInlineContent) {
    bodyClass = inlineBodyClass;
    bodyContent = renderUserMessageInlinePieces(inlinePieces, actions);
  } else if (text.length > 0) {
    bodyContent = <ItemMarkdown text={text} />;
  }

  return (
    <Surface
      variant="tertiary"
      className={chatPromptSurfaceClass}
      data-user-message="true"
      {...longPressHandlers}
    >
      <div className="min-w-0 space-y-1.5 leading-snug">
        {attachments.length > 0 ? (
          <div className="-mt-1">
            <AttachmentBar
              attachments={attachments}
              layout="flush"
              imagesAsPreview
              {...(imageUrlForPath ? { imageUrlForPath } : {})}
              {...(hostHeldAttachmentImages && actions?.remoteImageReadiness
                ? { remoteImageReadiness: actions.remoteImageReadiness }
                : {})}
              onPreviewImage={(att) => {
                // Prefer the thread-wide gallery so prev/next walks the whole
                // history (resolved click-time, no extra subscription); fall
                // back to this message's attachments when the gallery cannot
                // resolve the same URL (e.g. ephemeral preview).
                const gallery = getThreadGalleryImages(threadId);
                if (gallery.length > 1) {
                  const src = attachmentImageUrl(att, imageUrlForPath);
                  if (gallery.some((img) => img.src === src)) {
                    openThreadGallery(gallery, src, 0, threadId);
                    return;
                  }
                }
                const imageAttachments = attachments.filter((a) => a.isImage);
                const idx = imageAttachments.findIndex((a) => a.id === att.id);
                if (idx >= 0) openAttachmentLightbox(imageAttachments, idx, imageUrlForPath);
              }}
              onPreviewPdf={(att) => openPdfPreview(att.path)}
            />
          </div>
        ) : null}
        {bodyContent !== null ? (
          <div ref={bodyRef} data-user-message-content="true" className={bodyClass}>
            {bodyContent}
          </div>
        ) : null}
      </div>
      {isCollapsible ? (
        <>
          <Tooltip delay={300}>
            <Tooltip.Trigger
              aria-expanded={isExpanded}
              aria-label={tooltipLabel}
              onClick={() => {
                // Chromium preserves an overflow container's scrollTop when it
                // becomes clamped. Reset it before collapsing so the first four
                // lines paint from the top instead of overlapping the scrolled
                // tail inside the shorter box.
                if (isExpanded && bodyRef.current) bodyRef.current.scrollTop = 0;
                setIsExpanded((prev) => !prev);
                actions?.onContentHeightChange?.();
              }}
              className="absolute bottom-1 right-2 flex size-5 items-center justify-center text-muted transition-colors hover:text-foreground"
            >
              <Icon className="size-3.5" />
            </Tooltip.Trigger>
            <Tooltip.Content placement="top">{tooltipLabel}</Tooltip.Content>
          </Tooltip>
        </>
      ) : null}
      {!compact ? (
        // The strip's height is one text line, so its centered buttons line up
        // with a single-row message instead of hanging below it.
        <div className="poracode-message-action-strip absolute right-2 top-2 z-10 flex h-[calc(var(--lc-chat-font-size)*1.375)] items-center gap-0.5 rounded-full bg-surface-tertiary pl-1 opacity-0 transition-opacity group-hover/checkpoint:opacity-100 focus-within:opacity-100">
          {sentAt !== undefined ? (
            <time
              dateTime={new Date(sentAt).toISOString()}
              title={i18n.date(sentAt, { dateStyle: "full", timeStyle: "long" })}
              className="mr-1 whitespace-nowrap text-[length:var(--lc-chat-font-size-meta)] tabular-nums text-muted"
            >
              {formatMessageTimestamp(sentAt, i18n.locale)}
            </time>
          ) : null}
          {checkpointRevert ? (
            <CheckpointRevertButton
              itemId={checkpointRevert.itemId}
              onRequestRevert={checkpointRevert.onRequestRevert}
            />
          ) : null}
          <CopyTextButton text={rawText} label={t`Copy message`} />
        </div>
      ) : null}
    </Surface>
  );
});

function renderUserMessageInlinePieces(
  pieces: PromptInlinePiece[],
  actions: ReturnType<typeof useChatPaneActions>,
): ReactNode[] {
  return pieces.flatMap((piece): ReactNode[] => {
    if (piece.kind === "text") return renderUserMessageText(piece.text, piece.key);
    const { chip } = piece;
    if (chip.kind === "thread") {
      const { icon, label } = promptChipVisual(chip);
      return [
        <UserMessageThreadChip
          key={piece.key}
          icon={icon}
          label={label}
          threadId={chip.threadId}
          threadTitle={chip.title}
        />,
      ];
    }
    if (chip.kind === "file") {
      const path = actions?.projectLocation
        ? normalizeChatProjectPath(chip.path, actions.projectLocation)
        : chip.path;
      return [
        <InlineFilePathChip
          key={piece.key}
          path={path}
          onOpen={actions?.openProjectRelativePath}
        />,
      ];
    }
    return [<PromptSlashChip key={piece.key} {...promptChipVisual(chip)} />];
  });
}

function UserMessageThreadChip({
  icon,
  label,
  threadId,
  threadTitle,
}: {
  icon: ReactNode;
  label: string;
  threadId: string;
  threadTitle: string;
}) {
  const { t } = useLingui();
  const actions = useChatPaneActions();

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const threadExists = useAppStore.getState().threads.some((thread) => thread.id === threadId);
    if (!threadExists) {
      toast.danger(t`Thread not found`);
      return;
    }
    if (actions?.openThread) {
      actions.openThread(threadId);
      return;
    }
    openThread(threadId);
  };

  return (
    <Tooltip delay={200}>
      {/* tabIndex={-1} role="none" neutralize the trigger's own button semantics —
          the inner button is the single tab stop. Inline layout comes from the
          global .tooltip__trigger rule; don't let the wrapper become block. */}
      <Tooltip.Trigger className="max-w-full align-middle" tabIndex={-1} role="none">
        <button
          type="button"
          className="poracode-slash-chip poracode-thread-mention-chip mr-1.5"
          aria-label={t`Open ${label}`}
          data-thread-mention-id={threadId}
          {...(threadTitle ? { "data-thread-mention-title": threadTitle } : {})}
          onClick={handleClick}
        >
          <span className="poracode-slash-chip__slash">{icon}</span>
          <span className="poracode-slash-chip__name">{label}</span>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content placement="top" className="pointer-events-none max-w-sm break-words">
        {threadTitle || label}
      </Tooltip.Content>
    </Tooltip>
  );
}

const USER_MESSAGE_URL_RE = /https?:\/\/[^\s<>"']+/g;

function renderUserMessageText(text: string, keyPrefix: string): ReactNode[] {
  return renderUserMessageUrls(text, keyPrefix);
}

function renderUserMessageUrls(text: string, keyPrefix: string): ReactNode[] {
  USER_MESSAGE_URL_RE.lastIndex = 0;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = USER_MESSAGE_URL_RE.exec(text)) !== null) {
    const href = trimTrailingUrlPunctuation(match[0]);
    if (href.length === 0) continue;
    if (match.index > cursor) {
      nodes.push(
        <span key={`${keyPrefix}-text-${cursor}`}>{text.slice(cursor, match.index)}</span>,
      );
    }
    nodes.push(
      <Link
        key={`${keyPrefix}-url-${match.index}`}
        href={href}
        rel="noreferrer noopener"
        className="text-[length:inherit] text-foreground no-underline hover:underline hover:decoration-1 underline-offset-2 [display:inline] [width:auto] [overflow-wrap:anywhere] [word-break:break-word]"
        onClick={(event) => {
          event.preventDefault();
          openExternalWithFeedback(href);
        }}
      >
        {href}
      </Link>,
    );
    cursor = match.index + href.length;
  }
  if (cursor === 0) return [<span key={`${keyPrefix}-text`}>{text}</span>];
  if (cursor < text.length) {
    nodes.push(<span key={`${keyPrefix}-text-${cursor}`}>{text.slice(cursor)}</span>);
  }
  return nodes;
}

function trimTrailingUrlPunctuation(url: string): string {
  return url.replace(/[),.;:!?]+$/, "");
}

function enrichWithSelectorPayloads(
  attachments: Attachment[],
  payloads: ReturnType<typeof extractSelectorPayloads>,
): Attachment[] {
  if (payloads.length === 0) return attachments;
  const byName = new Map<string, { selector: string; url?: string }>();
  for (const p of payloads) {
    if (p.name && p.selector) {
      byName.set(p.name, { selector: p.selector, ...(p.url ? { url: p.url } : {}) });
    }
  }
  let nextUnmatchedIdx = 0;
  return attachments.map((a) => {
    if (!a.isImage) return a;
    if (a.selector) return a;
    const byMatch = byName.get(a.name);
    if (byMatch?.selector) {
      return {
        ...a,
        selector: byMatch.selector,
        ...(byMatch.url ? { sourceUrl: byMatch.url } : {}),
      };
    }
    while (nextUnmatchedIdx < payloads.length) {
      const candidate = payloads[nextUnmatchedIdx++]!;
      if (candidate.name && byName.has(candidate.name)) continue;
      if (candidate.selector) {
        return {
          ...a,
          selector: candidate.selector,
          ...(candidate.url ? { sourceUrl: candidate.url } : {}),
        };
      }
    }
    return a;
  });
}

function buildUserPromptAttachments(content: CanonicalContentBlock[]): Attachment[] {
  return content.flatMap((block, index): Attachment[] => {
    if (block.kind === "image" && block.source === "attachment" && block.path) {
      return [
        {
          id: `image-${index}-${block.path}`,
          path: block.path,
          name: block.name ?? fileNameFromPath(block.path),
          mimeType: block.mimeType,
          isImage: true,
        },
      ];
    }
    if (block.kind === "file" && block.source === "attachment") {
      const isImage = isImagePath(block.path, block.mimeType);
      return [
        {
          id: `${isImage ? "image" : "attachment"}-${index}-${block.path}`,
          path: block.path,
          name: block.name ?? fileNameFromPath(block.path),
          ...(block.mimeType ? { mimeType: block.mimeType } : {}),
          isImage,
        },
      ];
    }
    return [];
  });
}

function measureUserMessageOverflow(element: HTMLElement): boolean {
  // Chat typography is shared across rows; resolve collapsed height once per
  // session instead of getComputedStyle on every user message during switch.
  const collapsedHeightPx = userMessageCollapsedHeightCache.getShared(() =>
    window.getComputedStyle(element),
  );
  const scrollHeight = element.scrollHeight;
  // Prefer scrollHeight; only pay for getBoundingClientRect when the scroll
  // metric is still within epsilon of the collapsed height (ambiguous clamp).
  if (
    hasUserMessageVisualOverflow({
      fullHeightPx: scrollHeight,
      collapsedHeightPx,
    })
  ) {
    return true;
  }
  const rectHeight = element.getBoundingClientRect().height;
  if (rectHeight <= scrollHeight) return false;
  return hasUserMessageVisualOverflow({
    fullHeightPx: rectHeight,
    collapsedHeightPx,
  });
}
