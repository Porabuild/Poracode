import type { TaxonomyCase } from "./types";
import { itemCase, toolCase } from "./builders";
import { EDIT_PATH, NEW_TEXT } from "./core";

export const READ_PAYLOAD_CASES: readonly TaxonomyCase[] = [
  toolCase(
    "tool_plain",
    {
      name: "FixtureTool",
      kind: "other",
      args: "plain request",
      result: "start-marker\nplain result\nend-marker",
      status: "success",
    },
    "other",
  ),
  toolCase(
    "tool_json",
    {
      name: "FixtureJson",
      args: { nested: { enabled: true } },
      result: { records: [{ id: 1, ok: true }] },
      status: "success",
    },
    "other",
  ),
  toolCase(
    "tool_result_envelopes",
    {
      name: "FixtureResult",
      result: { detailedContent: "full-marker", text: "text-marker", content: "preview-marker" },
      status: "success",
    },
    "other",
  ),
  toolCase("tool_header_only", { name: "FixtureHeader", status: "success" }, "other"),
  toolCase("tool_unnamed_late", { name: "", status: "running" }, "other", { visible: false }),
  toolCase(
    "tool_think_kind",
    {
      name: "Thinking through fixture",
      kind: "think",
      result: "thought-like output",
      status: "success",
    },
    "other",
  ),
  toolCase(
    "tool_switch_mode",
    { name: "planning", kind: "switch_mode", result: { mode: "planning" }, status: "success" },
    "other",
  ),
  toolCase(
    "read_full",
    {
      name: "Read",
      kind: "read",
      args: { file_path: EDIT_PATH },
      result: NEW_TEXT,
      status: "success",
    },
    "viewed",
  ),
  toolCase(
    "read_range",
    {
      name: "Read",
      kind: "read",
      args: { file_path: EDIT_PATH, offset: 5, limit: 3 },
      result: "5: const n = 1;\n6: const m = 2;\n7: const endMarker = true;",
      status: "success",
    },
    "viewed",
  ),
  toolCase(
    "read_structured",
    {
      name: "ReadFile",
      kind: "read",
      args: { filePath: EDIT_PATH },
      result: { FileContent: { raw_output: NEW_TEXT, path: EDIT_PATH } },
      status: "success",
    },
    "viewed",
  ),
  toolCase(
    "read_lazy",
    {
      name: "read_file",
      kind: "read",
      locations: [{ path: "/tmp/tool-taxonomy/fixture.ts", line: 1 }],
      status: "success",
    },
    "viewed",
  ),
  toolCase(
    "search_local",
    {
      name: "Grep",
      kind: "search",
      args: { pattern: "fixture", path: "src", glob: "*.ts" },
      locations: [{ path: EDIT_PATH, line: 4 }],
      result: "src/fixture.ts:4:fixture-marker",
      status: "success",
    },
    "searched",
  ),
  toolCase(
    "fetch",
    {
      name: "Fetch fixture",
      kind: "fetch",
      args: { url: "https://fixture.invalid/page" },
      result: { text: "offline fetched-result-marker" },
      status: "success",
    },
    "searched",
  ),
  itemCase(
    "web_search",
    "web_search",
    {
      query: "fixture query",
      name: "WebSearch",
      result: {
        contents: [
          { type: "text", text: "one" },
          { type: "text", text: "two" },
        ],
      },
    },
    "searched",
  ),
];
