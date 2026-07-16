import { memo, type ReactNode, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { Link, Surface, Tooltip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import type { CanonicalContentBlock, MessageItemPayload } from "@/shared/contracts";
import { AttachmentBar } from "@/renderer/components/composer/AttachmentBar";
import { openAttachmentLightbox } from "@/renderer/components/composer/ImageLightbox";
import { openPdfPreview } from "@/renderer/components/pdf/openPdfPreview";
import type { Attachment } from "@/renderer/components/composer/useAttachments";
import { fileNameFromPath } from "@/shared/promptContent";
import { isRemoteSession } from "@/renderer/bridge";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import { useLongPress } from "@/renderer/hooks/useLongPress";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { normalizeChatProjectPath } from "../../chatPathUtils";
import { openUserMessageActions } from "../../userMessageActions";
import { CheckpointRevertButton, type CheckpointRevertRequest } from "../CheckpointRevertControls";
import { chatPromptSurfaceClass } from "./chatMessageSurface";
import { CopyTextButton } from "./CopyTextButton";
import { InlineFilePathChip } from "./InlineFilePathChip";
import { ItemMarkdown } from "./ItemMarkdown";
import { extractSelectorPayloads } from "./SelectorBadge";
import {
  hasUserMessageVisualOverflow,
  shouldNotifyUserMessageHeightChange,
  userMessageCollapsedHeightCache,
} from "./userMessageOverflow";

interface UserMessageProps {
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

export const UserMessage = memo(function UserMessage({ item, checkpointRevert }: UserMessageProps) {
  const { t } = useLingui();
  const actions = useChatPaneActions();
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
  const displaySlashCommand = slashCommand?.startsWith("skill:")
    ? slashCommand.slice("skill:".length)
    : slashCommand;
  const text = body;
  const commandPrefixLength = slashCommand ? rawText.length - body.length : 0;
  const hasInlineContent = content.some(
    (block) => block.kind === "skill" || (block.kind === "file" && block.source !== "attachment"),
  );
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
        actions?.onContentHeightChange();
      }
    }
    if (!hasMeasuredRef.current) {
      hasMeasuredRef.current = true;
      setHasMeasured(true);
    }
    if (!nextHasVisualOverflow) setIsExpanded(false);
  });

  useLayoutEffect(() => {
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

  // On touch (the PWA) there is no hover to reveal the copy/revert strip, and
  // permanently visible icons crowd a one-line bubble — so the strip is
  // dropped there and a long-press on the bubble opens the mobile action
  // sheet instead (see src/mobile/UserMessageActionsSheet.tsx).
  const isRemote = isRemoteSession();
  const longPressHandlers = useLongPress(
    isRemote
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
  const baseBodyClass = `min-w-0 leading-snug ${!isRemote && checkpointRevert ? "pr-12" : "pr-7"} ${collapseClass}`;
  const inlineBodyClass = `${baseBodyClass} poracode-user-message-inline-content whitespace-pre-wrap break-words text-[length:var(--lc-chat-font-size)] text-foreground`;

  let bodyContent: ReactNode = null;
  let bodyClass = baseBodyClass;
  if (slashCommand) {
    bodyClass = inlineBodyClass;
    bodyContent = (
      <>
        <UserMessageSlashChip icon="/" label={displaySlashCommand ?? slashCommand} />
        {renderUserMessageInlineContent(content, commandPrefixLength, actions)}
      </>
    );
  } else if (hasInlineContent) {
    bodyClass = inlineBodyClass;
    bodyContent = renderUserMessageInlineContent(content, 0, actions);
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
              onPreviewImage={(att) => {
                const imageAttachments = attachments.filter((a) => a.isImage);
                const idx = imageAttachments.findIndex((a) => a.id === att.id);
                if (idx >= 0) openAttachmentLightbox(imageAttachments, idx);
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
                setIsExpanded((prev) => !prev);
                actions?.onContentHeightChange();
              }}
              className="absolute bottom-1 right-2 flex size-5 items-center justify-center text-muted transition-colors hover:text-foreground"
            >
              <Icon className="size-3.5" />
            </Tooltip.Trigger>
            <Tooltip.Content placement="top">{tooltipLabel}</Tooltip.Content>
          </Tooltip>
        </>
      ) : null}
      {!isRemote ? (
        <div className="poracode-message-action-strip absolute right-2 top-2 z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/checkpoint:opacity-100 focus-within:opacity-100">
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

const LEADING_SLASH_COMMAND_RE = /^\/([A-Za-z][A-Za-z0-9_.:-]*)(\s+|$)/;

function extractLeadingSlashCommand(text: string): { slashCommand: string | null; body: string } {
  const match = text.match(LEADING_SLASH_COMMAND_RE);
  if (!match) return { slashCommand: null, body: text };
  return { slashCommand: match[1]!, body: text.slice(match[0].length) };
}

function buildUserPromptText(content: CanonicalContentBlock[]): string {
  return content
    .map((block) => {
      if (block.kind === "text") return block.text;
      if (block.kind === "skill") return block.invocation;
      if (block.kind === "file" && block.source !== "attachment") return block.path;
      return "";
    })
    .join("");
}

function renderUserMessageInlineContent(
  content: CanonicalContentBlock[],
  skipLeadingTextLength: number,
  actions: ReturnType<typeof useChatPaneActions>,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remainingSkip = skipLeadingTextLength;

  content.forEach((block, index) => {
    if (block.kind === "text") {
      if (remainingSkip >= block.text.length) {
        remainingSkip -= block.text.length;
        return;
      }
      const text = remainingSkip > 0 ? block.text.slice(remainingSkip) : block.text;
      remainingSkip = 0;
      if (text.length > 0) nodes.push(...renderUserMessageText(text, `text-${index}`));
      return;
    }

    if (block.kind === "skill") {
      if (remainingSkip >= block.invocation.length) {
        remainingSkip -= block.invocation.length;
        return;
      }
      remainingSkip = 0;
      nodes.push(
        <UserMessageSlashChip
          key={`skill-${index}-${block.name}`}
          icon={<Sparkles aria-hidden="true" />}
          label={block.name}
          skillName={block.name}
        />,
      );
      return;
    }

    if (block.kind === "file") {
      if (block.source === "attachment") return;
      if (remainingSkip >= block.path.length) {
        remainingSkip -= block.path.length;
        return;
      }
      remainingSkip = 0;
      const path = actions?.projectLocation
        ? normalizeChatProjectPath(block.path, actions.projectLocation)
        : block.path;
      nodes.push(
        <InlineFilePathChip
          key={`file-${index}-${block.path}`}
          path={path}
          onOpen={actions?.openProjectRelativePath}
        />,
      );
    }
  });

  return nodes;
}

function UserMessageSlashChip({
  icon,
  label,
  skillName,
}: {
  icon: ReactNode;
  label: string;
  skillName?: string;
}) {
  return (
    <span
      className="poracode-slash-chip mr-1.5"
      {...(skillName ? { "data-skill-name": skillName } : {})}
    >
      <span className="poracode-slash-chip__slash">{icon}</span>
      <span className="poracode-slash-chip__name">{label}</span>
    </span>
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
      return [
        {
          id: `attachment-${index}-${block.path}`,
          path: block.path,
          name: block.name ?? fileNameFromPath(block.path),
          ...(block.mimeType ? { mimeType: block.mimeType } : {}),
          isImage: false,
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
