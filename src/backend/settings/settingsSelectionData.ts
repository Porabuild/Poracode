import type { SharedSettings } from "@/shared/settings";
import { msg } from "@/shared/messages";
import {
  hasUnsupportedSelectionBinding,
  projectPersistedSelectionBinding,
} from "@/shared/persistedSelectionBinding";
import { isRecord } from "./settingsSubjects";

/** Known settings carriers only; opaque provider/plugin config is not traversed. */
const UTILITY_SELECTION_FIELDS = [
  "commitGenSelection",
  "titleGenSelection",
  "conflictResolverSelection",
  "experimentJudgeSelection",
  "wslCommitGenSelection",
  "wslTitleGenSelection",
  "wslConflictResolverSelection",
] as const satisfies readonly (keyof SharedSettings)[];

function hasUnsupportedProviderSelection(raw: Record<string, unknown>): boolean {
  return (
    isRecord(raw.providerConfigs) &&
    Object.values(raw.providerConfigs).some(hasUnsupportedSelectionBinding)
  );
}

export function assertSettingsSelectionDataReplaceable(raw: Record<string, unknown>): void {
  if (
    hasUnsupportedProviderSelection(raw) ||
    UTILITY_SELECTION_FIELDS.some((field) => hasUnsupportedSelectionBinding(raw[field]))
  )
    throw new Error(msg("modelSelection.unsupportedStoredData"));
}

/** Read projection only. Stored metadata and all actual controls remain untouched. */
export function projectSettingsSelectionData(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const projected = { ...raw };
  if (isRecord(raw.providerConfigs))
    projected.providerConfigs = Object.fromEntries(
      Object.entries(raw.providerConfigs).map(([owner, config]) => [
        owner,
        projectPersistedSelectionBinding(config),
      ]),
    );
  for (const field of UTILITY_SELECTION_FIELDS)
    if (Object.hasOwn(raw, field)) projected[field] = projectPersistedSelectionBinding(raw[field]);
  return projected;
}

/**
 * Legacy model migrations cannot reinterpret controls accompanying metadata
 * they do not understand. Preserve the original provider map as a unit because
 * those migrations may also rename its owner keys; utility carriers are flat.
 * The containing document is read-only until a compatible writer understands it.
 */
export function retainUnsupportedSettingsSelections(
  original: Record<string, unknown>,
  migrated: Record<string, unknown>,
): Record<string, unknown> {
  const retained = { ...migrated };
  if (hasUnsupportedProviderSelection(original))
    retained.providerConfigs = original.providerConfigs;
  for (const field of UTILITY_SELECTION_FIELDS)
    if (hasUnsupportedSelectionBinding(original[field])) retained[field] = original[field];
  return retained;
}
