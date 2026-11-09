import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, readlinkSync, renameSync, symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { canonicalHostPath } from "@/backend/ownership/hostRootPaths";
import { resolveInstallerPrefix } from "./installerPrefix";
import { launcherTargetsPrefix } from "./cliSelfUninstall";
import { acquireServerUpgradeLock, type ServerUpgradeLock } from "./serverUpgradeLock";
import {
  readInstalledServiceRelease,
  readServiceRegistration,
  type ServerServiceRegistration,
} from "./serverServiceRegistration";
import {
  runServerService,
  ServiceOwnerChangedBeforeRetirementError,
  type ServiceCliOptions,
  type ServiceLifecycleDeps,
} from "./serverService";
import {
  CLI_INSTALL_MIGRATION_FILE,
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
    reg.profileNamespace === journal.profile &&
    reg.registrationId === journal.registrationId &&
    reg.registrationNonce === (which === "old" ? journal.oldNonce : journal.newNonce) &&
    reg.account.kind === journal.account.kind &&
    reg.account.id === journal.account.id &&
    reg.configPath === journal.configPath
  );
}

type ServiceRunner = (
  profile: string,
  options: ServiceCliOptions,
  deps?: ServiceLifecycleDeps,
) => Promise<unknown>;

/**
 * Move an old default-prefix service using its existing identity and profile.
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
}): Promise<{ readonly profile: string | null; readonly wasRunning: boolean }> {
  const oldPrefix = canonicalHostPath(input.oldPrefix);
  const newPrefix = canonicalHostPath(input.newPrefix);
  if (oldPrefix === newPrefix) throw new Error("The legacy and new install prefixes must differ.");
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
  try {
    let journal = readCliInstallMigration(newPrefix);
    if (journal && (journal.oldPrefix !== oldPrefix || journal.newPrefix !== newPrefix)) {
      throw new Error("The existing legacy migration belongs to different install prefixes.");
    }
    if (journal?.phase === "complete") {
      const target = readRegistration(newPrefix);
      if (!target || !matches(target, journal, "new") || target.state !== "installed") {
        return { profile: null, wasRunning: false };
      }
      return { profile: journal.profile, wasRunning: journal.wasRunning };
    }
    // Both normal prefix locks remain held from the status snapshot until the
    // old service retires and the new one is registered. Acquire in order so
    // another lifecycle operation cannot interleave with the migration.
    for (const prefix of [oldPrefix, newPrefix].sort()) {
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
      if (readRegistration(newPrefix))
        throw new Error("The new prefix already has a service registration; it was not changed.");
      const source = readInstalledServiceRelease(oldPrefix).build;
      const target = readInstalledServiceRelease(newPrefix).build;
      if (
        !source.version ||
        !source.entrypointSha256 ||
        source.version !== target.version ||
        source.entrypointSha256 !== target.entrypointSha256
      ) {
        throw new Error(
          "The service migration requires the same qualified release at both prefixes.",
        );
      }
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
      journal = {
        formatVersion: CLI_INSTALL_MIGRATION_VERSION,
        oldPrefix,
        newPrefix,
        profile: old.profileNamespace,
        oldNonce: old.registrationNonce,
        newNonce: randomBytes(24).toString("hex"),
        registrationId: old.registrationId,
        account: old.account,
        configPath: old.configPath,
        releaseVersion: source.version,
        entrypointSha256: source.entrypointSha256,
        ownerGeneration: status.ownerGeneration ?? null,
        nativeMainPid,
        nativeState: nativeState as "active" | "inactive" | "failed",
        wasRunning: nativeState === "active",
        phase: "prepared",
      };
      lock.assertHeld();
      writeCliInstallMigration(newPrefix, journal);
    }
    const expectedRelease = {
      version: journal.releaseVersion,
      entrypointSha256: journal.entrypointSha256,
    };
    for (const prefix of [oldPrefix, newPrefix]) {
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
      const old = readRegistration(oldPrefix);
      if (old) {
        if (!matches(old, journal, "old") || old.state === "prepared")
          throw new Error(
            "The legacy service changed during migration; preserve it and inspect its registration.",
          );
        try {
          await service(
            journal.profile,
            {
              action: "uninstall",
              prefix: oldPrefix,
              recover: old.state === "removing",
              json: false,
            },
            {
              expectedRelease,
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
            const saved = readCliInstallMigration(newPrefix);
            if (
              current &&
              current.state === "installed" &&
              matches(current, journal, "old") &&
              !readRegistration(newPrefix) &&
              JSON.stringify(saved) === JSON.stringify(journal)
            ) {
              lock.assertHeld();
              oldLock.assertHeld();
              newLock.assertHeld();
              unlinkSync(join(newPrefix, CLI_INSTALL_MIGRATION_FILE));
            }
          }
          throw error;
        }
      }
      lock.assertHeld();
      journal = { ...journal, phase: "old-removed" };
      writeCliInstallMigration(newPrefix, journal);
    }
    if (journal.phase === "old-removed") {
      const target = readRegistration(newPrefix);
      if (target && (!matches(target, journal, "new") || target.state === "removing")) {
        throw new Error(
          "A different service registration appeared in the new prefix; it was not changed.",
        );
      }
      if (!target || target.state === "prepared") {
        await service(
          journal.profile,
          {
            action: "install",
            prefix: newPrefix,
            recover: target?.state === "prepared",
            json: false,
            ...(journal.configPath ? { config: journal.configPath } : {}),
          },
          { registrationNonce: journal.newNonce, expectedRelease, existingLock: newLock },
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
      writeCliInstallMigration(newPrefix, journal);
    }
    if (journal.phase === "new-installed") {
      const target = readRegistration(newPrefix);
      if (!target || !matches(target, journal, "new") || target.state !== "installed")
        throw new Error("The migrated service registration changed; no start was attempted.");
      if (journal.wasRunning)
        await service(
          journal.profile,
          {
            action: "start",
            prefix: newPrefix,
            recover: false,
            json: false,
          },
          { expectedRelease, existingLock: newLock },
        );
      lock.assertHeld();
      journal = { ...journal, phase: "complete" };
      writeCliInstallMigration(newPrefix, journal);
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
    return { profile: journal.profile, wasRunning: journal.wasRunning };
  } finally {
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
