import { buildLineUnifiedDiff, countLineChangeStats } from "@/shared/lineUnifiedDiff";

export interface AcpContentFileChange {
  path: string;
  oldText: string;
  newText: string;
  unifiedDiff: string;
  diffSummary: { added: number; removed: number };
}

/**
 * Read ACP `ToolCallContent` entries of type `"diff"` (`path`, `oldText`,
 * `newText`). Cursor's ACP server puts edits here while leaving `rawInput` /
 * `rawOutput` empty — Zed renders these blocks natively; without this helper
 * Poracode's mapper has nothing to show.
 */
export function extractAcpFileChangesFromContent(content: unknown): AcpContentFileChange[] {
  if (!Array.isArray(content)) return [];
  const changes: AcpContentFileChange[] = [];
  for (const entry of content) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (record.type !== "diff") continue;
    const path = readNonEmptyString(record.path);
    const newText = readString(record.newText);
    if (!path || newText === undefined) continue;
    const oldText = readString(record.oldText) ?? "";
    changes.push({
      path,
      oldText,
      newText,
      unifiedDiff: buildLineUnifiedDiff(path, oldText, newText),
      diffSummary: countLineChangeStats(oldText, newText),
    });
  }
  return changes;
}

export function joinAcpContentFileChangeDiffs(
  changes: readonly AcpContentFileChange[],
): string | undefined {
  if (changes.length === 0) return undefined;
  return changes.map((change) => change.unifiedDiff.trimEnd()).join("\n");
}

export function summarizeAcpContentFileChanges(
  changes: readonly AcpContentFileChange[],
): { added: number; removed: number } | undefined {
  if (changes.length === 0) return undefined;
  let added = 0;
  let removed = 0;
  for (const change of changes) {
    added += change.diffSummary.added;
    removed += change.diffSummary.removed;
  }
  return added === 0 && removed === 0 ? undefined : { added, removed };
}

/** True when `rawOutput` carries non-empty structured or string data. */
export function hasSubstantialAcpRawOutput(rawOutput: unknown): boolean {
  if (rawOutput === undefined || rawOutput === null) return false;
  if (typeof rawOutput === "string") return rawOutput.length > 0;
  if (typeof rawOutput !== "object") return true;
  if (Array.isArray(rawOutput)) return rawOutput.length > 0;
  return Object.keys(rawOutput).length > 0;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
