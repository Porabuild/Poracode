import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { writeFileAtomic } from "@/shared/atomicFile";

// Format 2 separates source and destination profiles. Format-1 completed
// journals remain readable; interrupted format 1 is preserved for inspection
// because automatically resuming it could start nightly against stable data.
export const CLI_INSTALL_MIGRATION_VERSION = 2;
export const CLI_INSTALL_MIGRATION_FILE = "legacy-install-migration.json";
export const CLI_PROFILE_MIGRATION_FILE = "service-profile-migration.json";
export type CliMigrationKind = "install" | "profile";
function migrationFile(kind: CliMigrationKind): string {
  return kind === "profile" ? CLI_PROFILE_MIGRATION_FILE : CLI_INSTALL_MIGRATION_FILE;
}
const migrationSchema = z.strictObject({
  formatVersion: z.literal(CLI_INSTALL_MIGRATION_VERSION),
  oldPrefix: z.string().min(1),
  newPrefix: z.string().min(1),
  oldProfile: z.string().min(1),
  newProfile: z.string().min(1),
  oldNonce: z.string().regex(/^[a-f0-9]{48}$/u),
  newNonce: z.string().regex(/^[a-f0-9]{48}$/u),
  oldRegistrationId: z.string().regex(/^poracode-[a-f0-9]{32}$/u),
  newRegistrationId: z.string().regex(/^poracode-[a-f0-9]{32}$/u),
  account: z.strictObject({ kind: z.enum(["uid", "sid"]), id: z.string().min(1) }),
  oldConfigPath: z.string().nullable(),
  newConfigPath: z.string().nullable(),
  oldReleaseVersion: z.string().min(1),
  oldEntrypointSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  newReleaseVersion: z.string().min(1),
  newEntrypointSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  ownerGeneration: z.string().nullable(),
  nativeMainPid: z.string(),
  nativeState: z.enum(["active", "inactive", "failed"]),
  wasRunning: z.boolean(),
  phase: z.enum(["prepared", "old-removed", "new-installed", "complete"]),
});
const legacyMigrationSchema = z.strictObject({
  formatVersion: z.literal(1),
  oldPrefix: z.string(),
  newPrefix: z.string(),
  profile: z.string(),
  oldNonce: z.string(),
  newNonce: z.string(),
  registrationId: z.string(),
  account: z.strictObject({ kind: z.enum(["uid", "sid"]), id: z.string() }),
  configPath: z.string().nullable(),
  releaseVersion: z.string(),
  entrypointSha256: z.string(),
  ownerGeneration: z.string().nullable(),
  nativeMainPid: z.string(),
  nativeState: z.enum(["active", "inactive", "failed"]),
  wasRunning: z.boolean(),
  phase: z.enum(["prepared", "old-removed", "new-installed", "complete"]),
});
export class LegacyCliMigrationRefusedError extends Error {
  constructor(path: string) {
    super(
      `The interrupted format-1 migration at ${path} is preserved. Inspect its service and profiles before recovery; it must not automatically start a nightly service on stable data.`,
    );
    this.name = "LegacyCliMigrationRefusedError";
  }
}
export type CliInstallMigration = z.infer<typeof migrationSchema>;

export function readCliInstallMigration(
  prefix: string,
  kind: CliMigrationKind = "install",
): CliInstallMigration | null {
  const path = join(prefix, migrationFile(kind));
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > 16_384) throw new Error("not a bounded regular file");
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (
      value &&
      typeof value === "object" &&
      "formatVersion" in value &&
      value.formatVersion === 1
    ) {
      const old = legacyMigrationSchema.parse(value);
      if (old.phase !== "complete") throw new LegacyCliMigrationRefusedError(path);
      return migrationSchema.parse({
        formatVersion: CLI_INSTALL_MIGRATION_VERSION,
        oldPrefix: old.oldPrefix,
        newPrefix: old.newPrefix,
        oldProfile: old.profile,
        newProfile: old.profile,
        oldNonce: old.oldNonce,
        newNonce: old.newNonce,
        oldRegistrationId: old.registrationId,
        newRegistrationId: old.registrationId,
        account: old.account,
        oldConfigPath: old.configPath,
        newConfigPath: old.configPath,
        oldReleaseVersion: old.releaseVersion,
        newReleaseVersion: old.releaseVersion,
        oldEntrypointSha256: old.entrypointSha256,
        newEntrypointSha256: old.entrypointSha256,
        ownerGeneration: old.ownerGeneration,
        nativeMainPid: old.nativeMainPid,
        nativeState: old.nativeState,
        wasRunning: old.wasRunning,
        phase: old.phase,
      });
    }
    return migrationSchema.parse(value);
  } catch (error) {
    if (error instanceof LegacyCliMigrationRefusedError) throw error;
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return null;
    throw new Error(
      `Cannot read the legacy installation migration at ${path}; preserve it and inspect it before retrying.`,
      { cause: error },
    );
  }
}

export function writeCliInstallMigration(
  prefix: string,
  migration: CliInstallMigration,
  kind: CliMigrationKind = "install",
): void {
  writeFileAtomic(
    join(prefix, migrationFile(kind)),
    `${JSON.stringify(migrationSchema.parse(migration), null, 2)}\n`,
    { mode: 0o600 },
  );
}

export function refusePendingCliInstallMigration(prefix: string): void {
  const pending = ["install", "profile"].some((kind) => {
    const migration = readCliInstallMigration(prefix, kind as CliMigrationKind);
    return migration && migration.phase !== "complete";
  });
  if (pending) {
    throw new Error(
      `An install migration for ${prefix} is incomplete. Run poracode migrate-install to resume it before changing this installation.`,
    );
  }
}
