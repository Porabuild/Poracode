import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useLingui } from "@lingui/react/macro";
import { useShallow } from "zustand/react/shallow";
import { floatingGlassSurfaceClass } from "@/renderer/components/layout/floatingGlass";
import { useAppStore } from "@/renderer/state/appStore";
import { useChatFindStore } from "@/renderer/state/chatFindStore";
import type { ChatTimelineEntry } from "./chatPaneSelectors";
import { forwardWheelToScroller } from "./forwardWheelToScroller";
import {
  buildRailPrompts,
  findActivePromptPosition,
  isPromptTurnInView,
  MAX_RAIL_TICKS,
  nextLoadedIndexAfter,
  RAIL_TICK_OVERSCAN,
  RAIL_TICK_PITCH_PX,
  selectPromptPreview,
  selectReplyPreview,
  selectUserPromptIndexes,
  tickScale,
  windowRailPositions,
  type RailPrompt,
} from "./promptRailTarget";
import { RAIL_MIN_GUTTER_PX, useRailPane } from "./useRailPane";
import { useThreadPromptIndex } from "./useThreadPromptIndex";
import { useVisibleRowRange } from "./useVisibleRowRange";

/** Grace period before the preview closes, so sweeping across ticks never flickers it. */
const PREVIEW_CLOSE_DELAY_MS = 100;
/** Wheel distance that moves the tick window by one tick. */
const WHEEL_PIXELS_PER_TICK = 40;
const FADE_MASK =
  "linear-gradient(to bottom, transparent, black 14px, black calc(100% - 14px), transparent)";

interface ChatPromptRailProps {
  threadId: string;
  entries: readonly ChatTimelineEntry[];
  scrollElement: HTMLDivElement | null;
  /** False while the transcript is still hidden for its initial scroll. */
  isEnabled: boolean;
  /** The prompt being paged in for a jump; its tick shows progress. */
  pendingPromptId: string | null;
  /** Scrolls to a prompt, paging it in first when it has not been loaded. */
  onJumpToPrompt: (itemId: string) => void;
}

/**
 * Compact outline of the conversation along the transcript's left edge: one
 * tick per user prompt, including prompts paging has not loaded yet (the host
 * supplies those). Ticks magnify like a dock around the pointer, the prompts on
 * screen stand out, and hovering or focusing a tick previews that prompt and
 * its reply; pressing it scrolls to the prompt. Long threads show a sliding
 * window of ticks, and everything animates with transform and opacity only.
 * It lives in the thread pane, in the gutter beside the transcript column, so
 * it needs room for that gutter, a fine pointer and at least two prompts;
 * otherwise it does nothing, not even read the host index.
 */
