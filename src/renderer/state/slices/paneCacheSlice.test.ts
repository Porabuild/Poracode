import { describe, expect, it } from "vitest";
import { makeDraftPaneId } from "@/shared/paneId";
import {
  keepAlivePatch,
  MAX_KEEP_ALIVE_PANES,
  removeKeepAliveId,
  touchKeepAliveIds,
} from "./paneCacheSlice";

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

  it("keeps the outgoing terminal pane when opening another thread", () => {
    const patch = keepAlivePatch(
      {
        keepAlivePaneIds: [],
        view: { kind: "thread", panes: ["command-code"] },
        threads: [
          { id: "command-code", presentationMode: "terminal" },
          { id: "opencode", presentationMode: "terminal" },
        ],
      },
      "opencode",
    );
    expect(patch.keepAlivePaneIds).toEqual(["command-code", "opencode"]);
  });

  it("skips unknown, draft and GUI panes so they do not consume the LRU cap", () => {
    const draftId = makeDraftPaneId("project");
    const patch = keepAlivePatch(
      {
        keepAlivePaneIds: [],
        view: { kind: "thread", panes: [draftId, "gui-thread"] },
        threads: [
          { id: "gui-thread", presentationMode: "gui" },
          { id: "terminal-thread", presentationMode: "terminal" },
        ],
      },
      ["unknown-thread", "terminal-thread"],
    );
    expect(patch.keepAlivePaneIds).toEqual(["terminal-thread"]);
  });
});
