import { describe, expect, it } from "vitest";
import {
  candidateMigrationPolicyFromEntries,
  parseCandidateMigrationPolicy,
  planServerUpgradeMigrations,
} from "./serverUpgradeMigrationPolicy";

const ROLLBACK_SAFE = candidateMigrationPolicyFromEntries(46, [
  { version: 45, name: "journal", rollback: "rollback-compatible" },
  { version: 46, name: "anchor", rollback: "rollback-compatible" },
]);
const FORWARD_ONLY = candidateMigrationPolicyFromEntries(47, [
  { version: 45, name: "journal", rollback: "rollback-compatible" },
  { version: 46, name: "anchor", rollback: "rollback-compatible" },
  { version: 47, name: "receipt principal", rollback: "forward-only" },
]);

describe("migration rollback policy (D4)", () => {
  it("requires no backup when every pending migration is rollback-compatible", () => {
    const plan = planServerUpgradeMigrations({
      currentSchemaVersion: 44,
      candidate: ROLLBACK_SAFE,
    });
    expect(plan).toMatchObject({
      migrationPending: true,
      rollbackCompatible: true,
      backupRequired: false,
      schemaAlreadyAdvanced: false,
    });
    expect(plan.pending.map((entry) => entry.version)).toEqual([45, 46]);
  });

  it("requires a backup for the N-1 -> N forward-only schema step", () => {
    const plan = planServerUpgradeMigrations({
      currentSchemaVersion: 46,
      candidate: FORWARD_ONLY,
    });
    expect(plan.forwardOnlyPending).toEqual([
      { version: 47, name: "receipt principal", rollback: "forward-only" },
    ]);
    expect(plan.rollbackCompatible).toBe(false);
    expect(plan.backupRequired).toBe(true);
  });

  it("treats a fresh root as no pending migration", () => {
    expect(
      planServerUpgradeMigrations({ currentSchemaVersion: null, candidate: FORWARD_ONLY }),
    ).toMatchObject({ migrationPending: false, backupRequired: false });
  });

  it("refuses a candidate older than the migrated data", () => {
    expect(
      planServerUpgradeMigrations({ currentSchemaVersion: 47, candidate: ROLLBACK_SAFE }),
    ).toMatchObject({ schemaAlreadyAdvanced: true });
  });

  it("parses the candidate doctor's full migrations object with additive fields (real-artifact gate)", () => {
    // `doctor --json` reports latestSchemaVersion/rollbackCompatibleThrough/
    // forwardOnly/registry; the upgrader must read the policy without
    // refusing the candidate over the report's own additive fields.
    const policy = parseCandidateMigrationPolicy({
      latestSchemaVersion: 47,
      rollbackCompatibleThrough: 46,
      forwardOnly: [{ version: 47, name: "x" }],
      registry: [
        { version: 46, name: "anchor", rollback: "rollback-compatible" },
        { version: 47, name: "x", rollback: "forward-only" },
      ],
    });
    expect(policy?.latestSchemaVersion).toBe(47);
    expect(policy?.registry.at(-1)?.rollback).toBe("forward-only");
  });

  it("rejects a malformed or inconsistent candidate policy", () => {
    expect(parseCandidateMigrationPolicy(null)).toBeNull();
    expect(
      parseCandidateMigrationPolicy({
        latestSchemaVersion: 47,
        registry: [{ version: 47, name: "x", rollback: "forward-only" }],
      }),
    ).not.toBeNull();
    // latestSchemaVersion must be the registry's last version.
    expect(
      parseCandidateMigrationPolicy({
        latestSchemaVersion: 99,
        registry: [{ version: 47, name: "x", rollback: "forward-only" }],
      }),
    ).toBeNull();
    // Non-increasing versions and unknown classifications are refused.
    expect(
      parseCandidateMigrationPolicy({
        latestSchemaVersion: 2,
        registry: [
          { version: 2, name: "b", rollback: "rollback-compatible" },
          { version: 1, name: "a", rollback: "rollback-compatible" },
        ],
      }),
    ).toBeNull();
    expect(
      parseCandidateMigrationPolicy({
        latestSchemaVersion: 1,
        registry: [{ version: 1, name: "a", rollback: "sometimes" }],
      }),
    ).toBeNull();
  });
});
