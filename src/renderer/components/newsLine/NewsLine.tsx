import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { useNewsLineStore } from "@/renderer/state/newsLineStore";
import type { ChangelogHighlight } from "@/shared/changelogHighlights";
import { NewsHighlightCard } from "./NewsHighlightCard";
import { useNewsLineItems } from "./useNewsLineItems";
import type { NewsItem } from "./newsTypes";

/** Time a regular item stays before the next one slides in. */
export const NEWS_ROTATE_MS = 7_000;
/** Give community promotions more time to be read and acted on. */
export const NEWS_PROMOTION_ROTATE_MS = 20_000;
/** Rotation stays paused this long after the last keystroke in the composer. */
export const NEWS_TYPING_PAUSE_MS = 15_000;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const controlButtonClass =
  "flex size-[22px] shrink-0 cursor-default items-center justify-center rounded-full text-muted/80 outline-none transition hover:bg-[var(--row-hover)] hover:text-foreground focus-visible:focus-ring";

/**
 * One quiet, rotating line below the new-thread composer: activity
 * highlights, changelog points, a usage limit, keyboard tips, and community
 * promotions. Rotation pauses on hover or focus, while the user types in the
 * composer, while a changelog point is expanded, while the window is hidden,
 * and through the pause button (WCAG 2.2.2).
 */
