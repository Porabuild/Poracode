import { expect, test } from "bun:test";
import {
  deriveToolDisplay,
  deriveWebSearchDisplay,
  getCommandExecutionCollapsedHeader,
  i18n,
  summarizeToolCalls,
  type RuntimeChatItem,
} from "./presentation";

const item = (type: string, payload: unknown, state: RuntimeChatItem["state"] = "completed") =>
  ({ id: `${type}-1`, type, state, payload, streams: {} }) as unknown as RuntimeChatItem;

test("desktop presentation modules load in the TUI runtime with English labels", () => {
  expect(
    deriveToolDisplay({ name: "Read", status: "success", args: { file_path: "src/app.ts" } }).title,
  ).toBe("View: src/app.ts");
  expect(
    getCommandExecutionCollapsedHeader(item("command_execution", { command: "rg -n foo src" }), {
      command: "rg -n foo src",
    }).display,
  ).toEqual({ title: 'Search: "foo"', kind: "search" });
  expect(deriveWebSearchDisplay({ query: "bun test" }, (d) => i18n._(d)).title).toBe("bun test");
  expect(
    summarizeToolCalls([
      item("reasoning", {}),
      item("file_change", {
        path: "a.ts",
        changeKind: "edit",
        diffSummary: { added: 2, removed: 1 },
      }),
      item("command_execution", { command: "bun test" }),
    ]).map((section) => [section.label, section.count, section.diffSummary]),
  ).toEqual([
    ["edit", 1, { added: 2, removed: 1 }],
    ["command", 1, undefined],
    ["thought", 1, undefined],
  ]);
});

test("macro shims interpolate template values and descriptor placeholders", () => {
  expect(i18n._({ id: "x", message: "Hello {name}", values: { name: "Pora" } })).toBe("Hello Pora");
});
