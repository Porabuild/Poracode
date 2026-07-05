/**
 * Leaf readers and small string helpers for the OpenCode canonical mapper.
 *
 * These helpers have no dependencies on the rest of the mapper — they only
 * normalise/extract strings from loosely-typed OpenCode SDK payloads.
 */

import type { ToolState } from "@opencode-ai/sdk/v2";

/** Longest suffix of `emitted` that is a prefix of `full`. */
export function suffixPrefixOverlap(emitted: string, full: string): number {
  const max = Math.min(emitted.length, full.length);
  for (let i = max; i > 0; i -= 1) {
    if (emitted.endsWith(full.slice(0, i))) return i;
  }
  return 0;
}

export function normalizeToolName(toolName: string): string {
  return toolName.trim().toLowerCase();
}

export function readStringField(
  input: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  if (!input) return undefined;
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

export function readOpenCodePath(input: Record<string, unknown> | undefined): string | undefined {
  return readStringField(
    input,
    "filePath",
    "file_path",
    "path",
    "relativePath",
    "relative_path",
    "notebookPath",
    "notebook_path",
  );
}

export function readStringMetadata(metadata: object, key: string): string | undefined {
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function toolStateStatus(state: ToolState): "running" | "success" | "error" {
  if (state.status === "completed") return "success";
  if (state.status === "error") return "error";
  return "running";
}
