/** Full add content has LF-delimited file lines, rather than patch prefixes. */
export function countCodexAddedFileLines(content: string): number {
  if (content.length === 0) return 0;
  let count = content.endsWith("\n") ? 0 : 1;
  let offset = -1;
  while ((offset = content.indexOf("\n", offset + 1)) !== -1) count++;
  return count;
}

/** Pure counterpart of the live mapper's existing add/update/delete counting. */
export function readCodexChangesDiffSummary(
  changes: unknown,
): { added: number; removed: number } | undefined {
  if (!Array.isArray(changes)) return undefined;
  let added = 0;
  let removed = 0;
  let sawDiff = false;
  for (const change of changes) {
    if (!change || typeof change !== "object") continue;
    const record = change as Record<string, unknown>;
    const diff = record.diff;
    if (typeof diff !== "string" || diff.length === 0) continue;
    sawDiff = true;
    const kind = record.kind;
    if (
      kind !== null &&
      typeof kind === "object" &&
      (kind as Record<string, unknown>).type === "add"
    ) {
      added += countCodexAddedFileLines(diff);
      continue;
    }
    for (const line of diff.split(/\r?\n/)) {
      if (line.startsWith("+++") || line.startsWith("---")) continue;
      if (line.startsWith("+")) added++;
      else if (line.startsWith("-")) removed++;
    }
  }
  return sawDiff ? { added, removed } : undefined;
}
