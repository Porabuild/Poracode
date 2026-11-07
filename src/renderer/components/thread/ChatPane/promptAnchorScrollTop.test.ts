import { afterEach, describe, expect, it } from "vitest";
import { useAppStore } from "@/renderer/state/appStore";
import { promptAnchorScrollTop } from "./promptAnchorScrollTop";

function buildScroller(rowTop: number, scrollTop: number) {
  const scroller = document.createElement("div");
  const row = document.createElement("div");
  row.dataset.chatVirtualRow = "true";
  row.dataset.itemId = "prompt-1";
  scroller.append(row);
  scroller.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
  row.getBoundingClientRect = () => ({ top: 100 + rowTop }) as DOMRect;
  Object.defineProperty(scroller, "scrollTop", { configurable: true, value: scrollTop });
  return scroller;
}

describe("promptAnchorScrollTop", () => {
  afterEach(() => {
    useAppStore.setState({ chatPromptAnchorIds: {} });
  });

  it("returns null when the thread has no anchored prompt", () => {
    expect(promptAnchorScrollTop(buildScroller(0, 500), "thread-1")).toBeNull();
  });

  it("returns the scroll offset that puts the anchored row flush with the top", () => {
    useAppStore.setState({ chatPromptAnchorIds: { "thread-1": "prompt-1" } });
    expect(promptAnchorScrollTop(buildScroller(0, 500), "thread-1")).toBe(500);
    expect(promptAnchorScrollTop(buildScroller(40, 500), "thread-1")).toBe(540);
  });

  it("returns null when the anchored row is not rendered", () => {
    useAppStore.setState({ chatPromptAnchorIds: { "thread-1": "other" } });
    expect(promptAnchorScrollTop(buildScroller(0, 500), "thread-1")).toBeNull();
  });
});
