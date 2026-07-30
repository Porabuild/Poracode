import { describe, expect, it } from "vitest";
import {
  BOTTOM_EPSILON_PX,
  distanceFromBottom,
  isElementAtBottom,
  nextShowScrollDown,
  shouldCoalesceLayoutSync,
  shouldIgnoreProgrammaticPinScroll,
  shouldMarkUserScrollIntentFromPointerTarget,
  shouldReenableStickToBottom,
  shouldReleaseStickToBottom,
  shouldSkipScrollToBottomWrite,
  shouldTrustCachedAtBottom,
  nextAtBottomCacheUntil,
  shouldRepinForContentGrowth,
} from "./chatScrollGeometry";

function scroller(partial: { scrollHeight: number; scrollTop: number; clientHeight: number }) {
  return partial;
}

describe("chatScrollGeometry", () => {
  it("treats within-epsilon distance as at bottom", () => {
    // distance = scrollHeight - scrollTop - clientHeight = 1000 - 896 - 100 = 4
    expect(
      isElementAtBottom(scroller({ scrollHeight: 1000, scrollTop: 896, clientHeight: 100 })),
    ).toBe(true);
    expect(
      distanceFromBottom(scroller({ scrollHeight: 1000, scrollTop: 896, clientHeight: 100 })),
    ).toBe(4);
    expect(BOTTOM_EPSILON_PX).toBe(4);
  });

  it("skips scrollTop writes when already pinned at the same content height", () => {
    expect(
      shouldSkipScrollToBottomWrite({
        scrollHeight: 1000,
        scrollTop: 900,
        clientHeight: 100,
        lastPinnedScrollHeight: 1000,
      }),
    ).toBe(true);
    expect(
      shouldSkipScrollToBottomWrite({
        scrollHeight: 1000,
        scrollTop: 800,
        clientHeight: 100,
        lastPinnedScrollHeight: 1000,
      }),
    ).toBe(false);
    expect(
      shouldSkipScrollToBottomWrite({
        scrollHeight: 0,
        scrollTop: 0,
        clientHeight: 0,
        lastPinnedScrollHeight: 0,
      }),
    ).toBe(false);
  });

  it("does not skip the pin write when content height shrinks (tool collapse)", () => {
    // Sticky + collapse: scrollHeight drops while scrollTop may still look
    // "at bottom" (or overscrolled). Skipping the write stranded the view.
    expect(
      shouldSkipScrollToBottomWrite({
        scrollHeight: 800,
        scrollTop: 700,
        clientHeight: 100,
        lastPinnedScrollHeight: 1000,
      }),
    ).toBe(false);
    expect(
      shouldSkipScrollToBottomWrite({
        scrollHeight: 800,
        scrollTop: 800,
        clientHeight: 100,
        lastPinnedScrollHeight: 1000,
      }),
    ).toBe(false);
  });

  it("does not skip the pin write when content height grows", () => {
    expect(
      shouldSkipScrollToBottomWrite({
        scrollHeight: 1200,
        scrollTop: 1100,
        clientHeight: 100,
        lastPinnedScrollHeight: 1000,
      }),
    ).toBe(false);
  });

  it("ignores downward programmatic pin scrolls while sticky", () => {
    expect(
      shouldIgnoreProgrammaticPinScroll({
        stickToBottom: true,
        prevScrollTop: 100,
        nextScrollTop: 120,
      }),
    ).toBe(true);
    expect(
      shouldIgnoreProgrammaticPinScroll({
        stickToBottom: true,
        prevScrollTop: 120,
        nextScrollTop: 120,
      }),
    ).toBe(true);
    expect(
      shouldIgnoreProgrammaticPinScroll({
        stickToBottom: true,
        prevScrollTop: 120,
        nextScrollTop: 100,
      }),
    ).toBe(false);
    expect(
      shouldIgnoreProgrammaticPinScroll({
        stickToBottom: false,
        prevScrollTop: 100,
        nextScrollTop: 120,
      }),
    ).toBe(false);
  });

  it("releases sticky on upward user scroll but ignores layout-driven height changes", () => {
    // Native scrollbar thumbs often never fire pointerdown — only scroll — so
    // stable-height movement must not require a prior user-scroll-intent flag.
    // Layout clamps and virtualizer anchor adjustments keep sticky.
    expect(
      shouldReleaseStickToBottom({
        prevScrollTop: 200,
        nextScrollTop: 150,
        isAtBottom: false,
        isProgrammaticScroll: false,
        scrollHeightShrunk: false,
        scrollHeightGrew: false,
        viewportHeightChanged: false,
        isVirtualizerLayoutChange: false,
        hasRecentUserScrollIntent: false,
      }),
    ).toBe(true);
    expect(
      shouldReleaseStickToBottom({
        prevScrollTop: 200,
        nextScrollTop: 150,
        isAtBottom: false,
        isProgrammaticScroll: true,
        scrollHeightShrunk: false,
        scrollHeightGrew: false,
        viewportHeightChanged: false,
        isVirtualizerLayoutChange: false,
        hasRecentUserScrollIntent: false,
      }),
    ).toBe(false);
    expect(
      shouldReleaseStickToBottom({
        prevScrollTop: 200,
        nextScrollTop: 150,
        isAtBottom: false,
        isProgrammaticScroll: false,
        scrollHeightShrunk: true,
        scrollHeightGrew: false,
        viewportHeightChanged: false,
        isVirtualizerLayoutChange: false,
        hasRecentUserScrollIntent: false,
      }),
    ).toBe(false);
    expect(
      shouldReleaseStickToBottom({
        prevScrollTop: 200,
        nextScrollTop: 150,
        isAtBottom: true,
        isProgrammaticScroll: false,
        scrollHeightShrunk: false,
        scrollHeightGrew: false,
        viewportHeightChanged: false,
        isVirtualizerLayoutChange: false,
        hasRecentUserScrollIntent: false,
      }),
    ).toBe(false);
    expect(
      shouldReleaseStickToBottom({
        prevScrollTop: 200,
        nextScrollTop: 150,
        isAtBottom: false,
        isProgrammaticScroll: false,
        scrollHeightShrunk: false,
        scrollHeightGrew: true,
        viewportHeightChanged: false,
        isVirtualizerLayoutChange: false,
        hasRecentUserScrollIntent: false,
      }),
    ).toBe(false);
    expect(
      shouldReleaseStickToBottom({
        prevScrollTop: 200,
        nextScrollTop: 150,
        isAtBottom: false,
        isProgrammaticScroll: false,
        scrollHeightShrunk: false,
        scrollHeightGrew: true,
        viewportHeightChanged: false,
        isVirtualizerLayoutChange: false,
        hasRecentUserScrollIntent: true,
      }),
    ).toBe(true);
    expect(
      shouldReleaseStickToBottom({
        prevScrollTop: 200,
        nextScrollTop: 150,
        isAtBottom: false,
        isProgrammaticScroll: false,
        scrollHeightShrunk: false,
        scrollHeightGrew: false,
        viewportHeightChanged: false,
        isVirtualizerLayoutChange: true,
        hasRecentUserScrollIntent: false,
      }),
    ).toBe(false);
    expect(
      shouldReleaseStickToBottom({
        prevScrollTop: 200,
        nextScrollTop: 150,
        isAtBottom: false,
        isProgrammaticScroll: false,
        scrollHeightShrunk: false,
        scrollHeightGrew: false,
        viewportHeightChanged: false,
        isVirtualizerLayoutChange: true,
        hasRecentUserScrollIntent: true,
      }),
    ).toBe(true);
    expect(
      shouldReleaseStickToBottom({
        prevScrollTop: 200,
        nextScrollTop: 150,
        isAtBottom: false,
        isProgrammaticScroll: false,
        scrollHeightShrunk: false,
        scrollHeightGrew: false,
        viewportHeightChanged: true,
        isVirtualizerLayoutChange: false,
        hasRecentUserScrollIntent: false,
      }),
    ).toBe(false);
  });

  it("does not arm scroll-intent for in-chat control clicks", () => {
    const button = document.createElement("button");
    const nested = document.createElement("span");
    button.append(nested);
    document.body.append(button);
    expect(shouldMarkUserScrollIntentFromPointerTarget(button)).toBe(false);
    expect(shouldMarkUserScrollIntentFromPointerTarget(nested)).toBe(false);

    const link = document.createElement("a");
    link.href = "#";
    document.body.append(link);
    expect(shouldMarkUserScrollIntentFromPointerTarget(link)).toBe(false);

    const blank = document.createElement("div");
    document.body.append(blank);
    expect(shouldMarkUserScrollIntentFromPointerTarget(blank)).toBe(true);
    expect(shouldMarkUserScrollIntentFromPointerTarget(null)).toBe(false);

    button.remove();
    link.remove();
    blank.remove();
  });

  it("does not arm scroll-intent for ARIA-role controls (React Aria / HeroUI)", () => {
    for (const role of [
      "button",
      "link",
      "checkbox",
      "radio",
      "switch",
      "option",
      "tab",
      "slider",
      "menuitem",
      "menuitemcheckbox",
      "menuitemradio",
    ]) {
      const el = document.createElement("div");
      el.setAttribute("role", role);
      const nested = document.createElement("span");
      el.append(nested);
      document.body.append(el);
      expect(shouldMarkUserScrollIntentFromPointerTarget(nested), `role=${role}`).toBe(false);
      el.remove();
    }
  });

  it("re-enables sticky at bottom unless the user is still scrolling up", () => {
    expect(
      shouldReenableStickToBottom({
        prevScrollTop: 100,
        nextScrollTop: 120,
        isAtBottom: true,
        hasRecentUserScrollIntent: true,
      }),
    ).toBe(true);
    expect(
      shouldReenableStickToBottom({
        prevScrollTop: 120,
        nextScrollTop: 118,
        isAtBottom: true,
        hasRecentUserScrollIntent: true,
      }),
    ).toBe(false);
    expect(
      shouldReenableStickToBottom({
        prevScrollTop: 120,
        nextScrollTop: 118,
        isAtBottom: true,
        hasRecentUserScrollIntent: false,
      }),
    ).toBe(true);
  });

  it("shows the scroll-down button only when unpinned and not at bottom", () => {
    expect(nextShowScrollDown({ stickToBottom: false, isAtBottom: false })).toBe(true);
    expect(nextShowScrollDown({ stickToBottom: true, isAtBottom: false })).toBe(false);
    expect(nextShowScrollDown({ stickToBottom: false, isAtBottom: true })).toBe(false);
  });

  it("trusts a recent at-bottom cache until its deadline when height is unchanged", () => {
    expect(
      shouldTrustCachedAtBottom({
        now: 100,
        cachedUntil: 400,
        scrollHeight: 1000,
        lastPinnedScrollHeight: 1000,
        clientHeight: 200,
        lastPinnedClientHeight: 200,
      }),
    ).toBe(true);
    expect(
      shouldTrustCachedAtBottom({
        now: 400,
        cachedUntil: 400,
        scrollHeight: 1000,
        lastPinnedScrollHeight: 1000,
        clientHeight: 200,
        lastPinnedClientHeight: 200,
      }),
    ).toBe(false);
    expect(
      shouldTrustCachedAtBottom({
        now: 100,
        cachedUntil: 400,
        scrollHeight: 1200,
        lastPinnedScrollHeight: 1000,
        clientHeight: 200,
        lastPinnedClientHeight: 200,
      }),
    ).toBe(false);
    expect(
      shouldTrustCachedAtBottom({
        now: 100,
        cachedUntil: 400,
        scrollHeight: 1000,
        lastPinnedScrollHeight: 1000,
        clientHeight: 200,
        lastPinnedClientHeight: 200,
        reconcileVirtualizer: true,
      }),
    ).toBe(false);
    expect(
      shouldTrustCachedAtBottom({
        now: 100,
        cachedUntil: 400,
        scrollHeight: 1000,
        lastPinnedScrollHeight: 1000,
        clientHeight: 240,
        lastPinnedClientHeight: 200,
      }),
    ).toBe(false);
  });

  it("extends the at-bottom cache through the open coalesce window", () => {
    expect(nextAtBottomCacheUntil({ now: 100, frameCacheMs: 16, coalesceUntil: 500 })).toBe(500);
    expect(nextAtBottomCacheUntil({ now: 100, frameCacheMs: 16, coalesceUntil: 50 })).toBe(116);
  });

  it("only re-pins during open storm when content or viewport height changes", () => {
    expect(
      shouldRepinForContentGrowth({
        stickToBottom: true,
        now: 100,
        coalesceUntil: 400,
        scrollHeight: 1000,
        lastPinnedScrollHeight: 1000,
        clientHeight: 200,
        lastPinnedClientHeight: 200,
      }),
    ).toBe(false);
    expect(
      shouldRepinForContentGrowth({
        stickToBottom: true,
        now: 100,
        coalesceUntil: 400,
        scrollHeight: 1100,
        lastPinnedScrollHeight: 1000,
        clientHeight: 200,
        lastPinnedClientHeight: 200,
      }),
    ).toBe(true);
    expect(
      shouldRepinForContentGrowth({
        stickToBottom: true,
        now: 100,
        coalesceUntil: 400,
        scrollHeight: 1000,
        lastPinnedScrollHeight: 1000,
        clientHeight: 240,
        lastPinnedClientHeight: 200,
      }),
    ).toBe(true);
    expect(
      shouldRepinForContentGrowth({
        stickToBottom: true,
        now: 500,
        coalesceUntil: 400,
        scrollHeight: 1000,
        lastPinnedScrollHeight: 1000,
        clientHeight: 200,
        lastPinnedClientHeight: 200,
      }),
    ).toBe(true);
    expect(
      shouldRepinForContentGrowth({
        stickToBottom: false,
        now: 100,
        coalesceUntil: 400,
        scrollHeight: 1000,
        lastPinnedScrollHeight: 1000,
        clientHeight: 200,
        lastPinnedClientHeight: 200,
      }),
    ).toBe(true);
  });

  it("coalesces layout sync during panel resize and thread-open storms", () => {
    expect(
      shouldCoalesceLayoutSync({
        isPanelResizing: true,
        initialScrollSettled: true,
        now: 1000,
        threadOpenCoalesceUntil: 0,
      }),
    ).toBe(true);
    expect(
      shouldCoalesceLayoutSync({
        isPanelResizing: false,
        initialScrollSettled: false,
        now: 1000,
        threadOpenCoalesceUntil: 0,
      }),
    ).toBe(true);
    expect(
      shouldCoalesceLayoutSync({
        isPanelResizing: false,
        initialScrollSettled: true,
        now: 100,
        threadOpenCoalesceUntil: 400,
      }),
    ).toBe(true);
    expect(
      shouldCoalesceLayoutSync({
        isPanelResizing: false,
        initialScrollSettled: true,
        now: 500,
        threadOpenCoalesceUntil: 400,
      }),
    ).toBe(false);
  });
});
