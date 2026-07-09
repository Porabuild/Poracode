import { describe, expect, it, vi } from "vitest";
import {
  collapsedHeightFromComputedStyle,
  createCollapsedHeightCache,
  hasUserMessageVisualOverflow,
  parseCssLineHeight,
  parseCssPx,
  shouldNotifyUserMessageHeightChange,
  USER_MESSAGE_COLLAPSED_LINE_COUNT,
  USER_MESSAGE_OVERFLOW_EPSILON_PX,
} from "./userMessageOverflow";

describe("userMessageOverflow", () => {
  it("notifies height change only when clamp height can change", () => {
    expect(
      shouldNotifyUserMessageHeightChange({
        wasFirstMeasure: true,
        overflowChanged: false,
        nextHasVisualOverflow: true,
      }),
    ).toBe(false);
    expect(
      shouldNotifyUserMessageHeightChange({
        wasFirstMeasure: true,
        overflowChanged: false,
        nextHasVisualOverflow: false,
      }),
    ).toBe(true);
    expect(
      shouldNotifyUserMessageHeightChange({
        wasFirstMeasure: false,
        overflowChanged: true,
        nextHasVisualOverflow: true,
      }),
    ).toBe(true);
    expect(
      shouldNotifyUserMessageHeightChange({
        wasFirstMeasure: false,
        overflowChanged: false,
        nextHasVisualOverflow: false,
      }),
    ).toBe(false);
  });

  it("detects overflow past the collapsed height epsilon", () => {
    expect(
      hasUserMessageVisualOverflow({
        fullHeightPx: 100,
        collapsedHeightPx: 88,
      }),
    ).toBe(true);
    expect(
      hasUserMessageVisualOverflow({
        fullHeightPx: 90,
        collapsedHeightPx: 88,
      }),
    ).toBe(false);
    expect(USER_MESSAGE_OVERFLOW_EPSILON_PX).toBe(2);
  });

  it("parses css lengths used for collapsed height", () => {
    expect(parseCssPx("16px")).toBe(16);
    expect(parseCssPx("not-a-number")).toBeNull();
    expect(parseCssLineHeight("22px", 16)).toBe(22);
    expect(parseCssLineHeight("1.375", 16)).toBe(22);
    expect(parseCssLineHeight("normal", 16)).toBe(16 * 1.375);
  });

  it("computes and caches collapsed height from typography", () => {
    const px = collapsedHeightFromComputedStyle({
      fontSize: "16px",
      lineHeight: "22px",
    });
    expect(px).toBe(22 * USER_MESSAGE_COLLAPSED_LINE_COUNT);

    const cache = createCollapsedHeightCache();
    const style = { fontSize: "16px", lineHeight: "22px" };
    expect(cache.get(style)).toBe(px);
    expect(cache.get(style)).toBe(px);
    expect(cache.get({ fontSize: "14px", lineHeight: "20px" })).toBe(
      20 * USER_MESSAGE_COLLAPSED_LINE_COUNT,
    );
  });

  it("reuses shared collapsed height without re-reading style", () => {
    const cache = createCollapsedHeightCache();
    type StyleReader = () => { fontSize: string; lineHeight: string };
    const readStyle = vi.fn<StyleReader>(() => ({
      fontSize: "16px",
      lineHeight: "22px",
    }));
    expect(cache.getShared(readStyle)).toBe(22 * USER_MESSAGE_COLLAPSED_LINE_COUNT);
    expect(cache.getShared(readStyle)).toBe(22 * USER_MESSAGE_COLLAPSED_LINE_COUNT);
    expect(readStyle).toHaveBeenCalledTimes(1);
    cache.clear();
    expect(cache.getShared(readStyle)).toBe(22 * USER_MESSAGE_COLLAPSED_LINE_COUNT);
    expect(readStyle).toHaveBeenCalledTimes(2);
  });
});
