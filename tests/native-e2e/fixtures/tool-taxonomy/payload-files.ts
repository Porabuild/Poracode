import type { TaxonomyCase } from "./types";
import { itemCase, toolCase } from "./builders";
import {
  ADD_PATCH,
  CREATED_PATH,
  EDIT_PATH,
  NEW_TEXT,
  OLD_TEXT,
  PATCH_TEXT,
  UNIFIED_DIFF,
} from "./core";

export const FILE_PAYLOAD_CASES: readonly TaxonomyCase[] = [
  itemCase(
    "create_content",
    "file_change",
    {
      path: CREATED_PATH,
      changeKind: "create",
      args: { content: "export const fixture = true;\n" },
      diffSummary: { added: 1, removed: 0 },
      status: "success",
    },
    "edited",
  ),
  itemCase(
    "create_patch",
    "file_change",
    { path: CREATED_PATH, changeKind: "create", args: ADD_PATCH, status: "success" },
    "edited",
  ),
  itemCase(
    "create_changes",
    "file_change",
    {
      path: CREATED_PATH,
      changeKind: "create",
      result: {
        changes: [
          {
            path: CREATED_PATH,
            kind: { type: "add" },
            diff: "@@ -0,0 +1 @@\n+export const fixture = true;\n",
          },
        ],
      },
      status: "success",
    },
    "edited",
  ),
  itemCase(
    "create_lazy",
    "file_change",
    { path: "/tmp/tool-taxonomy/created.ts", changeKind: "create", status: "success" },
    "edited",
  ),
  itemCase(
    "edit_unified",
    "file_change",
    {
      path: EDIT_PATH,
      changeKind: "edit",
      result: UNIFIED_DIFF,
      diffSummary: { added: 1, removed: 1 },
      status: "success",
    },
    "edited",
  ),
  itemCase(
    "edit_replacement",
    "file_change",
    {
      path: EDIT_PATH,
      changeKind: "edit",
      args: { file_path: EDIT_PATH, old_string: OLD_TEXT, new_string: NEW_TEXT },
      result: "edit complete",
      status: "success",
    },
    "edited",
  ),
  itemCase(
    "edit_content_diff",
    "file_change",
    {
      path: EDIT_PATH,
      changeKind: "edit",
      editOldText: OLD_TEXT,
      editNewText: NEW_TEXT,
      status: "success",
    },
    "edited",
  ),
  itemCase(
    "edit_changes",
    "file_change",
    {
      path: EDIT_PATH,
      changeKind: "edit",
      result: { changes: [{ path: EDIT_PATH, kind: { type: "update" }, diff: UNIFIED_DIFF }] },
      status: "success",
    },
    "edited",
  ),
  toolCase(
    "generic_edit_patch",
    {
      name: "apply_patch",
      kind: "edit",
      args: { patchText: PATCH_TEXT },
      result: "updated",
      status: "success",
    },
    "edited",
  ),
  itemCase(
    "delete",
    "file_change",
    {
      path: "src/deleted-fixture.ts",
      changeKind: "delete",
      result:
        "diff --git a/src/deleted-fixture.ts b/src/deleted-fixture.ts\n--- a/src/deleted-fixture.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-export const deleted = true;\n",
      diffSummary: { added: 0, removed: 1 },
      status: "success",
    },
    "edited",
  ),
  toolCase(
    "move",
    {
      name: "Moving fixture",
      kind: "move",
      locations: [{ path: "src/old-fixture.ts" }, { path: CREATED_PATH }],
      result: "moved",
      status: "success",
    },
    "edited",
    { title: `Move: src/old-fixture.ts -> ${CREATED_PATH}`, icon: "Pencil" },
  ),
];
