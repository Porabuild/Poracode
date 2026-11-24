import { describe, expect, it } from "vitest";
import {
  applyOpenCodeToolContent,
  applyOpenCodeToolMetadata,
  createOpenCodeToolItem,
  openCodeToolPayload,
  readOpenCodeScriptCalls,
} from "./toolPayload";
import { toolCallPayloadSchema } from "@/shared/contracts";
import { isVisibleRuntimeItem } from "@/shared/runtimeItemVisibility";
import { isAskUserQuestionToolName } from "@/shared/toolCallClassification";
import { GOAL_TOOL_TITLES } from "./goals";
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

describe("OpenCode tool titles", () => {
  const payloadOf = (name: string, input?: Record<string, unknown>) => {
    const item = createOpenCodeToolItem("item", name);
    item.input = input;
    item.status = "success";
    return openCodeToolPayload(item);
  };

  it.each([
    ...Object.entries(GOAL_TOOL_TITLES),
    ["todowrite", "Update todo list"],
    ["generate_image", "Generate image"],
    ["image_generate", "Generate image"],
    ["experimental_image_generate", "Generate image"],
    ["generate_video", "Generate video"],
  ])("titles the identifier-named %s tool", (name, title) => {
    expect(payloadOf(name!, { objective: "x" })).toMatchObject({
      name: title,
      title,
      status: "success",
      args: { objective: "x" },
    });
  });

  it("titles the question tool without the spelling the shared pane hides", () => {
    // The row is the transcript's only record of the exchange.
    const payload = payloadOf("question", { questions: [] });
    expect(payload).toMatchObject({ name: "Question", kind: "other" });
    expect(isAskUserQuestionToolName(payload.name)).toBe(false);
  });

  it("leaves tools it cannot name as they arrived", () => {
    expect(payloadOf("delete_calendar_event")).toMatchObject({
      name: "delete_calendar_event",
      status: "success",
    });
    expect(payloadOf("delete_calendar_event")).not.toHaveProperty("title");
    // A plain property read would answer with `Object.prototype` members.
    expect(payloadOf("constructor").name).toBe("constructor");
    expect(payloadOf("__proto__").name).toBe("__proto__");
    expect(payloadOf("toString").name).toBe("toString");
  });

  it("normalizes a skill load onto the canonical skill row", () => {
    expect(payloadOf("skill", { id: "deep-review" })).toEqual({
      name: "Skill",
      title: "Skill: deep-review",
      status: "success",
      args: { skill: "deep-review", id: "deep-review" },
    });
    // A skill named through the `name` argument normalizes the same way.
    expect(payloadOf("skill", { name: "deep-review" })).toMatchObject({
      args: { skill: "deep-review", name: "deep-review" },
      title: "Skill: deep-review",
    });
  });

  it("reads the tools a Code Mode script called from its metadata", () => {
    const item = createOpenCodeToolItem("item", "execute");
    expect(readOpenCodeScriptCalls({ toolCalls: [] })).toBeUndefined();
    expect(readOpenCodeScriptCalls({ toolCalls: "search" })).toBeUndefined();
    applyOpenCodeToolMetadata(item, {
      toolCalls: [
        { tool: "search", status: "completed" },
        { tool: "search", status: "completed" },
        { status: "completed" },
        { name: "opencode.worktree_list", status: "completed" },
      ],
      truncated: true,
    });
    expect(item.scriptCalls).toEqual(["search", "opencode.worktree_list"]);
    item.status = "success";
    expect(openCodeToolPayload(item)).toMatchObject({
      name: "Execute: search, opencode.worktree_list",
    });
  });
});

describe("OpenCode rows persisted before readable tool titles", () => {
  it("keeps the previous released shapes valid and visible", () => {
    // Earlier releases stored the wire names as they arrived, and gave the
    // compaction row a `reason` argument. History is never rewritten, so those
    // rows must keep parsing and stay visible exactly as they rendered before.
    const previous = [
      { name: "skill", status: "success", args: { id: "gh-cli" } },
      { name: "execute", status: "success", args: { code: "return 1" } },
      { name: "create_goal", status: "success", args: {} },
      { name: "question", status: "success", kind: "other", args: { questions: [] } },
      { name: "compact", status: "success", args: { reason: "manual" } },
      { name: "compact", status: "error", args: { reason: "auto" }, result: "failed" },
    ];
    for (const payload of previous) {
      expect(toolCallPayloadSchema.safeParse(payload).success).toBe(true);
      expect(
        isVisibleRuntimeItem({ type: "tool_call", state: "completed", payload, streams: {} }),
      ).toBe(true);
    }
  });
});
