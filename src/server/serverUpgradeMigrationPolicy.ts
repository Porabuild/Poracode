import { z } from "zod";
import type { MigrationRollbackPolicyEntry } from "@/host/db/migrations";

/**
 * D4 migration rollback policy.
 *
 * Swapping the code symlink does not undo a database migration. Before a
 * candidate is installed, the upgrader classifies every migration between the
 * schema the running data is at and the schema the candidate supports:
 *
 * - `rollback-compatible` migrations (additive tables/columns) can be followed
 *   by a code rollback: the previous release still serves the migrated data.
 * - `forward-only` migrations rewrite persisted meaning the previous release
 *   cannot interpret. When any of them is pending, the upgrader captures a
 *   consistent backup while no owner is writing, starts the candidate with
 *   admission held, and never restores that backup over accepted newer writes.
 *
 * The classification travels from the candidate through `doctor --json` (the
 * candidate's own compiled registry) so an older upgrader binary does not
 * classify a newer candidate from its own stale registry.
 */

export const SERVER_UPGRADE_MIGRATION_POLICY_VERSION = 1;
export const MAX_CANDIDATE_MIGRATION_REGISTRY_ENTRIES = 512;

const migrationPolicyEntrySchema = z.strictObject({
  version: z.int().positive().max(1_000_000),
  name: z.string().min(1).max(200),
  rollback: z.enum(["rollback-compatible", "forward-only"]),
});

export const candidateMigrationPolicySchema = z.object({
  latestSchemaVersion: z.int().nonnegative().max(1_000_000),
  registry: z
    .array(migrationPolicyEntrySchema)
    .min(1)
    .max(MAX_CANDIDATE_MIGRATION_REGISTRY_ENTRIES),
});

export type CandidateMigrationPolicy = z.infer<typeof candidateMigrationPolicySchema>;
export type CandidateMigrationPolicyEntry = z.infer<typeof migrationPolicyEntrySchema>;

/** Bounded, consistency-checked parse of a candidate's reported policy. */
export function parseCandidateMigrationPolicy(value: unknown): CandidateMigrationPolicy | null {
  const parsed = candidateMigrationPolicySchema.safeParse(value);
  if (!parsed.success) return null;
  let previous = 0;
  for (const entry of parsed.data.registry) {
    if (entry.version <= previous) return null;
    previous = entry.version;
  }
  if (previous !== parsed.data.latestSchemaVersion) return null;
  return parsed.data;
}

export function candidateMigrationPolicyFromEntries(
  latestSchemaVersion: number,
  entries: readonly MigrationRollbackPolicyEntry[],
): CandidateMigrationPolicy {
  return candidateMigrationPolicySchema.parse({
    latestSchemaVersion,
    registry: entries.map(({ version, name, rollback }) => ({ version, name, rollback })),
  });
}

export interface PendingMigration {
  readonly version: number;
  readonly name: string;
  readonly rollback: "rollback-compatible" | "forward-only";
}

export interface ServerUpgradeMigrationPlan {
  /** Schema version recorded by the running profile; null for a fresh root. */
  readonly currentSchemaVersion: number | null;
  readonly latestSchemaVersion: number;
  readonly migrationPending: boolean;
  readonly pending: readonly PendingMigration[];
  readonly forwardOnlyPending: readonly PendingMigration[];
  /** True when a code-only rollback is data-safe for the pending path. */
  readonly rollbackCompatible: boolean;
  /** True when a forward-only migration is pending and needs a backup first. */
  readonly backupRequired: boolean;
  /** True when the candidate cannot serve the already-migrated data at all. */
  readonly schemaAlreadyAdvanced: boolean;
}

export function planServerUpgradeMigrations(input: {
  readonly currentSchemaVersion: number | null;
  readonly candidate: CandidateMigrationPolicy;
}): ServerUpgradeMigrationPlan {
  const current = input.currentSchemaVersion;
  const latest = input.candidate.latestSchemaVersion;
  const schemaAlreadyAdvanced = current !== null && current > latest;
  const pending =
    current === null || current >= latest
      ? []
      : input.candidate.registry
          .filter((entry) => entry.version > current)
          .map(({ version, name, rollback }) => ({ version, name, rollback }));
  const forwardOnlyPending = pending.filter((entry) => entry.rollback === "forward-only");
  return {
    currentSchemaVersion: current,
    latestSchemaVersion: latest,
    migrationPending: pending.length > 0,
    pending,
    forwardOnlyPending,
    rollbackCompatible: forwardOnlyPending.length === 0,
    backupRequired: forwardOnlyPending.length > 0,
    schemaAlreadyAdvanced,
  };
}
