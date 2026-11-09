import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { writeFileAtomic } from "@/shared/atomicFile";

// Format 1 is closed: a future or malformed journal is preserved and refused.
export const CLI_INSTALL_MIGRATION_VERSION = 1;
export const CLI_INSTALL_MIGRATION_FILE = "legacy-install-migration.json";
const migrationSchema = z.strictObject({
  formatVersion: z.literal(CLI_INSTALL_MIGRATION_VERSION),
  oldPrefix: z.string().min(1),
  newPrefix: z.string().min(1),
  profile: z.string().min(1),
  oldNonce: z.string().regex(/^[a-f0-9]{48}$/u),
  newNonce: z.string().regex(/^[a-f0-9]{48}$/u),
  registrationId: z.string().regex(/^poracode-[a-f0-9]{32}$/u),
  account: z.strictObject({ kind: z.enum(["uid", "sid"]), id: z.string().min(1) }),
  configPath: z.string().nullable(),
  releaseVersion: z.string().min(1),
  entrypointSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  ownerGeneration: z.string().nullable(),
  nativeMainPid: z.string(),
  nativeState: z.enum(["active", "inactive", "failed"]),
  wasRunning: z.boolean(),
  phase: z.enum(["prepared", "old-removed", "new-installed", "complete"]),
});
export type CliInstallMigration = z.infer<typeof migrationSchema>;

export function readCliInstallMigration(prefix: string): CliInstallMigration | null {
  const path = join(prefix, CLI_INSTALL_MIGRATION_FILE);
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > 16_384) throw new Error("not a bounded regular file");
    return migrationSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return null;
    throw new Error(
      `Cannot read the legacy installation migration at ${path}; preserve it and inspect it before retrying.`,
      { cause: error },
    );
  }
}

export function writeCliInstallMigration(prefix: string, migration: CliInstallMigration): void {
  writeFileAtomic(
    join(prefix, CLI_INSTALL_MIGRATION_FILE),
    `${JSON.stringify(migrationSchema.parse(migration), null, 2)}\n`,
    { mode: 0o600 },
  );
}

export function refusePendingCliInstallMigration(prefix: string): void {
  const migration = readCliInstallMigration(prefix);
  if (migration && migration.phase !== "complete") {
    throw new Error(
      `An install migration for ${prefix} is incomplete. Run poracode migrate-install to resume it before changing this installation.`,
    );
  }
}
