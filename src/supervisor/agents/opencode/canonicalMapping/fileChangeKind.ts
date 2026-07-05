/**
 * File-change kind inference for OpenCode tool calls.
 *
 * Determines whether a tool call created, edited, or deleted a file, using
 * the tool name, args, and any structured metadata OpenCode attaches.
 */

import { normalizeToolName, readStringField } from "./readers";

export function inferFileChangeKind(
  toolName: string,
  ...sources: unknown[]
): "create" | "edit" | "delete" {
  const n = normalizeToolName(toolName);
  if (/create|write/.test(n)) return "create";
  if (/delete|rm/.test(n)) return "delete";
  for (const source of sources) {
    const kind = inferFileChangeKindFromSource(source);
    if (kind) return kind;
  }
  return "edit";
}

export function inferFileChangeKindFromSource(source: unknown): "create" | "delete" | undefined {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  const direct = readStringField(record, "changeKind", "change_kind", "type")?.toLowerCase();
  if (direct === "create" || direct === "add") return "create";
  if (direct === "delete" || direct === "remove") return "delete";
  const patchText = readStringField(record, "patchText", "patch_text", "patch");
  const patchKind = inferPatchTextKind(patchText);
  if (patchKind) return patchKind;
  const changesKind = inferChangesKind(record.changes);
  if (changesKind) return changesKind;
  return inferFileChangeKindFromSource(record.args) ?? inferFileChangeKindFromSource(record.input);
}

export function inferPatchTextKind(patchText: string | undefined): "create" | "delete" | undefined {
  if (!patchText) return undefined;
  const operations = [...patchText.matchAll(/^\*\*\*\s+(Add|Update|Delete)\s+File:/gm)].map(
    (match) => match[1],
  );
  if (operations.length === 0) return undefined;
  if (operations.every((operation) => operation === "Add")) return "create";
  if (operations.every((operation) => operation === "Delete")) return "delete";
  return undefined;
}

export function inferChangesKind(changes: unknown): "create" | "delete" | undefined {
  if (!Array.isArray(changes) || changes.length === 0) return undefined;
  const kinds = changes.flatMap((change) => {
    if (!change || typeof change !== "object") return [];
    const kind = (change as Record<string, unknown>).kind;
    if (!kind || typeof kind !== "object") return [];
    const type = readStringField(kind as Record<string, unknown>, "type")?.toLowerCase();
    return type ? [type] : [];
  });
  if (kinds.length === 0) return undefined;
  if (kinds.every((kind) => kind === "add" || kind === "create")) return "create";
  if (kinds.every((kind) => kind === "delete" || kind === "remove")) return "delete";
  return undefined;
}
