import { describe, expect, it } from "vitest";
import { createOpenCode2ToolItem, openCode2ToolPayload } from "./toolPayload";
import { readOpenCode2String } from "./readers";

describe("OpenCode 2 plugin tool classification", () => {
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
});
