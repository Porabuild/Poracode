import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readStandaloneRuntimeMarker } from "../../scripts/server-release-install.mjs";
import { defaultInstallerPrefix, resolveInstallerPrefix } from "./installerPrefix";
import { installServiceRelease } from "./cliServiceInstall";
import { migrateLegacyCommand, migrateLegacyService } from "./cliInstallMigration";
import { compareCliReleaseVersions } from "./cliReleaseVersion";
import { readInstalledServiceRelease, readServiceRegistration } from "./serverServiceRegistration";
import { runSelfUpdate } from "./cliSelfUpdate";
import { readCliInstallMigration } from "./cliInstallMigrationJournal";
import { defaultCliBinDirectory } from "../../packages/poracode-cli/lib/installPaths.mjs";
import { acquireServerUpgradeLock, type ServerUpgradeLock } from "./serverUpgradeLock";
import { relocateLegacyTooling } from "./cliLegacyToolingMove";
import { readLegacyServiceProfile } from "./cliLegacyProfile";

/** Migrate only the old implicit POSIX prefix; explicit prefixes remain owned by their operator. */
export async function migrateDefaultLegacyInstall(input: {
  readonly releaseRoot: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: string;
  readonly platform?: NodeJS.Platform;
  readonly installIfMissing?: boolean;
}): Promise<{
  readonly prefix: string;
  readonly profile: string | null;
  readonly moved: readonly string[];
  readonly retained: readonly string[];
} | null> {
  const env = input.env ?? process.env;
  const home = input.home ?? homedir();
  if ((input.platform ?? process.platform) === "win32" || env.PORACODE_INSTALL_DIR?.trim())
    return null;
  const oldPrefix = join(home, ".poracode", "server");
  const prefix = defaultInstallerPrefix({
    env,
    home,
    platform: input.platform ?? process.platform,
  });
  const journal = readCliInstallMigration(prefix);
  if (!existsSync(join(oldPrefix, "current"))) {
    if (journal && journal.phase !== "complete")
      throw new Error(
        "The legacy prefix needed to resume migration is missing; preserve the migration journal and inspect it.",
      );
    if (existsSync(join(home, ".poracode", "runtime"))) {
      return {
        prefix,
        profile: readLegacyServiceProfile(prefix) ?? null,
        ...relocateLegacyTooling({ home, prefix, env }),
      };
    }
    return null;
  }
  const finish = (targetPrefix: string, profile: string | null) => {
    const binDir = defaultCliBinDirectory({
      env,
      home,
      platform: input.platform ?? process.platform,
    });
    migrateLegacyCommand({ oldPrefix, newPrefix: targetPrefix, binDir });
    return {
      prefix: targetPrefix,
      profile,
      ...relocateLegacyTooling({ home, prefix: targetPrefix, env }),
    };
  };
  if (journal && journal.phase !== "complete") {
    const resumed = await migrateLegacyService({
      oldPrefix,
      newPrefix: prefix,
      releaseRoot: input.releaseRoot,
    });
    return finish(prefix, resumed.profile);
  }
  const previous = resolveInstallerPrefix({
    explicitPrefix: oldPrefix,
    releaseRoot: input.releaseRoot,
  });
  if (!existsSync(join(prefix, "current"))) {
    if (!input.installIfMissing)
      throw new Error(`Install the new runtime at ${prefix} before migrating the legacy install.`);
    const version = readStandaloneRuntimeMarker(previous.currentDir)?.version;
    if (!version)
      throw new Error("The legacy install has no self-contained release marker; it was not moved.");
    const runningVersion = readStandaloneRuntimeMarker(input.releaseRoot)?.version;
    const installEnv = { ...env };
    if (runningVersion !== version) {
      delete installEnv.PORACODE_LAUNCHER_RUNTIME_ROOT;
      delete installEnv.PORACODE_LAUNCHER_RUNTIME_SHA256;
      delete installEnv.PORACODE_LAUNCHER_RUNTIME_TARGET;
    }
    await installServiceRelease({
      prefix,
      version,
      env: installEnv,
      ...(runningVersion === version ? { releaseRoot: input.releaseRoot } : {}),
    });
  }
  const target = readInstalledServiceRelease(prefix);
  const migrationLock = acquireServerUpgradeLock({
    prefix: join(target.prefix, ".legacy-migration"),
    releaseId: "legacy-install",
  });
  let targetLock: ServerUpgradeLock | undefined;
  try {
    targetLock = acquireServerUpgradeLock({ prefix: target.prefix, releaseId: target.releaseId });
    const underLock = readCliInstallMigration(target.prefix);
    if (underLock && underLock.phase !== "complete") {
      const resumed = await migrateLegacyService({
        oldPrefix,
        newPrefix: target.prefix,
        releaseRoot: input.releaseRoot,
        targetLock,
        migrationLock,
      });
      return finish(target.prefix, resumed.profile);
    }
    const selected = resolveInstallerPrefix({
      explicitPrefix: prefix,
      releaseRoot: input.releaseRoot,
    });
    const order = compareCliReleaseVersions(selected.currentVersion, previous.currentVersion);
    if (order === undefined || order < 0) {
      throw new Error(
        `The new prefix has an older or unrecognized release than ${oldPrefix}; the existing service was not moved.`,
      );
    }
    const registration = readServiceRegistration(oldPrefix);
    if (registration && readServiceRegistration(prefix)) {
      throw new Error(
        "Both the old and new prefixes have service registrations; neither service was changed.",
      );
    }
    if (registration && order > 0) {
      // An existing service must cross release versions through the normal
      // drain, backup and candidate-admission protocol before it is relocated.
      const previousProfile = process.env.PORACODE_BASE_DIR;
      process.env.PORACODE_BASE_DIR = registration.profileNamespace;
      try {
        const result = await runSelfUpdate(
          { version: selected.currentVersion, prefix: oldPrefix, json: false },
          { releaseRoot: input.releaseRoot, env, onlyIfNewer: true },
        );
        if (!result.ok)
          throw new Error(
            `The existing service could not be upgraded before migration: ${result.detail}`,
          );
      } finally {
        if (previousProfile === undefined) delete process.env.PORACODE_BASE_DIR;
        else process.env.PORACODE_BASE_DIR = previousProfile;
      }
    }
    const migrated = await migrateLegacyService({
      oldPrefix,
      newPrefix: target.prefix,
      releaseRoot: input.releaseRoot,
      targetLock,
      migrationLock,
    });
    return finish(target.prefix, migrated.profile);
  } finally {
    targetLock?.release();
    migrationLock.release();
  }
}
