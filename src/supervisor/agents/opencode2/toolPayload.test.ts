import { describe, expect, it } from "vitest";
import {
  applyOpenCode2ToolContent,
  createOpenCode2ToolItem,
  openCode2ToolPayload,
} from "./toolPayload";
import { readToolVideoSources } from "@/shared/chatVideo";
import { readOpenCode2String } from "./readers";

describe("OpenCode 2 plugin tool classification", () => {
  it("normalizes native video file content into standard resource links", () => {
    const item = createOpenCode2ToolItem("video", "record_demo");
    applyOpenCode2ToolContent(item, [
      { type: "text", text: "Recorded" },
      { type: "file", uri: "file:///tmp/demo.mp4", mime: "video/mp4", name: "Demo" },
    ]);
    expect(readToolVideoSources(openCode2ToolPayload(item).result)).toEqual([
      { src: "file:///tmp/demo.mp4", name: "Demo", mimeType: "video/mp4" },
    ]);
  });
  it.each(["create_goal", "delete_calendar_event", "shell_preferences", "plugin_websearch_config"])(
    "keeps %s as a generic tool without invented file or shell fields",
    (name) => {
      const item = createOpenCode2ToolItem("item", name);
      expect(item.itemType).toBe("tool_call");
      expect(openCode2ToolPayload(item)).not.toHaveProperty("path");
      expect(openCode2ToolPayload(item)).not.toHaveProperty("command");
    },
  );
  it.each([
    ["write", "file_change"],
    ["apply_patch", "file_change"],
    ["shell", "command_execution"],
    ["websearch", "web_search"],
  ])("preserves the native %s row", (name, expected) => {
    expect(createOpenCode2ToolItem("item", name!).itemType).toBe(expected);
  });

  it("treats whitespace-only strings as absent and falls through", () => {
    expect(readOpenCode2String({ command: "   ", cmd: "ls" }, "command", "cmd")).toBe("ls");
    expect(readOpenCode2String({ command: "   " }, "command", "cmd")).toBeUndefined();
  });

  it("populates diffSummary on file_change payloads", () => {
    const item = createOpenCode2ToolItem("edit-1", "edit");
    item.input = { filePath: "src/a.ts", oldString: "old\n", newString: "new\nextra\n" };
    item.status = "success";
    expect(openCode2ToolPayload(item)).toMatchObject({
      name: "edit",
      path: "src/a.ts",
      diffSummary: { added: 2, removed: 1 },
    });
  });

  it("omits inline images when read targets a Poracode user attachment", () => {
    const attachmentItem = createOpenCode2ToolItem("read-att", "read");
    attachmentItem.input = {
      filePath: "/Users/me/.poracode-nightly/attachments/draft-1/Image 1.png",
    };
    attachmentItem.status = "success";
    applyOpenCode2ToolContent(attachmentItem, [
      { type: "file", uri: "data:image/png;base64,iVBORw0KGgo=", mime: "image/png" },
    ]);
    expect(openCode2ToolPayload(attachmentItem).images).toBeUndefined();

    const regularItem = createOpenCode2ToolItem("read-regular", "read");
    regularItem.input = { filePath: "/tmp/screenshot.png" };
    regularItem.status = "success";
    applyOpenCode2ToolContent(regularItem, [
      { type: "file", uri: "data:image/png;base64,iVBORw0KGgo=", mime: "image/png" },
    ]);
    expect(openCode2ToolPayload(regularItem).images).toEqual([
      "data:image/png;base64,iVBORw0KGgo=",
    ]);
  });
});
