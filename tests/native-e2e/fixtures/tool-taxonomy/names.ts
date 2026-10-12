import type { AcpToolKind } from "@/shared/contracts";
import type { GroupCategory } from "@/renderer/components/thread/ChatPane/parts/items/toolCallCategorization";
import type { TaxonomyCase } from "./types";
import { toolCase } from "./builders";
import { EDIT_PATH, PATCH_TEXT } from "./core";

type NameRow = readonly [
  name: string,
  args: unknown,
  category: GroupCategory,
  title: string,
  icon: string,
];
// One row per declared raw title name. Expectations are authored, never obtained
// from the production resolver under test. Overlapping category names occur once.
const RAW_NAME_ROWS = [
  [
    "Read",
    { file_path: EDIT_PATH, offset: 2, limit: 3 },
    "viewed",
    `View 2:4: ${EDIT_PATH}`,
    "Eye",
  ],
  ["NotebookRead", { notebook_path: "fixture.ipynb" }, "viewed", "View: fixture.ipynb", "Eye"],
  ["Grep", { pattern: "fixture", path: "src" }, "searched", 'Grep: "fixture" in src', "SearchCode"],
  ["Glob", { pattern: "src/*.ts" }, "searched", "Glob: src/*.ts", "FolderSearch"],
  ["LS", { path: "src" }, "searched", "List: src", "FolderSearch"],
  ["List", { path: "src" }, "searched", "List: src", "FolderSearch"],
  ["Task", { description: "fixture" }, "other", "Agent: fixture", "Bot"],
  ["Agent", { description: "fixture" }, "other", "Agent: fixture", "Bot"],
  ["BashOutput", { bash_id: "shell-1" }, "executed", "Bash output: shell-1", "Terminal"],
  ["KillBash", { shell_id: "shell-1" }, "executed", "Kill bash: shell-1", "Terminal"],
  ["KillShell", { bash_id: "shell-1" }, "executed", "Kill bash: shell-1", "Terminal"],
  ["ExitPlanMode", { plan: "Fixture plan" }, "other", "Exit plan mode", "Wrench"],
  ["EnterPlanMode", {}, "other", "Enter plan mode", "Wrench"],
  [
    "WebFetch",
    { url: "https://fixture.invalid" },
    "searched",
    "Fetch: https://fixture.invalid",
    "Globe",
  ],
  ["WebSearch", { query: "fixture" }, "searched", "Web search: fixture", "Globe"],
  [
    "ToolSearch",
    { query: "fixture tools" },
    "searched",
    "Tool search: fixture tools",
    "SearchCode",
  ],
  [
    "ScheduleWakeup",
    { delaySeconds: 61, reason: "fixture" },
    "other",
    "Wake up in 1m: fixture",
    "Clock",
  ],
  ["TaskCreate", { description: "fixture" }, "other", "Create task: fixture", "FilePlus"],
  ["TaskList", {}, "other", "List tasks", "FolderSearch"],
  ["TaskGet", { id: "task-1" }, "other", "Get task: task-1", "Eye"],
  ["TaskUpdate", { id: "task-1" }, "other", "Update task: task-1", "Pencil"],
  ["TaskOutput", { id: "task-1" }, "other", "Task output: task-1", "Terminal"],
  ["TaskStop", { id: "task-1" }, "other", "Stop task: task-1", "Trash2"],
  ["imageView", { path: "media/fixture.png" }, "other", "Image: media/fixture.png", "ImageIcon"],
  [
    "ImageView",
    { file_path: "media/fixture.png" },
    "other",
    "Image: media/fixture.png",
    "ImageIcon",
  ],
  [
    "ViewImage",
    { image_path: "media/fixture.png" },
    "other",
    "Image: media/fixture.png",
    "ImageIcon",
  ],
  ["Image", { source: "media/fixture.png" }, "other", "Image: media/fixture.png", "ImageIcon"],
] as const satisfies readonly NameRow[];
export const RAW_TITLE_NAMES = RAW_NAME_ROWS.map(([name]) => name);
export const EDIT_CATEGORY_NAMES = [
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
  "Patch",
  "ApplyPatch",
  "apply_patch",
] as const;
export const TOOL_NAME_CASES: readonly TaxonomyCase[] = [
  ...RAW_NAME_ROWS.map(([name, args, category, title, icon]) =>
    toolCase(`name:${name}`, { name, args, status: "success" }, category, {
      title,
      icon,
      subagent: false,
      ...(name === "ExitPlanMode" ? { planProposal: true, groupEligible: false } : {}),
    }),
  ),
  ...EDIT_CATEGORY_NAMES.map((name) =>
    toolCase(
      `name:${name}`,
      { name, args: { patchText: PATCH_TEXT }, status: "success" },
      "edited",
      {
        title: /apply/i.test(name) ? `Edit: ${EDIT_PATH}` : name,
        icon: /apply/i.test(name) ? "Pencil" : "Wrench",
      },
    ),
  ),
  toolCase(
    "name:Bash",
    { name: "Bash", args: { command: "echo fixture" }, status: "success" },
    "executed",
    { title: "Bash", icon: "Wrench" },
  ),
];

export const KIND_EXPECTATIONS: Readonly<
  Record<AcpToolKind, readonly [GroupCategory, string, string]>
> = {
  read: ["viewed", `View: ${EDIT_PATH}`, "Eye"],
  edit: ["edited", `Edit: ${EDIT_PATH}`, "Pencil"],
  delete: ["edited", `Delete: ${EDIT_PATH}`, "Trash2"],
  move: ["edited", `Move: ${EDIT_PATH}`, "Pencil"],
  search: ["searched", 'Search: "fixture"', "SearchCode"],
  execute: ["executed", "Run: echo fixture", "Terminal"],
  think: ["other", "Fixture operation", "Wrench"],
  fetch: ["searched", "Fetch: https://fixture.invalid", "Globe"],
  switch_mode: ["other", "Switch mode: Fixture operation", "Wrench"],
  other: ["other", "Fixture operation", "Wrench"],
};
export const KIND_CASES = Object.entries(KIND_EXPECTATIONS).map(([kind, [category, title, icon]]) =>
  toolCase(
    `kind:${kind}`,
    {
      name: "Fixture operation",
      kind: kind as AcpToolKind,
      status: "success",
      locations: [{ path: EDIT_PATH }],
      args: { query: "fixture", command: "echo fixture", url: "https://fixture.invalid" },
    },
    category,
    { title, icon },
  ),
);
