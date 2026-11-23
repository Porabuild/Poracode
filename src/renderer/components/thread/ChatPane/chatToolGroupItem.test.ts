import { describe, expect, it } from "vitest";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { isToolGroupItem } from "./chatToolGroupItem";

describe("isToolGroupItem", () => {
  function videoResultTool(kind: string): RuntimeChatItem {
    return {
      id: `tool-${kind}`,
      type: "tool_call",
      state: "completed",
      payload: {
        name: "Find files matching `*e2e*`",
        kind,
        status: "success",
        result: {
          content: [{ type: "resource_link", name: "clip.mp4", uri: "file:///tmp/clip.mp4" }],
        },
      },
      streams: {},
    };
  }

  it("keeps a search whose hit is a video inside the tool group", () => {
    expect(isToolGroupItem(videoResultTool("search"))).toBe(true);
    // A tool that returns a clip it produced still renders outside the group.
    expect(isToolGroupItem(videoResultTool("other"))).toBe(false);
  });
});
