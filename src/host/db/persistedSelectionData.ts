import type Database from "better-sqlite3";
import {
  projectDraftConfigSchema,
  threadConfigSchema,
  type ProjectDraftConfig,
  type ThreadConfig,
} from "@/shared/contracts/config";
import { msg } from "@/shared/messages";
import {
  hasUnsupportedSelectionBinding,
  projectPersistedSelectionBinding,
} from "@/shared/persistedSelectionBinding";

type SqliteDatabase = InstanceType<typeof Database>;

export function readPersistedThreadConfig(json: string): ThreadConfig {
  const projected = projectPersistedSelectionBinding(JSON.parse(json));
  threadConfigSchema.parse(projected);
  // Validate known fields without stripping existing opaque/legacy properties.
  return projected as ThreadConfig;
}

export function readPersistedProjectDraftConfig(json: string): ProjectDraftConfig {
  const projected = projectPersistedSelectionBinding(JSON.parse(json));
  projectDraftConfigSchema.parse(projected);
  return projected as ProjectDraftConfig;
}

/** A typed incoming replacement cannot introduce unsupported metadata either. */
export function assertSelectionDataReplaceable(value: unknown): void {
  if (hasUnsupportedSelectionBinding(value))
    throw new Error(msg("modelSelection.unsupportedStoredData"));
}

export function assertSelectionJsonReplaceable(json: string | null | undefined): void {
  if (json != null) assertSelectionDataReplaceable(JSON.parse(json));
}

/** Call inside the actual writer's transaction, never against a client projection. */
export function assertStoredThreadSelectionReplaceable(sqlite: SqliteDatabase, id: string): void {
  const row = sqlite.prepare("SELECT config FROM threads WHERE id = ?").get(id) as
    | { config: string }
    | undefined;
  assertSelectionJsonReplaceable(row?.config);
}

export function assertStoredProjectDraftReplaceable(sqlite: SqliteDatabase, id: string): void {
  const row = sqlite.prepare("SELECT last_draft_config FROM projects WHERE id = ?").get(id) as
    | { last_draft_config: string | null }
    | undefined;
  assertSelectionJsonReplaceable(row?.last_draft_config);
}

/** Both source and canonical rows participate in a merge, including borrowed drafts. */
export function assertProjectMergeSelectionsReplaceable(
  sqlite: SqliteDatabase,
  duplicateIds: ReadonlyMap<string, string>,
): void {
  for (const id of new Set([...duplicateIds.keys(), ...duplicateIds.values()]))
    assertStoredProjectDraftReplaceable(sqlite, id);
}
