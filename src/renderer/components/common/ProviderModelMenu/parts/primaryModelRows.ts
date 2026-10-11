import { msg } from "@lingui/core/macro";
import type { ProviderModelItem } from "./types";

/** Drop section headings left without models after rows are promoted. */
export function removeEmptyModelHeaders(rows: readonly ProviderModelItem[]): ProviderModelItem[] {
  const kept = new Set<ProviderModelItem>();
  let groupHasModels = false;
  let sectionHasModels = false;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]!;
    if (row.type === "model") {
      kept.add(row);
      groupHasModels = true;
      sectionHasModels = true;
    } else if (row.type === "header-sub") {
      if (groupHasModels) kept.add(row);
      groupHasModels = false;
    } else {
      if (sectionHasModels) kept.add(row);
      groupHasModels = false;
      sectionHasModels = false;
    }
  }
  return rows.filter((row) => kept.has(row));
}

/** Reorder main rows only; exact favorites retain their independent identity. */
export function separatePrimaryModelRows(
  rows: readonly ProviderModelItem[],
  providerKey: string,
  modelIds: readonly string[],
): ProviderModelItem[] {
  const primary = [...new Set(modelIds)].flatMap((modelId) => {
    const row = rows.find((item) => item.id === `model:${providerKey}:${modelId}`);
    return row?.type === "model" ? [row] : [];
  });
  if (primary.length === 0) return [...rows];
  const primaryRows = new Set<ProviderModelItem>(primary);
  const rest = rows.filter((row) => !primaryRows.has(row));
  // A group containing only promoted choices has no remaining header.
  const regular = removeEmptyModelHeaders(rest);
  return [
    ...primary,
    ...(regular.length > 0
      ? [{ type: "header-plain" as const, id: `models:${providerKey}`, label: msg`Models` }]
      : []),
    ...regular,
  ];
}
