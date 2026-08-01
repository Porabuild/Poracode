import { describe, expect, it } from "vitest";
import { MAX_KEEP_ALIVE_PANES, removeKeepAliveId, touchKeepAliveIds } from "./paneCacheSlice";

describe("paneCacheSlice", () => {
  it("adds touched panes to the end", () => {
    expect(touchKeepAliveIds(["a", "b"], "a", [])).toEqual(["b", "a"]);
  });

  it("removes a pane", () => {
    expect(removeKeepAliveId(["a", "b"], "a")).toEqual(["b"]);
  });

  it("evicts the oldest hidden pane past the cap", () => {
    const current = Array.from({ length: MAX_KEEP_ALIVE_PANES }, (_, index) => `hidden-${index}`);
    expect(touchKeepAliveIds(current, "new", [])).toEqual([...current.slice(1), "new"]);
  });

  it("keeps visible panes when enforcing the cap", () => {
    const current = [
      "visible",
      ...Array.from({ length: MAX_KEEP_ALIVE_PANES - 1 }, (_, index) => `hidden-${index}`),
    ];
    const next = touchKeepAliveIds(current, "new", ["visible"]);
    expect(next).toContain("visible");
    expect(next).not.toContain("hidden-0");
  });
});
