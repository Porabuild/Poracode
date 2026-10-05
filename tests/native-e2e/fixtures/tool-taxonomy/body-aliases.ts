import type { TaxonomyCase } from "./types";
import { itemCase, toolCase } from "./builders";
import { EDIT_PATH, NEW_TEXT, OLD_TEXT, PATCH_TEXT, UNIFIED_DIFF } from "./core";

export const PATH_ARGUMENT_KEYS = [
  "file_path",
  "filePath",
  "path",
  "relative_path",
  "relativePath",
  "notebook_path",
  "notebookPath",
] as const;
export const READ_START_KEYS = [
  "offset",
  "line",
  "lineNumber",
  "start",
  "startLine",
  "start_line",
  "lineStart",
  "line_start",
] as const;
export const READ_END_KEYS = ["end", "endLine", "end_line", "lineEnd", "line_end"] as const;
export const READ_WRAPPER_KEYS = ["file", "output", "FileContent", "fileContent"] as const;
export const READ_TEXT_KEYS = ["raw_output", "content", "text"] as const;
export const READ_RESULT_PATH_KEYS = [
  "path",
  "file_path",
  "filePath",
  "absolute_path",
  "absolutePath",
] as const;
export const BODY_ALIAS_CASES: readonly TaxonomyCase[] = [
  ...PATH_ARGUMENT_KEYS.map((key) =>
    toolCase(
      `path-arg:${key}`,
      {
        name: "FixtureRead",
        kind: "read",
        args: { [key]: EDIT_PATH },
        result: NEW_TEXT,
        status: "success",
      },
      "viewed",
      { title: `View: ${EDIT_PATH}`, icon: "Eye" },
    ),
  ),
  ...READ_START_KEYS.map((key) =>
    toolCase(
      `read-start:${key}`,
      {
        name: "FixtureRead",
        kind: "read",
        locations: [{ path: EDIT_PATH }],
        args: { [key]: "2", limit: 3 },
        status: "success",
      },
      "viewed",
      { title: `View 2:4: ${EDIT_PATH}`, icon: "Eye" },
    ),
  ),
  ...READ_END_KEYS.map((key) =>
    toolCase(
      `read-end:${key}`,
      {
        name: "FixtureRead",
        kind: "read",
        locations: [{ path: EDIT_PATH }],
        args: { offset: 2, [key]: 4 },
        status: "success",
      },
      "viewed",
      { title: `View 2:4: ${EDIT_PATH}`, icon: "Eye" },
    ),
  ),
  ...READ_WRAPPER_KEYS.flatMap((wrapper) =>
    READ_TEXT_KEYS.map((key) =>
      toolCase(
        `read-wrapper:${wrapper}:${key}`,
        {
          name: "FixtureRead",
          kind: "read",
          result: { [wrapper]: { [key]: NEW_TEXT, path: EDIT_PATH } },
          status: "success",
        },
        "viewed",
      ),
    ),
  ),
  ...READ_RESULT_PATH_KEYS.map((key) =>
    toolCase(
      `read-result-path:${key}`,
      {
        name: "FixtureRead",
        kind: "read",
        result: { content: NEW_TEXT, [key]: EDIT_PATH },
        status: "success",
      },
      "viewed",
    ),
  ),
  ...["content", "text", "tool_output_for_prompt"].map((key) =>
    toolCase(
      `read-direct:${key}`,
      {
        name: "FixtureRead",
        kind: "read",
        result: { [key]: NEW_TEXT, path: EDIT_PATH },
        status: "success",
      },
      "viewed",
    ),
  ),
  toolCase(
    "read-markup-wrapper",
    {
      name: "FixtureRead",
      kind: "read",
      result: `<path>${EDIT_PATH}</path>\n<type>file</type>\n<content>\n1: ${NEW_TEXT.trim()}\n</content>`,
      status: "success",
    },
    "viewed",
  ),
  ...["patchText", "patch_text", "patch"].map((key) =>
    toolCase(
      `patch-arg:${key}`,
      { name: "apply_patch", kind: "edit", args: { [key]: PATCH_TEXT }, status: "success" },
      "edited",
    ),
  ),
  ...["snake", "camel"].map((spelling) =>
    toolCase(
      `replacement:${spelling}`,
      {
        name: "Edit",
        kind: "edit",
        args:
          spelling === "snake"
            ? { file_path: EDIT_PATH, old_string: OLD_TEXT, new_string: NEW_TEXT }
            : { filePath: EDIT_PATH, oldString: OLD_TEXT, newString: NEW_TEXT },
        status: "success",
      },
      "edited",
    ),
  ),
  ...["View", "Viewing", "Read", "Reading"].map((name) =>
    toolCase(
      `read-header:${name}`,
      { name: `${name}: fixture`, result: NEW_TEXT, args: { path: EDIT_PATH }, status: "success" },
      name === "Viewing" || name === "Reading" ? "viewed" : "other",
    ),
  ),
  ...[
    "Edit",
    "Editing",
    "Write",
    "Writing",
    "Patch",
    "Patching",
    "Create",
    "Creating",
    "Delete",
    "Deleting",
    "Remove",
    "Removing",
  ].map((name) =>
    toolCase(
      `edit-header:${name}`,
      { name: `${name}: fixture`, result: UNIFIED_DIFF, status: "success" },
      ["Editing", "Writing", "Patching", "Creating", "Deleting", "Removing"].includes(name)
        ? "edited"
        : "other",
    ),
  ),
  ...["query", "needle", "term", "pattern"].map((key) =>
    toolCase(
      `search-term:${key}`,
      { name: "FixtureSearch", kind: "search", args: { [key]: "fixture" }, status: "success" },
      "searched",
      { title: 'Search: "fixture"', icon: "SearchCode" },
    ),
  ),
  ...["path", "glob", "paths"].map((key) =>
    toolCase(
      `search-scope:${key}`,
      {
        name: "FixtureSearch",
        kind: "search",
        args: { [key]: key === "paths" ? ["", "src"] : "src" },
        status: "success",
      },
      "searched",
      { title: "Search: src", icon: "SearchCode" },
    ),
  ),
  ...["detailedContent", "text", "content"].map((key) =>
    toolCase(
      `result-text:${key}`,
      { name: "FixtureResult", result: { [key]: "body-marker" }, status: "success" },
      "other",
    ),
  ),
  ...["content", "contents"].map((key) =>
    toolCase(
      `result-blocks:${key}`,
      {
        name: "FixtureResult",
        result: {
          [key]: [{ type: "text", text: "one" }, { type: "image" }, { type: "text", text: "two" }],
        },
        status: "success",
      },
      "other",
    ),
  ),
  ...["WebSearch", "webSearch", "web_search", "Web search:", "web-search"].map((name) =>
    itemCase(
      `web-label:${name}`,
      "web_search",
      { query: "fixture query", name, result: { contents: [{ text: "one" }, { text: "two" }] } },
      "searched",
    ),
  ),
];
