import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readStandaloneRuntimeMarker } from "../../scripts/server-release-install.mjs";
import { defaultInstallerPrefix, resolveInstallerPrefix } from "./installerPrefix";
import { installServiceRelease } from "./cliServiceInstall";
import { migrateLegacyCommand, migrateLegacyService } from "./cliInstallMigration";
import { compareCliReleaseVersions, isNightlyRelease } from "./cliReleaseVersion";
import { readInstalledServiceRelease, readServiceRegistration } from "./serverServiceRegistration";
import { runSelfUpdate } from "./cliSelfUpdate";
import { readCliInstallMigration } from "./cliInstallMigrationJournal";
import { defaultCliBinDirectory } from "../../packages/poracode-cli/lib/installPaths.mjs";
import { acquireServerUpgradeLock, type ServerUpgradeLock } from "./serverUpgradeLock";
import { relocateLegacyTooling } from "./cliLegacyToolingMove";
import { serviceProfileForRelease } from "./cliProfileNamespace";
import { canonicalHostPath } from "@/backend/ownership/hostRootPaths";
import { runServerService } from "./serverService";

async function migrateCurrentProfile(
  prefix: string,
  releaseRoot: string,
  home: string,
  allowRunning: boolean,
  explicitProfile?: string,
): Promise<string | null> {
  const pending = readCliInstallMigration(prefix, "profile");
  if (pending && pending.phase !== "complete") {
    if (explicitProfile && canonicalHostPath(explicitProfile) !== pending.newProfile)
      throw new Error("The pending migration targets another profile; no service was changed.");
    return (await migrateLegacyService({ oldPrefix: prefix, newPrefix: prefix, releaseRoot, home }))
      .profile;
  }
  const registration = readServiceRegistration(prefix);
  if (!registration) return null;
  const current = resolveInstallerPrefix({ explicitPrefix: prefix, releaseRoot });
  const profile = serviceProfileForRelease(
    current.currentVersion,
    registration.profileNamespace,
    home,
  );
  if (explicitProfile) {
    const requested = canonicalHostPath(explicitProfile);
    if (requested !== registration.profileNamespace && requested !== profile)
      throw new Error("The service belongs to a different profile; no service was changed.");
    if (requested === registration.profileNamespace) return null;
  }
  if (!profile || profile === registration.profileNamespace) return null;
  return (
    await migrateLegacyService({
      oldPrefix: prefix,
      newPrefix: prefix,
      releaseRoot,
      targetProfile: profile,
      allowRunning,
      home,
    })
  ).profile;
}

