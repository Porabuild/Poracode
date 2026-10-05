import type { GroupingScenario, TaxonomyFrame } from "./types";
import { EDIT_PATH } from "./core";
import { taxonomyItem } from "./catalog";
import { imageDataUrl } from "./media-assets";

const png = imageDataUrl("png");

function frame(label: string, ids: readonly string[], rows: TaxonomyFrame["rows"]): TaxonomyFrame {
  return { label, items: ids.map((id) => taxonomyItem(id)), rows };
}
function repeatedFrame(count: number): TaxonomyFrame {
  const items = Array.from({ length: count }, (_, i) => taxonomyItem("read_full", `:${i}`));
  return { label: `${count} segments`, items, rows: [items.map((i) => i.id)] };
}
const categories = [
  "reasoning",
  "read_full",
  "search_local",
  "edit_unified",
  "command_command",
  "mcp_names",
  "tool_plain",
];
const childItems = [
  taxonomyItem("subagent_flagged"),
  ...[
    "reasoning",
    "read_full",
    "create_content",
    "edit_unified",
    "command_stream",
    "mcp_names",
    "image_jpeg_synthetic",
  ].map((id) => ({ ...taxonomyItem(id), parentItemId: "subagent_flagged" })),
  taxonomyItem("subagent_nested_child"),
  { ...taxonomyItem("read_full", ":inner"), parentItemId: "subagent_nested_child" },
];
export const GROUPING_SCENARIOS: readonly GroupingScenario[] = [
  {
    id: "group_single_vs_pair",
    frames: [
      frame("one", ["read_full"], ["read_full"]),
      {
        label: "pair",
        items: [taxonomyItem("read_full"), taxonomyItem("read_full", ":2")],
        rows: [["read_full", "read_full:2"]],
      },
      frame(
        "assistant break",
        ["read_full", "markdown_image", "command_command"],
        ["read_full", "markdown_image", "command_command"],
      ),
    ],
    uiChecksNotRun: [],
  },
  {
    id: "group_all_categories",
    frames: [
      frame("singular", categories, [categories]),
      {
        label: "plural",
        items: categories.flatMap((id) => [taxonomyItem(id), taxonomyItem(id, ":2")]),
        rows: [categories.flatMap((id) => [id, `${id}:2`])],
      },
    ],
    uiChecksNotRun: [],
  },
  {
    id: "group_8_9_overflow",
    frames: [8, 9, 32, 128, 512].map(repeatedFrame),
    uiChecksNotRun: [
      "latest-eight preview",
      "Show all/less",
      "scroll viewport",
      "reduced motion",
      "offscreen animation",
    ],
  },
  {
    id: "group_live_to_history",
    frames: [
      frame("tail", ["read_full", "command_stream"], [["read_full", "command_stream"]]),
      frame(
        "history",
        ["read_full", "command_stream", "markdown_image"],
        [["read_full", "command_stream"], "markdown_image"],
      ),
    ],
    uiChecksNotRun: ["default expansion", "auto-collapse", "manual disclosure persistence"],
  },
  {
    id: "group_edit_only",
    frames: [
      frame(
        "edit/thought/edit",
        ["edit_unified", "reasoning", "create_content"],
        [["edit_unified", "reasoning", "create_content"]],
      ),
      frame("thought only", ["reasoning"], ["reasoning"]),
      frame("mixed", ["edit_unified", "read_full"], [["edit_unified", "read_full"]]),
    ],
    uiChecksNotRun: ["edit-only live disclosure stays collapsed"],
  },
  {
    id: "group_same_file",
    frames: [
      ...[2, 8, 32].map((count) => {
        const items = Array.from({ length: count }, (_, i) =>
          taxonomyItem("edit_unified", `:${i}`),
        );
        return { label: `${count} edits`, items, rows: [items.map((i) => i.id)] };
      }),
      {
        label: "thought glue and trailing thought",
        items: [
          taxonomyItem("edit_unified"),
          taxonomyItem("reasoning"),
          taxonomyItem("edit_replacement"),
          taxonomyItem("reasoning", ":tail"),
        ],
        rows: [["edit_unified", "reasoning", "edit_replacement", "reasoning:tail"]],
      },
    ],
    uiChecksNotRun: ["merged diff body pixels"],
  },
  {
    id: "group_same_file_mixed",
    frames: [
      frame(
        "contiguous edit pair",
        ["read_full", "edit_unified", "edit_replacement", "command_command"],
        [["read_full", "edit_unified", "edit_replacement", "command_command"]],
      ),
      frame(
        "read breaks edit run",
        ["edit_unified", "read_full", "edit_replacement"],
        [["edit_unified", "read_full", "edit_replacement"]],
      ),
    ],
    uiChecksNotRun: [],
  },
  {
    id: "group_missing_stats",
    frames: [
      {
        label: "missing stats",
        items: [
          taxonomyItem("edit_unified"),
          {
            id: "missing-edit",
            type: "file_change",
            state: "completed",
            streams: {},
            payload: { path: EDIT_PATH, changeKind: "edit", status: "success" },
          },
        ],
        rows: [["edit_unified", "missing-edit"]],
      },
      frame(
        "complete stats",
        ["edit_unified", "edit_replacement"],
        [["edit_unified", "edit_replacement"]],
      ),
    ],
    uiChecksNotRun: [],
  },
  {
    id: "group_media_unfold",
    frames: (["tool_call", "mcp_tool_call", "dynamic_tool_call", "image_view"] as const).flatMap(
      (type) =>
        (["running", "success", "error"] as const).map((status) => {
          const image = {
            ...taxonomyItem("image_png"),
            type,
            state: status === "running" ? ("started" as const) : ("completed" as const),
            payload: {
              name: "FixtureImage",
              status,
              ...(status !== "running" ? { images: [png] } : {}),
            },
          };
          return {
            label: `${type}:${status}`,
            items: [taxonomyItem("read_full"), image, taxonomyItem("command_command")],
            rows:
              status === "success"
                ? ["read_full", "image_png", "command_command"]
                : [["read_full", "image_png", "command_command"]],
          };
        }),
    ),
    uiChecksNotRun: ["image readiness/decode/paint in app"],
  },
  {
    id: "group_delegation_exclusion",
    frames: [
      frame(
        "root pills",
        [
          "read_full",
          "subagent_flagged",
          "crossagent_flagged",
          "workflow_manifest",
          "command_command",
        ],
        [
          "read_full",
          "subagent_flagged",
          "crossagent_flagged",
          "workflow_manifest",
          "command_command",
        ],
      ),
      frame(
        "MCP flags",
        ["read_full", "mcp-spelling:0", "command_command"],
        [["read_full", "mcp-spelling:0", "command_command"]],
      ),
      {
        label: "wrong bucket",
        items: [
          taxonomyItem("read_full"),
          { ...taxonomyItem("subagent_flagged"), type: "dynamic_tool_call" },
          taxonomyItem("command_command"),
        ],
        rows: [["read_full", "subagent_flagged", "command_command"]],
      },
    ],
    uiChecksNotRun: ["pills/overlay actions"],
  },
  {
    id: "group_special_exclusion",
    frames: [
      frame(
        "visible specials",
        ["read_full", "plan_proposal", "compaction", "question_answer", "command_command"],
        ["read_full", "plan_proposal", "compaction", "question_answer", "command_command"],
      ),
      frame(
        "hidden controls",
        [
          "read_full",
          "plan_dock",
          "goal_dock",
          "error_item_hidden",
          "question-name:0",
          "crossagent_spawn_transport",
          "command_command",
        ],
        [["read_full", "command_command"]],
      ),
    ],
    uiChecksNotRun: ["request form rendering"],
  },
  {
    id: "group_child_timeline",
    frames: [
      {
        label: "outer",
        items: childItems,
        parentItemId: "subagent_flagged",
        rows: [
          [
            "reasoning",
            "read_full",
            "create_content",
            "edit_unified",
            "command_stream",
            "mcp_names",
          ],
          "image_jpeg_synthetic",
          "subagent_nested_child",
        ],
      },
      {
        label: "inner",
        items: childItems,
        parentItemId: "subagent_nested_child",
        rows: ["read_full:inner"],
      },
      { label: "root", items: childItems, rows: ["subagent_flagged"] },
    ],
    uiChecksNotRun: ["overlay subscribe/drain", "open/close bursts"],
  },
  {
    id: "group_background_running",
    frames: [
      frame(
        "running after turn",
        ["read_full", "command_stream"],
        [["read_full", "command_stream"]],
      ),
      frame("settled", ["read_full", "command_error"], [["read_full", "command_error"]]),
    ],
    uiChecksNotRun: ["collapsed header shimmer clears at authoritative completion"],
  },
];
