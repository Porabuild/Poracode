import { msg } from "@lingui/core/macro";
import type { ProviderModelItem } from "./types";

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
  const regular = rest.filter((row, index) => {
    if (row.type === "model") return true;
    return rest[index + 1]?.type === "model";
  });
  return [
    ...primary,
    ...(regular.length > 0
      ? [{ type: "header-plain" as const, id: `models:${providerKey}`, label: msg`Models` }]
      : []),
    ...regular,
  ];
}