/** Migrate only the old implicit POSIX prefix; explicit prefixes remain owned by their operator. */
export async function migrateDefaultLegacyInstall(input: {
  readonly releaseRoot: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: string;
  readonly platform?: NodeJS.Platform;
  readonly installIfMissing?: boolean;
  readonly explicitProfile?: string;
  readonly allowRunning?: boolean;
}): Promise<{
  readonly prefix: string;
  readonly profile: string | null;
  readonly moved: readonly string[];
  readonly retained: readonly string[];
} | null> {
  const env = input.env ?? process.env;
  const home = input.home ?? homedir();
  const allowRunning = input.allowRunning === true || env.PORACODE_MIGRATE_SERVICE === "1";
  if ((input.platform ?? process.platform) === "win32" || env.PORACODE_INSTALL_DIR?.trim()) {
    const prefix = defaultInstallerPrefix({
      env,
      home,
      platform: input.platform ?? process.platform,
    });
    const profile = await migrateCurrentProfile(
      prefix,
      input.releaseRoot,
      home,
      allowRunning,
      input.explicitProfile,
    );
    return profile ? { prefix, profile, moved: [], retained: [] } : null;
  }
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
    const profile = await migrateCurrentProfile(
      prefix,
      input.releaseRoot,
      home,
      allowRunning,
      input.explicitProfile,
    );
    if (profile || existsSync(join(home, ".poracode", "runtime"))) {
      return {
        prefix,
        profile,
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
  if (journal?.phase === "complete" && !readServiceRegistration(oldPrefix)) {
    const profile = await migrateCurrentProfile(
      prefix,
      input.releaseRoot,
      home,
      allowRunning,
      input.explicitProfile,
    );
    return finish(prefix, profile);
  }
  if (journal && journal.phase !== "complete") {
    if (input.explicitProfile && canonicalHostPath(input.explicitProfile) !== journal.newProfile)
      throw new Error("The pending migration targets another profile; no service was changed.");
    const resumed = await migrateLegacyService({
      oldPrefix,
      newPrefix: prefix,
      releaseRoot: input.releaseRoot,
      home,
    });
    return finish(prefix, resumed.profile);
  }
  const previous = resolveInstallerPrefix({
    explicitPrefix: oldPrefix,
    releaseRoot: input.releaseRoot,
  });
  const initialRegistration = readServiceRegistration(oldPrefix);
  if (!initialRegistration && readServiceRegistration(prefix)) {
    // A stale legacy runtime must not mask the active shared-prefix service.
    // Fence the old prefix while moving the current service's profile.
    const oldRelease = readInstalledServiceRelease(oldPrefix);
    const oldLock = acquireServerUpgradeLock({
      prefix: oldPrefix,
      releaseId: oldRelease.releaseId,
    });
    let profile: string | null;
    try {
      if (readServiceRegistration(oldPrefix))
        throw new Error(
          "A legacy service appeared while preparing migration; retry after it settles.",
        );
      profile = await migrateCurrentProfile(
        prefix,
        input.releaseRoot,
        home,
        allowRunning,
        input.explicitProfile,
      );
    } finally {
      oldLock.release();
    }
    return finish(prefix, profile);
  }
  if (initialRegistration && input.explicitProfile) {
    const requested = canonicalHostPath(input.explicitProfile);
    const runningVersion =
      readStandaloneRuntimeMarker(input.releaseRoot)?.version ?? previous.currentVersion;
    const channelProfile = serviceProfileForRelease(
      runningVersion,
      initialRegistration.profileNamespace,
      home,
    );
    if (requested !== initialRegistration.profileNamespace && requested !== channelProfile)
      throw new Error(
        "The existing service belongs to a different profile; no service was changed.",
      );
  }
  if (!existsSync(join(prefix, "current"))) {
    if (!input.installIfMissing)
      throw new Error(`Install the new runtime at ${prefix} before migrating the legacy install.`);
    const previousVersion = readStandaloneRuntimeMarker(previous.currentDir)?.version;
    if (!previousVersion)
      throw new Error("The legacy install has no self-contained release marker; it was not moved.");
    const runningVersion = readStandaloneRuntimeMarker(input.releaseRoot)?.version;
    const useRunning =
      runningVersion &&
      isNightlyRelease(runningVersion) === isNightlyRelease(previousVersion) &&
      (compareCliReleaseVersions(runningVersion, previousVersion) ?? -1) >= 0;
    const version = useRunning && runningVersion ? runningVersion : previousVersion;
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
      if (
        input.explicitProfile &&
        canonicalHostPath(input.explicitProfile) !== underLock.newProfile
      ) {
        throw new Error("The pending migration targets another profile; no service was changed.");
      }
      const resumed = await migrateLegacyService({
        oldPrefix,
        newPrefix: target.prefix,
        releaseRoot: input.releaseRoot,
        targetLock,
        migrationLock,
        home,
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
    if (registration && input.explicitProfile) {
      const requested = canonicalHostPath(input.explicitProfile);
      const channelProfile = serviceProfileForRelease(
        selected.currentVersion,
        registration.profileNamespace,
        home,
      );
      if (requested !== registration.profileNamespace && requested !== channelProfile)
        throw new Error(
          "The existing service belongs to a different profile; no service was changed.",
        );
    }
    if (
      registration &&
      isNightlyRelease(previous.currentVersion) !== isNightlyRelease(selected.currentVersion)
    ) {
      throw new Error(
        "Stable and nightly use separate profiles. Install the other channel in a separate prefix; the existing service was not changed.",
      );
    }
    if (registration && readServiceRegistration(prefix)) {
      throw new Error(
        "Both the old and new prefixes have service registrations; neither service was changed.",
      );
    }
    const targetProfile = registration
      ? input.explicitProfile
        ? canonicalHostPath(input.explicitProfile)
        : (serviceProfileForRelease(selected.currentVersion, registration.profileNamespace, home) ??
          registration.profileNamespace)
      : undefined;
    if (registration && order > 0 && targetProfile === registration.profileNamespace) {
      if (!allowRunning) {
        const status = await runServerService(registration.profileNamespace, {
          action: "status",
          prefix: oldPrefix,
          recover: false,
          json: false,
        });
        if (!("native" in status) || !status.native)
          throw new Error("The existing service state could not be verified; it was not changed.");
        if (status.native.ActiveState === "active")
          throw new Error(
            "Migrating the running service stops its agent turns. Stop it first or rerun with PORACODE_MIGRATE_SERVICE=1; the service was not changed.",
          );
      }
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
      ...(targetProfile ? { targetProfile } : {}),
      allowRunning,
      home,
    });
    return finish(target.prefix, migrated.profile);
  } finally {
    targetLock?.release();
    migrationLock.release();
  }
}
