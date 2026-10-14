import type { CanonicalItemType } from "@/shared/contracts";

/** New, in-memory fixture format; no app wire, persisted state, or deployed helper changes. */
export const TOOL_TAXONOMY_VERSION = 1;
export const TAXONOMY_EVIDENCE = {
  level: "normalized_fixture",
  actualToolExecution: false,
  actualDelegationExecution: false,
  actualWorkflowExecution: false,
  uiQualified: false,
} as const;
export const TAXONOMY_NOW = 1_790_899_200_000;
export const CANONICAL_TOOL_TYPES = [
  "tool_call",
  "mcp_tool_call",
  "dynamic_tool_call",
  "image_view",
  "command_execution",
  "file_change",
  "web_search",
] as const satisfies readonly CanonicalItemType[];

export const EDIT_PATH = "src/fixture.ts";
export const CREATED_PATH = "src/new-fixture.ts";
export const OLD_TEXT = "export const n = 1;\n";
export const NEW_TEXT = "export const n = 2;\n";
export const UNIFIED_DIFF = `diff --git a/${EDIT_PATH} b/${EDIT_PATH}\n--- a/${EDIT_PATH}\n+++ b/${EDIT_PATH}\n@@ -1 +1 @@\n-${OLD_TEXT.trim()}\n+${NEW_TEXT.trim()}\n`;
export const PATCH_TEXT = `*** Begin Patch\n*** Update File: ${EDIT_PATH}\n@@\n-${OLD_TEXT.trim()}\n+${NEW_TEXT.trim()}\n*** End Patch\n`;
export const ADD_PATCH = `*** Begin Patch\n*** Add File: ${CREATED_PATH}\n+export const fixture = true;\n*** End Patch\n`;
