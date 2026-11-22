import { describe, expect, it } from "vitest";
import {
  applyOpenCodeToolContent,
  createOpenCodeToolItem,
  openCodeToolPayload,
} from "./toolPayload";
import { readToolVideoSources } from "@/shared/chatVideo";
import { readOpenCodeString } from "./readers";

describe("OpenCode plugin tool classification", () => {
  it("normalizes native video file content into standard resource links", () => {
    const item = createOpenCodeToolItem("video", "record_demo");
    applyOpenCodeToolContent(item, [
      { type: "text", text: "Recorded" },
      { type: "file", uri: "file:///tmp/demo.mp4", mime: "video/mp4", name: "Demo" },
    ]);
    expect(readToolVideoSources(openCodeToolPayload(item).result)).toEqual([
      { src: "file:///tmp/demo.mp4", name: "Demo", mimeType: "video/mp4" },
    ]);
  });
  it.each(["create_goal", "delete_calendar_event", "shell_preferences", "plugin_websearch_config"])(
    "keeps %s as a generic tool without invented file or shell fields",
    (name) => {
      const item = createOpenCodeToolItem("item", name);
      expect(item.itemType).toBe("tool_call");
      expect(openCodeToolPayload(item)).not.toHaveProperty("path");
      expect(openCodeToolPayload(item)).not.toHaveProperty("command");
    },
  );
  it.each([
    ["write", "file_change"],
    ["apply_patch", "file_change"],
    ["shell", "command_execution"],
    ["websearch", "web_search"],
  ])("preserves the native %s row", (name, expected) => {
    expect(createOpenCodeToolItem("item", name!).itemType).toBe(expected);
  });

  it("treats whitespace-only strings as absent and falls through", () => {
    expect(readOpenCodeString({ command: "   ", cmd: "ls" }, "command", "cmd")).toBe("ls");
    expect(readOpenCodeString({ command: "   " }, "command", "cmd")).toBeUndefined();
  });

  it("populates diffSummary on file_change payloads", () => {
    const item = createOpenCodeToolItem("edit-1", "edit");
    item.input = { filePath: "src/a.ts", oldString: "old\n", newString: "new\nextra\n" };
    item.status = "success";
    expect(openCodeToolPayload(item)).toMatchObject({
      name: "edit",
      path: "src/a.ts",
      diffSummary: { added: 2, removed: 1 },
    });
  });

  it("omits inline images when read targets a Poracode user attachment", () => {
    const attachmentItem = createOpenCodeToolItem("read-att", "read");
    attachmentItem.input = {
      filePath: "/Users/me/.poracode-nightly/attachments/draft-1/Image 1.png",
    };
    attachmentItem.status = "success";
    applyOpenCodeToolContent(attachmentItem, [
      { type: "file", uri: "data:image/png;base64,iVBORw0KGgo=", mime: "image/png" },
    ]);
    expect(openCodeToolPayload(attachmentItem).images).toBeUndefined();

    const regularItem = createOpenCodeToolItem("read-regular", "read");
    regularItem.input = { filePath: "/tmp/screenshot.png" };
    regularItem.status = "success";
    applyOpenCodeToolContent(regularItem, [
      { type: "file", uri: "data:image/png;base64,iVBORw0KGgo=", mime: "image/png" },
    ]);
    expect(openCodeToolPayload(regularItem).images).toEqual(["data:image/png;base64,iVBORw0KGgo="]);
  });
});