export function NewsLine(props: { className?: string }) {
  const { t } = useLingui();
  const { items, highlights } = useNewsLineItems();
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const shownIdsRef = useRef(new Set<string>());

  const [cursor, setCursor] = useState<{ id: string | null; index: number }>({
    id: null,
    index: 0,
  });
  const [userPaused, setUserPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [typing, setTyping] = useState(false);
  const [pageHidden, setPageHidden] = useState(() => document.visibilityState === "hidden");
  const [openHighlight, setOpenHighlight] = useState<ChangelogHighlight | null>(null);
  const actionRef = useRef<HTMLButtonElement>(null);

  const foundIndex = cursor.id === null ? -1 : items.findIndex((item) => item.id === cursor.id);
  const index =
    foundIndex >= 0 ? foundIndex : Math.min(cursor.index, Math.max(0, items.length - 1));
  const current: NewsItem | undefined = items[index];
  const currentId = current?.id ?? null;
  const rotateMs = current?.kind === "promotion" ? NEWS_PROMOTION_ROTATE_MS : NEWS_ROTATE_MS;
  const paused = userPaused || interacting || typing || pageHidden || openHighlight !== null;

  const step = (delta: number) => {
    if (items.length === 0) return;
    const nextIndex = (index + delta + items.length) % items.length;
    setCursor({ id: items[nextIndex]?.id ?? null, index: nextIndex });
  };

  // Auto-advance. Items are rebuilt on every store change, so the timer keys on
  // the visible item and reads the latest list when it fires.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });
  const itemCount = items.length;
  const rotateTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (paused || itemCount < 2) return;
    const tick = () => {
      // Some browsers skip focusout when the focused control is removed, so
      // check where focus really is and wait while it is on the line.
      if (rootRef.current?.contains(document.activeElement)) {
        rotateTimerRef.current = window.setTimeout(tick, rotateMs);
        return;
      }
      const list = itemsRef.current;
      const from = list.findIndex((item) => item.id === currentId);
      const nextIndex = (from + 1) % list.length;
      setCursor({ id: list[nextIndex]?.id ?? null, index: nextIndex });
    };
    rotateTimerRef.current = window.setTimeout(tick, rotateMs);
    return () => window.clearTimeout(rotateTimerRef.current);
  }, [paused, itemCount, currentId, rotateMs]);

  // Count a showing once per visit, and slide the new item in.
  useEffect(() => {
    if (!current || shownIdsRef.current.has(current.id)) return;
    shownIdsRef.current.add(current.id);
    current.onShown?.();
  }, [current]);
  useEffect(() => {
    const element = contentRef.current;
    if (!element || currentId === null || typeof element.animate !== "function") return;
    if (window.matchMedia?.(REDUCED_MOTION_QUERY).matches) return;
    element.animate(
      [
        { opacity: 0, transform: "translateY(6px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 260, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
    );
  }, [currentId]);

  // Pause while the user types in this draft's composer.
  const typingTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const scope = rootRef.current?.closest("[data-draft-body]");
    if (!scope) return;
    const onInput = () => {
      setTyping(true);
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = window.setTimeout(() => setTyping(false), NEWS_TYPING_PAUSE_MS);
    };
    scope.addEventListener("input", onInput);
    scope.addEventListener("keydown", onInput);
    return () => {
      scope.removeEventListener("input", onInput);
      scope.removeEventListener("keydown", onInput);
      window.clearTimeout(typingTimerRef.current);
    };
  }, []);

  // Pause while the pointer or keyboard focus is on the line or its card.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const state = { pointer: false, focus: false };
    const sync = () => setInteracting(state.pointer || state.focus);
    const onPointerEnter = () => {
      state.pointer = true;
      sync();
    };
    const onPointerLeave = () => {
      state.pointer = false;
      sync();
    };
    const onFocusIn = () => {
      state.focus = true;
      sync();
    };
    const onFocusOut = (event: FocusEvent) => {
      state.focus = root.contains(event.relatedTarget as Node | null);
      sync();
    };
    root.addEventListener("pointerenter", onPointerEnter);
    root.addEventListener("pointerleave", onPointerLeave);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    return () => {
      root.removeEventListener("pointerenter", onPointerEnter);
      root.removeEventListener("pointerleave", onPointerLeave);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  useEffect(() => {
    const onVisibility = () => setPageHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // The root stays mounted (its listeners attach once); it is empty when there is nothing to show.
  if (!current) return <div ref={rootRef} className={props.className} data-news-line="" />;

  const openCard = (highlight: ChangelogHighlight) => {
    // Opening a point counts as reading it: it won't be featured again.
    useNewsLineStore.getState().retireHighlight(highlight.id);
    setOpenHighlight(highlight);
  };
  const action = current.action;
  const closeCard = () => {
    setOpenHighlight(null);
    // Return focus to the control that opened the card instead of dropping it.
    actionRef.current?.focus();
  };
  const onAction = () => {
    if (current.highlight) {
      if (openHighlight) closeCard();
      else openCard(current.highlight);
      return;
    }
    action?.onPress();
  };
  const dotCount = Math.min(5, items.length);
  const position = index % dotCount;

  return (
    <div ref={rootRef} className={props.className} data-news-line="">
      <div
        role="region"
        aria-roledescription={t`carousel`}
        aria-label={t`News`}
        className="group flex flex-col items-center gap-0.5 text-[12.5px] text-muted"
      >
        <div
          ref={contentRef}
          // Announce only while rotation is stopped (APG carousel): never every 7s.
          aria-live={paused ? "polite" : "off"}
          aria-atomic="true"
          className="flex h-8 w-full min-w-0 items-center gap-2 rounded-full px-3 transition-colors group-hover:bg-[var(--row-hover)] group-focus-within:bg-[var(--row-hover)]"
          data-news-item={current.id}
          data-news-kind={current.kind}
        >
          {current.icon}
          <span className="min-w-0 truncate" data-news-text="">
            {current.content}
          </span>
          {action ? (
            <button
              ref={actionRef}
              type="button"
              aria-expanded={current.highlight ? openHighlight !== null : undefined}
              className={`flex shrink-0 cursor-default items-center gap-1 rounded-full px-2.5 py-0.5 outline-none transition focus-visible:focus-ring ${
                action.emphasis
                  ? "border border-[var(--border)] bg-[var(--surface-secondary)] text-foreground hover:bg-[var(--default)]"
                  : "text-foreground/85 hover:bg-[var(--row-hover)] hover:text-foreground"
              }`}
              onClick={onAction}
            >
              {action.leadingIcon}
              {action.label}
              {action.external ? (
                <ArrowUpRight className="size-3" />
              ) : action.emphasis ? null : (
                <ChevronRight className="size-3" />
              )}
            </button>
          ) : null}
        </div>
        {/* Reserve the controls' row so revealing it never shifts the content. */}
        <div
          className="flex h-[22px] shrink-0 items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
          data-news-controls=""
        >
          {items.length > 1 ? (
            <>
              <span aria-hidden="true" className="mx-1.5 flex gap-1">
                {Array.from({ length: dotCount }, (_, dot) => (
                  <span
                    key={dot}
                    className={`h-1 rounded-full transition-all ${dot === position ? "w-3 bg-muted" : "w-1 bg-muted/35"}`}
                  />
                ))}
              </span>
              <button
                type="button"
                aria-label={t`Previous`}
                className={controlButtonClass}
                onClick={() => step(-1)}
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={t`Next`}
                className={controlButtonClass}
                onClick={() => step(1)}
              >
                <ChevronRight className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={userPaused ? t`Resume news` : t`Pause news`}
                aria-pressed={userPaused}
                className={controlButtonClass}
                onClick={() => setUserPaused(!userPaused)}
              >
                {userPaused ? <Play className="size-3" /> : <Pause className="size-3" />}
              </button>
            </>
          ) : null}
          <button
            type="button"
            aria-label={t`Hide this`}
            className={controlButtonClass}
            onClick={() => {
              if (current.highlight) setOpenHighlight(null);
              current.onDismiss();
            }}
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      {openHighlight ? (
        <NewsHighlightCard
          highlight={openHighlight}
          highlights={highlights}
          onNavigate={openCard}
          onClose={closeCard}
        />
      ) : null}
    </div>
  );
}