export function ChatPromptRail({
  threadId,
  entries,
  scrollElement,
  isEnabled,
  pendingPromptId,
  onJumpToPrompt,
}: ChatPromptRailProps) {
  const { t } = useLingui();
  const [hoveredPosition, setHoveredPosition] = useState<number | null>(null);
  // Where the tick window is centered while the wheel browses a long thread;
  // null follows the prompt in view.
  const [browseCenter, setBrowseCenter] = useState<number | null>(null);
  // The tick keyboard focus is moving to once the window has slid to show it.
  const [focusPosition, setFocusPosition] = useState<number | null>(null);
  const wheelRemainderRef = useRef(0);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFindOpen = useChatFindStore((state) => state.activeThreadId === threadId);
  const loadedPromptIndexes = useAppStore(
    useShallow((state) => selectUserPromptIndexes(state, threadId, entries)),
  );
  const railPane = useRailPane(scrollElement);
  const hasRoom = railPane !== null && railPane.gutter >= RAIL_MIN_GUTTER_PX;
  const promptIndex = useThreadPromptIndex(threadId, hasRoom);
  const prompts = buildRailPrompts(promptIndex ?? null, entries, loadedPromptIndexes);
  const visibleRange = useVisibleRowRange(hasRoom ? scrollElement : null, entries);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  const count = prompts.length;
  const loadedIndexes = prompts.map((prompt) => prompt.loadedIndex);
  const activePosition = findActivePromptPosition(loadedIndexes, visibleRange?.last ?? null);

  // A native, non-passive listener: React's `onWheel` cannot cancel the gesture.
  // A thread with more prompts than ticks lets the wheel browse the ticks, so
  // far-away prompts can be reached; otherwise it scrolls the transcript.
  const attachWheel = (node: HTMLDivElement | null) => {
    if (!node || !scrollElement) return;
    const onWheel = (event: WheelEvent) => {
      if (count <= MAX_RAIL_TICKS) {
        forwardWheelToScroller(event, scrollElement);
        return;
      }
      if (event.ctrlKey || event.deltaY === 0) return;
      event.preventDefault();
      // Trackpads send many tiny deltas: accumulate them so a gesture moves the
      // window by distance, not by event count.
      if (Math.sign(event.deltaY) !== Math.sign(wheelRemainderRef.current)) {
        wheelRemainderRef.current = 0;
      }
      wheelRemainderRef.current += event.deltaY;
      const steps = Math.trunc(wheelRemainderRef.current / WHEEL_PIXELS_PER_TICK);
      if (steps === 0) return;
      wheelRemainderRef.current -= steps * WHEEL_PIXELS_PER_TICK;
      setBrowseCenter((current) =>
        Math.min(Math.max((current ?? activePosition) + steps, 0), count - 1),
      );
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  };

  if (
    !isEnabled ||
    isFindOpen ||
    promptIndex === undefined ||
    prompts.length < 2 ||
    !railPane ||
    !hasRoom
  )
    return null;

  const openPreviewAt = (position: number) => {
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    setHoveredPosition(position);
  };
  const closePreviewSoon = () => {
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setHoveredPosition(null);
      setBrowseCenter(null);
      wheelRemainderRef.current = 0;
    }, PREVIEW_CLOSE_DELAY_MS);
  };
  const { start, end } = windowRailPositions(count, browseCenter ?? activePosition, MAX_RAIL_TICKS);
  const mountStart = Math.max(0, start - RAIL_TICK_OVERSCAN);
  const mountEnd = Math.min(count, end + RAIL_TICK_OVERSCAN);
  const positions = Array.from(
    { length: mountEnd - mountStart },
    (_, offset) => mountStart + offset,
  );
  const previewPosition =
    hoveredPosition !== null && hoveredPosition >= start && hoveredPosition < end
      ? hoveredPosition
      : null;
  // Arrow keys step between ticks, sliding the window when the next tick lies
  // beyond it: only ticks inside the window are visible, so focus never lands
  // on a clipped one.
  const moveFocusWithArrows = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (!(event.target instanceof HTMLElement)) return;
    const current = Number(event.target.dataset.promptRailTick);
    if (Number.isNaN(current)) return;
    event.preventDefault();
    const target = Math.min(Math.max(current + (event.key === "ArrowDown" ? 1 : -1), 0), count - 1);
    if (target === current) return;
    if (target < start || target >= end) setBrowseCenter(target);
    setFocusPosition(target);
  };

  // The wrapper spans the transcript's height across the whole pane; it never
  // intercepts pointer events outside the rail itself.
  return createPortal(
    <div
      className="pointer-events-none absolute inset-x-0 z-10"
      style={{ top: railPane.top, bottom: railPane.bottom }}
    >
      <div
        ref={attachWheel}
        role="toolbar"
        aria-orientation="vertical"
        tabIndex={-1}
        aria-label={t`Prompt navigation`}
        className="pointer-events-auto absolute left-3 top-1/2 w-6 -translate-y-1/2"
        style={{ height: (end - start) * RAIL_TICK_PITCH_PX }}
        onPointerLeave={closePreviewSoon}
        onKeyDown={moveFocusWithArrows}
      >
        <div
          className="relative h-full w-full overflow-hidden"
          style={count > MAX_RAIL_TICKS ? { maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK } : {}}
        >
          {positions.map((position) => {
            const prompt = prompts[position]!;
            const isActive = position === activePosition;
            const isInView = isPromptTurnInView(
              loadedIndexes,
              position,
              visibleRange,
              entries.length,
            );
            return (
              <PromptTick
                key={prompt.id}
                threadId={threadId}
                prompt={prompt}
                position={position}
                offset={(position - start) * RAIL_TICK_PITCH_PX}
                scale={tickScale({ position, hoveredPosition, isActive, isInView })}
                isHovered={position === hoveredPosition}
                isActive={isActive}
                isInView={isInView}
                isPending={prompt.id === pendingPromptId}
                focusRequested={position === focusPosition}
                onFocusHandled={() => setFocusPosition(null)}
                onPress={() => onJumpToPrompt(prompt.id)}
                onPreviewStart={() => openPreviewAt(position)}
                onPreviewEnd={closePreviewSoon}
              />
            );
          })}
        </div>
        {previewPosition !== null ? (
          <PromptPreviewCard
            threadId={threadId}
            entries={entries}
            prompt={prompts[previewPosition]!}
            nextLoadedIndex={nextLoadedIndexAfter(loadedIndexes, previewPosition)}
            offset={(previewPosition - start) * RAIL_TICK_PITCH_PX + RAIL_TICK_PITCH_PX / 2}
          />
        ) : null}
      </div>
    </div>,
    railPane.pane,
  );
}

