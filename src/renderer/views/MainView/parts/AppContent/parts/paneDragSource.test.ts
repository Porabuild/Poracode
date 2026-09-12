import { describe, expect, it } from "vitest";
import { paneDragSourceOptions } from "./paneDragSource";

describe("paneDragSourceOptions", () => {
  it("keeps a lone pane's element away from dnd-kit so it is never marked a disabled button", () => {
    expect(paneDragSourceOptions({ paneId: "t1", paneCount: 1 })).toEqual({
      options: {
        id: "pane:t1",
        type: "pane",
        data: { type: "pane", paneId: "t1" },
        disabled: true,
      },
      registerElement: false,
    });
  });

  it("registers the pane element once a drag handle exists", () => {
    expect(paneDragSourceOptions({ paneId: "t1", paneCount: 2 })).toEqual({
      options: {
        id: "pane:t1",
        type: "pane",
        data: { type: "pane", paneId: "t1" },
        disabled: false,
      },
      registerElement: true,
    });
  });
});
