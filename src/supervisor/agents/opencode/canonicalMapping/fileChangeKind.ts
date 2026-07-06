/**
 * File-change kind inference for OpenCode tool calls.
 *
 * The tool name is the strongest signal OpenCode gives us (`write`, `rm`, …);
 * everything else delegates to the shared cross-provider source inference.
 */

import { inferFileChangeKindFromSource, type FileChangeKind } from "../../fileChangeKind";
import { normalizeToolName } from "./readers";

export function inferFileChangeKind(toolName: string, ...sources: unknown[]): FileChangeKind {
  const n = normalizeToolName(toolName);
  if (/create|write/.test(n)) return "create";
  if (/delete|rm/.test(n)) return "delete";
  for (const source of sources) {
    const kind = inferFileChangeKindFromSource(source);
    if (kind) return kind;
  }
  return "edit";
}
