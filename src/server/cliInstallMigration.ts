import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, readlinkSync, renameSync, symlinkSync, unlinkSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { canonicalHostPath } from "@/backend/ownership/hostRootPaths";
import { resolveInstallerPrefix } from "./installerPrefix";
import { launcherTargetsPrefix } from "./cliSelfUninstall";
import { acquireServerUpgradeLock, type ServerUpgradeLock } from "./serverUpgradeLock";
import {
  readInstalledServiceRelease,
  readServiceRegistration,
  serviceRegistrationId,
  type ServerServiceRegistration,
} from "./serverServiceRegistration";
import {
  runServerService,
  ServiceOwnerChangedBeforeRetirementError,
  type ServiceCliOptions,
  type ServiceLifecycleDeps,
} from "./serverService";
import { assertServiceProfileAvailable } from "./cliServiceProfileAdmission";
import { assertChannelProfileNamespace } from "./cliProfileNamespace";
import { probeLeaseKernelLock, redactDiagnosticLine } from "./serverDoctorIo";
import {
  CLI_INSTALL_MIGRATION_FILE,
  CLI_PROFILE_MIGRATION_FILE,
  CLI_INSTALL_MIGRATION_VERSION,
  readCliInstallMigration,
  writeCliInstallMigration,
  type CliInstallMigration,
} from "./cliInstallMigrationJournal";
export { CLI_INSTALL_MIGRATION_FILE } from "./cliInstallMigrationJournal";

function matches(
  reg: ServerServiceRegistration,
  journal: CliInstallMigration,
  which: "old" | "new",
): boolean {
  return (
    reg.installPrefix === (which === "old" ? journal.oldPrefix : journal.newPrefix) &&
    reg.profileNamespace === (which === "old" ? journal.oldProfile : journal.newProfile) &&
    reg.registrationId ===
      (which === "old" ? journal.oldRegistrationId : journal.newRegistrationId) &&
    reg.registrationNonce === (which === "old" ? journal.oldNonce : journal.newNonce) &&
    reg.account.kind === journal.account.kind &&
    reg.account.id === journal.account.id &&
    reg.configPath === (which === "old" ? journal.oldConfigPath : journal.newConfigPath)
  );
}

type ServiceRunner = (
  profile: string,
  options: ServiceCliOptions,
  deps?: ServiceLifecycleDeps,
) => Promise<unknown>;

