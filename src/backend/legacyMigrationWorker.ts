import {
  migrateLegacyDataOnLaunch,
  type LegacyDataMigrationOptions,
} from "@/main/legacyDataMigration";

try {
  const encoded = process.argv[2];
  if (!encoded) throw new Error("Legacy migration worker requires an encoded request.");
  const options = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as LegacyDataMigrationOptions;
  process.stdout.write(JSON.stringify(migrateLegacyDataOnLaunch(options)));
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
