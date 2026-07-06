/**
 * Cross-provider file-change kind inference (create / edit / delete).
 *
 * Promoted from the ACP mapper as the single source-based implementation for
 * every provider (acp, codex, opencode delegate here; claude classifies by its
 * exact tool names and doesn't need source inference). Unified semantics,
 * pinned in fileChangeKind.test.ts:
 *
 * - Mixed structured `changes` (e.g. one add + one delete in the same tool
 *   call) classify as "edit": concrete multi-file evidence wins over the
 *   weaker kind/title heuristics that a fall-through would consult.
 *   (Previously codex short-circuited to "edit" while acp/opencode returned
 *   undefined and fell through.)
 * - Structured-change types `modify` and `move` count as "edit".
 * - A direct `type` field is honored alongside `changeKind`/`change_kind`.
 * - Inference follows nested `args` / `input` records (opencode payloads wrap
 *   the interesting fields one level down).
 */

import { readFileChangePath, readStringField } from "./fileChangeSummary";

export type FileChangeKind = "create" | "edit" | "delete";

/**
 * Classify a file-change tool call: concrete evidence in `sources` (structured
 * changes, diffs, patch text, explicit kind fields) wins; otherwise fall back
 * to the tool-call `kind` / `title` heuristics; default "edit".
 */
export function classifyFileChangeKind(
  kind: string | undefined,
  title: string | undefined,
  ...sources: unknown[]
): FileChangeKind {
  const k = (kind ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();
  for (const source of sources) {
    const inferred = inferFileChangeKindFromSource(source);
    if (inferred) return inferred;
  }
  if (k === "delete" || /\bdelete\b/.test(t)) return "delete";
  if (k === "create" || /\b(create|add)\b/.test(t)) return "create";
  if ((k === "write" || /\bwrite\b/.test(t)) && sources.some(sourceHasFileContent)) return "create";
  return "edit";
}

export function normalizeDiffSummaryForKind(
  changeKind: FileChangeKind,
  summary: { added: number; removed: number },
): { added: number; removed: number } {
  if (changeKind === "create") return { added: summary.added, removed: 0 };
  if (changeKind === "delete") return { added: 0, removed: summary.removed };
  return summary;
}

export function inferFileChangeKindFromSource(source: unknown): FileChangeKind | undefined {
  if (typeof source === "string") {
    if (/^\*\*\*\s+Add File:/m.test(source)) return "create";
    if (/^\*\*\*\s+Delete File:/m.test(source)) return "delete";
    if (/^\*\*\*\s+Update File:/m.test(source)) return "edit";
    if (/^(?:new file mode|--- \/dev\/null\b)/m.test(source)) return "create";
    if (/^(?:deleted file mode|\+\+\+ \/dev\/null\b)/m.test(source)) return "delete";
    if (/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m.test(source)) return "edit";
    return undefined;
  }
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  const changesKind = inferStructuredChangesKind(record.changes);
  if (changesKind) return changesKind;
  const diffKind = inferFileChangeKindFromSource(record.diff);
  if (diffKind) return diffKind;
  const patchKind =
    inferFileChangeKindFromSource(record.patchText) ??
    inferFileChangeKindFromSource(record.patch_text) ??
    inferFileChangeKindFromSource(record.patch);
  if (patchKind) return patchKind;
  const directKind = normalizeChangeType(
    readStringField(record, "changeKind", "change_kind", "type"),
  );
  if (directKind) return directKind;
  const oldText =
    readStringAllowEmpty(record, "oldText") ?? readStringAllowEmpty(record, "old_text");
  const newText =
    readStringAllowEmpty(record, "newText") ?? readStringAllowEmpty(record, "new_text");
  if (oldText !== undefined && oldText.trim().length === 0 && newText && newText.length > 0) {
    return "create";
  }
  if (newText !== undefined && newText.trim().length === 0 && oldText && oldText.length > 0) {
    return "delete";
  }
  return inferFileChangeKindFromSource(record.args) ?? inferFileChangeKindFromSource(record.input);
}

function normalizeChangeType(type: string | undefined): FileChangeKind | undefined {
  switch (type?.toLowerCase()) {
    case "create":
    case "add":
      return "create";
    case "delete":
    case "remove":
      return "delete";
    case "edit":
    case "update":
    case "modify":
    case "move":
      return "edit";
    default:
      return undefined;
  }
}

function inferStructuredChangesKind(changes: unknown): FileChangeKind | undefined {
  if (!Array.isArray(changes) || changes.length === 0) return undefined;
  const kinds = changes.flatMap((change) => {
    if (!change || typeof change !== "object") return [];
    const record = change as Record<string, unknown>;
    const kind = record.kind && typeof record.kind === "object" ? record.kind : record;
    const normalized = normalizeChangeType(
      readStringField(kind, "type", "changeKind", "change_kind"),
    );
    return normalized ? [normalized] : [];
  });
  if (kinds.length === 0) return undefined;
  const uniqueKinds = new Set(kinds);
  // Mixed operations across files summarize as an edit — see module doc.
  return uniqueKinds.size === 1 ? kinds[0] : "edit";
}

function readStringAllowEmpty(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" ? value : undefined;
}

function sourceHasFileContent(source: unknown): boolean {
  if (!source || typeof source !== "object") return false;
  const record = source as Record<string, unknown>;
  if (typeof record.content === "string" && readFileChangePath(record)) return true;
  return sourceHasFileContent(record.args) || sourceHasFileContent(record.input);
}