function configForTarget(
  oldProfile: string,
  newProfile: string,
  configPath: string | null,
): string | null {
  if (!configPath || oldProfile === newProfile) return configPath;
  const path = relative(oldProfile, configPath);
  const belongsToOld =
    configPath === `${oldProfile}.server.json` ||
    path === "" ||
    (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
  return belongsToOld ? null : configPath;
}

function windowsProfileMigrationRefusal(profile: string, prefix: string): Error {
  return new Error(
    `Windows Task Scheduler's destination environment cannot be verified from this shell. Stop the existing service with poracode --base-dir "${profile}" service stop --prefix "${prefix}", then retry migration and start the new service after checking its account environment; the running service was not changed.`,
  );
}

/**
 * Move an old service to the selected prefix and profile without moving data.
 * Every transition is replayable. Old runtime files remain as rollback evidence;
 * they may still be in use by a foreground process for another profile.
 */
export async function migrateLegacyService(input: {
  readonly oldPrefix: string;
  readonly newPrefix: string;
  readonly releaseRoot: string;
  readonly service?: ServiceRunner;
  readonly readRegistration?: (prefix: string) => ServerServiceRegistration | null;
  readonly targetLock?: ServerUpgradeLock;
  readonly migrationLock?: ServerUpgradeLock;
  readonly targetProfile?: string;
  readonly allowRunning?: boolean;
  readonly home?: string;
  readonly assertTargetAvailable?: (
    profile: string,
    account: ServerServiceRegistration["account"],
    releaseDir: string,
    deps?: ServiceLifecycleDeps,
    options?: { readonly allowRegistered?: boolean; readonly configPath?: string },
  ) => Promise<{ assertActive(): void; release(): void }>;
}): Promise<{ readonly profile: string | null; readonly wasRunning: boolean }> {
  const oldPrefix = canonicalHostPath(input.oldPrefix);
  const newPrefix = canonicalHostPath(input.newPrefix);
  const kind = oldPrefix === newPrefix ? "profile" : "install";
  const journalFile = kind === "profile" ? CLI_PROFILE_MIGRATION_FILE : CLI_INSTALL_MIGRATION_FILE;
  resolveInstallerPrefix({ explicitPrefix: oldPrefix, releaseRoot: input.releaseRoot });
  resolveInstallerPrefix({ explicitPrefix: newPrefix, releaseRoot: input.releaseRoot });
  const readRegistration = input.readRegistration ?? readServiceRegistration;
  const service = input.service ?? runServerService;
  const migrationLockPath = join(newPrefix, ".legacy-migration", "upgrade.lock");
  if (input.migrationLock && input.migrationLock.path !== migrationLockPath)
    throw new Error("The supplied migration lock belongs to a different prefix.");
  const lock =
    input.migrationLock ??
    acquireServerUpgradeLock({
      prefix: join(newPrefix, ".legacy-migration"),
      releaseId: "legacy-install",
    });
  const prefixLocks = new Map<string, ServerUpgradeLock>();
  let destinationLease: { assertActive(): void; release(): void } | undefined;
  try {
    let journal = readCliInstallMigration(newPrefix, kind);
    if (journal && (journal.oldPrefix !== oldPrefix || journal.newPrefix !== newPrefix)) {
      throw new Error("The existing legacy migration belongs to different install prefixes.");
    }
    if (journal?.phase === "complete") {
      const target = readRegistration(newPrefix);
      if (!target || !matches(target, journal, "new") || target.state !== "installed") {
        if (
          oldPrefix !== newPrefix ||
          !target ||
          target.state !== "installed" ||
          !input.targetProfile
        )
          return { profile: null, wasRunning: false };
        journal = null;
      } else {
        if (!input.targetProfile || canonicalHostPath(input.targetProfile) === journal.newProfile)
          return { profile: journal.newProfile, wasRunning: journal.wasRunning };
        if (oldPrefix !== newPrefix)
          throw new Error("The completed migration belongs to a different service move.");
        journal = null;
      }
    }
    // Both normal prefix locks remain held from the status snapshot until the
    // old service retires and the new one is registered. Acquire in order so
    // another lifecycle operation cannot interleave with the migration.
    for (const prefix of [...new Set([oldPrefix, newPrefix])].sort()) {
      const selected = readInstalledServiceRelease(prefix);
      if (prefix === newPrefix && input.targetLock) {
        if (input.targetLock.path !== join(newPrefix, "upgrade.lock"))
          throw new Error("The reserved destination lock belongs to a different prefix.");
        input.targetLock.assertHeld();
        prefixLocks.set(prefix, input.targetLock);
      } else {
        prefixLocks.set(
          prefix,
          acquireServerUpgradeLock({ prefix, releaseId: selected.releaseId }),
        );
      }
    }
    const oldLock = prefixLocks.get(oldPrefix)!;
    const newLock = prefixLocks.get(newPrefix)!;
    const creatingJournal = !journal;
    if (!journal) {
      const old = readRegistration(oldPrefix);
      if (!old) return { profile: null, wasRunning: false };
      if (old.state !== "installed")
        throw new Error(
          `The legacy service is ${old.state}; finish its recovery before migrating it.`,
        );
      if (oldPrefix !== newPrefix && readRegistration(newPrefix))
        throw new Error("The new prefix already has a service registration; it was not changed.");
      const newProfile = canonicalHostPath(input.targetProfile ?? old.profileNamespace);
      const source = readInstalledServiceRelease(oldPrefix).build;
      const target = readInstalledServiceRelease(newPrefix).build;
      if (
        !source.version ||
        !source.entrypointSha256 ||
        !target.version ||
        !target.entrypointSha256 ||
        (newProfile === old.profileNamespace &&
          (source.version !== target.version ||
            source.entrypointSha256 !== target.entrypointSha256))
      ) {
        throw new Error(
          "The service migration requires qualified releases and the same build when retaining a profile.",
        );
      }
      assertChannelProfileNamespace(target.version, newProfile, input.home);
      const status = (await service(
        old.profileNamespace,
        {
          action: "status",
          prefix: oldPrefix,
          recover: false,
          json: false,
        },
        { existingLock: oldLock },
      )) as {
        ownerGeneration?: string | null;
        ownerManaged?: boolean;
        native?: Record<string, string>;
      };
      if (status.ownerGeneration && !status.ownerManaged)
        throw new Error(
          "The legacy profile is running outside its registered service; stop that owner first.",
        );
      const nativeState = status.native?.ActiveState;
      const nativeMainPid = status.native?.MainPID;
      if (!["active", "inactive", "failed"].includes(nativeState ?? ""))
        throw new Error("The legacy service is not in a stable state; retry after it settles.");
      if (nativeMainPid === undefined)
        throw new Error("The legacy service did not report a process identity.");
      if (nativeState === "active" && !status.ownerManaged)
        throw new Error("The legacy service is still starting; retry after it is ready.");
      if (
        old.manager === "windows-task" &&
        nativeState === "active" &&
        newProfile !== old.profileNamespace
      ) {
        throw windowsProfileMigrationRefusal(old.profileNamespace, oldPrefix);
      }
      if (nativeState === "active" && !input.allowRunning) {
        throw new Error(
          "Migrating the running service stops its agent turns. Stop it first or rerun with PORACODE_MIGRATE_SERVICE=1; the service was not changed.",
        );
      }
      if (newProfile !== old.profileNamespace) {
        const targetConfig = configForTarget(old.profileNamespace, newProfile, old.configPath);
        destinationLease = await (input.assertTargetAvailable ?? assertServiceProfileAvailable)(
          newProfile,
          old.account,
          target.releaseDir,
          {},
          targetConfig ? { configPath: targetConfig } : {},
        );
      }
      journal = {
        formatVersion: CLI_INSTALL_MIGRATION_VERSION,
        oldPrefix,
        newPrefix,
        oldProfile: old.profileNamespace,
        newProfile,
        oldNonce: old.registrationNonce,
        newNonce: randomBytes(24).toString("hex"),
        oldRegistrationId: old.registrationId,
        newRegistrationId: serviceRegistrationId(newProfile, old.account),
        account: old.account,
        oldConfigPath: old.configPath,
        newConfigPath: configForTarget(old.profileNamespace, newProfile, old.configPath),
        oldReleaseVersion: source.version,
        oldEntrypointSha256: source.entrypointSha256,
        newReleaseVersion: target.version,
        newEntrypointSha256: target.entrypointSha256,
        ownerGeneration: status.ownerGeneration ?? null,
        nativeMainPid,
        nativeState: nativeState as "active" | "inactive" | "failed",
        wasRunning: nativeState === "active",
        phase: "prepared",
      };
      lock.assertHeld();
      writeCliInstallMigration(newPrefix, journal, kind);
    }
    assertChannelProfileNamespace(journal.newReleaseVersion, journal.newProfile, input.home);
    const oldRelease = {
      version: journal.oldReleaseVersion,
      entrypointSha256: journal.oldEntrypointSha256,
    };
    const newRelease = {
      version: journal.newReleaseVersion,
      entrypointSha256: journal.newEntrypointSha256,
    };
    if (!creatingJournal && journal.oldProfile !== journal.newProfile) {
      const currentTarget = readRegistration(newPrefix);
      const ours = currentTarget && matches(currentTarget, journal, "new");
      let alreadyRunning = false;
      if (ours && currentTarget.state === "installed") {
        const status = (await service(
          journal.newProfile,
          { action: "status", prefix: newPrefix, recover: false, json: false },
          { existingLock: newLock, expectedRelease: newRelease },
        )) as { ownerManaged?: boolean; ownerGeneration?: string | null };
        alreadyRunning = !!status.ownerGeneration && status.ownerManaged === true;
      }
      if (!alreadyRunning) {
        destinationLease = await (input.assertTargetAvailable ?? assertServiceProfileAvailable)(
          journal.newProfile,
          journal.account,
          readInstalledServiceRelease(newPrefix).releaseDir,
          {},
          {
            allowRegistered: !!ours,
            ...(journal.newConfigPath ? { configPath: journal.newConfigPath } : {}),
          },
        );
      }
    }
    for (const [prefix, expectedRelease] of [
      [oldPrefix, oldRelease],
      [newPrefix, newRelease],
    ] as const) {
      const build = readInstalledServiceRelease(prefix).build;
      if (
        build.version !== expectedRelease.version ||
        build.entrypointSha256 !== expectedRelease.entrypointSha256
      ) {
        throw new Error(
          "A selected release changed during service migration; inspect the migration journal before continuing.",
        );
      }
    }
    if (journal.phase === "prepared") {
      destinationLease?.assertActive();
      const old = readRegistration(oldPrefix);
      if (old) {
        if (!matches(old, journal, "old") || old.state === "prepared")
          throw new Error(
            "The legacy service changed during migration; preserve it and inspect its registration.",
          );
        if (old.manager === "windows-task" && journal.oldProfile !== journal.newProfile) {
          const status = (await service(
            journal.oldProfile,
            {
              action: "status",
              prefix: oldPrefix,
              recover: false,
              json: false,
            },
            { expectedRelease: oldRelease, existingLock: oldLock },
          )) as { ownerGeneration?: string | null; native?: Record<string, string> };
          if (
            status.ownerGeneration ||
            !["inactive", "failed"].includes(status.native?.ActiveState ?? "") ||
            status.native?.MainPID !== "0"
          )
            throw windowsProfileMigrationRefusal(journal.oldProfile, oldPrefix);
        }
        try {
          await service(
            journal.oldProfile,
            {
              action: "uninstall",
              prefix: oldPrefix,
              recover: old.state === "removing",
              json: false,
            },
            {
              expectedRelease: oldRelease,
              existingLock: oldLock,
              expectedOwner: {
                generation: journal.ownerGeneration,
                mainPid: journal.nativeMainPid,
                state: journal.nativeState,
                allowRetired: !creatingJournal,
              },
            },
          );
        } catch (error) {
          if (error instanceof ServiceOwnerChangedBeforeRetirementError) {
            const current = readRegistration(oldPrefix);
            const saved = readCliInstallMigration(newPrefix, kind);
            if (
              current &&
              current.state === "installed" &&
              matches(current, journal, "old") &&
              (oldPrefix === newPrefix || !readRegistration(newPrefix)) &&
              JSON.stringify(saved) === JSON.stringify(journal)
            ) {
              lock.assertHeld();
              oldLock.assertHeld();
              newLock.assertHeld();
              unlinkSync(join(newPrefix, journalFile));
            }
          }
          throw error;
        }
      }
      lock.assertHeld();
      journal = { ...journal, phase: "old-removed" };
      writeCliInstallMigration(newPrefix, journal, kind);
    }
    if (journal.phase === "old-removed") {
      destinationLease?.assertActive();
      const target = readRegistration(newPrefix);
      if (target && (!matches(target, journal, "new") || target.state === "removing")) {
        throw new Error(
          "A different service registration appeared in the new prefix; it was not changed.",
        );
      }
      if (!target || target.state === "prepared") {
        await service(
          journal.newProfile,
          {
            action: "install",
            prefix: newPrefix,
            recover: target?.state === "prepared",
            json: false,
            ...(journal.newConfigPath ? { config: journal.newConfigPath } : {}),
          },
          {
            registrationNonce: journal.newNonce,
            expectedRelease: newRelease,
            existingLock: newLock,
          },
        );
      }
      const installed = readRegistration(newPrefix);
      if (!installed || !matches(installed, journal, "new") || installed.state !== "installed") {
        throw new Error(
          "The new service did not publish its expected registration; inspect it before retrying.",
        );
      }
      lock.assertHeld();
      journal = { ...journal, phase: "new-installed" };
      writeCliInstallMigration(newPrefix, journal, kind);
    }
    if (journal.phase === "new-installed") {
      const target = readRegistration(newPrefix);
      if (!target || !matches(target, journal, "new") || target.state !== "installed")
        throw new Error("The migrated service registration changed; no start was attempted.");
      const releasedDestinationLease = destinationLease !== undefined;
      destinationLease?.release();
      destinationLease = undefined;
      if (journal.wasRunning) {
        try {
          await service(
            journal.newProfile,
            {
              action: "start",
              prefix: newPrefix,
              recover: false,
              json: false,
            },
            {
              expectedRelease: newRelease,
              existingLock: newLock,
              // We just closed our reservation; its stopped record still names
              // this process. Probe the kernel instead of treating it as held.
              ...(releasedDestinationLease
                ? { lease: (paths) => probeLeaseKernelLock(paths, 0) }
                : {}),
            },
          );
        } catch (error) {
          throw new Error(
            `The old service was stopped, but the destination service could not start: ${redactDiagnosticLine(error instanceof Error ? error.message : String(error))}. Check the destination profile and retry the migration; its journal and both profiles were preserved.`,
            { cause: error },
          );
        }
      }
      lock.assertHeld();
      journal = { ...journal, phase: "complete" };
      writeCliInstallMigration(newPrefix, journal, kind);
    }
    const finalRegistration = readRegistration(newPrefix);
    if (
      !finalRegistration ||
      !matches(finalRegistration, journal, "new") ||
      finalRegistration.state !== "installed"
    ) {
      throw new Error(
        "The migrated service registration changed after migration; inspect it before continuing.",
      );
    }
    return { profile: journal.newProfile, wasRunning: journal.wasRunning };
  } finally {
    destinationLease?.release();
    for (const held of [...prefixLocks.values()].reverse())
      if (held !== input.targetLock) held.release();
    if (!input.migrationLock) lock.release();
  }
}

/** Retarget only an exact installer-owned POSIX command; foreign commands stay. */
export function migrateLegacyCommand(input: {
  readonly oldPrefix: string;
  readonly newPrefix: string;
  readonly binDir: string;
}): boolean {
  const command = join(input.binDir, "poracode");
  let original: ReturnType<typeof lstatSync>;
  let target: string;
  try {
    original = lstatSync(command);
    if (!original.isSymbolicLink()) return false;
    target = readlinkSync(command);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return false;
    throw error;
  }
  if (!launcherTargetsPrefix(target, input.oldPrefix, process.platform)) return false;
  const backup = join(input.binDir, `.poracode-legacy-${randomBytes(12).toString("hex")}`);
  renameSync(command, backup);
  try {
    const taken = lstatSync(backup);
    if (
      taken.dev !== original.dev ||
      taken.ino !== original.ino ||
      readlinkSync(backup) !== target
    ) {
      throw new Error(
        `The command changed during migration; the displaced entry is preserved at ${backup}.`,
      );
    }
    symlinkSync(join(input.newPrefix, "current", "bin", "poracode"), command);
    unlinkSync(backup);
    return true;
  } catch (error) {
    if (!existsSync(command)) {
      try {
        symlinkSync(target, command);
      } catch {
        /* preserve the displaced entry */
      }
    }
    throw new Error(
      `Could not retarget ${command}; the original entry is preserved at ${backup}.`,
      { cause: error },
    );
  }
}