function PromptTick({
  threadId,
  prompt,
  position,
  offset,
  scale,
  isHovered,
  isActive,
  isInView,
  isPending,
  focusRequested,
  onFocusHandled,
  onPress,
  onPreviewStart,
  onPreviewEnd,
}: {
  threadId: string;
  prompt: RailPrompt;
  position: number;
  offset: number;
  scale: number;
  isHovered: boolean;
  isActive: boolean;
  isInView: boolean;
  isPending: boolean;
  focusRequested: boolean;
  onFocusHandled: () => void;
  onPress: () => void;
  onPreviewStart: () => void;
  onPreviewEnd: () => void;
}) {
  const { t } = useLingui();
  const preview =
    useAppStore((state) => selectPromptPreview(state, threadId, prompt.id)) ??
    previewFromHostText(prompt.text);
  const emphasis = isHovered || isActive ? 1 : isInView ? 0.7 : 0;
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!focusRequested) return;
    // The rail's clip box must not scroll to reveal the tick.
    buttonRef.current?.focus({ preventScroll: true });
    onFocusHandled();
  }, [focusRequested, onFocusHandled]);
  return (
    // Position and magnification live on different elements: the outer one
    // slides with the window, the inner one scales, and neither fights the
    // other's transition.
    <div
      className="absolute left-0 top-0 transition-transform duration-150 motion-reduce:transition-none"
      style={{ transform: `translateY(${offset}px)` }}
    >
      <button
        ref={buttonRef}
        type="button"
        data-prompt-rail-tick={position}
        aria-label={t`Scroll to prompt: ${preview}`}
        aria-current={isActive ? "true" : undefined}
        tabIndex={isActive ? 0 : -1}
        className="flex h-3 w-6 items-center rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-focus"
        onClick={onPress}
        onPointerEnter={onPreviewStart}
        onFocus={onPreviewStart}
        onBlur={onPreviewEnd}
      >
        <span
          aria-hidden="true"
          className={`relative block h-0.5 w-6 origin-left rounded-full bg-muted/40 transition-transform duration-150 motion-reduce:transition-none ${
            isPending ? "animate-pulse motion-reduce:animate-none" : ""
          }`}
          style={{ transform: `scaleX(${scale})` }}
        >
          <span
            className="absolute inset-0 rounded-full bg-foreground transition-opacity duration-150 motion-reduce:transition-none"
            style={{ opacity: emphasis }}
          />
        </span>
      </button>
    </div>
  );
}

function PromptPreviewCard({
  threadId,
  entries,
  prompt,
  nextLoadedIndex,
  offset,
}: {
  threadId: string;
  entries: readonly ChatTimelineEntry[];
  prompt: RailPrompt;
  nextLoadedIndex: number | undefined;
  offset: number;
}) {
  const loadedPrompt = useAppStore((state) => selectPromptPreview(state, threadId, prompt.id));
  const promptText = loadedPrompt ?? (previewFromHostText(prompt.text) || null);
  // Only a loaded turn has a reply to show; an unloaded one is just its prompt.
  const reply = useAppStore((state) =>
    prompt.loadedIndex === null
      ? null
      : selectReplyPreview(state, threadId, entries, prompt.loadedIndex, nextLoadedIndex),
  );
  if (promptText === null && reply === null) return null;
  return (
    <div
      className="pointer-events-none absolute left-8 top-0 transition-transform duration-150 motion-reduce:transition-none"
      style={{ transform: `translateY(calc(${offset}px - 50%))` }}
    >
      <div
        className={`poracode-prompt-rail-card ${floatingGlassSurfaceClass} w-72 rounded-lg px-2.5 py-2 text-[11px] leading-snug`}
      >
        {promptText !== null ? (
          <p className="line-clamp-2 text-xs font-medium text-foreground">{promptText}</p>
        ) : null}
        {reply !== null ? (
          <p className={`line-clamp-3 text-muted ${promptText !== null ? "mt-1" : ""}`}>{reply}</p>
        ) : null}
      </div>
    </div>
  );
}

/** One-line text for a prompt the host described: whitespace collapsed. */
function previewFromHostText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
